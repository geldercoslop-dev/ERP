import { Request, Response, NextFunction } from 'express';
import { jwtAuth, JWTPayload } from '../security/jwt-auth.js';
import { systemLogger } from '../_core/logger.js';

/**
 * Extensão para incluir usuário autenticado no Request
 */
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      sessionId?: string;
    }
  }
}

/**
 * Middleware de autenticação: JWT (Bearer) apenas.
 * tenantId vem APENAS do JWT payload.
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    try {
      const authHeader = req.headers.authorization;
      const token = typeof authHeader === 'string'
        ? authHeader.replace(/^\s*Bearer\s+/i, '').trim()
        : undefined;

      if (!token) {
        systemLogger.warn(
          {
            method: req.method,
            url: req.url,
            userAgent: req.get('User-Agent'),
            ip: req.ip,
            traceId: req.traceId,
          },
          'Authentication failed - no JWT token provided'
        );

        res.status(401).json({
          error: 'Unauthorized',
          message: 'JWT access token required',
          code: 'TOKEN_MISSING',
        });
        return;
      }

      try {
        const payload = jwtAuth.verifyAccessToken(token);
        req.user = payload;
        req.sessionId = payload.sessionId;

        systemLogger.debug(
          {
            userId: payload.userId,
            tenantId: payload.tenantId,
            email: payload.email,
            role: payload.role,
            sessionId: payload.sessionId,
            method: req.method,
            url: req.url,
            traceId: req.traceId,
          },
          'User authenticated via JWT'
        );

        next();
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Authentication failed';

        systemLogger.warn(
          {
            method: req.method,
            url: req.url,
            error: message,
            userAgent: req.get('User-Agent'),
            ip: req.ip,
            traceId: req.traceId,
          },
          'JWT authentication failed'
        );

        let errorCode = 'TOKEN_INVALID';
        if (message === 'Access token expired') {
          errorCode = 'TOKEN_EXPIRED';
        }

        res.status(401).json({
          error: 'Unauthorized',
          message,
          code: errorCode,
        });
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed';
      systemLogger.warn(
        {
          method: req.method,
          url: req.url,
          error: message,
          userAgent: req.get('User-Agent'),
          ip: req.ip,
          traceId: req.traceId,
        },
        'Authentication failed'
      );
      res.status(401).json({
        error: 'Unauthorized',
        message,
        code: 'TOKEN_INVALID',
      });
    }
  })();
}

/**
 * Middleware opcional de autenticação
 * Se o token for válido, adiciona o usuário ao request
 * Se não for válido ou não existir, continua sem usuário
 */
export function optionalAuthentication(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    const token = jwtAuth.extractTokenFromHeader(authHeader);

    if (token) {
      const payload = jwtAuth.verifyAccessToken(token);
      req.user = payload;
      req.sessionId = payload.sessionId;

      systemLogger.debug({
        userId: payload.userId,
        tenantId: payload.tenantId,
        email: payload.email,
        role: payload.role,
        sessionId: payload.sessionId,
        method: req.method,
        url: req.url,
        traceId: req.traceId
      }, 'Optional authentication successful');
    }
  } catch (error) {
    // Ignora erros de autenticação opcional
    systemLogger.debug({
      method: req.method,
      url: req.url,
      error: error instanceof Error ? error.message : String(error),
      traceId: req.traceId
    }, 'Optional authentication failed - continuing without user');
  }

  next();
}

/**
 * Middleware que verifica se o token precisa de refresh
 * Se precisar, adiciona header informando o client
 */
export function checkTokenRefresh(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = jwtAuth.extractTokenFromHeader(authHeader);

  if (token && jwtAuth.shouldRefreshToken(token)) {
    res.setHeader('X-Token-Refresh-Required', 'true');
    res.setHeader('X-Token-Refresh-Reason', 'expiring-soon');
  }

  next();
}

/**
 * Factory para middleware que requer role específica
 */
export function requireRole(requiredRole: 'admin' | 'operator' | 'user') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      systemLogger.warn({
        method: req.method,
        url: req.url,
        requiredRole,
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

    // Hierarquia de roles: admin > operator > user
    const roleHierarchy = {
      admin: 3,
      operator: 2,
      user: 1
    };

    const userLevel = roleHierarchy[userRole];
    const requiredLevel = roleHierarchy[requiredRole];

    if (userLevel < requiredLevel) {
      systemLogger.warn({
        method: req.method,
        url: req.url,
        userId: req.user.userId,
        userRole,
        requiredRole,
        traceId: req.traceId
      }, 'Authorization failed - insufficient role');

      res.status(403).json({
        error: 'Forbidden',
        message: `Role '${requiredRole}' required`,
        code: 'INSUFFICIENT_ROLE'
      });
      return;
    }

    systemLogger.debug({
      method: req.method,
      url: req.url,
      userId: req.user.userId,
      userRole,
      requiredRole,
      traceId: req.traceId
    }, 'Role authorization successful');

    next();
  };
}

/**
 * Middleware que verifica se o usuário pertence ao tenant correto
 */
export function requireTenantAccess(req: Request, res: Response, next: NextFunction): void {
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
}
