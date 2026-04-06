import * as db from "../db/index.js";
import type { Vendedor } from "../db/index.js";
import type { UserWithTenant } from "../types/schema-extended.js";

export type SessionTokenKind = "vendedor" | "admin-session" | "vendedor-session" | "user" | "unknown";

export interface ResolvedSessionPrincipal {
  user: UserWithTenant | null;
  vendedor: Vendedor | null;
  tenantId: number | null;
  isImpersonating: boolean;
  tokenKind: SessionTokenKind;
  shouldClearSession: boolean;
}

function buildUserFromVendedor(
  vendedor: { id: number; nome: string | null; email: string | null; admin: number | boolean },
  tenantId: number
): UserWithTenant {
  return {
    id: vendedor.id,
    tenantId,
    openId: `vendedor-${vendedor.id}`,
    name: vendedor.nome ?? "Vendedor",
    email: vendedor.email ?? null,
    role: ((typeof vendedor.admin === "number" ? vendedor.admin > 0 : vendedor.admin) ? "admin" : "user") as "admin" | "user",
    loginMethod: "local",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

export async function resolveSessionPrincipal(
  token: string | undefined,
  adminSessionToken?: string
): Promise<ResolvedSessionPrincipal> {
  let user: UserWithTenant | null = null;
  let vendedor: Vendedor | null = null;
  let tenantId: number | null = null;
  let isImpersonating = false;
  let tokenKind: SessionTokenKind = "unknown";
  let shouldClearSession = false;

  if (typeof token === "string" && token.startsWith("u:")) {
    tokenKind = "user";
    const userId = parseInt(token.slice(2), 10);
    if (Number.isFinite(userId)) {
      const loadedUser = await db.getUserById(userId);
      if (loadedUser) {
        user = loadedUser;
        tenantId = loadedUser.tenantId ?? null;
      }
    }
  } else if (typeof token === "string" && token.startsWith("v:")) {
    tokenKind = "vendedor";
    const parts = token.split(":");
    const tokenTenantId = Number(parts[1]);
    const vendedorId = Number(parts[2]);
    if (Number.isInteger(tokenTenantId) && tokenTenantId > 0 && Number.isInteger(vendedorId) && vendedorId > 0) {
      const loadedVendedor = await db.getVendedorById(String(tokenTenantId), vendedorId);
      if (loadedVendedor?.ativo) {
        vendedor = loadedVendedor;
        tenantId = tokenTenantId;
        user = buildUserFromVendedor(loadedVendedor, tokenTenantId);
        isImpersonating = Boolean(typeof adminSessionToken === "string" && adminSessionToken.length > 0);
      } else {
        shouldClearSession = true;
      }
    }
  } else if (token === "admin-session") {
    tokenKind = "admin-session";
    const loadedUser = await db.getUserByOpenId("admin");
    if (loadedUser) {
      user = loadedUser;
      tenantId = loadedUser.tenantId ?? null;
    }
  } else if (token === "vendedor-session") {
    tokenKind = "vendedor-session";
  }

  return {
    user,
    vendedor,
    tenantId,
    isImpersonating,
    tokenKind,
    shouldClearSession,
  };
}