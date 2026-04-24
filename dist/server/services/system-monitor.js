/**
 * Endpoint de Monitoramento do Sistema - System Health Monitor
 *
 * Fornece status completo do sistema ERP + LEO
 * Monitora filas, workers, memória, performance
 */
import { redisManager } from '../infra/redis.js';
import { queueManager } from '../queue/queue.js';
import { workerManager } from '../queue/worker-simple.js';
// LEO ISOLADO — import removido
// import { leoMemoryManager } from '../leo/memory/memory-manager.js';
// Stub para leoMemoryManager — LEO ISOLADO
const leoMemoryManager = {
    getStats: () => ({
        totalItems: 0,
        totalSizeBytes: 0,
        maxItems: 10000,
        maxMemoryBytes: 256 * 1024 * 1024,
        itemsByType: {},
    }),
};
import { safeTransactionService } from '../services/safe-transaction.js';
import { getDb } from '../db/index.js';
import { logError } from '../_core/logger.js';
import { sql } from 'drizzle-orm';
/**
 * Coletor de métricas de performance
 */
class PerformanceCollector {
    responseTimes = [];
    operationTimes = [];
    errors = [];
    maxSamples = 1000;
    addResponseTime(time) {
        this.responseTimes.push(time);
        if (this.responseTimes.length > this.maxSamples) {
            this.responseTimes.shift();
        }
    }
    addOperationTime(time) {
        this.operationTimes.push(time);
        if (this.operationTimes.length > this.maxSamples) {
            this.operationTimes.shift();
        }
    }
    addError(error, context) {
        this.errors.push({
            timestamp: new Date(),
            error,
            context,
        });
        if (this.errors.length > 100) {
            this.errors.shift();
        }
    }
    getMetrics() {
        const sortedResponseTimes = [...this.responseTimes].sort((a, b) => a - b);
        const sortedOperationTimes = [...this.operationTimes].sort((a, b) => a - b);
        return {
            responseTime: {
                avg: this.average(sortedResponseTimes),
                p95: this.percentile(sortedResponseTimes, 95),
                p99: this.percentile(sortedOperationTimes, 99),
            },
            throughput: {
                requestsPerSecond: this.calculateThroughput(this.responseTimes),
                operationsPerSecond: this.calculateThroughput(this.operationTimes),
            },
            errors: {
                rate: this.calculateErrorRate(),
                total: this.errors.length,
                recent: this.errors.slice(-10),
            },
        };
    }
    average(arr) {
        return arr.length > 0 ? arr.reduce((sum, val) => sum + val, 0) / arr.length : 0;
    }
    percentile(arr, p) {
        if (arr.length === 0)
            return 0;
        const index = Math.ceil((p / 100) * arr.length) - 1;
        const safeIndex = Math.max(0, Math.min(index, arr.length - 1));
        return arr[safeIndex] ?? 0;
    }
    calculateThroughput(times) {
        if (times.length < 2)
            return 0;
        const timeWindow = 60000; // 1 minuto
        const recentTimes = times.filter((time) => Date.now() - time < timeWindow);
        return recentTimes.length / (timeWindow / 1000);
    }
    calculateErrorRate() {
        const timeWindow = 300000; // 5 minutos
        const recentErrors = this.errors.filter((e) => Date.now() - e.timestamp.getTime() < timeWindow);
        return recentErrors.length / Math.max(1, this.responseTimes.length + this.operationTimes.length);
    }
}
/**
 * Serviço de monitoramento do sistema
 */
export class SystemMonitorService {
    static instance;
    performanceCollector;
    startTime;
    constructor() {
        this.performanceCollector = new PerformanceCollector();
        this.startTime = new Date();
    }
    static getInstance() {
        if (!SystemMonitorService.instance) {
            SystemMonitorService.instance = new SystemMonitorService();
        }
        return SystemMonitorService.instance;
    }
    /**
     * Coleta health check completo do sistema
     */
    async getSystemHealth() {
        const timestamp = new Date();
        const uptime = Date.now() - this.startTime.getTime();
        try {
            // Coletar informações paralelamente
            const [systemInfo, redisStatus, dbStatus, queueStats, workerStats, leoMemoryStats, transactionStats, stockStats,] = await Promise.all([
                this.getSystemInfo(),
                this.getRedisStatus(),
                this.getDatabaseStatus(),
                this.getQueueStats(),
                this.getWorkerStats(),
                this.getLeoMemoryStats(),
                this.getTransactionStats(),
                this.getStockStats(),
            ]);
            // Determinar status geral
            const status = this.determineOverallStatus({
                redisStatus,
                dbStatus,
                queueStats,
                workerStats,
            });
            // Coletar métricas de performance
            const performance = this.performanceCollector.getMetrics();
            // Gerar alertas
            const alerts = this.generateAlerts({
                systemInfo,
                redisStatus,
                dbStatus,
                queueStats,
                workerStats,
                leoMemoryStats: {
                    totalSizeBytes: typeof leoMemoryStats.memory.totalSizeBytes === 'number'
                        ? leoMemoryStats.memory.totalSizeBytes
                        : 0,
                    maxMemoryMB: typeof leoMemoryStats.memory.maxMemoryMB === 'number'
                        ? leoMemoryStats.memory.maxMemoryMB
                        : 0,
                },
                performance,
            });
            return {
                status,
                timestamp,
                uptime,
                version: process.env.npm_package_version || '1.0.0',
                environment: process.env.NODE_ENV || 'development',
                system: systemInfo,
                infrastructure: {
                    redis: redisStatus,
                    database: dbStatus,
                    queues: queueStats,
                    workers: workerStats,
                },
                application: {
                    leo: leoMemoryStats,
                    transactions: transactionStats,
                    stock: stockStats,
                },
                performance,
                alerts,
            };
        }
        catch (error) {
            logError('Falha ao coletar health check do sistema', error instanceof Error ? error : new Error(String(error)));
            return {
                status: 'unhealthy',
                timestamp,
                uptime,
                version: process.env.npm_package_version || '1.0.0',
                environment: process.env.NODE_ENV || 'development',
                system: this.getFallbackSystemInfo(),
                infrastructure: {
                    redis: {
                        connected: false,
                        memory: {
                            used: 0,
                            peak: 0,
                            rss: 0,
                        },
                        stats: {
                            totalCommandsProcessed: 0,
                            totalConnectionsReceived: 0,
                            keyspaceHits: 0,
                            keyspaceMisses: 0,
                        },
                        error: 'Falha na coleta'
                    },
                    database: { connected: false, error: 'Falha na coleta' },
                    queues: { initialized: false, count: 0, names: [], stats: {} },
                    workers: { initialized: false, count: 0, active: [], stats: {} },
                },
                application: {
                    leo: this.getFallbackLeoStats(),
                    transactions: { active: 0, stats: { total: 0, completed: 0, failed: 0, partial: 0 } },
                    stock: { protected: false, operations: { total: 0, successful: 0, failed: 0 } },
                },
                performance: this.performanceCollector.getMetrics(),
                alerts: [{
                        level: 'critical',
                        message: 'Falha crítica no monitoramento do sistema',
                        component: 'system',
                        timestamp,
                        details: error,
                    }],
            };
        }
    }
    async getSystemInfo() {
        return {
            node: {
                version: process.version,
                platform: process.platform,
                arch: process.arch,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: {
                    usage: process.cpuUsage().user,
                    loadAverage: require('os').loadavg(),
                },
            },
            process: {
                pid: process.pid,
                memory: process.memoryUsage(),
                cpuUsage: process.cpuUsage(),
            },
        };
    }
    async getRedisStatus() {
        try {
            const redisStatus = await redisManager.getStatus();
            return {
                connected: redisStatus.connected,
                latency: redisStatus.uptime,
                memory: redisStatus.memory,
                stats: redisStatus.stats,
            };
        }
        catch (error) {
            return {
                connected: false,
                memory: {
                    used: 0,
                    peak: 0,
                    rss: 0,
                },
                stats: {
                    totalCommandsProcessed: 0,
                    totalConnectionsReceived: 0,
                    keyspaceHits: 0,
                    keyspaceMisses: 0,
                },
                error: error instanceof Error ? error.message : 'Erro desconhecido',
            };
        }
    }
    async getDatabaseStatus() {
        try {
            const db = await getDb();
            // Teste simples de conexão
            await db.execute(sql `SELECT 1`);
            return {
                connected: true,
                // TODO: Adicionar estatísticas do pool quando disponível
            };
        }
        catch (error) {
            return {
                connected: false,
                error: error instanceof Error ? error.message : 'Erro desconhecido',
            };
        }
    }
    async getQueueStats() {
        try {
            const stats = await queueManager.getAllQueueStats();
            const names = queueManager.getQueueNames();
            return {
                initialized: queueManager.isReady(),
                count: names.length,
                names,
                stats,
            };
        }
        catch (error) {
            return {
                initialized: false,
                count: 0,
                names: [],
                stats: {},
                error: error instanceof Error ? error.message : 'Erro desconhecido',
            };
        }
    }
    async getWorkerStats() {
        try {
            const active = workerManager.getActiveWorkers();
            return {
                initialized: workerManager.isReady(),
                count: active.length,
                active,
                stats: {},
            };
        }
        catch (error) {
            return {
                initialized: false,
                count: 0,
                active: [],
                stats: {},
                error: error instanceof Error ? error.message : 'Erro desconhecido',
            };
        }
    }
    async getLeoMemoryStats() {
        try {
            const memoryStats = leoMemoryManager.getStats();
            return {
                memory: {
                    ...memoryStats,
                    maxMemoryMB: Math.round(memoryStats.maxMemoryBytes / (1024 * 1024)),
                },
                uptime: process.uptime(),
                cleanupStats: undefined, // TODO: Implementar se necessário
            };
        }
        catch (error) {
            return this.getFallbackLeoStats();
        }
    }
    async getTransactionStats() {
        try {
            const active = safeTransactionService.getActiveTransactions();
            return {
                active: active.length,
                stats: {
                    total: 0, // TODO: Implementar estatísticas
                    completed: 0,
                    failed: 0,
                    partial: 0,
                },
            };
        }
        catch (error) {
            return {
                active: 0,
                stats: { total: 0, completed: 0, failed: 0, partial: 0 },
            };
        }
    }
    async getStockStats() {
        try {
            // TODO: Implementar estatísticas do serviço de estoque
            return {
                protected: true,
                operations: {
                    total: 0,
                    successful: 0,
                    failed: 0,
                },
            };
        }
        catch (error) {
            return {
                protected: false,
                operations: { total: 0, successful: 0, failed: 0 },
            };
        }
    }
    getFallbackSystemInfo() {
        return {
            node: {
                version: process.version,
                platform: process.platform,
                arch: process.arch,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: {
                    usage: process.cpuUsage().user,
                    loadAverage: [0, 0, 0],
                },
            },
            process: {
                pid: process.pid,
                memory: process.memoryUsage(),
                cpuUsage: process.cpuUsage(),
            },
        };
    }
    getFallbackLeoStats() {
        return {
            memory: {
                totalItems: 0,
                totalSizeBytes: 0,
                maxItems: 10000,
                maxMemoryMB: 256,
                itemsByType: {},
            },
            uptime: process.uptime(),
        };
    }
    determineOverallStatus(status) {
        const criticalIssues = [
            !status.redisStatus.connected,
            !status.dbStatus.connected,
            !status.queueStats.initialized,
            !status.workerStats.initialized,
        ];
        if (criticalIssues.every(issue => !issue)) {
            return 'healthy';
        }
        else if (criticalIssues.some(issue => !issue)) {
            return 'degraded';
        }
        else {
            return 'unhealthy';
        }
    }
    generateAlerts(context) {
        const alerts = [];
        // Alertas de Redis
        if (!context.redisStatus.connected) {
            alerts.push({
                level: 'critical',
                message: 'Redis não está conectado',
                component: 'redis',
                timestamp: new Date(),
                details: context.redisStatus,
            });
        }
        // Alertas de Database
        if (!context.dbStatus.connected) {
            alerts.push({
                level: 'critical',
                message: 'Database não está conectado',
                component: 'database',
                timestamp: new Date(),
                details: context.dbStatus,
            });
        }
        // Alertas de Filas
        if (!context.queueStats.initialized) {
            alerts.push({
                level: 'error',
                message: 'Sistema de filas não inicializado',
                component: 'queues',
                timestamp: new Date(),
            });
        }
        // Alertas de Workers
        if (!context.workerStats.initialized) {
            alerts.push({
                level: 'error',
                message: 'Workers não inicializados',
                component: 'workers',
                timestamp: new Date(),
            });
        }
        // Alertas de Memória do LEO
        const memoryUsagePercent = (context.leoMemoryStats.totalSizeBytes / (context.leoMemoryStats.maxMemoryMB * 1024 * 1024)) * 100;
        if (memoryUsagePercent > 80) {
            alerts.push({
                level: memoryUsagePercent > 95 ? 'critical' : 'warning',
                message: `Memória do LEO em ${memoryUsagePercent.toFixed(1)}%`,
                component: 'leo-memory',
                timestamp: new Date(),
                details: {
                    used: context.leoMemoryStats.totalSizeBytes,
                    max: context.leoMemoryStats.maxMemoryMB * 1024 * 1024,
                    percentage: memoryUsagePercent,
                },
            });
        }
        // Alertas de Performance
        if (context.performance.errors.rate > 0.1) {
            alerts.push({
                level: 'warning',
                message: `Taxa de erros elevada: ${(context.performance.errors.rate * 100).toFixed(1)}%`,
                component: 'performance',
                timestamp: new Date(),
                details: {
                    rate: context.performance.errors.rate,
                    total: context.performance.errors.total,
                },
            });
        }
        return alerts;
    }
}
// Exportar instância singleton
export const systemMonitor = SystemMonitorService.getInstance();
// Middleware para coletar métricas de performance
export function performanceMiddleware() {
    return (req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - start;
            systemMonitor.performanceCollector.addResponseTime(duration);
        });
        next();
    };
}
// Endpoint de health check
export async function healthCheckHandler(req, res) {
    try {
        const health = await systemMonitor.getSystemHealth();
        res.status(health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503)
            .json(health);
    }
    catch (error) {
        logError('Erro no health check', error instanceof Error ? error : new Error(String(error)));
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date(),
            error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
    }
}
