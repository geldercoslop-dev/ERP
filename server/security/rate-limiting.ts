import { Request } from 'express';
import type { JWTPayload } from './jwt-auth.js';
import { securityLogger } from '../_core/logger.js';
import { createRedisRateLimitMiddleware } from './redis-rate-limit.js';

type TenantAwareRequest = Request & { tenantId?: string | number };

function getTenantId(req: Request): string {
  const tenantId = (req as TenantAwareRequest).tenantId;
  if (typeof tenantId === "number" && Number.isFinite(tenantId)) return String(tenantId);
  if (typeof tenantId === "string" && tenantId.trim() !== "") return tenantId.trim();
  return "anonymous";
}

function isLoopbackIp(ip: string | undefined): boolean {
  if (!ip) return false;
  const normalized = String(ip).trim();
  return (
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.startsWith("::ffff:127.0.0.1")
  );
}

/** Path tRPC montado em /api/trpc — ex.: /leo.perguntar */
export function trpcPathIncludesProcedure(req: Request, needle: string): boolean {
  const path = (req.path || "").split("?")[0];
  return path.includes(needle);
}

/**
 * Rate Limiting por Tenant + IP
 * Protege contra ataques e abuso por tenant
 */
export function createTenantRateLimit(options: {
  windowMs?: number;
  max?: number;
  message?: string;
} = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutos
    max = 1000, // 1000 requests por janela
    message = 'Too many requests from this tenant, please try again later.',
  } = options;

  return createRedisRateLimitMiddleware({
    name: 'tenant',
    windowMs,
    max,
    code: 'TENANT_RATE_LIMIT',
    message,
    keySuffix: (req: Request) => {
      const tenantId = getTenantId(req);
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      return `${tenantId}:${ip}`;
    },
    shouldApply: (req: Request) => {
      const path = req.path;
      const shouldSkip = (
        path.startsWith('/health') ||
        path.startsWith('/metrics') ||
        path.startsWith('/assets') ||
        path.startsWith('/_next') ||
        path.endsWith('.js') ||
        path.endsWith('.css') ||
        path.endsWith('.png') ||
        path.endsWith('.jpg') ||
        path.endsWith('.ico')
      );
      return !shouldSkip;
    },
    onBlocked: (req: Request) => {
      const tenantId = getTenantId(req);
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      
      securityLogger.warn({
        tenantId,
        ip,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
      }, `[Rate Limit] tenant ${tenantId} IP ${ip}`);
    },
  });
}

/**
 * Rate Limiting específico para endpoints críticos
 */
export function createCriticalRateLimit(options: {
  windowMs?: number;
  max?: number;
  message?: string;
} = {}) {
  const {
    windowMs = 5 * 60 * 1000, // 5 minutos
    max = 50, // 50 requests para endpoints críticos
    message = 'Too many requests to critical endpoint, please try again later.',
  } = options;

  return createRedisRateLimitMiddleware({
    name: 'critical',
    windowMs,
    max,
    code: 'CRITICAL_RATE_LIMIT',
    message,
    keySuffix: (req: Request) => {
      const tenantId = getTenantId(req);
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      return `critical:${tenantId}:${ip}`;
    },
    shouldApply: () => true,
    onBlocked: (req: Request) => {
      const tenantId = getTenantId(req);
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      
      securityLogger.error({
        tenantId,
        ip,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        severity: 'HIGH',
      }, `[Critical Rate Limit] tenant ${tenantId} IP ${ip}`);
    },
  });
}

/**
 * Rate Limiting para LEO AI
 */
export function createLeoRateLimit(options: {
  windowMs?: number;
  max?: number;
  message?: string;
} = {}) {
  const {
    windowMs = 60 * 1000, // 1 minuto
    max = 20, // 20 chamadas por minuto para LEO
    message = 'Too many LEO requests, please wait before making another request.',
  } = options;

  return createRedisRateLimitMiddleware({
    name: 'leo',
    windowMs,
    max,
    code: 'LEO_RATE_LIMIT',
    message,
    keySuffix: (req: Request) => {
      const jwt = req.user as JWTPayload | undefined;
      const tenantId = jwt?.tenantId ?? "anonymous";
      const userId = jwt?.userId ?? "anonymous";
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      return `leo:${tenantId}:${userId}:${ip}`;
    },
    shouldApply: (req: Request) => trpcPathIncludesProcedure(req, "leo."),
    onBlocked: (req: Request) => {
      const jwt = req.user as JWTPayload | undefined;
      const tenantId = jwt?.tenantId ?? "anonymous";
      const userId = jwt?.userId ?? "anonymous";
      const ip = req.ip || req.connection.remoteAddress || 'unknown';

      securityLogger.error({
        tenantId,
        userId,
        ip,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        severity: 'CRITICAL',
      }, `[LEO Rate Limit] user ${userId} tenant ${tenantId} IP ${ip}`);
    },
  });
}

/**
 * Rate Limiting para auth endpoints
 */
export function createAuthRateLimit(options: {
  windowMs?: number;
  max?: number;
  message?: string;
} = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutos
    max = process.env.NODE_ENV === "development" ? 10 : 10,
    message = 'Too many authentication attempts, please try again later.',
  } = options;

  return createRedisRateLimitMiddleware({
    name: 'auth',
    windowMs,
    max,
    code: 'AUTH_RATE_LIMIT',
    message,
    keySuffix: (req: Request) => {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      return `auth:${ip}`;
    },
    shouldApply: (req: Request) => {
      const path = req.path;
      const isAuthEndpoint =
        path.includes("/login") || path.includes("/auth") || path.includes("/signin");
      if (!isAuthEndpoint) return false;
      // Dev + localhost: mesmo critério do rate limit global em index.ts (carga / http-perf).
      if (process.env.NODE_ENV === "development" && isLoopbackIp(req.ip || req.connection.remoteAddress)) {
        return false;
      }
      return true;
    },
    onBlocked: (req: Request) => {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      
      securityLogger.error({
        ip,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        severity: 'CRITICAL',
      }, `[Auth Rate Limit] IP ${ip}`);
    },
  });
}

/**
 * Rate limit para rotas tRPC financeiro.* (por IP + usuário JWT + tenant).
 */
export function createFinanceiroTrpcRateLimit(options: {
  windowMs?: number;
  max?: number;
  message?: string;
} = {}) {
  const {
    windowMs = 60 * 1000,
    max = process.env.NODE_ENV === "development" ? 200 : 45,
    message = "Limite de requisições financeiro excedido. Aguarde e tente novamente.",
  } = options;

  return createRedisRateLimitMiddleware({
    name: 'financeiro',
    windowMs,
    max,
    code: 'FINANCEIRO_RATE_LIMIT',
    message,
    keySuffix: (req: Request) => {
      const jwt = req.user as JWTPayload | undefined;
      const tenantId = jwt?.tenantId ?? "anon";
      const userId = jwt?.userId ?? "anon";
      const ip = req.ip || req.connection.remoteAddress || "unknown";
      return `fin:${tenantId}:${userId}:${ip}`;
    },
    shouldApply: (req: Request) => trpcPathIncludesProcedure(req, "financeiro."),
    onBlocked: (req: Request) => {
      const ip = req.ip || req.connection.remoteAddress || "unknown";
      securityLogger.error({ ip, path: req.path }, "[Financeiro Rate Limit]");
    },
  });
}

/**
 * Limite composto por usuário autenticado em /api/trpc (JWT obrigatório nas rotas protegidas).
 * Login público continua limitado só pelo global + auth limiter.
 */
export function createTrpcAuthenticatedRateLimit(options: {
  windowMs?: number;
  max?: number;
  message?: string;
} = {}) {
  const {
    windowMs = 60 * 1000,
    max = process.env.NODE_ENV === "development" ? 4000 : 900,
    message = "Muitas requisições à API. Tente novamente em instantes.",
  } = options;

  return createRedisRateLimitMiddleware({
    name: 'trpc-authenticated',
    windowMs,
    max,
    code: 'TRPC_AUTH_RATE_LIMIT',
    message,
    keySuffix: (req: Request) => {
      const jwt = req.user as JWTPayload | undefined;
      const ip = req.ip || req.connection.remoteAddress || "unknown";
      if (jwt?.userId != null && jwt?.tenantId != null) {
        return `trpc-user:${jwt.tenantId}:${jwt.userId}:${ip}`;
      }
      return `trpc-anon:${ip}`;
    },
    shouldApply: (req: Request) => {
      if (req.method === "OPTIONS") return false;
      if (req.path.includes("/api/trpc/health")) return false;
      return true;
    },
    onBlocked: (req: Request) => {
      securityLogger.warn({ path: req.path, method: req.method }, "[TRPC Authenticated Rate Limit]");
    },
  });
}
