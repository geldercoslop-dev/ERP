/**
 * Utilitários de Tenant - Centralizado para uso em toda aplicação
 */

import { TRPCError } from '@trpc/server';
import type { Request } from 'express';

/**
 * Extrai e valida tenantId do request de forma segura
 * SECURITY: tenantId deve vir apenas do JWT
 */
export function requireTenantFromRequest(req: Request): number {
  // SECURITY: tenantId must come from JWT only
  const reqWithTenant = req as Request & {
    tenantId?: unknown;
    user?: { tenantId?: number | string };
  };

  const raw = reqWithTenant.tenantId ?? reqWithTenant.user?.tenantId;

  const tenantId = typeof raw === 'number' ? raw : Number(raw);

  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Tenant ID obrigatório' });
  }

  return tenantId;
}
