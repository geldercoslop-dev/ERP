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
    if (Number.isFinite(userId) && userId > 0) {
      const loadedUser = await db.getUserById(userId);
      if (loadedUser) {
        // SECURITY HARDENING: validar usuário
        if (!loadedUser.tenantId || loadedUser.tenantId <= 0) {
          throw new Error(`User token blocked: invalid tenantId for user ${userId}`);
        }
        
        user = loadedUser;
        tenantId = loadedUser.tenantId;
      } else {
        throw new Error(`User token blocked: user ${userId} not found`);
      }
    } else {
      throw new Error("User token blocked: invalid userId format");
    }
  } else if (typeof token === "string" && token.startsWith("v:")) {
    tokenKind = "vendedor";
    const parts = token.split(":");
    const tokenTenantId = Number(parts[1]);
    const vendedorId = Number(parts[2]);
    if (Number.isInteger(tokenTenantId) && tokenTenantId > 0 && Number.isInteger(vendedorId) && vendedorId > 0) {
      const loadedVendedor = await db.getVendedorById(vendedorId);
      if (loadedVendedor?.ativo) {
        // SECURITY HARDENING: usar tenant do banco, não do token
        const realTenantId = loadedVendedor.tenantId;
        
        // Validar consistência: token tenant vs banco tenant
        if (tokenTenantId !== realTenantId) {
          throw new Error(`Vendedor token blocked: tenant mismatch (token:${tokenTenantId} != db:${realTenantId}) for vendedor ${vendedorId}`);
        }
        
        vendedor = loadedVendedor;
        tenantId = realTenantId; // Usar tenant real do banco
        user = buildUserFromVendedor(loadedVendedor, realTenantId);
        isImpersonating = Boolean(typeof adminSessionToken === "string" && adminSessionToken.length > 0);
      } else {
        throw new Error(`Vendedor token blocked: vendedor ${vendedorId} not found or inactive`);
      }
    } else {
      throw new Error("Vendedor token blocked: invalid token format");
    }
  } else if (token === "admin-session") {
    tokenKind = "admin-session";
    
    // SECURITY HARDENING: admin-session apenas em localhost/dev
    const clientIP = typeof process !== 'undefined' && process.env && process.env.CLIENT_IP;
    const isLocalhost = clientIP === '127.0.0.1' || clientIP === '::1' || process.env.NODE_ENV === 'development';
    
    if (!isLocalhost) {
      throw new Error("Admin session blocked: not from trusted source");
    }
    
    const loadedUser = await db.getUserByOpenId("admin");
    if (loadedUser) {
      user = loadedUser;
      tenantId = loadedUser.tenantId ?? null;
    } else {
      throw new Error("Admin session blocked: admin user not found");
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