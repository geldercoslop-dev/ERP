// BLOQUEADO — LOTE 2 FINALIZADO
// ISOLAMENTO LEO EM ROUTERS CONCLUÍDO
// NÃO ALTERAR SEM AUTORIZAÇÃO
import { queueManager } from '../../queue/queue.js';
import { getJobExecutionStats } from '../../queue/idempotency.js';
import { getRateLimitStats } from '../../queue/rate-limiter.js';
// LEO ISOLADO — imports removidos
// import { leoLoop } from '../../leo/engine/leo-loop.js';
// import { leoLoopProtection } from '../../leo/security/leo-loop-protection.js';
// Stubs que retornam valores válidos — LEO ISOLADO
const leoLoop = {
    getLoopStatus: () => ({
        running: false,
        runCount: 0,
        errors: 0,
        uptime: 0,
        lastRun: undefined,
    }),
};
const leoLoopProtection = {
    getStatistics: () => ({
        totalTasks: 0,
        blockedTasks: 0,
        totalAlerts: 0,
        criticalAlerts: 0,
    }),
};
import { logInfo, logError } from '../../_core/logger.js';
import { pingDatabase } from '../../services/database-health.service.js';
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
    cpus.forEach((cpu) => {
        for (const type in cpu.times) {
            totalTick += cpu.times[type];
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
async function checkDatabaseHealth() {
    const result = await pingDatabase("SYSTEM_HEALTH");
    return {
        status: result.ok ? 'connected' : 'error',
        responseTime: result.latencyMs >= 0 ? result.latencyMs : 0,
    };
}
/**
 * Determina status geral do sistema
 */
function determineOverallStatus(health) {
    // Verificar critérios críticos
    if (health.memory?.percentage && health.memory.percentage > 90 ||
        health.cpu?.usage && health.cpu.usage > 90 ||
        health.database?.status === 'error' ||
        health.queues?.failed && health.queues.failed > 100 ||
        health.leo?.protection?.criticalAlerts && health.leo.protection.criticalAlerts > 0) {
        return 'critical';
    }
    // Verificar critérios degradados
    if (health.memory?.percentage && health.memory.percentage > 70 ||
        health.cpu?.usage && health.cpu.usage > 70 ||
        health.database?.status === 'disconnected' ||
        health.queues?.failed && health.queues.failed > 10 ||
        health.jobs?.failed && health.jobs.failed > health.jobs.total * 0.1) {
        return 'degraded';
    }
    return 'healthy';
}
/**
 * Endpoint principal de health check
 */
export async function collectSystemHealth() {
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
    const health = {
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
export async function getSystemHealth(_req, res) {
    try {
        const health = await collectSystemHealth();
        const statusCode = health.status === "healthy" ? 200 : health.status === "degraded" ? 200 : 503;
        res.status(statusCode).json({
            success: true,
            data: health
        });
    }
    catch (error) {
        logError("Erro no health check do sistema", error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Erro desconhecido"
        });
    }
}
/**
 * Endpoint simplificado para load balancers
 */
export async function getHealthCheck(req, res) {
    try {
        const result = await collectHealthCheck();
        res.status(result.status === "healthy" ? 200 : 503).json({
            success: true,
            data: result
        });
    }
    catch (error) {
        res.status(503).json({
            success: false,
            error: error instanceof Error ? error.message : "Erro desconhecido"
        });
    }
}
export async function collectHealthCheck() {
    const result = await pingDatabase("HEALTH_CHECK");
    return {
        status: result.ok ? "healthy" : "unhealthy",
        timestamp: new Date(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || "1.0.0",
        environment: process.env.NODE_ENV || "development",
    };
}
/**
 * Endpoint de métricas detalhadas (para monitoring)
 */
export async function getSystemMetrics(req, res) {
    try {
        const detailedMetrics = await collectSystemMetrics();
        res.status(200).json({
            success: true,
            data: detailedMetrics
        });
    }
    catch (error) {
        logError('Erro ao obter métricas detalhadas', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
}
export async function collectSystemMetrics() {
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
