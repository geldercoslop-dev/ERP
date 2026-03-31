import { Request, Response, NextFunction } from 'express';

type Payload = Record<string, unknown>;
type RequestWithAuth = Request & {
  user?: { tenantId?: number | string; role?: string };
  tenantId?: number | null;
};

/**
 * TENANT MIDDLEWARE
 * 
 * Extracts tenant information from request
 * Sets req.tenantId for multi-tenant isolation
 */

export function tenantMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const typedReq = req as RequestWithAuth;
    const user = typedReq.user;

    // DEBUG: Log incoming request state
    console.log('[TENANT-MIDDLEWARE] Request received:', {
      hasUser: !!user,
      user: user,
      userTenantId: user?.tenantId,
      userTenantIdType: typeof user?.tenantId,
      headers: {
        authorization: req.headers.authorization?.substring(0, 50) + '...'
      }
    });

    // SECURITY: tenantId must come from JWT only
    if (user && user.tenantId !== undefined && user.tenantId !== null) {
      const tenantId = typeof user.tenantId === 'number' ? user.tenantId : parseInt(user.tenantId, 10);
      
      console.log('[TENANT-MIDDLEWARE] Processing tenantId:', {
        originalTenantId: user.tenantId,
        parsedTenantId: tenantId,
        isFinite: Number.isFinite(tenantId),
        isPositive: tenantId > 0
      });
      
      if (Number.isFinite(tenantId) && tenantId > 0) {
        typedReq.tenantId = tenantId;
        
        console.log('[TENANT-MIDDLEWARE] SUCCESS - Tenant set:', {
          tenantId: typedReq.tenantId,
          nextCalled: true
        });
        
        return next();
      }
    }

    // No tenant found
    console.log('[TENANT-MIDDLEWARE] FAILED - No valid tenant:', {
      user,
      tenantId: user?.tenantId,
      reason: !user ? 'No user' : user.tenantId === undefined ? 'tenantId undefined' : user.tenantId === null ? 'tenantId null' : 'invalid tenantId'
    });
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
export function adminTenantMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const typedReq = req as RequestWithAuth;
    const user = typedReq.user;
    
    // Check if user is admin
    if (user && user.role === 'admin') {
      typedReq.tenantId = null; // Admin can access all tenants
      return next();
    }

    // Use regular tenant middleware for non-admin users
    tenantMiddleware(req, res, next);
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: 'Admin tenant validation failed',
      message: 'Failed to validate admin tenant access'
    });
  }
}
