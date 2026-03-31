import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./context.js";

/**
 * Middleware para enforçar isolamento de tenant
 * Usar em procedures que requerem autenticação
 */
export async function requireTenant(ctx: TrpcContext) {
  if (!ctx.tenantId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Tenant ID is required. User must belong to a tenant.",
    });
  }
  return ctx.tenantId;
}

/** Alias explícito para middlewares / documentação (mesmo comportamento que requireTenant). */
export const enforceTenant = requireTenant;

/**
 * Garante que o usuário está autenticado e tem um tenant
 */
export async function enforceAuth(ctx: TrpcContext) {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User is not authenticated",
    });
  }
  if (!ctx.tenantId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User does not belong to any tenant",
    });
  }
  return { user: ctx.user, tenantId: ctx.tenantId };
}

/**
 * Valida que um ID de recurso pertence ao tenant do usuário
 * Usar ao buscar/atualizar/deletar recursos
 */
export async function validateOwnership(
  resourceTenantId: number | undefined | null,
  userTenantId: number | null
): Promise<void> {
  if (resourceTenantId !== userTenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Access denied: Resource does not belong to your tenant",
    });
  }
}

/**
 * Helper para aplicar tenantId a queries
 * Retorna a condição WHERE para incluir tenantId
 */
export function withTenant(tenantId: number, tableName: string): Record<string, unknown> {
  return {
    tenantId,
    tableName, // Para facilitar debug
  };
}
