import { recordRequest, metrics } from './metrics.js';
/**
 * Middleware para medir tempo de requests
 */
export function metricsMiddleware() {
    return (req, res, next) => {
        const startTime = Date.now();
        // Intercepta o método res.end para capturar o tempo final
        const originalEnd = res.end.bind(res);
        res.end = function (...args) {
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
                userId: req.user?.id,
                tenantId: req.tenantId,
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
    return (req, res, next) => {
        // Adiciona método para registrar métricas de DB no request
        req.recordDbMetric = (query, duration, success, error) => {
            const dbMetrics = {
                query,
                duration,
                timestamp: new Date(),
                success,
                error,
                tenantId: req.tenantId,
            };
            // Registra query lenta (>300ms)
            if (duration > 300) {
                metrics.recordDatabase(dbMetrics);
            }
        };
        next();
    };
}
