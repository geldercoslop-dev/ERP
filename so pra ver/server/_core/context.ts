import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { users } from "../../drizzle/schema";
import cookie from "cookie";
import * as db from "../db";

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
  tokenKind: "vendedor" | "admin-session" | "vendedor-session" | "unknown";
};

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: typeof users.$inferSelect | null;
  session: SessionInfo;
};

/** App espera role "admin" | "vendedor". Retornamos "vendedor" para não-admin (schema DB usa "user"). */
function buildUserFromVendedor(v: { id: number; nome: string | null; email: string | null; admin: boolean }): typeof users.$inferSelect {
  return {
    id: v.id,
    openId: `vendedor-${v.id}`,
    name: v.nome ?? "Vendedor",
    email: v.email ?? null,
    // users.role no schema atual: "user" | "admin". Vendedor é tratado como "user".
    role: (v.admin ? "admin" : "user") as "admin" | "user",
    loginMethod: "local",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: typeof users.$inferSelect | null = null;
  const session: SessionInfo = {
    origin: "none",
    tokenPresent: false,
    tokenKind: "unknown",
  };

  try {
    const rawCookie = opts.req.headers.cookie;
    const parsed = rawCookie ? cookie.parse(rawCookie) : {};
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

    console.log("=== CONTEXT SESSION CHECK ===");
    console.log({
      cookieToken: cookieToken || undefined,
      headerToken: headerToken || undefined,
      authToken: authToken || undefined,
      token: token || undefined,
    });

    // Cookie "v:ID" = login por vendedor no DB (auth com bcrypt)
    if (typeof token === "string" && token.startsWith("v:")) {
      session.tokenKind = "vendedor";
      const id = parseInt(token.slice(2), 10);
      if (Number.isFinite(id)) {
        const vendedor = await db.getVendedorById(id);

        if (vendedor?.ativo) {
          user = buildUserFromVendedor(vendedor);
        } else {
          // Sessão inválida: vendedor não existe, inativo ou query falhou — limpa cookie para evitar loop
          const cookieNames = ["session_token", "session", "auth_token"];
          cookieNames.forEach(name => {
            opts.res.clearCookie(name, { path: "/" });
            opts.res.clearCookie(name, { path: "/", domain: "localhost" });
          });
          // Cookie v:ID inválido (vendedor ausente/inativo). Cookies limpos.
        }
      }
    } else if (token === "admin-session") {
      session.tokenKind = "admin-session";
      user = {
        id: 1,
        openId: "admin-local",
        name: "Administrador",
        email: "admin@local.com",
        role: "admin",
        loginMethod: "local",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };
    } else if (token === "vendedor-session") {
      session.tokenKind = "vendedor-session";
      // Legado: tentar resolver vendedor por userId 2 no DB para que ctx.user.id seja vendedor.id
      const vendedor = await db.getVendedorByUserId(2);
      if (vendedor?.ativo) {
        user = buildUserFromVendedor(vendedor);
      } else {
        user = {
          id: 2,
          openId: "vendedor-local",
          name: "Vendedor",
          email: "vendedor@local.com",
          role: "user",
          loginMethod: "local",
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        };
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
    } catch (_) {}
  }

  if (!user && process.env.NODE_ENV === "development") {
    const rawCookie = opts.req.headers.cookie;
    const host = opts.req.headers.host || opts.req.hostname || "";
    const names = rawCookie ? Object.keys(cookie.parse(rawCookie)) : [];
    const hasSession = names.some((n) => n === "session_token" || n === "session" || n === "auth_token");
    const hasSessionHeader = !!opts.req.headers["x-session-token"];
    console.log("[createContext] Requisição sem sessão válida.", {
      hasCookie: !!rawCookie,
      cookieNames: names.length ? names : "(nenhum)",
      hasSessionCookie: hasSession,
      hasSessionHeader,
      host,
      dica: hasSessionHeader ? "Header X-Session-Token veio mas valor pode ser inválido." : "Faça login na mesma URL (ex.: http://localhost:3003). O token é salvo em sessionStorage e enviado no header X-Session-Token.",
    });
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    session,
  };
}
