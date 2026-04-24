/**
 * Monitoramento Avançado do Sistema
 *
 * Implementa:
 * - Tempo de resposta das APIs
 * - Tamanho das filas
 * - Jobs falhos
 * - Uso de memória e CPU
 */
import { performance } from 'perf_hooks';
import { logInfo, logError, logWarn } from '../_core/logger.js';
import { queueManager } from '../queue/queue.js';
import { CircuitBreakerManager } from '../infra/circuit-breaker.js';
/**
 * Serviço de Monitoramento Avançado
 */
export class AdvancedMonitoring {
    static instance;
    apiMetrics = [];
    systemMetrics = [];
    healthChecks = new Map();
    isMonitoring = false;
    monitoringInterval;
    constructor() {
        // Singleton
    }
    static getInstance() {
        if (!AdvancedMonitoring.instance) {
            AdvancedMonitoring.instance = new AdvancedMonitoring();
        }
        return AdvancedMonitoring.instance;
    }
    /**
     * Inicia o monitoramento
     */
    async startMonitoring(intervalMs = 30000) {
        if (this.isMonitoring) {
            logWarn('Monitoramento já está ativo');
            return;
        }
        this.isMonitoring = true;
        logInfo('Iniciando monitoramento avançado', { intervalMs });
        // Coletar métricas do sistema
        this.monitoringInterval = setInterval(async () => {
            await this.collectSystemMetrics();
            await this.collectQueueMetrics();
            await this.performHealthChecks();
        }, intervalMs);
        // Coleta inicial
        await this.collectSystemMetrics();
        await this.collectQueueMetrics();
        await this.performHealthChecks();
    }
    /**
     * Para o monitoramento
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = undefined;
        }
        this.isMonitoring = false;
        logInfo('Monitoramento avançado parado');
    }
    /**
     * Registra métrica de API
     */
    recordApiMetric(metric) {
        const apiMetric = {
            ...metric,
            timestamp: new Date(),
        };
        this.apiMetrics.push(apiMetric);
        // Manter apenas últimas 1000 métricas
        if (this.apiMetrics.length > 1000) {
            this.apiMetrics = this.apiMetrics.slice(-1000);
        }
        // Alerta se tempo de resposta for alto
        if (metric.responseTime > 5000) {
            logWarn('API com tempo de resposta alto', {
                endpoint: metric.endpoint,
                responseTime: metric.responseTime,
            });
        }
    }
    /**
     * Coleta métricas do sistema
     */
    async collectSystemMetrics() {
        try {
            const memUsage = process.memoryUsage();
            const cpuUsage = process.cpuUsage();
            const systemMetric = {
                memory: {
                    used: memUsage.heapUsed / 1024 / 1024, // MB
                    total: memUsage.heapTotal / 1024 / 1024, // MB
                    percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
                },
                cpu: {
                    usage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
                    loadAverage: require('os').loadavg(),
                },
                uptime: process.uptime(),
                timestamp: new Date(),
            };
            this.systemMetrics.push(systemMetric);
            // Manter apenas últimas 100 métricas
            if (this.systemMetrics.length > 100) {
                this.systemMetrics = this.systemMetrics.slice(-100);
            }
            // Alerta se uso de memória for alto
            if (systemMetric.memory.percentage > 80) {
                logWarn('Uso de memória alto', {
                    percentage: systemMetric.memory.percentage,
                    used: systemMetric.memory.used,
                });
            }
            // Alerta se uso de CPU for alto
            if (systemMetric.cpu.usage > 80) {
                logWarn('Uso de CPU alto', {
                    usage: systemMetric.cpu.usage,
                });
            }
        }
        catch (error) {
            logError('Erro ao coletar métricas do sistema', error);
        }
    }
    /**
     * Coleta métricas das filas
     */
    async collectQueueMetrics() {
        try {
            const queueNames = ['OCR', 'NOTIFICATIONS', 'REPORTS', 'CLEANUP'];
            for (const queueName of queueNames) {
                const metrics = await queueManager.getQueueStats(queueName);
                // Alerta se muitas tarefas falharam
                if (metrics.failed > 10) {
                    logWarn('Muitas tarefas falharam na fila', {
                        queueName,
                        failed: metrics.failed,
                    });
                }
                // Alerta se muitas tarefas esperando
                if (metrics.waiting > 100) {
                    logWarn('Muitas tarefas esperando na fila', {
                        queueName,
                        waiting: metrics.waiting,
                    });
                }
            }
        }
        catch (error) {
            logError('Erro ao coletar métricas das filas', error);
        }
    }
    /**
     * Realiza verificações de saúde
     */
    async performHealthChecks() {
        const checks = [
            this.checkDatabase(),
            this.checkRedis(),
            this.checkApis(),
            this.checkCircuitBreakers(),
        ];
        try {
            const results = await Promise.allSettled(checks);
            for (const result of results) {
                if (result.status === 'fulfilled') {
                    this.healthChecks.set(result.value.service, result.value);
                }
                else {
                    logError('Health check falhou', result.reason);
                }
            }
        }
        catch (error) {
            logError('Erro geral nos health checks', error);
        }
    }
    /**
     * Verifica saúde do banco de dados
     */
    async checkDatabase() {
        const startTime = performance.now();
        try {
            const { getDb } = await import('../db/index.js');
            const db = await getDb();
            await db.execute('SELECT 1');
            const responseTime = performance.now() - startTime;
            return {
                service: 'database',
                status: responseTime < 1000 ? 'healthy' : 'degraded',
                responseTime,
                lastCheck: new Date(),
            };
        }
        catch (error) {
            return {
                service: 'database',
                status: 'unhealthy',
                lastCheck: new Date(),
                error: error.message,
            };
        }
    }
    /**
     * Verifica saúde do Redis
     */
    async checkRedis() {
        const startTime = performance.now();
        try {
            const { redisManager } = await import('../infra/redis.js');
            await redisManager.testConnection();
            const responseTime = performance.now() - startTime;
            return {
                service: 'redis',
                status: responseTime < 500 ? 'healthy' : 'degraded',
                responseTime,
                lastCheck: new Date(),
            };
        }
        catch (error) {
            return {
                service: 'redis',
                status: 'unhealthy',
                lastCheck: new Date(),
                error: error.message,
            };
        }
    }
    /**
     * Verifica saúde das APIs externas
     */
    async checkApis() {
        try {
            const { ExternalApiManager } = await import('../services/external-apis.js');
            const health = await ExternalApiManager.checkAllApisHealth();
            return {
                service: 'external-apis',
                status: health.healthy ? 'healthy' : 'degraded',
                lastCheck: new Date(),
                details: health.apis,
            };
        }
        catch (error) {
            return {
                service: 'external-apis',
                status: 'unhealthy',
                lastCheck: new Date(),
                error: error.message,
            };
        }
    }
    /**
     * Verifica saúde dos Circuit Breakers
     */
    async checkCircuitBreakers() {
        try {
            const circuitBreakers = Object.values(CircuitBreakerManager.listCircuitBreakers());
            const unhealthyCount = circuitBreakers.filter((cb) => cb?.state?.isOpen).length;
            return {
                service: 'circuit-breakers',
                status: unhealthyCount === 0 ? 'healthy' : unhealthyCount > 2 ? 'unhealthy' : 'degraded',
                lastCheck: new Date(),
                details: {
                    total: circuitBreakers.length,
                    open: unhealthyCount,
                    circuitBreakers,
                },
            };
        }
        catch (error) {
            return {
                service: 'circuit-breakers',
                status: 'unhealthy',
                lastCheck: new Date(),
                error: error.message,
            };
        }
    }
    /**
     * Obtém dashboard completo
     */
    getDashboard() {
        return {
            apis: this.apiMetrics.slice(-100), // últimas 100 métricas
            queues: [], // Preenchido pelo collectQueueMetrics
            system: this.systemMetrics[this.systemMetrics.length - 1] || {},
            circuitBreakers: CircuitBreakerManager.listCircuitBreakers(),
            healthChecks: Array.from(this.healthChecks.values()),
            timestamp: new Date(),
        };
    }
    /**
     * Obtém métricas de API por período
     */
    getApiMetrics(minutes = 60) {
        const cutoff = new Date(Date.now() - minutes * 60 * 1000);
        return this.apiMetrics.filter((metric) => metric.timestamp >= cutoff);
    }
    /**
     * Obtém estatísticas de API
     */
    getApiStats(minutes = 60) {
        const metrics = this.getApiMetrics(minutes);
        if (metrics.length === 0) {
            return {
                totalRequests: 0,
                averageResponseTime: 0,
                errorRate: 0,
                requestsPerMinute: 0,
            };
        }
        const errorCount = metrics.filter((m) => m.statusCode >= 400).length;
        const totalResponseTime = metrics.reduce((sum, m) => sum + m.responseTime, 0);
        return {
            totalRequests: metrics.length,
            averageResponseTime: totalResponseTime / metrics.length,
            errorRate: (errorCount / metrics.length) * 100,
            requestsPerMinute: metrics.length / minutes,
        };
    }
    /**
     * Limpa métricas antigas
     */
    cleanupMetrics(hours = 24) {
        const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
        this.apiMetrics = this.apiMetrics.filter((m) => m.timestamp >= cutoff);
        this.systemMetrics = this.systemMetrics.filter((m) => m.timestamp >= cutoff);
        logInfo('Métricas antigas limpas', { hours });
    }
}
