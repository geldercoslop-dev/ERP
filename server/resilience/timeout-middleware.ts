import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../infra/structured-logger.js';
import { isHealthProbePath } from '../_core/health-probe-paths.js';

const logger = createLogger('timeout-middleware');

/**
 * Middleware de timeout global para requests
 * Protege contra requests lentas que podem sobrecarregar o sistema
 */
export function globalTimeoutMiddleware(timeoutMs: number = 10000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const pathOnly = req.path || req.url || "";
    if (isHealthProbePath(pathOnly)) {
      return next();
    }
    const startTime = Date.now();
    let timedOut = false;

    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    const originalEnd = res.end.bind(res);

    const shouldSkipResponse = () => timedOut || res.headersSent || res.writableEnded;

    res.json = ((body: unknown) => {
      if (shouldSkipResponse()) {
        logger.warn('Response suppressed after timeout/headers sent', {
          metadata: {
            url: req.url,
            method: req.method,
            timeout: timeoutMs,
          },
        });
        return res;
      }
      return originalJson(body);
    }) as Response['json'];

    res.send = ((body?: unknown) => {
      if (shouldSkipResponse()) {
        logger.warn('Send suppressed after timeout/headers sent', {
          metadata: {
            url: req.url,
            method: req.method,
            timeout: timeoutMs,
          },
        });
        return res;
      }
      return originalSend(body);
    }) as Response['send'];

    res.end = ((chunk?: unknown, encoding?: BufferEncoding | (() => void), cb?: () => void) => {
      if (shouldSkipResponse()) {
        logger.warn('End suppressed after timeout/headers sent', {
          metadata: {
            url: req.url,
            method: req.method,
            timeout: timeoutMs,
          },
        });
        if (typeof encoding === 'function') {
          encoding();
        }
        if (typeof cb === 'function') {
          cb();
        }
        return res;
      }
      return originalEnd(chunk as never, encoding as never, cb as never);
    }) as Response['end'];
    
    // Timeout timer
    const timeout = setTimeout(() => {
      timedOut = true;
      (res.locals as Record<string, unknown>).requestTimedOut = true;
      logger.warn('Request timeout', {
        metadata: {
          url: req.url,
          method: req.method,
          timeout: timeoutMs,
          duration: Date.now() - startTime,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });
      
      // Fechar response se ainda não enviada
      if (!res.headersSent) {
        res.status(408).json({
          error: 'Request Timeout',
          message: `Request exceeded ${timeoutMs}ms timeout`,
          timeout: timeoutMs,
        });
      }
    }, timeoutMs);
    
    // Limpar timeout quando response terminar
    res.on('finish', () => {
      clearTimeout(timeout);
      
      // Log requests lentas (mas que completaram)
      const duration = Date.now() - startTime;
      if (duration > timeoutMs * 0.8) {
        logger.warn('Slow request detected', {
          metadata: {
            url: req.url,
            method: req.method,
            duration,
            timeout: timeoutMs,
            ip: req.ip,
          },
        });
      }
    });
    
    // Limpar timeout em caso de erro
    res.on('error', () => {
      clearTimeout(timeout);
    });
    
    next();
  };
}

/**
 * Timeout específico para operações de banco
 */
export function databaseTimeout(timeoutMs: number = 5000) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const timeout = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Database operation timeout: ${timeoutMs}ms`));
        }, timeoutMs);
      });
      
      try {
        const result = await Promise.race([
          originalMethod.apply(this, args),
          timeout,
        ]);
        return result;
      } catch (error) {
        logger.error('Database operation timeout', `Database operation ${propertyKey} timeout`, {
          metadata: {
            operation: propertyKey,
            timeout: timeoutMs,
            args: args.length,
          },
        });
        throw error;
      }
    };
    
    return descriptor;
  };
}

/**
 * Timeout para APIs externas
 */
export function externalApiTimeout(timeoutMs: number = 8000) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const timeout = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`External API timeout: ${timeoutMs}ms`));
        }, timeoutMs);
      });
      
      try {
        const result = await Promise.race([
          originalMethod.apply(this, args),
          timeout,
        ]);
        return result;
      } catch (error) {
        logger.error('External API timeout', `External API ${propertyKey} timeout`, {
          metadata: {
            api: propertyKey,
            timeout: timeoutMs,
            args: args.length,
          },
        });
        throw error;
      }
    };
    
    return descriptor;
  };
}

/**
 * Wrapper para operações com timeout manual
 */
export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  operationName: string = 'operation'
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operationName} timeout: ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  try {
    const result = await Promise.race([operation, timeout]);
    return result;
  } catch (error) {
    logger.error('Operation timeout', `Operation ${operationName} timeout`, {
      metadata: {
        operation: operationName,
        timeout: timeoutMs,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
    throw error;
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Configurações de timeout por tipo de operação
 */
export const TIMEOUT_CONFIG = {
  // Requests HTTP
  HTTP_REQUEST: 10000, // 10s
  API_REQUEST: 8000,   // 8s
  
  // Database
  DB_QUERY: 5000,      // 5s
  DB_TRANSACTION: 8000, // 8s
  DB_CONNECTION: 3000, // 3s
  
  // External APIs
  EXTERNAL_API: 8000,  // 8s
  PAYMENT_API: 10000,  // 10s
  EMAIL_API: 15000,    // 15s
  
  // File operations
  FILE_UPLOAD: 30000,  // 30s
  FILE_DOWNLOAD: 20000, // 20s
  
  // Cache operations
  CACHE_GET: 1000,     // 1s
  CACHE_SET: 2000,     // 2s
} as const;
