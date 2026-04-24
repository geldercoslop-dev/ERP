/**
 * Request Timeout Middleware
 *
 * Implementa timeout para requests longos
 * Previna DoS e recursos presos
 */
import { logger } from '../_core/logger.js';
/**
 * Configuração padrão
 */
const DEFAULT_TIMEOUT_CONFIG = {
    timeoutMs: 10 * 1000, // 10 segundos
    enableTimeoutResponse: true
};
/**
 * Gera response de timeout
 */
function sendTimeoutResponse(res, config) {
    if (!res.headersSent) {
        res.status(408).json({
            error: 'Request Timeout',
            message: 'Request took too long to process',
            timeout: config.timeoutMs / 1000
        });
    }
}
/**
 * Limpa recursos do timeout
 */
function clearTimeoutResources(req) {
    if (req._timeoutTimer) {
        clearTimeout(req._timeoutTimer);
        req._timeoutTimer = undefined;
    }
}
/**
 * Log de timeout
 */
function logTimeout(req, duration) {
    logger.warn({
        method: req.method,
        path: req.path,
        ip: req.ip || req.socket?.remoteAddress,
        userAgent: req.headers['user-agent'],
        duration: Math.round(duration),
        timeout: DEFAULT_TIMEOUT_CONFIG.timeoutMs / 1000,
        timestamp: new Date().toISOString()
    }, 'Request timeout detected');
}
/**
 * Middleware de timeout
 */
export function createTimeoutMiddleware(config = DEFAULT_TIMEOUT_CONFIG) {
    return (req, res, next) => {
        const startTime = Date.now();
        req._timeoutStarted = startTime;
        // Configurar timer de timeout
        req._timeoutTimer = setTimeout(() => {
            req._timedOut = true;
            // Log do timeout
            const duration = Date.now() - startTime;
            logTimeout(req, duration);
            // Tentar terminar response
            if (config.enableTimeoutResponse && !res.headersSent) {
                if (config.onTimeout) {
                    config.onTimeout(req, res);
                }
                else {
                    sendTimeoutResponse(res, config);
                }
                return;
            }
            // Tentar destruir request se possível
            try {
                if (req.socket && !req.socket.destroyed) {
                    req.socket.destroy();
                }
            }
            catch (error) {
                logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to destroy socket on timeout');
            }
        }, config.timeoutMs);
        // Listener para quando o request terminar
        res.on('finish', () => {
            clearTimeoutResources(req);
        });
        // Listener para erro
        res.on('error', () => {
            clearTimeoutResources(req);
        });
        // Verificar se já está em timeout antes de continuar
        if (req._timedOut) {
            return;
        }
        next();
    };
}
/**
 * Middleware de timeout padrão (export)
 */
export const timeoutMiddleware = createTimeoutMiddleware();
/**
 * Middleware para medir tempo de processamento
 */
export function createTimingMiddleware() {
    return (req, res, next) => {
        const startTime = Date.now();
        // Apenas log no finish; headers não podem ser mutados após envio
        res.on('finish', () => {
            const duration = Date.now() - startTime;
            // Log de requests lentos (>5s)
            if (duration > 5000) {
                logger.warn({
                    method: req.method,
                    path: req.path,
                    duration,
                    status: res.statusCode,
                    ip: req.ip || req.socket?.remoteAddress,
                    timestamp: new Date().toISOString()
                }, 'Slow request detected');
            }
        });
        next();
    };
}
/**
 * Export do timing middleware
 */
export const timingMiddleware = createTimingMiddleware();
/**
 * Utilitários de timeout
 */
export const timeoutUtils = {
    /**
     * Verifica se request está em timeout
     */
    isTimedOut: (req) => !!req._timedOut,
    /**
     * Obtém tempo decorrido
     */
    getElapsedTime: (req) => {
        const started = req._timeoutStarted;
        return started ? Date.now() - started : 0;
    },
    /**
     * Obtém tempo restante
     */
    getRemainingTime: (req, config = DEFAULT_TIMEOUT_CONFIG) => {
        const elapsed = timeoutUtils.getElapsedTime(req);
        return Math.max(0, config.timeoutMs - elapsed);
    },
    /**
     * Configuração padrão
     */
    getDefaultConfig: () => DEFAULT_TIMEOUT_CONFIG
};
