import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import type { JWTPayload } from './jwt-auth';
import { securityLogger } from '../_core/logger';

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

  return rateLimit({
    windowMs,
    max,
    message: {
      error: message,
      retryAfter: Math.ceil(windowMs / 1000),
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Chave customizada: tenantId + IP
    keyGenerator: (req: Request) => {
      const tenantId = (req as any).tenantId || 'anonymous';
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      return `${tenantId}:${ip}`;
    },
    // Skip para health checks e arquivos estáticos
    skip: (req: Request) => {
      const path = req.path;
      return (
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
    },
    // Handler customizado com logging
    handler: (req: Request, res: Response) => {
      const tenantId = (req as any).tenantId || 'anonymous';
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      
      securityLogger.warn({
        tenantId,
        ip,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
      }, `[Rate Limit] tenant ${tenantId} IP ${ip}`);
      
      res.status(429).json({
        error: message,
        retryAfter: Math.ceil(windowMs / 1000),
        tenantId,
        ip,
      });
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

  return rateLimit({
    windowMs,
    max,
    message: {
      error: message,
      retryAfter: Math.ceil(windowMs / 1000),
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const tenantId = (req as any).tenantId || 'anonymous';
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      return `critical:${tenantId}:${ip}`;
    },
    handler: (req: Request, res: Response) => {
      const tenantId = (req as any).tenantId || 'anonymous';
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

      res.status(429).json({
        error: message,
        retryAfter: Math.ceil(windowMs / 1000),
        tenantId,
        ip,
        severity: 'HIGH',
      });
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

  return rateLimit({
    windowMs,
    max,
    message: {
      error: message,
      retryAfter: Math.ceil(windowMs / 1000),
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const jwt = req.user as JWTPayload | undefined;
      const tenantId = jwt?.tenantId ?? "anonymous";
      const userId = jwt?.userId ?? "anonymous";
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      return `leo:${tenantId}:${userId}:${ip}`;
    },
    skip: (req: Request) => !trpcPathIncludesProcedure(req, "leo.") && !trpcPathIncludesProcedure(req, "health.") && !trpcPathIncludesProcedure(req, "health."),
    handler: (req: Request, res: Response) => {
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

      res.status(429).json({
        error: message,
        retryAfter: Math.ceil(windowMs / 1000),
        tenantId,
        userId,
        ip,
        severity: 'CRITICAL',
      });
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

  return rateLimit({
    windowMs,
    max,
    message: {
      error: message,
      retryAfter: Math.ceil(windowMs / 1000),
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      return `auth:${ip}`;
    },
    skip: (req: Request) => {
      const path = req.path;
      const isAuthEndpoint =
        path.includes("/login") || path.includes("/auth") || path.includes("/signin");
      if (!isAuthEndpoint) return true;
      // Dev + localhost: mesmo critério do rate limit global em index.ts (carga / http-perf).
      if (process.env.NODE_ENV === "development" && isLoopbackIp(req.ip || req.connection.remoteAddress)) {
        return true;
      }
      return false;
    },
    handler: (req: Request, res: Response) => {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      
      securityLogger.error({
        ip,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        severity: 'CRITICAL',
      }, `[Auth Rate Limit] IP ${ip}`);

      res.status(429).json({
        error: message,
        retryAfter: Math.ceil(windowMs / 1000),
        ip,
        severity: 'CRITICAL',
      });
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

  return rateLimit({
    windowMs,
    max,
    message: { error: message, retryAfter: Math.ceil(windowMs / 1000) },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const jwt = req.user as JWTPayload | undefined;
      const tenantId = jwt?.tenantId ?? "anon";
      const userId = jwt?.userId ?? "anon";
      const ip = req.ip || req.connection.remoteAddress || "unknown";
      return `fin:${tenantId}:${userId}:${ip}`;
    },
    skip: (req: Request) => !trpcPathIncludesProcedure(req, "financeiro.") && !trpcPathIncludesProcedure(req, "health.") && !trpcPathIncludesProcedure(req, "health."),
    handler: (req: Request, res: Response) => {
      const ip = req.ip || req.connection.remoteAddress || "unknown";
      securityLogger.error({ ip, path: req.path }, "[Financeiro Rate Limit]");
      res.status(429).json({
        error: message,
        retryAfter: Math.ceil(windowMs / 1000),
        ip,
      });
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

  return rateLimit({
    windowMs,
    max,
    message: { error: message, retryAfter: Math.ceil(windowMs / 1000) },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const jwt = req.user as JWTPayload | undefined;
      const ip = req.ip || req.connection.remoteAddress || "unknown";
      if (jwt?.userId != null && jwt?.tenantId != null) {
        return `trpc-user:${jwt.tenantId}:${jwt.userId}:${ip}`;
      }
      return `trpc-anon:${ip}`;
    },
    skip: (req: Request) => {
      if (req.method === "OPTIONS") return true;
      if (req.path.includes("/api/trpc/health")) return true;
      return false;
    },
  });
}
