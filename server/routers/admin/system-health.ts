/**
 * Endpoint de Monitoramento do Sistema
 * 
 * Fornece informações sobre saúde do sistema para administração
 * Inclui métricas de memória, CPU, jobs e filas
 */

import { Request, Response } from 'express';
import { queueManager } from '../../queue/queue.js';
import { getJobExecutionStats } from '../../queue/idempotency.js';
import { getRateLimitStats } from '../../queue/rate-limiter.js';
import { leoLoop } from '../../leo/engine/leo-loop.js';
import { leoLoopProtection } from '../../leo/security/leo-loop-protection.js';
import { logInfo, logError } from '../../_core/logger.js';
import type { HealthCheck } from "../../../shared/types/index.js";
import { sql } from 'drizzle-orm';

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'critical';
  timestamp: string;
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
    heap: NodeJS.MemoryUsage;
  };
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  queues: {
    total: number;
    active: number;
    waiting: number;
    failed: number;
    stats: Record<string, any>;
  };
  jobs: {
    total: number;
    started: number;
    completed: number;
    failed: number;
    byType: Record<string, number>;
  };
  leo: {
    loop: {
      isRunning: boolean;
      runCount: number;
      errors: number;
      uptime: number;
      lastRun: string | null;
    };
    protection: {
      totalTasks: number;
      blockedTasks: number;
      totalAlerts: number;
      criticalAlerts: number;
    };
  };
  rateLimits: {
    stats: Record<string, any>;
  };
  database: {
    status: 'connected' | 'disconnected' | 'error';
    responseTime: number;
  };
}

/**
 * Obtém métricas de memória do sistema
 */
function getMemoryMetrics() {
  const memUsage = process.memoryUsage();
  const totalMemory = require('os').totalmem();
  const freeMemory = require('os').freemem();
  const usedMemory = totalMemory - freeMemory;
  
  return {
    used: usedMemory,
    total: totalMemory,
    percentage: (usedMemory / totalMemory) * 100,
    heap: memUsage,
  };
}

/**
 * Obtém métricas de CPU do sistema
 */
function getCpuMetrics() {
  const cpus = require('os').cpus();
  const loadAvg = require('os').loadavg();
  
  // Calcular uso médio da CPU
  let totalIdle = 0;
  let totalTick = 0;
  
  cpus.forEach((cpu: { times: { user: number; nice: number; sys: number; idle: number; irq: number; } }) => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  });
  
  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;
  const usage = 100 - (idle / total) * 100;
  
  return {
    usage: Math.round(usage * 100) / 100,
    loadAverage: loadAvg,
  };
}

/**
 * Verifica saúde do banco de dados
 */
async function checkDatabaseHealth(): Promise<{
  status: 'connected' | 'disconnected' | 'error';
  responseTime: number;
}> {
  const startTime = Date.now();
  
  try {
    // Simular verificação de conexão (implementar real se necessário)
    const { getDb } = await import('../../db/index.js');
    const db = await getDb();
    
    if (!db) {
      return {
        status: 'disconnected',
        responseTime: Date.now() - startTime,
      };
    }
    
    // Tentar uma query simples
    await db.execute(sql`SELECT 1`);
    
    return {
      status: 'connected',
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      status: 'error',
      responseTime: Date.now() - startTime,
    };
  }
}

/**
 * Determina status geral do sistema
 */
function determineOverallStatus(health: Partial<SystemHealth>): 'healthy' | 'degraded' | 'critical' {
  // Verificar critérios críticos
  if (
    health.memory?.percentage && health.memory.percentage > 90 ||
    health.cpu?.usage && health.cpu.usage > 90 ||
    health.database?.status === 'error' ||
    health.queues?.failed && health.queues.failed > 100 ||
    health.leo?.protection?.criticalAlerts && health.leo.protection.criticalAlerts > 0
  ) {
    return 'critical';
  }
  
  // Verificar critérios degradados
  if (
    health.memory?.percentage && health.memory.percentage > 70 ||
    health.cpu?.usage && health.cpu.usage > 70 ||
    health.database?.status === 'disconnected' ||
    health.queues?.failed && health.queues.failed > 10 ||
    health.jobs?.failed && health.jobs.failed > health.jobs.total * 0.1
  ) {
    return 'degraded';
  }
  
  return 'healthy';
}

/**
 * Endpoint principal de health check
 */
export async function collectSystemHealth(): Promise<SystemHealth> {
  const startTime = Date.now();

  // Coletar métricas
  const memory = getMemoryMetrics();
  const cpu = getCpuMetrics();
  const database = await checkDatabaseHealth();

  // Métricas das filas
  const queueStats = await queueManager.getAllQueueStats();
  let totalQueues = 0;
  let totalActive = 0;
  let totalWaiting = 0;
  let totalFailed = 0;

  Object.values(queueStats).forEach((stats) => {
    if ("error" in stats) {
      totalFailed++;
      return;
    }
    totalQueues++;
    totalActive += stats.active;
    totalWaiting += stats.waiting;
    totalFailed += stats.failed;
  });

  // Métricas dos jobs
  const jobStats = await getJobExecutionStats();

  // Métricas do LEO
  const leoStatus = leoLoop.getLoopStatus();
  const leoProtectionStats = leoLoopProtection.getStatistics();

  // Métricas de rate limit
  const rateLimitStats = await getRateLimitStats();

  // Montar objeto de saúde
  const health: SystemHealth = {
    status: "healthy", // Será atualizado depois
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory,
    cpu,
    queues: {
      total: totalQueues,
      active: totalActive,
      waiting: totalWaiting,
      failed: totalFailed,
      stats: queueStats,
    },
    jobs: jobStats,
    leo: {
      loop: {
        isRunning: leoStatus.running,
        runCount: leoStatus.runCount,
        errors: leoStatus.errors,
        uptime: leoStatus.uptime ?? 0,
        lastRun: leoStatus.lastRun?.toISOString() || null,
      },
      protection: leoProtectionStats,
    },
    rateLimits: {
      stats: rateLimitStats,
    },
    database,
  };

  // Determinar status geral
  health.status = determineOverallStatus(health);

  logInfo("System health check executado", {
    status: health.status,
    responseTime: Date.now() - startTime,
    memoryUsage: health.memory.percentage,
    cpuUsage: health.cpu.usage,
    queueFailures: health.queues.failed,
  });

  return health;
}

export async function getSystemHealth(_req: Request, res: Response): Promise<void> {
  try {
    const health = await collectSystemHealth();
    const statusCode = health.status === "healthy" ? 200 : health.status === "degraded" ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    logError("Erro no health check do sistema", error as Error);
    res.status(500).json({
      status: "critical",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Erro desconhecido",
      uptime: process.uptime(),
    });
  }
}

/**
 * Endpoint simplificado para load balancers
 */
export async function getHealthCheck(req: Request, res: Response): Promise<void> {
  try {
    const result = await collectHealthCheck();
    res.status(result.status === "healthy" ? 200 : 503).json(result);
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy',
      timestamp: new Date(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || "1.0.0",
      environment: process.env.NODE_ENV || "development",
    });
  }
}

export async function collectHealthCheck(): Promise<HealthCheck> {
  const { getDb } = await import("../../db/index.js");
  const db = await getDb();
  if (!db) {
    return {
      status: "unhealthy",
      timestamp: new Date(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || "1.0.0",
      environment: process.env.NODE_ENV || "development",
    };
  }
  return {
    status: "healthy",
    timestamp: new Date(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || "1.0.0",
    environment: process.env.NODE_ENV || "development",
  };
}

/**
 * Endpoint de métricas detalhadas (para monitoring)
 */
export async function getSystemMetrics(req: Request, res: Response): Promise<void> {
  try {
    const detailedMetrics = await collectSystemMetrics();
    res.json(detailedMetrics);
  } catch (error) {
    logError('Erro ao obter métricas detalhadas', error as Error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
}

export async function collectSystemMetrics(): Promise<Record<string, unknown>> {
  const health = await collectSystemHealth();

  return {
    ...health,
    system: {
      platform: process.platform,
      nodeVersion: process.version,
      arch: process.arch,
      pid: process.pid,
    },
    performance: {
      eventLoopLag: 0,
      gc: {},
    },
  };
}
