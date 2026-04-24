import { nanoid } from 'nanoid';
import { systemLogger } from './logger.js';
/**
 * Middleware que adiciona traceId global a todas as requisições
 * O traceId é usado para rastrear logs através de toda a aplicação
 */
export function traceMiddleware(req, res, next) {
    // Gerar traceId único para esta requisição
    const traceId = nanoid(10);
    // Adicionar traceId e startTime ao objeto request
    req.traceId = traceId;
    req.startTime = Date.now();
    // Adicionar traceId aos headers de resposta para debugging
    res.setHeader('X-Trace-ID', traceId);
    // Adicionar traceId ao logger para todos os logs desta requisição
    const originalLog = systemLogger.info.bind(systemLogger);
    const originalError = systemLogger.error.bind(systemLogger);
    const originalWarn = systemLogger.warn.bind(systemLogger);
    // Sobrescrever métodos do logger para incluir traceId automaticamente
    systemLogger.info = (data, message) => {
        if (typeof data === 'object' && data !== null) {
            data.traceId = traceId;
        }
        else {
            data = { message: data, traceId };
        }
        return originalLog(data, message);
    };
    systemLogger.error = (data, message) => {
        if (typeof data === 'object' && data !== null) {
            data.traceId = traceId;
        }
        else {
            data = { message: data, traceId };
        }
        return originalError(data, message);
    };
    systemLogger.warn = (data, message) => {
        if (typeof data === 'object' && data !== null) {
            data.traceId = traceId;
        }
        else {
            data = { message: data, traceId };
        }
        return originalWarn(data, message);
    };
    // Log de início da requisição
    systemLogger.info({
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip
    }, 'Request started');
    // Restaurar logger original no final da requisição
    res.on('finish', () => {
        // Restaurar logger original
        systemLogger.info = originalLog;
        systemLogger.error = originalError;
        systemLogger.warn = originalWarn;
        // Log de fim da requisição
        systemLogger.info({
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration: req.startTime ? Date.now() - req.startTime : 0
        }, 'Request completed');
    });
    next();
}
/**
 * Middleware para capturar erros com traceId
 */
export function errorTraceMiddleware(err, req, res, next) {
    const traceId = req.traceId || 'unknown';
    systemLogger.error({
        error: err.message,
        stack: err.stack,
        traceId,
        method: req.method,
        url: req.url,
        body: req.body,
        query: req.query,
        params: req.params
    }, 'Request error');
    // Adicionar traceId ao erro para debugging
    if (err && typeof err === 'object') {
        err.traceId = traceId;
    }
    next(err);
}
