/**
 * Rotas para exportação de métricas do sistema
 * 
 * Fornece endpoints para visualizar métricas de performance
 */

import { Router, Request, Response } from 'express';
import { metrics } from '../infra/metrics.js';
import { createLogger } from '../infra/structured-logger.js';
import { errorAlerter } from '../monitoring/error-alerter.js';

const router = Router();
const logger = createLogger('metrics');

type EndpointStat = {
  method: string;
  path: string;
  count: number;
  totalTime: number;
  errors: number;
  statusCodes: Record<number, number>;
};

type QueryPatternStat = {
  pattern: string;
  count: number;
  totalTime: number;
  errors: number;
  examples: Array<{ query: string; duration: number; timestamp: string }>;
};

/**
 * GET /api/metrics
 * Retorna métricas gerais do sistema
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const requestStats = metrics.getRequestStats(5); // últimos 5 minutos
    const slowQueries = metrics.getSlowQueries(10); // top 10 consultas lentas
    const systemMetrics = metrics.getCurrentSystemMetrics();
    const counters = metrics.getCounters();
    const errorStats = errorAlerter.getErrorStats();
    
    res.json({
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      requests: {
        total: requestStats.total,
        averageResponseTime: Math.round(requestStats.averageDuration * 100) / 100,
        errorRate: Math.round((requestStats.errorsPerMinute / Math.max(requestStats.total, 1)) * 10000) / 100,
        requestsPerMinute: Math.round((requestStats.total / 5) * 100) / 100
      },
      database: {
        slowQueries: slowQueries.map(q => ({
          query: q.query.substring(0, 100) + (q.query.length > 100 ? '...' : ''),
          duration: Math.round(q.duration * 100) / 100,
          timestamp: q.timestamp.toISOString()
        }))
      },
      system: {
        memory: systemMetrics.memory,
        cpu: systemMetrics.cpu,
        activeConnections: systemMetrics.activeConnections
      },
      errors: {
        total: errorStats.total,
        recentErrors: errorStats.recentErrors,
        topErrors: errorStats.topErrors.map(e => ({
          message: e.message.substring(0, 100) + (e.message.length > 100 ? '...' : ''),
          count: e.count,
          recentCount: e.recentCount
        }))
      },
      counters
    });
    
    logger.info('Metrics accessed', {
      requestId: req.requestId,
      userId: getUserId(req),
      metadata: {
        ip: req.ip
      }
    });
  } catch (error) {
    logger.error('Error accessing metrics', {
      requestId: req.requestId,
      error: error instanceof Error ? error.message : String(error),
      metadata: {
        stack: error instanceof Error ? error.stack : undefined
      }
    });
    
    res.status(500).json({
      error: 'Failed to retrieve metrics',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/metrics/requests
 * Retorna métricas detalhadas de requisições
 */
router.get('/requests', async (req: Request, res: Response) => {
  try {
    const minutes = Math.min(Number(req.query.minutes) || 5, 60);
    const requestMetrics = metrics.getRequestMetrics(minutes);
    
    // Agrupar por endpoint
    const endpointStats = requestMetrics.reduce<Record<string, EndpointStat>>((acc, metric) => {
      const key = `${metric.method}:${metric.path}`;
      if (!acc[key]) {
        acc[key] = {
          method: metric.method,
          path: metric.path,
          count: 0,
          totalTime: 0,
          errors: 0,
          statusCodes: {}
        };
      }
      
      acc[key].count++;
      acc[key].totalTime += metric.duration;
      
      if (metric.statusCode >= 400) {
        acc[key].errors++;
      }
      
      acc[key].statusCodes[metric.statusCode] = (acc[key].statusCodes[metric.statusCode] || 0) + 1;
      
      return acc;
    }, {});
    
    // Converter para array e calcular médias
    const endpoints = Object.values(endpointStats).map(endpoint => ({
      ...endpoint,
      averageTime: Math.round((endpoint.totalTime / endpoint.count) * 100) / 100,
      errorRate: Math.round((endpoint.errors / endpoint.count) * 10000) / 100
    }));
    
    // Ordenar por tempo médio (mais lento primeiro)
    endpoints.sort((a, b) => b.averageTime - a.averageTime);
    
    res.json({
      timestamp: new Date().toISOString(),
      period: `${minutes} minutes`,
      totalRequests: requestMetrics.length,
      endpoints
    });
    
  } catch (error) {
    logger.error('Error accessing request metrics', {
      requestId: req.requestId,
      error: error instanceof Error ? error.message : String(error)
    });
    
    res.status(500).json({
      error: 'Failed to retrieve request metrics',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/metrics/database
 * Retorna métricas detalhadas de banco de dados
 */
router.get('/database', async (req: Request, res: Response) => {
  try {
    const slowQueries = metrics.getSlowQueries(50);
    
    // Agrupar por padrão de query
    const queryPatterns = slowQueries.reduce<Record<string, QueryPatternStat>>((acc, query) => {
      // Simplificar query para agrupar similares
      const pattern = query.query
        .replace(/\b\d+\b/g, '?') // Substituir números por ?
        .replace(/('|").*?\1/g, '$1?$1') // Substituir strings por ?
        .trim();
      
      if (!acc[pattern]) {
        acc[pattern] = {
          pattern,
          count: 0,
          totalTime: 0,
          errors: 0,
          examples: []
        };
      }
      
      acc[pattern].count++;
      acc[pattern].totalTime += query.duration;
      
      if (!query.success) {
        acc[pattern].errors++;
      }
      
      // Guardar alguns exemplos
      if (acc[pattern].examples.length < 3) {
        acc[pattern].examples.push({
          query: query.query.substring(0, 200) + (query.query.length > 200 ? '...' : ''),
          duration: query.duration,
          timestamp: query.timestamp.toISOString()
        });
      }
      
      return acc;
    }, {});
    
    // Converter para array e calcular médias
    const patterns = Object.values(queryPatterns).map(pattern => ({
      ...pattern,
      averageTime: Math.round((pattern.totalTime / pattern.count) * 100) / 100,
      errorRate: Math.round((pattern.errors / pattern.count) * 10000) / 100
    }));
    
    // Ordenar por tempo médio (mais lento primeiro)
    patterns.sort((a, b) => b.averageTime - a.averageTime);
    
    res.json({
      timestamp: new Date().toISOString(),
      totalSlowQueries: slowQueries.length,
      patterns
    });
    
  } catch (error) {
    logger.error('Error accessing database metrics', {
      requestId: req.requestId,
      error: error instanceof Error ? error.message : String(error)
    });
    
    res.status(500).json({
      error: 'Failed to retrieve database metrics',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/metrics/errors
 * Retorna métricas de erros
 */
router.get('/errors', async (req: Request, res: Response) => {
  try {
    const errorStats = errorAlerter.getErrorStats();
    
    res.json({
      timestamp: new Date().toISOString(),
      totalErrors: errorStats.total,
      recentErrors: errorStats.recentErrors,
      topErrors: errorStats.topErrors
    });
    
  } catch (error) {
    logger.error('Error accessing error metrics', {
      requestId: req.requestId,
      error: error instanceof Error ? error.message : String(error)
    });
    
    res.status(500).json({
      error: 'Failed to retrieve error metrics',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;

function getUserId(req: Request): number | undefined {
  const candidate = (req as Request & { user?: { id?: unknown } }).user?.id;
  return typeof candidate === 'number' ? candidate : undefined;
}