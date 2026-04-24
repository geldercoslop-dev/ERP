import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { Vendedor } from "../db/index.js";
import type { UserWithTenant } from "../types/schema-extended.js";
import { jwtAuth } from "../security/jwt-auth.js";

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
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  console.log("🔥 CONTEXT EXECUTADO", opts.req.originalUrl ?? opts.req.url);
  let user: UserWithTenant | null = null;
  let vendedor: Vendedor | null = null;
  let isImpersonating = false;
  let tenantId: number | null = null;

  try {
    const rawAuth = opts.req.headers.authorization;
    const authToken = (typeof rawAuth === "string"
      ? rawAuth.replace(/^\s*Bearer\s+/i, "").trim()
      : "") || undefined;

    if (typeof authToken === "string" && authToken) {
      // Validate JWT token
      const payload = jwtAuth.verifyAccessToken(authToken);

      user = {
        id: payload.userId,
        tenantId: payload.tenantId,
        openId: `user-${payload.userId}`,
        name: payload.email,
        email: payload.email,
        role: payload.role === 'operator' ? 'user' : payload.role,
        loginMethod: "jwt",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };
      tenantId = payload.tenantId;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[createContext] Erro ao processar contexto JWT:", msg);
    if (err instanceof Error && err.stack) console.error("[createContext] Stack:", err.stack);
    user = null;
    tenantId = null;
  }

  if (!user && process.env.NODE_ENV !== "production") {
    const hasAuthHeader = !!opts.req.headers.authorization;
    const host = opts.req.headers.host || opts.req.hostname || "";
    console.log("[createContext] Requisição sem token JWT válido.", {
      hasAuthHeader,
      host,
      dica: hasAuthHeader ? "Header Authorization veio mas token pode ser inválido." : "Envie token JWT no header Authorization: Bearer <token>.",
    });
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    tenantId,
    vendedor,
    isImpersonating,
  };
}
