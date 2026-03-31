import { Request, Response, NextFunction } from 'express';
import { RBAC, Role, Permission } from '../security/rbac.js';
import { systemLogger } from '../_core/logger.js';

/**
 * Middleware que verifica permissão específica
 */
export function requirePermission(resource: string, action: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      systemLogger.warn({
        method: req.method,
        url: req.url,
        resource,
        action,
        traceId: req.traceId
      }, 'Authorization failed - no user authenticated');

      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    const userRole = req.user.role;
    const userId = req.user.userId;
    const userTenantId = req.user.tenantId;

    // Preparar contexto para verificação de condições
    const context = {
      userId,
      userTenantId,
      targetUserId: req.params.userId || req.body.userId,
      // SECURITY: tenantId must come from JWT only
      resourceTenantId: userTenantId,
      resourceOwnerId: req.params.createdBy || req.body.createdBy
    };

    const hasPermission = RBAC.hasPermission(userRole, resource, action, context);

    if (!hasPermission) {
      systemLogger.warn({
        method: req.method,
        url: req.url,
        userId,
        userRole,
        resource,
        action,
        context,
        traceId: req.traceId
      }, 'Authorization failed - insufficient permission');

      res.status(403).json({
        error: 'Forbidden',
        message: `Insufficient permission for ${action} on ${resource}`,
        code: 'INSUFFICIENT_PERMISSION',
        required: { resource, action }
      });
      return;
    }

    systemLogger.debug({
      method: req.method,
      url: req.url,
      userId,
      userRole,
      resource,
      action,
      traceId: req.traceId
    }, 'Permission check successful');

    next();
  };
}

/**
 * Middleware que verifica múltiplas permissões (AND)
 */
export function requirePermissions(permissions: Array<{ resource: string; action: string }>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    const userRole = req.user.role;
    const userId = req.user.userId;
    const userTenantId = req.user.tenantId;

    // Preparar contexto
    const context = {
      userId,
      userTenantId,
      targetUserId: req.params.userId || req.body.userId,
      // SECURITY: tenantId must come from JWT only
      resourceTenantId: userTenantId,
      resourceOwnerId: req.params.createdBy || req.body.createdBy
    };

    // Verificar todas as permissões
    for (const permission of permissions) {
      const hasPermission = RBAC.hasPermission(userRole, permission.resource, permission.action, context);

      if (!hasPermission) {
        systemLogger.warn({
          method: req.method,
          url: req.url,
          userId,
          userRole,
          requiredPermissions: permissions,
          failedPermission: permission,
          traceId: req.traceId
        }, 'Authorization failed - missing required permission');

        res.status(403).json({
          error: 'Forbidden',
          message: `Insufficient permission for ${permission.action} on ${permission.resource}`,
          code: 'INSUFFICIENT_PERMISSION',
          required: permission
        });
        return;
      }
    }

    systemLogger.debug({
      method: req.method,
      url: req.url,
      userId,
      userRole,
      requiredPermissions: permissions,
      traceId: req.traceId
    }, 'Multiple permissions check successful');

    next();
  };
}

/**
 * Middleware que verifica qualquer uma das permissões (OR)
 */
export function requireAnyPermission(permissions: Array<{ resource: string; action: string }>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    const userRole = req.user.role;
    const userId = req.user.userId;
    const userTenantId = req.user.tenantId;

    // Preparar contexto
    const context = {
      userId,
      userTenantId,
      targetUserId: req.params.userId || req.body.userId,
      // SECURITY: tenantId must come from JWT only
      resourceTenantId: userTenantId,
      resourceOwnerId: req.params.createdBy || req.body.createdBy
    };

    // Verificar se tem alguma das permissões
    for (const permission of permissions) {
      const hasPermission = RBAC.hasPermission(userRole, permission.resource, permission.action, context);

      if (hasPermission) {
        systemLogger.debug({
          method: req.method,
          url: req.url,
          userId,
          userRole,
          grantedPermission: permission,
          requiredPermissions: permissions,
          traceId: req.traceId
        }, 'Any permission check successful');

        next();
        return;
      }
    }

    // Se não tem nenhuma permissão
    systemLogger.warn({
      method: req.method,
      url: req.url,
      userId,
      userRole,
      requiredPermissions: permissions,
      traceId: req.traceId
    }, 'Authorization failed - no sufficient permission');

    res.status(403).json({
      error: 'Forbidden',
      message: 'Insufficient permissions',
      code: 'INSUFFICIENT_PERMISSIONS',
      required: permissions
    });
  };
}

/**
 * Middleware que verifica se o usuário pode gerenciar a role de outro usuário
 */
export function requireRoleManagement() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    const userRole = req.user.role;
    const targetRole = req.body.role || req.params.role;

    if (!targetRole || !RBAC.isValidRole(targetRole)) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid target role',
        code: 'INVALID_ROLE'
      });
      return;
    }

    const canManage = RBAC.canManageRole(userRole, targetRole as Role);

    if (!canManage) {
      systemLogger.warn({
        method: req.method,
        url: req.url,
        userId: req.user.userId,
        userRole,
        targetRole,
        traceId: req.traceId
      }, 'Authorization failed - cannot manage role');

      res.status(403).json({
        error: 'Forbidden',
        message: `Cannot manage role '${targetRole}'`,
        code: 'CANNOT_MANAGE_ROLE'
      });
      return;
    }

    next();
  };
}

/**
 * Middleware que adiciona informações de permissões ao response
 */
export function addPermissionsInfo(req: Request, res: Response, next: NextFunction): void {
  if (req.user) {
    const userPermissions = RBAC.getPermissions(req.user.role);
    
    // Adicionar header com informações de permissões
    res.setHeader('X-User-Role', req.user.role);
    res.setHeader('X-User-Permissions', JSON.stringify(userPermissions));
    
    // Adicionar ao request para uso posterior
    (req as any).userPermissions = userPermissions;
  }

  next();
}

/**
 * Middleware que verifica acesso baseado no tenant (multi-tenancy)
 */
export function requireTenantAccess() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    const userTenantId = req.user.tenantId;

    // SECURITY: tenantId must come from JWT only
    const hasTenantOverride =
      typeof req.params.tenantId !== 'undefined' ||
      typeof req.query.tenantId !== 'undefined' ||
      (typeof req.body === 'object' && req.body !== null && 'tenantId' in req.body);

    if (hasTenantOverride) {
      systemLogger.warn({
        method: req.method,
        url: req.url,
        userId: req.user.userId,
        userTenantId,
        traceId: req.traceId
      }, 'Authorization failed - tenant override attempt');

      res.status(403).json({
        error: 'Forbidden',
        message: 'Tenant override is not allowed',
        code: 'TENANT_OVERRIDE_FORBIDDEN'
      });
      return;
    }

    if (!Number.isFinite(userTenantId) || userTenantId <= 0) {
      systemLogger.warn({
        method: req.method,
        url: req.url,
        userId: req.user.userId,
        userTenantId,
        traceId: req.traceId
      }, 'Authorization failed - invalid user tenant');

      res.status(403).json({
        error: 'Forbidden',
        message: 'Tenant access denied',
        code: 'TENANT_INVALID'
      });
      return;
    }

    next();
  };
}
