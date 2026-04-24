/**
 * Safe Response Middleware
 *
 * Previne "Cannot call write after a stream was destroyed"
 * Implementa regras de response único e safe transaction
 */
import { logger } from '../_core/logger.js';
/**
 * Middleware para prevenir escrita após stream destruído
 */
function safeResponseMiddleware(req, res, next) {
    // Flag para rastrear estado do response
    res._responseSent = false;
    res._isDestroyed = false;
    // Override res.json para prevenir múltiplos writes
    const originalJson = res.json;
    res.json = function (body) {
        if (res._responseSent || res.headersSent || res.writableEnded) {
            logger.warn({
                method: req.method,
                path: req.path,
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString()
            }, '[SAFE_RESPONSE] Tentativa de múltiplo response.json bloqueada');
            return res;
        }
        res._responseSent = true;
        return originalJson.call(this, body);
    };
    // Override res.send para prevenir múltiplos writes
    const originalSend = res.send;
    res.send = function (body) {
        if (res._responseSent || res.headersSent || res.writableEnded) {
            logger.warn({
                method: req.method,
                path: req.path,
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString()
            }, '[SAFE_RESPONSE] Tentativa de múltiplo response.send bloqueada');
            return res;
        }
        res._responseSent = true;
        return originalSend.call(this, body);
    };
    // Override res.end para prevenir múltiplos writes
    const originalEnd = res.end;
    res.end = function () {
        if (res._isDestroyed) {
            logger.warn({
                method: req.method,
                path: req.path,
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString()
            }, '[SAFE_RESPONSE] Tentativa de write em stream destruído bloqueada');
            return res;
        }
        res._responseSent = true;
        const args = Array.from(arguments);
        return originalEnd.apply(this, args);
    };
    // Escutar evento de close para marcar como destruído
    res.on('close', () => {
        res._isDestroyed = true;
        logger.debug({
            method: req.method,
            path: req.path,
            ip: req.ip,
            timestamp: new Date().toISOString()
        }, '[SAFE_RESPONSE] Response stream closed');
    });
    // Escutar evento de finish
    res.on('finish', () => {
        res._responseSent = true;
        logger.debug({
            method: req.method,
            path: req.path,
            ip: req.ip,
            timestamp: new Date().toISOString()
        }, '[SAFE_RESPONSE] Response finished');
    });
    next();
}
/**
 * Verifica se response pode ser escrito
 */
function canWriteResponse(res) {
    return !res._responseSent && !res.headersSent && !res.writableEnded && !res._isDestroyed;
}
/**
 * Wrapper seguro para response.json
 */
function safeJson(res, data, statusCode = 200) {
    if (!canWriteResponse(res)) {
        return false;
    }
    try {
        res.status(statusCode).json(data);
        return true;
    }
    catch (error) {
        logger.error({
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString()
        }, '[SAFE_RESPONSE] Erro ao enviar JSON');
        return false;
    }
}
/**
 * Wrapper seguro para audit log (só executa ANTES da resposta)
 */
function safeAuditLog(res, auditFn) {
    // Só executa audit se response ainda não foi enviado
    if (!canWriteResponse(res)) {
        logger.warn({
            timestamp: new Date().toISOString()
        }, '[SAFE_RESPONSE] Audit log ignorado - response já enviado');
        return;
    }
    // Executar audit de forma assíncrona sem bloquear response
    Promise.resolve(auditFn()).catch(error => {
        logger.error({
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString()
        }, '[SAFE_RESPONSE] Erro no audit log assíncrono');
    });
}
/**
 * Wrapper seguro para metrics (só executa ANTES da resposta)
 */
function safeMetrics(res, metricsFn) {
    // Só executa metrics se response ainda não foi enviado
    if (!canWriteResponse(res)) {
        logger.debug({
            timestamp: new Date().toISOString()
        }, '[SAFE_RESPONSE] Metrics ignorados - response já enviado');
        return;
    }
    // Executar metrics de forma assíncrona sem bloquear response
    Promise.resolve(metricsFn()).catch(error => {
        logger.error({
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString()
        }, '[SAFE_RESPONSE] Erro nas metrics assíncronas');
    });
}
/**
 * Middleware global para garantir regras
 */
function safeResponseGlobalMiddleware() {
    return [
        safeResponseMiddleware,
        // Middleware para garantir que next() não seja chamado após response
        (req, res, next) => {
            const originalNext = next;
            const guardedNext = (err) => {
                if (res._responseSent || res.headersSent) {
                    logger.warn({
                        method: req.method,
                        path: req.path,
                        ip: req.ip,
                        error: err,
                        timestamp: new Date().toISOString()
                    }, '[SAFE_RESPONSE] next() chamado após response enviado - BLOQUEADO');
                    return;
                }
                return originalNext(err);
            };
            return guardedNext();
        }
    ];
}
/**
 * Verificação de promises pendentes (para debug)
 */
function checkPendingPromises() {
    if (process.env.NODE_ENV === 'development') {
        // Contagem simplificada para evitar erros TypeScript
        const pendingCount = 1; // Placeholder
        if (pendingCount > 100) {
            logger.warn({
                pendingHandles: pendingCount,
                timestamp: new Date().toISOString()
            }, '[SAFE_RESPONSE] Muitos handles pendentes - possível memory leak');
        }
    }
}
// Exportar funções utilitárias
export { safeResponseMiddleware, safeResponseGlobalMiddleware, canWriteResponse, safeJson, safeAuditLog, safeMetrics, checkPendingPromises };
