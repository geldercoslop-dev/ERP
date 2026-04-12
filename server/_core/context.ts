import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import cookie from "cookie";
import type { Vendedor } from "../db/index.js";
import type { UserWithTenant, VendedorWithTenant } from "../types/schema-extended.js";
import { resolveSessionPrincipal } from "../services/context-auth.service.js";
import { validateTenantContextSafe } from "./tenant-validation-safe.js";

export type SessionOrigin = "cookie" | "header" | "bearer" | "none";

export type SessionInfo = {
  /** De onde veio o token efetivamente usado para autenticar (se houver). */
  origin: SessionOrigin;
  /** Nome do cookie utilizado (quando origin === "cookie"). */
  cookieName?: "session_token" | "session" | "auth_token";
  /** Indica se algum token (cookie/header/bearer) estava presente na requisição. */
  tokenPresent: boolean;
  /**
   * Classificação do token (não expõe valor).
   * Ex.: "vendedor", "admin-session", "vendedor-session", "unknown".
   */
  tokenKind: "vendedor" | "admin-session" | "vendedor-session" | "user" | "unknown";
};

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: UserWithTenant | null;
  /** Tenant atual (quando autenticado em ambiente multi-tenant). */
  tenantId: number | null;
  /** Preenchido quando sessão é vendedor (token "v:..."). */
  vendedor: Vendedor | null;
  /** True quando admin está impersonando vendedor (cookie admin_session presente). */
  isImpersonating: boolean;
  session: SessionInfo;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  console.log("🔥 CONTEXT EXECUTADO", opts.req.originalUrl ?? opts.req.url);
  let user: UserWithTenant | null = null;
  let vendedor: Vendedor | null = null;
  let isImpersonating = false;
  let tenantId: number | null = null;
  const session: SessionInfo = {
    origin: "none",
    tokenPresent: false,
    tokenKind: "unknown",
  };

  try {
    const rawCookie = opts.req.headers.cookie;
    const parsed = rawCookie ? cookie.parse(rawCookie) : {};
    const adminSessionToken = parsed.admin_session as string | undefined;
    const cookieToken = (parsed.session_token || parsed.session || parsed.auth_token) as string | undefined;
    const cookieName: SessionInfo["cookieName"] =
      parsed.session_token != null
        ? "session_token"
        : parsed.session != null
          ? "session"
          : parsed.auth_token != null
            ? "auth_token"
            : undefined;
    const rawX = opts.req.headers["x-session-token"];
    const rawAuth = opts.req.headers.authorization;
    const headerToken = (
      Array.isArray(rawX) ? rawX[0] : (rawX as string | undefined)
    )?.trim();
    const authToken = (typeof rawAuth === "string"
      ? rawAuth.replace(/^\s*Bearer\s+/i, "").trim()
      : "") || undefined;
    const token: string | undefined =
      (typeof cookieToken === "string" && cookieToken ? cookieToken : undefined) ||
      (headerToken || undefined) ||
      (authToken || undefined);

    session.tokenPresent = Boolean(
      (typeof cookieToken === "string" && cookieToken) ||
      (typeof headerToken === "string" && headerToken) ||
      (typeof authToken === "string" && authToken)
    );

    // Origem efetiva: a primeira fonte válida na ordem em que token é decidido acima.
    if (typeof cookieToken === "string" && cookieToken) {
      session.origin = "cookie";
      session.cookieName = cookieName;
    } else if (typeof headerToken === "string" && headerToken) {
      session.origin = "header";
    } else if (typeof authToken === "string" && authToken) {
      session.origin = "bearer";
    } else {
      session.origin = "none";
    }

    const resolvedSession = await resolveSessionPrincipal(token, adminSessionToken);
    user = resolvedSession.user;
    vendedor = resolvedSession.vendedor;
    tenantId = resolvedSession.tenantId;
    isImpersonating = resolvedSession.isImpersonating;
    session.tokenKind = resolvedSession.tokenKind;

    if (resolvedSession.shouldClearSession) {
      const cookieNames = ["session_token", "session", "auth_token"];
      cookieNames.forEach(name => {
        opts.res.clearCookie(name, { path: "/" });
        opts.res.clearCookie(name, { path: "/", domain: "localhost" });
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[createContext] Erro ao processar contexto:", msg);
    if (err instanceof Error && err.stack) console.error("[createContext] Stack:", err.stack);
    user = null;
    session.origin = "none";
    session.cookieName = undefined;
    session.tokenKind = "unknown";
    // Limpa cookies em caso de erro para não travar o usuário
    try {
      const cookieNames = ["session_token", "session", "auth_token"];
      cookieNames.forEach(name => {
        opts.res.clearCookie(name, { path: "/" });
        opts.res.clearCookie(name, { path: "/", domain: "localhost" });
      });
    } catch (err) {
      console.error("[createContext] clearCookie failed:", err);
    }
  }

  if (!user && process.env.NODE_ENV !== "production") {
    const rawCookie = opts.req.headers.cookie;
    const names = rawCookie ? Object.keys(cookie.parse(rawCookie)) : [];
    const hasSession = names.some((n) => n === "session_token" || n === "session" || n === "auth_token");
    const hasSessionHeader = !!opts.req.headers["x-session-token"];
    const host = opts.req.headers.host || opts.req.hostname || "";
    console.log("[createContext] Requisição sem sessão válida.", {
      hasCookie: !!rawCookie,
      hasSessionCookie: hasSession,
      hasSessionHeader,
      host,
      dica: hasSessionHeader ? "Header X-Session-Token veio mas valor pode ser inválido." : "Faça login na mesma URL (ex.: http://localhost:3000). O token é salvo em sessionStorage e enviado no header X-Session-Token.",
    });
  }

  const validation = validateTenantContextSafe({
    user,
    vendedor,
    tenantId,
    isImpersonating,
    session,
  });

  // LOG DE SEGURANÇA SEM BLOQUEAR
  if (!validation.valid) {
    console.error("[SECURITY] Tenant context validation failed", {
      severity: validation.severity,
      issues: validation.issues,
      tokenOrigin: validation.details.tokenOrigin,
      tokenFormat: validation.details.tokenFormat,
      isLegacy: validation.details.isLegacyToken,
      userAgent: opts.req.headers["user-agent"],
      ip: opts.req.ip,
    });

    // LOG ESPECÍFICO PARA TOKENS LEGADOS
    if (validation.details.isLegacyToken) {
      console.warn("[SECURITY] LEGACY_TOKEN_USED", {
        tokenFormat: validation.details.tokenFormat,
        tokenOrigin: validation.details.tokenOrigin,
        userId: user?.id,
        tenantId: tenantId,
        ip: opts.req.ip,
      });
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    tenantId,
    vendedor,
    isImpersonating,
    session,
  };
}
