import { recordRequest } from './metrics.js';
/**
 * Logger de erro estruturado PURO - sem dependência de logger
 */
export class StructuredErrorLogger {
    /**
     * Registra erro com contexto completo
     */
    static error(error, context = {}) {
        const timestamp = new Date().toISOString();
        const errorMessage = error instanceof Error ? error.message : error;
        const errorStack = error instanceof Error ? error.stack : undefined;
        const logEntry = {
            timestamp,
            level: 'ERROR',
            message: errorMessage,
            stack: errorStack,
            context: {
                route: context.route,
                method: context.method,
                path: context.path,
                payload: context.payload,
                userId: context.userId,
                tenantId: context.tenantId,
                requestId: context.requestId,
                duration: context.duration,
                userAgent: context.userAgent,
                ip: context.ip,
            },
        };
        // Log direto para console - sem dependência circular
        console.error('[ERROR-TRACKING]', JSON.stringify(logEntry));
        // Registra métricas se houver contexto de request
        if (context.method && context.path && context.duration !== undefined) {
            recordRequest({
                method: context.method,
                path: context.path,
                statusCode: 500,
                duration: context.duration,
                timestamp: new Date(),
                userId: context.userId,
                tenantId: context.tenantId,
                ip: context.ip,
                userAgent: context.userAgent,
            });
        }
    }
    /**
     * Registra warning com contexto
     */
    static warn(message, context = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: 'WARN',
            message,
            context: {
                route: context.route,
                method: context.method,
                path: context.path,
                payload: context.payload,
                userId: context.userId,
                tenantId: context.tenantId,
                requestId: context.requestId,
                duration: context.duration,
            },
        };
        console.warn('[ERROR-TRACKING]', JSON.stringify(logEntry));
    }
    /**
     * Registra info com contexto
     */
    static info(message, context = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: 'INFO',
            message,
            context: {
                route: context.route,
                method: context.method,
                path: context.path,
                payload: context.payload,
                userId: context.userId,
                tenantId: context.tenantId,
                requestId: context.requestId,
                duration: context.duration,
            },
        };
        console.info('[ERROR-TRACKING]', JSON.stringify(logEntry));
    }
}
/**
 * Wrapper para funções async com tracking de erro
 */
export function withErrorTracking(fn, context = {}) {
    return (async (...args) => {
        const startTime = Date.now();
        try {
            const result = await fn(...args);
            return result;
        }
        catch (error) {
            StructuredErrorLogger.error(error, {
                ...context,
                duration: Date.now() - startTime,
            });
            throw error;
        }
    });
}
/**
 * Middleware Express para tracking de erros
 */
export function errorTrackingMiddleware() {
    return (error, req, res, next) => {
        const startTime = req.startTime || Date.now();
        const duration = Date.now() - startTime;
        const userId = req.user?.id;
        StructuredErrorLogger.error(error, {
            route: req.path,
            method: req.method,
            path: req.url,
            payload: req.body,
            userId,
            tenantId: req.tenantId,
            requestId: req.requestId,
            duration,
            userAgent: req.get('User-Agent'),
            ip: req.ip,
        });
        next(error);
    };
}
