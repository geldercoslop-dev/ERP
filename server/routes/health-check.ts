/**
 * Health Check Avançado
 * 
 * Rota: /health
 * Verifica: banco, memória, CPU, uptime, métricas
 * Retorna: JSON com status detalhado do sistema
 */

import { Request, Response } from 'express';
import { getDb, getConnectionPool } from '../db/index';
import { createLogger } from '../infra/structured-logger';
import { metrics } from '../infra/metrics';
import { performance } from 'perf_hooks';
import os from 'os';

const logger = createLogger('health-check');

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  checks: {
    database: {
      status: 'healthy' | 'warning' | 'critical';
      responseTime?: number;
      connections?: {
        active: number;
        idle: number;
        total: number;
        max: number;
      };
      error?: string;
    };
    memory: {
      status: 'healthy' | 'warning' | 'critical';
      usage: {
        rss: number;
        heapTotal: number;
        heapUsed: number;
        external: number;
        percentage: number;
      };
      system: {
        total: number;
        free: number;
        percentage: number;
      };
    };
    cpu: {
      status: 'healthy' | 'warning' | 'critical';
      load: number[];
      cores: number;
    };
    api: {
      status: 'healthy' | 'warning' | 'critical';
      requests: {
        total: number;
        errors: number;
        avgResponseTime: number;
      };
      slowEndpoints?: Array<{
        path: string;
        method: string;
        avgTime: number;
        count: number;
      }>;
    };
  };
}

/**
 * Health Check completo para produção
 */
export async function healthCheck(req: Request, res: Response): Promise<void> {
  const startTime = performance.now();
  
  try {
    logger.info('Health check initiated', {
      requestId: req.requestId,
      metadata: {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      }
    });
    
    // Executar verificações em paralelo para melhor performance
    const [
      databaseCheck,
      memoryCheck,
      cpuCheck,
      apiCheck
    ] = await Promise.all([
      checkDatabase(),
      checkMemory(),
      checkCpu(),
      checkApi()
    ]);
    
    const healthResponse: HealthResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks: {
        database: databaseCheck,
        memory: memoryCheck,
        cpu: cpuCheck,
        api: apiCheck
      }
    };
    
    // Determinar status geral
    const criticalChecks = Object.values(healthResponse.checks).filter(
      check => check.status === 'critical'
    );
    
    const warningChecks = Object.values(healthResponse.checks).filter(
      check => check.status === 'warning'
    );
    
    if (criticalChecks.length > 0) {
      healthResponse.status = 'unhealthy';
    } else if (warningChecks.length > 0) {
      healthResponse.status = 'degraded';
    }
    
    // Adicionar headers de monitoramento
    res.setHeader('X-Health-Status', healthResponse.status);
    res.setHeader('X-Health-Uptime', healthResponse.uptime.toString());
    res.setHeader('X-Response-Time', (performance.now() - startTime).toFixed(2));
    
    // Retornar resposta
    res.status(healthResponse.status === 'unhealthy' ? 503 : 200).json(healthResponse);
    
    // Log de conclusão
    logger.info('Health check completed', {
      requestId: req.requestId,
      duration: performance.now() - startTime,
      status: healthResponse.status,
      metadata: {
        criticalChecks: criticalChecks.length,
        warningChecks: warningChecks.length
      }
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error('Health check failed', {
      requestId: req.requestId,
      error: errorMessage,
      metadata: {
        stack: error instanceof Error ? error.stack : undefined
      }
    });
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      message: errorMessage
    });
  }
}

/**
 * Verifica saúde do banco de dados
 */
async function checkDatabase(): Promise<HealthResponse['checks']['database']> {
  const startTime = performance.now();
  
  try {
    const db = await getDb();
    if (!db) {
      return {
        status: 'critical',
        error: 'Database connection failed'
      };
    }
    
    // Testar query simples
    await db.execute('SELECT 1 as health_check');
    const responseTime = performance.now() - startTime;
    
    // Obter estatísticas do pool de conexões
    let connections;
    try {
      const pool = await getConnectionPool();
      const stats = await new Promise<any>((resolve) => {
        (pool as any).pool.getConnection((err: any, conn: any) => {
          if (err) {
            resolve({ active: 0, idle: 0, total: 0, max: 0 });
            return;
          }
          
          const poolStats = (pool as any).pool._allConnections.length;
          const activeConnections = (pool as any).pool._acquiringConnections.length;
          const idleConnections = (pool as any).pool._freeConnections.length;
          const maxConnections = (pool as any).pool.config.connectionLimit;
          
          conn.release();
          
          resolve({
            active: activeConnections,
            idle: idleConnections,
            total: poolStats,
            max: maxConnections
          });
        });
      });
      
      connections = stats;
    } catch (e) {
      connections = { active: 0, idle: 0, total: 0, max: 0 };
    }
    
    // Determinar status com base no tempo de resposta e uso do pool
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    
    if (responseTime > 1000) {
      status = 'critical';
    } else if (responseTime > 500) {
      status = 'warning';
    }
    
    // Se o pool estiver quase esgotado, elevar o status
    if (connections && connections.total > connections.max * 0.9) {
      status = 'critical';
    } else if (connections && connections.total > connections.max * 0.8) {
      status = 'warning';
    }
    
    return {
      status,
      responseTime,
      connections
    };
    
  } catch (error) {
    return {
      status: 'critical',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Verifica saúde da memória
 */
function checkMemory(): HealthResponse['checks']['memory'] {
  const memUsage = process.memoryUsage();
  const systemMemory = {
    total: os.totalmem(),
    free: os.freemem()
  };
  
  const heapUsedPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  const systemUsedPercentage = ((systemMemory.total - systemMemory.free) / systemMemory.total) * 100;
  
  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  
  if (heapUsedPercentage > 90 || systemUsedPercentage > 95) {
    status = 'critical';
  } else if (heapUsedPercentage > 75 || systemUsedPercentage > 85) {
    status = 'warning';
  }
  
  return {
    status,
    usage: {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
      percentage: Math.round(heapUsedPercentage * 100) / 100
    },
    system: {
      total: Math.round(systemMemory.total / 1024 / 1024),
      free: Math.round(systemMemory.free / 1024 / 1024),
      percentage: Math.round(systemUsedPercentage * 100) / 100
    }
  };
}

/**
 * Verifica saúde da CPU
 */
function checkCpu(): HealthResponse['checks']['cpu'] {
  const cpuLoad = os.loadavg();
  const cpuCores = os.cpus().length;
  
  // Carga normalizada por núcleo (1.0 = 100% de um núcleo)
  const normalizedLoad = cpuLoad[0] / cpuCores;
  
  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  
  if (normalizedLoad > 0.8) {
    status = 'critical';
  } else if (normalizedLoad > 0.7) {
    status = 'warning';
  }
  
  return {
    status,
    load: cpuLoad,
    cores: cpuCores
  };
}

/**
 * Verifica saúde das APIs
 */
function checkApi(): HealthResponse['checks']['api'] {
  // Obter estatísticas das últimas 5 minutos
  const stats = metrics.getRequestStats(5);
  
  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  
  // Se houver muitos erros ou tempo de resposta alto
  const errorRate = stats.total > 0 ? (stats.errorsPerMinute / stats.total) * 100 : 0;
  
  if (errorRate > 10 || stats.averageDuration > 1000) {
    status = 'critical';
  } else if (errorRate > 5 || stats.averageDuration > 500) {
    status = 'warning';
  }
  
  // Identificar endpoints lentos
  const slowEndpoints = stats.slowestRequests
    .reduce((acc, req) => {
      const key = `${req.method}:${req.path}`;
      if (!acc[key]) {
        acc[key] = { path: req.path, method: req.method, times: [], count: 0 };
      }
      acc[key].times.push(req.duration);
      acc[key].count++;
      return acc;
    }, {} as Record<string, { path: string; method: string; times: number[]; count: number; }>);
  
  const slowEndpointsArray = Object.values(slowEndpoints)
    .map(endpoint => ({
      path: endpoint.path,
      method: endpoint.method,
      avgTime: endpoint.times.reduce((sum, time) => sum + time, 0) / endpoint.times.length,
      count: endpoint.count
    }))
    .filter(endpoint => endpoint.avgTime > 500)
    .sort((a, b) => b.avgTime - a.avgTime)
    .slice(0, 5);
  
  return {
    status,
    requests: {
      total: stats.total,
      errors: stats.errorsPerMinute,
      avgResponseTime: Math.round(stats.averageDuration * 100) / 100
    },
    slowEndpoints: slowEndpointsArray.length > 0 ? slowEndpointsArray : undefined
  };
}

/**
 * Health check simples (sem dependências externas)
 */
export function simpleHealthCheck(req: Request, res: Response): void {
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();
  
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(uptime),
    memory: {
      used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
    },
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  });
}

/**
 * Health check para load balancers
 */
export function loadBalancerHealthCheck(_req: Request, res: Response): void {
  // Resposta simples para load balancers
  res.status(200).send('OK');
}

export default healthCheck;