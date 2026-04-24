import { adminProcedure, publicProcedure, router } from './trpc.js';
import { systemLogger } from './logger.js';
import { checkDatabasePoolHealth, getPoolStats } from '../config/database.js';
import { z } from 'zod';

/**
 * Schema para resposta de health check
 */
const healthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  timestamp: z.string(),
  uptime: z.number(),
  version: z.string(),
  environment: z.string(),
  services: z.object({
    database: z.object({
      status: z.enum(['healthy', 'unhealthy', 'unknown']),
      lastCheck: z.string().optional(),
      responseTime: z.number().optional(),
      error: z.string().optional(),
      connectionAttempts: z.number().optional()
    }),
    memory: z.object({
      status: z.enum(['healthy', 'warning', 'critical']),
      used: z.number(),
      total: z.number(),
      percentage: z.number()
    }),
    cpu: z.object({
      status: z.enum(['healthy', 'warning', 'critical']),
      loadAverage: z.array(z.number()).optional(),
      usage: z.number().optional()
    })
  }),
  metrics: z.object({
    requestsPerMinute: z.number(),
    errorRate: z.number(),
    averageResponseTime: z.number()
  }).optional()
});

/**
 * Obtém informações do sistema
 */
function getSystemInfo() {
  const memUsage = process.memoryUsage();
  const uptime = process.uptime();
  
  return {
    memory: {
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100
    },
    uptime,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  };
}

/**
 * Verifica saúde do banco de dados
 */
async function checkDatabaseHealth() {
  const startTime = Date.now();

  try {
    const ok = await checkDatabasePoolHealth();
    const stats = await getPoolStats();
    const responseTime = Date.now() - startTime;

    if (!ok) {
      return {
        status: 'unhealthy' as const,
        lastCheck: new Date().toISOString(),
        responseTime,
        error: 'Database pool health check failed',
        connectionAttempts: stats.queued,
      };
    }

    systemLogger.info({
      message: 'Database health check successful',
      responseTime,
      queued: stats.queued,
    } as Record<string, unknown>);

    return {
      status: 'healthy' as const,
      lastCheck: new Date().toISOString(),
      responseTime,
      connectionAttempts: stats.queued,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;

    systemLogger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        responseTime,
      },
      'Database health check failed'
    );

    return {
      status: 'unhealthy' as const,
      lastCheck: new Date().toISOString(),
      responseTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Verifica saúde do sistema
 */
function checkSystemHealth() {
  const memUsage = process.memoryUsage();
  const memPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  
  let memoryStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (memPercentage > 90) {
    memoryStatus = 'critical';
  } else if (memPercentage > 75) {
    memoryStatus = 'warning';
  }
  
  return {
    memory: {
      status: memoryStatus,
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      percentage: memPercentage
    },
    cpu: {
      status: 'healthy' as const, // TODO: Implementar verificação real de CPU
      loadAverage: [] as number[],
      usage: 0
    }
  };
}

interface DbHealthInfo { status: 'healthy' | 'unhealthy' | 'unknown'; }
interface SystemHealthInfo { memory: { status: 'healthy' | 'warning' | 'critical' } }

/**
 * Calcula status geral do sistema
 */
function calculateOverallStatus(dbHealth: DbHealthInfo, systemHealth: SystemHealthInfo): 'healthy' | 'degraded' | 'unhealthy' {
  if (dbHealth.status === 'unhealthy' || systemHealth.memory.status === 'critical') {
    return 'unhealthy';
  }
  
  if (dbHealth.status === 'unknown' || systemHealth.memory.status === 'warning') {
    return 'degraded';
  }
  
  return 'healthy';
}

/**
 * Router de health check para monitoramento do sistema
 */
export const healthRouter = router({
  /**
   * Health check completo
   */
  check: publicProcedure
    .query(async () => {
      const startTime = Date.now();
      
      try {
        systemLogger.info({ message: 'Starting comprehensive health check' } as Record<string, unknown>);
        
        // Verificar banco de dados
        const dbHealth = await checkDatabaseHealth();
        
        // Verificar sistema
        const systemHealth = checkSystemHealth();
        
        // Calcular status geral
        const overallStatus = calculateOverallStatus(dbHealth, systemHealth);
        
        // Obter informações do sistema
        const systemInfo = getSystemInfo();
        
        const responseTime = Date.now() - startTime;
        
        const healthData = {
          status: overallStatus,
          timestamp: systemInfo.timestamp,
          uptime: systemInfo.uptime,
          version: systemInfo.version,
          environment: systemInfo.environment,
          services: {
            database: dbHealth,
            ...systemHealth
          }
        };
        
        systemLogger.info({
          status: overallStatus,
          responseTime,
          dbStatus: dbHealth.status,
          memoryUsage: systemHealth.memory.percentage
        }, 'Health check completed');
        
        // Validar resposta com Zod
        return healthResponseSchema.parse(healthData);
        
      } catch (error) {
        systemLogger.error({
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - startTime
        }, 'Health check failed');
        
        // Retornar status unhealthy em caso de erro
        return {
          status: 'unhealthy' as const,
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          version: process.env.npm_package_version || '1.0.0',
          environment: process.env.NODE_ENV || 'development',
          services: {
            database: {
              status: 'unhealthy' as const,
              error: error instanceof Error ? error.message : String(error)
            },
            memory: {
              status: 'critical' as const,
              used: 0,
              total: 0,
              percentage: 0
            },
            cpu: {
              status: 'critical' as const,
              loadAverage: [],
              usage: 0
            }
          }
        };
      }
    }),

  /**
   * Health check simples (para load balancers)
   */
  ping: publicProcedure
    .query(() => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      };
    }),

  /**
   * Health check apenas do banco de dados
   */
  database: publicProcedure
    .query(async () => {
      const dbHealth = await checkDatabaseHealth();
      return dbHealth;
    }),

  /**
   * Informações detalhadas do sistema (PROTEGIDO)
   */
  info: adminProcedure
    .query(() => {
      const systemInfo = getSystemInfo();
      const systemHealth = checkSystemHealth();
      
      return {
        ...systemInfo,
        health: systemHealth,
        process: {
          pid: process.pid,
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version
        }
      };
    }),

  /**
   * Métricas de performance (PROTEGIDO)
   */
  metrics: adminProcedure
    .input(z.object({
      timeframe: z.enum(['1m', '5m', '15m', '1h']).default('5m')
    }))
    .query(async ({ input }) => {
      // TODO: Implementar coleta real de métricas
      // Por enquanto, retornar dados simulados
      
      return {
        timeframe: input.timeframe,
        timestamp: new Date().toISOString(),
        requestsPerMinute: Math.floor(Math.random() * 100),
        errorRate: Math.random() * 5,
        averageResponseTime: Math.random() * 1000,
        databaseQueries: Math.floor(Math.random() * 500),
        activeConnections: Math.floor(Math.random() * 50)
      };
    })
});
