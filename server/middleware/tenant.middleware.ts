import { Request, Response, NextFunction } from 'express';

type Payload = Record<string, unknown>;
export type RequestWithTenant = Request & {
  user?: { tenantId?: number | string; role?: string };
  tenantId?: number | null;
};

/**
 * TENANT MIDDLEWARE
 * 
 * Extracts tenant information from request
 * Sets req.tenantId for multi-tenant isolation
 */

// Type guard para garantir RequestWithTenant
function hasTenantUser(req: Request): req is RequestWithTenant {
  return (
    'user' in req &&
    req.user != null &&
    typeof req.user === 'object' &&
    'tenantId' in req.user
  );
}

export function tenantMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    // Log mínimo: apenas status da requisição
    console.log('[TENANT-MIDDLEWARE] Request recebido');

    if (hasTenantUser(req) && req.user) {
      const { user } = req;
      // SECURITY: tenantId must come from JWT only
      if (user.tenantId !== undefined && user.tenantId !== null) {
        const tenantId = typeof user.tenantId === 'number' ? user.tenantId : parseInt(user.tenantId as string, 10);
        if (Number.isFinite(tenantId) && tenantId > 0) {
          req.tenantId = tenantId;
          console.log('[TENANT-MIDDLEWARE] Tenant set com sucesso');
          return next();
        }
      }
    }

    // No tenant found
    console.log('[TENANT-MIDDLEWARE] Falha: tenantId ausente ou inválido');
    res.status(401).json({
      success: false,
      error: 'Tenant ID required',
      message: 'Authentication required'
    });
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: 'Tenant validation failed',
      message: 'Failed to extract tenant information'
    });
  }
}

/**
 * ADMIN TENANT MIDDLEWARE
 * 
 * Bypasses tenant validation for admin operations
 */
// (adminTenantMiddleware removido — não existe mais bypass global)
