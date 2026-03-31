import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import cookie from "cookie";
import * as db from "../db/index.js";
import type { Vendedor } from "../db/index.js";
import type { UserWithTenant, VendedorWithTenant } from "../types/schema-extended.js";

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

/** App espera role "admin" | "vendedor". Retornamos "vendedor" para não-admin (schema DB usa "user"). */
function buildUserFromVendedor(
  v: { id: number; nome: string | null; email: string | null; admin: number | boolean },
  tenantId: number
): UserWithTenant {
  return {
    id: v.id,
    tenantId,
    openId: `vendedor-${v.id}`,
    name: v.nome ?? "Vendedor",
    email: v.email ?? null,
    // users.role no schema atual: "user" | "admin". Vendedor é tratado como "user".
    role: ((typeof v.admin === "number" ? v.admin > 0 : v.admin) ? "admin" : "user") as "admin" | "user",
    loginMethod: "local",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

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

    if (typeof token === "string" && token.startsWith("u:")) {
      session.tokenKind = "user";
      const userId = parseInt(token.slice(2), 10);
      if (Number.isFinite(userId)) {
        const u = await db.getUserById(userId);
        if (u) {
          user = u;
          tenantId = (u as UserWithTenant).tenantId ?? null;
        }
      }
    } else if (typeof token === "string" && token.startsWith("v:")) {
      session.tokenKind = "vendedor";
      const id = parseInt(token.slice(2), 10);
      if (Number.isFinite(id)) {
        const v = await db.getVendedorById(id);

        if (v?.ativo) {
          vendedor = v;
          // para vendedores, usamos sempre tenantId obrigatório (schema multi-tenant)
          tenantId = (v as VendedorWithTenant).tenantId ?? null;
          user = buildUserFromVendedor(v, tenantId ?? 0);
          isImpersonating = Boolean(typeof adminSessionToken === "string" && adminSessionToken.length > 0);
        } else {
          const cookieNames = ["session_token", "session", "auth_token"];
          cookieNames.forEach(name => {
            opts.res.clearCookie(name, { path: "/" });
            opts.res.clearCookie(name, { path: "/", domain: "localhost" });
          });
        }
      }
    } else if (token === "admin-session") {
      session.tokenKind = "admin-session";
      const u = await db.getUserByOpenId("admin");
      if (u) {
        user = u;
        tenantId = (u as UserWithTenant).tenantId ?? null;
      }
    } else if (token === "vendedor-session") {
      session.tokenKind = "vendedor-session";
      // Legado: tentar resolver vendedor por userId 2 no DB para que ctx.user.id seja vendedor.id
      const vendedor = await db.getVendedorByUserId(2);
      if (vendedor?.ativo) {
        tenantId = (vendedor as VendedorWithTenant).tenantId ?? null;
        user = buildUserFromVendedor(vendedor, tenantId ?? 0);
      }
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
