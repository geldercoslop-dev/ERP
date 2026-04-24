/**
 * Sistema de Métricas e Monitoramento
 *
 * Coleta e armazena métricas do sistema para monitoramento
 */
class MetricsCollector {
    requestMetrics = [];
    databaseMetrics = [];
    systemMetrics = [];
    counters = {
        request_count: 0,
        error_count: 0,
        request_duration_total_ms: 0,
        redis_request_count: 0,
        redis_error_count: 0,
        redis_duration_total_ms: 0,
    };
    maxMetricsSize = 10000; // Mantém últimas 10k métricas
    /**
     * Registra métricas de request
     */
    recordRequest(metrics) {
        this.requestMetrics.push(metrics);
        this.counters.request_count += 1;
        this.counters.request_duration_total_ms += metrics.duration;
        if (metrics.statusCode >= 400)
            this.counters.error_count += 1;
        this.trimMetrics();
    }
    /**
     * Registra métricas de database
     */
    recordDatabase(metrics) {
        this.databaseMetrics.push(metrics);
        this.trimMetrics();
    }
    recordRedis(durationMs, success) {
        this.counters.redis_request_count += 1;
        this.counters.redis_duration_total_ms += durationMs;
        if (!success)
            this.counters.redis_error_count += 1;
    }
    /**
     * Registra métricas do sistema
     */
    recordSystem(metrics) {
        this.systemMetrics.push(metrics);
        this.trimMetrics();
    }
    /**
     * Obtém métricas de requests do último período
     */
    getRequestMetrics(minutes = 5) {
        const cutoff = new Date(Date.now() - minutes * 60 * 1000);
        return this.requestMetrics.filter(m => m.timestamp >= cutoff);
    }
    /**
     * Obtém métricas de database lentas (>300ms)
     */
    getSlowQueries(limit = 50) {
        return this.databaseMetrics
            .filter(m => m.duration > 300)
            .sort((a, b) => b.duration - a.duration)
            .slice(0, limit);
    }
    /**
     * Obtém estatísticas de requests
     */
    getRequestStats(minutes = 5) {
        const metrics = this.getRequestMetrics(minutes);
        const errors = metrics.filter(m => m.statusCode >= 400);
        return {
            total: metrics.length,
            averageDuration: metrics.length > 0
                ? metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length
                : 0,
            errorsPerMinute: errors.length,
            slowestRequests: metrics
                .sort((a, b) => b.duration - a.duration)
                .slice(0, 10),
            statusCodes: metrics.reduce((acc, m) => {
                acc[m.statusCode] = (acc[m.statusCode] || 0) + 1;
                return acc;
            }, {}),
        };
    }
    /**
     * Obtém métricas atuais do sistema
     */
    getCurrentSystemMetrics() {
        const memUsage = process.memoryUsage();
        const totalMem = memUsage.heapTotal;
        const usedMem = memUsage.heapUsed;
        return {
            timestamp: new Date(),
            memory: {
                used: usedMem,
                total: totalMem,
                percentage: (usedMem / totalMem) * 100,
            },
            cpu: {
                usage: 0, // TODO: Implementar medição de CPU
            },
            activeConnections: 0, // TODO: Implementar contagem de conexões
            requestsPerMinute: this.getRequestMetrics(1).length,
            errorsPerMinute: this.getRequestStats(1).errorsPerMinute,
        };
    }
    /**
     * Mantém o tamanho do array de métricas sob controle
     */
    trimMetrics() {
        if (this.requestMetrics.length > this.maxMetricsSize) {
            this.requestMetrics = this.requestMetrics.slice(-this.maxMetricsSize);
        }
        if (this.databaseMetrics.length > this.maxMetricsSize) {
            this.databaseMetrics = this.databaseMetrics.slice(-this.maxMetricsSize);
        }
        if (this.systemMetrics.length > this.maxMetricsSize) {
            this.systemMetrics = this.systemMetrics.slice(-this.maxMetricsSize);
        }
    }
    /**
     * Limpa métricas antigas
     */
    clearOldMetrics(olderThanMinutes = 60) {
        const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
        this.requestMetrics = this.requestMetrics.filter(m => m.timestamp >= cutoff);
        this.databaseMetrics = this.databaseMetrics.filter(m => m.timestamp >= cutoff);
        this.systemMetrics = this.systemMetrics.filter(m => m.timestamp >= cutoff);
    }
    getCounters() {
        return { ...this.counters };
    }
}
// Singleton instance
export const metrics = new MetricsCollector();
// Funções de conveniência
export const recordRequest = (requestMetrics) => metrics.recordRequest(requestMetrics);
export const recordDatabase = (dbMetrics) => metrics.recordDatabase(dbMetrics);
export const recordSystemMetrics = () => metrics.recordSystem(metrics.getCurrentSystemMetrics());
export const recordRedis = (durationMs, success) => metrics.recordRedis(durationMs, success);
