import cookie from 'cookie';
import { Request, Response, NextFunction } from 'express';
import * as db from '../db/index';
import type { User, Vendedor } from '../db/core';
import { jwtAuth, JWTPayload } from '../security/jwt-auth';
import { systemLogger } from '../_core/logger';

/** Mesma ordem de resolução que createContext (cookie → X-Session-Token → Bearer). */
function resolveSessionLikeToken(req: Request): string | undefined {
  const rawCookie = req.headers.cookie ?? '';
  const parsed = rawCookie ? cookie.parse(rawCookie) : {};
  const cookieToken = (parsed.session_token || parsed.session || parsed.auth_token) as string | undefined;
  const rawX = req.headers['x-session-token'];
  const headerToken = (Array.isArray(rawX) ? rawX[0] : rawX)?.trim();
  const authHeader = req.headers.authorization;
  const authToken =
    typeof authHeader === 'string' ? authHeader.replace(/^\s*Bearer\s+/i, '').trim() : undefined;
  return (
    (typeof cookieToken === 'string' && cookieToken ? cookieToken : undefined) ||
    (headerToken || undefined) ||
    (authToken || undefined)
  );
}

function isLikelyJwt(token: string): boolean {
  const parts = token.split('.');
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

function mapUserToJwtPayload(u: User): JWTPayload {
  const role: JWTPayload['role'] = u.role === 'admin' ? 'admin' : 'user';
  return {
    userId: u.id,
    tenantId: u.tenantId ?? 0,
    email: u.email ?? '',
    role,
    sessionId: `session-u-${u.id}`,
  };
}

function mapVendedorToJwtPayload(v: Vendedor, tenantId: number): JWTPayload {
  return {
    userId: v.id,
    tenantId,
    email: v.email ?? '',
    role: v.admin ? 'admin' : 'user',
    sessionId: `session-v-${v.id}`,
  };
}

/**
 * auth.login devolve tokens legados `u:` / `v:` — alinhado a createContext.
 */
async function resolveSessionTokenToPayload(token: string): Promise<JWTPayload | null> {
  if (token.startsWith('u:')) {
    const userId = parseInt(token.slice(2), 10);
    if (!Number.isFinite(userId)) return null;
    const u = await db.getUserById(userId);
    return u ? mapUserToJwtPayload(u) : null;
  }
  if (token.startsWith('v:')) {
    const id = parseInt(token.slice(2), 10);
    if (!Number.isFinite(id)) return null;
    const v = await db.getVendedorById(id);
    if (!v?.ativo) return null;
    const tenantId = v.tenantId ?? 0;
    return mapVendedorToJwtPayload(v, tenantId);
  }
  if (token === 'admin-session') {
    const u = await db.getUserByOpenId('admin');
    return u ? mapUserToJwtPayload(u) : null;
  }
  if (token === 'vendedor-session') {
    const vendedor = await db.getVendedorByUserId(2);
    if (!vendedor?.ativo) return null;
    const tenantId = vendedor.tenantId ?? 0;
    return mapVendedorToJwtPayload(vendedor, tenantId);
  }
  return null;
}

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
 * Middleware de autenticação: JWT (Bearer) ou sessão legada `u:` / `v:` (mesmo modelo que createContext).
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    try {
      const token = resolveSessionLikeToken(req);

      if (!token) {
        systemLogger.warn(
          {
            method: req.method,
            url: req.url,
            userAgent: req.get('User-Agent'),
            ip: req.ip,
            traceId: req.traceId,
          },
          'Authentication failed - no token provided'
        );

        res.status(401).json({
          error: 'Unauthorized',
          message: 'Access token required',
          code: 'TOKEN_MISSING',
        });
        return;
      }

      if (isLikelyJwt(token)) {
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
            'User authenticated'
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
            'Authentication failed'
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
      }

      const sessionPayload = await resolveSessionTokenToPayload(token);
      if (!sessionPayload) {
        systemLogger.warn(
          {
            method: req.method,
            url: req.url,
            userAgent: req.get('User-Agent'),
            ip: req.ip,
            traceId: req.traceId,
          },
          'Authentication failed - invalid session token'
        );
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid session token',
          code: 'TOKEN_INVALID',
        });
        return;
      }

      req.user = sessionPayload;
      req.sessionId = sessionPayload.sessionId;

      systemLogger.debug(
        {
          userId: sessionPayload.userId,
          tenantId: sessionPayload.tenantId,
          email: sessionPayload.email,
          role: sessionPayload.role,
          sessionId: sessionPayload.sessionId,
          method: req.method,
          url: req.url,
          traceId: req.traceId,
        },
        'User authenticated (session token)'
      );

      next();
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

  // Obter tenantId dos parâmetros ou do usuário
  const requestTenantId = req.params.tenantId || req.query.tenantId || req.body.tenantId;
  const userTenantId = req.user.tenantId;

  if (requestTenantId && String(requestTenantId) !== String(userTenantId)) {
    systemLogger.warn({
      method: req.method,
      url: req.url,
      userId: req.user.userId,
      userTenantId,
      requestTenantId,
      traceId: req.traceId
    }, 'Authorization failed - tenant mismatch');

    res.status(403).json({
      error: 'Forbidden',
      message: 'Tenant access denied',
      code: 'TENANT_MISMATCH'
    });
    return;
  }

  next();
}
