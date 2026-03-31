import { Request, Response, NextFunction } from 'express';
import { recordRequest, metrics } from './metrics.js';

/**
 * Middleware para medir tempo de requests
 */
export function metricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Intercepta o método res.end para capturar o tempo final
    const originalEnd = res.end.bind(res);
    res.end = function(...args: any[]) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Registra métricas do request
      recordRequest({
        method: req.method,
        path: req.path || req.url,
        statusCode: res.statusCode,
        duration,
        timestamp: new Date(startTime),
        userAgent: req.get('User-Agent'),
        ip: req.ip || req.connection.remoteAddress,
        userId: (req as any).user?.id,
        tenantId: (req as any).tenantId,
      });
      
      // Chama o método original
      return originalEnd(...args);
    };
    
    next();
  };
}

/**
 * Middleware para medir tempo de queries lentas
 */
export function databaseMetricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Adiciona método para registrar métricas de DB no request
    (req as any).recordDbMetric = (query: string, duration: number, success: boolean, error?: string) => {
      const dbMetrics = {
        query,
        duration,
        timestamp: new Date(),
        success,
        error,
        tenantId: (req as any).tenantId,
      };
      
      // Registra query lenta (>300ms)
      if (duration > 300) {
        metrics.recordDatabase(dbMetrics);
      }
    };
    
    next();
  };
}
