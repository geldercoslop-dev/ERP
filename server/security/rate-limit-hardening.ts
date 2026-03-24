import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { createLogger } from '../infra/structured-logger';

const logger = createLogger('rate-limit-hardening');

/**
 * Rate Limiting EXTREMO para endpoints críticos
 */
export function createCriticalRateLimit() {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 5, // Apenas 5 requests por minuto
    message: {
      error: 'Critical endpoint rate limit exceeded',
      retryAfter: 60,
      code: 'CRITICAL_RATE_LIMIT'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const userAgent = req.get('User-Agent') || 'unknown';
      return `critical:${ip}:${userAgent}`;
    },
    handler: (req: Request, res: Response) => {
      logger.warn('Critical rate limit exceeded', {
        metadata: {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          url: req.url,
          method: req.method,
          timestamp: new Date().toISOString(),
        }
      });

      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Critical endpoint rate limit exceeded',
        retryAfter: 60,
        code: 'CRITICAL_RATE_LIMIT'
      });
    }
  });
}

/**
 * Rate Limiting para endpoints de autenticação
 */
export function createAuthRateLimit() {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10, // 10 tentativas de login por 15 minutos
    message: {
      error: 'Authentication rate limit exceeded',
      retryAfter: 900,
      code: 'AUTH_RATE_LIMIT'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const email = req.body?.email || req.body?.usuario || 'unknown';
      return `auth:${ip}:${email}`;
    },
    handler: (req: Request, res: Response) => {
      logger.warn('Authentication rate limit exceeded', {
        metadata: {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          url: req.url,
          method: req.method,
          email: req.body?.email || req.body?.usuario,
          timestamp: new Date().toISOString(),
        }
      });

      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Too many authentication attempts, please try again later',
        retryAfter: 900,
        code: 'AUTH_RATE_LIMIT'
      });
    }
  });
}

/**
 * Rate Limiting para APIs sensíveis
 */
export function createSensitiveApiRateLimit() {
  return rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutos
    max: 50, // 50 requests por 5 minutos
    message: {
      error: 'Sensitive API rate limit exceeded',
      retryAfter: 300,
      code: 'SENSITIVE_API_RATE_LIMIT'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const tenantId = (req as any).tenantId || 'anonymous';
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      return `sensitive:${tenantId}:${ip}`;
    },
    handler: (req: Request, res: Response) => {
      logger.warn('Sensitive API rate limit exceeded', {
        metadata: {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          url: req.url,
          method: req.method,
          tenantId: (req as any).tenantId,
          timestamp: new Date().toISOString(),
        }
      });

      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Sensitive API rate limit exceeded',
        retryAfter: 300,
        code: 'SENSITIVE_API_RATE_LIMIT'
      });
    }
  });
}

/**
 * Rate Limiting para upload de arquivos
 */
export function createUploadRateLimit() {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 3, // 3 uploads por minuto
    message: {
      error: 'Upload rate limit exceeded',
      retryAfter: 60,
      code: 'UPLOAD_RATE_LIMIT'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const tenantId = (req as any).tenantId || 'anonymous';
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      return `upload:${tenantId}:${ip}`;
    },
    handler: (req: Request, res: Response) => {
      logger.warn('Upload rate limit exceeded', {
        metadata: {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          url: req.url,
          method: req.method,
          tenantId: (req as any).tenantId,
          contentLength: req.get('Content-Length'),
          timestamp: new Date().toISOString(),
        }
      });

      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Upload rate limit exceeded, please try again later',
        retryAfter: 60,
        code: 'UPLOAD_RATE_LIMIT'
      });
    }
  });
}

/**
 * Rate Limiting para LEO AI
 */
export function createLeoRateLimit() {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 20, // 20 requests por minuto
    message: {
      error: 'LEO AI rate limit exceeded',
      retryAfter: 60,
      code: 'LEO_RATE_LIMIT'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const tenantId = (req as any).tenantId || 'anonymous';
      const userId = (req as any).user?.id || 'anonymous';
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      return `leo:${tenantId}:${userId}:${ip}`;
    },
    handler: (req: Request, res: Response) => {
      logger.warn('LEO AI rate limit exceeded', {
        metadata: {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          url: req.url,
          method: req.method,
          tenantId: (req as any).tenantId,
          userId: (req as any).user?.id,
          timestamp: new Date().toISOString(),
        }
      });

      res.status(429).json({
        error: 'Too Many Requests',
        message: 'LEO AI rate limit exceeded, please try again later',
        retryAfter: 60,
        code: 'LEO_RATE_LIMIT'
      });
    }
  });
}

/**
 * Rate Limiting para prevenção de brute force
 */
export function createBruteForceProtection() {
  const attempts = new Map<string, { count: number; lastAttempt: number; blocked: boolean }>();
  
  return rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 3, // 3 tentativas por minuto
    message: {
      error: 'Brute force protection activated',
      retryAfter: 300, // 5 minutos de bloqueio
      code: 'BRUTE_FORCE_PROTECTION'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const email = req.body?.email || req.body?.usuario || 'unknown';
      return `brute:${ip}:${email}`;
    },
    handler: (req: Request, res: Response) => {
      logger.warn('Brute force protection activated', {
        metadata: {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          url: req.url,
          method: req.method,
          email: req.body?.email || req.body?.usuario,
          timestamp: new Date().toISOString(),
        }
      });

      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Brute force protection activated. Account temporarily locked.',
        retryAfter: 300,
        code: 'BRUTE_FORCE_PROTECTION'
      });
    },
    // Skip successful requests
    skipSuccessfulRequests: true,
  });
}

/**
 * Rate Limiting adaptativo baseado em comportamento
 */
export function createAdaptiveRateLimit() {
  const requestHistory = new Map<string, number[]>();
  
  return rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: (req: Request) => {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const history = requestHistory.get(ip) || [];
      const now = Date.now();
      
      // Limpar histórico antigo
      const recentHistory = history.filter(time => now - time < 300000); // 5 minutos
      requestHistory.set(ip, recentHistory);
      
      // Adaptar limite baseado no comportamento
      if (recentHistory.length > 100) {
        return 10; // Comportamento suspeito - limite muito baixo
      } else if (recentHistory.length > 50) {
        return 25; // Comportamento anormal - limite baixo
      } else if (recentHistory.length > 20) {
        return 50; // Comportamento normal - limite médio
      } else {
        return 100; // Comportamento baixo - limite normal
      }
    },
    message: {
      error: 'Adaptive rate limit exceeded',
      retryAfter: 60,
      code: 'ADAPTIVE_RATE_LIMIT'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      
      // Registrar request
      const history = requestHistory.get(ip) || [];
      history.push(Date.now());
      requestHistory.set(ip, history);
      
      return `adaptive:${ip}`;
    },
    handler: (req: Request, res: Response) => {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const history = requestHistory.get(ip) || [];
      
      logger.warn('Adaptive rate limit exceeded', {
        metadata: {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          url: req.url,
          method: req.method,
          requestCount: history.length,
          timestamp: new Date().toISOString(),
        }
      });

      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Adaptive rate limit exceeded',
        retryAfter: 60,
        code: 'ADAPTIVE_RATE_LIMIT'
      });
    }
  });
}

/**
 * Middleware completo de rate limiting hardening
 */
export function createHardeningRateLimits() {
  return [
    // Rate limit adaptativo geral
    createAdaptiveRateLimit(),
    
    // Rate limits específicos por endpoint
    {
      path: '/api/trpc/auth.login',
      limit: createAuthRateLimit()
    },
    {
      path: '/api/trpc/auth.register',
      limit: createAuthRateLimit()
    },
    {
      path: '/api/trpc/auth.forgotPassword',
      limit: createAuthRateLimit()
    },
    {
      path: '/api/trpc/auth.resetPassword',
      limit: createAuthRateLimit()
    },
    {
      path: '/admin',
      limit: createCriticalRateLimit()
    },
    {
      path: '/leo',
      limit: createLeoRateLimit()
    },
    {
      path: '/api/upload',
      limit: createUploadRateLimit()
    },
    {
      path: '/api/sensitive',
      limit: createSensitiveApiRateLimit()
    }
  ];
}

export default createHardeningRateLimits;
