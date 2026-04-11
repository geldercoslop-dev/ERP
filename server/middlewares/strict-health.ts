/**
 * Strict Health Middleware
 * 
 * Garante que qualquer falha de saúde retorne 503
 * Previne falso positivo de saúde
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../_core/logger.js';

interface HealthCheck {
  name: string;
  check: () => Promise<boolean>;
  timeout?: number;
}

interface StrictHealthConfig {
  checks: HealthCheck[];
  timeoutMs: number;
  failFast: boolean;
}

/**
 * Middleware de saúde estrito
 * Força 503 em qualquer falha crítica
 */
export function createStrictHealthMiddleware(config: StrictHealthConfig) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // A rota canônica /api/health (/health) é tratada no handler dedicado.
    if (req.path === '/api/health' || req.path === '/health') {
      return next();
    }

    // Só aplica a endpoints de saúde auxiliares
    if (!req.path.includes('/health') && !req.path.includes('/ping')) {
      return next();
    }

    try {
      const results: Record<string, { status: 'healthy' | 'unhealthy'; error?: string; responseTime: number }> = {};
      let overallHealthy = true;

      // Executar todos os checks
      for (const healthCheck of config.checks) {
        const startTime = Date.now();
        
        try {
          const timeout = healthCheck.timeout || config.timeoutMs;
          const isHealthy = await Promise.race([
            healthCheck.check(),
            new Promise<boolean>((_, reject) => 
              setTimeout(() => reject(new Error('Health check timeout')), timeout)
            )
          ]);

          const responseTime = Date.now() - startTime;
          
          results[healthCheck.name] = {
            status: isHealthy ? 'healthy' : 'unhealthy',
            responseTime
          };

          if (!isHealthy) {
            overallHealthy = false;
            if (config.failFast) {
              break;
            }
          }

        } catch (error) {
          const responseTime = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          results[healthCheck.name] = {
            status: 'unhealthy',
            error: errorMessage,
            responseTime
          };

          overallHealthy = false;
          
          logger.error(
            {
              check: healthCheck.name,
              error: errorMessage,
              responseTime,
              timestamp: new Date().toISOString()
            },
            'Health check failed'
          );

          if (config.failFast) {
            break;
          }
        }
      }

      // Se não está saudável, forçar 503
      if (!overallHealthy) {
        logger.error(
          {
            results,
            path: req.path,
            timestamp: new Date().toISOString()
          },
          'System unhealthy - forcing 503'
        );

        res.status(503).json({
          status: 'unhealthy',
          message: 'Service Unavailable',
          checks: results,
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Se está saudável, continua
      req.healthChecks = results;
      next();

    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          path: req.path,
          timestamp: new Date().toISOString()
        },
        'Health middleware error - forcing 503'
      );

      // Qualquer erro no middleware = 503
      res.status(503).json({
        status: 'unhealthy',
        message: 'Health check failed',
        error: 'Internal health check error',
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * Configuração padrão de checks críticos
 */
export const defaultHealthChecks: HealthCheck[] = [
  {
    name: 'database',
    check: async (): Promise<boolean> => {
      const { pingDatabase } = await import('../services/database-health.service.js');
      const result = await pingDatabase('STRICT_HEALTH');
      return result.ok;
    },
    timeout: 5000
  },
  {
    name: 'redis',
    check: async (): Promise<boolean> => {
      try {
        const { createClient } = await import('redis');
        const redis = createClient({
          socket: {
            host: process.env.REDIS_HOST || 'localhost',
            port: Number(process.env.REDIS_PORT) || 6379,
            connectTimeout: 3000,
          },
        });

        await redis.connect();
        await redis.ping();
        await redis.quit();
        return true;
      } catch {
        return false;
      }
    },
    timeout: 3000
  },
  {
    name: 'memory',
    check: async (): Promise<boolean> => {
      const memUsage = process.memoryUsage();
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
      const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
      
      // Considera não saudável se usar > 90% do heap
      const usagePercentage = (heapUsedMB / heapTotalMB) * 100;
      return usagePercentage < 90;
    },
    timeout: 1000
  },
  {
    name: 'disk',
    check: async (): Promise<boolean> => {
      try {
        const fs = await import('fs');
        const stats = await fs.promises.stat('./');
        return !!stats;
      } catch {
        return false;
      }
    },
    timeout: 2000
  }
];

/**
 * Middleware de saúde estrito padrão (export)
 */
export const strictHealthMiddleware = createStrictHealthMiddleware({
  checks: defaultHealthChecks,
  timeoutMs: 10000,
  failFast: true
});

// Extensão do tipo Request
declare module 'express' {
  interface Request {
    healthChecks?: Record<string, { status: 'healthy' | 'unhealthy'; error?: string; responseTime: number }>;
  }
}
