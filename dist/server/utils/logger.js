/**
 * Logger centralizado do sistema
 * Implementação direta para evitar import circular
 */
import pino from 'pino';
const pinoLogger = pino({
    level: process.env.LOG_LEVEL || 'info'
});
export const logger = pinoLogger;
// Logger principal exportado
export const loggerInstance = {
    info: (message, context) => pinoLogger.info(context || {}, message),
    error: (message, error, context) => {
        if (error) {
            pinoLogger.error({ ...context, error: { message: error.message, stack: error.stack, name: error.name } }, message);
        }
        else {
            pinoLogger.error(context || {}, message);
        }
    },
    warn: (message, context) => pinoLogger.warn(context || {}, message),
    debug: (message, context) => pinoLogger.debug(context || {}, message),
};
// Funções de conveniência para compatibilidade
export const logInfo = (data, context) => {
    if (typeof data === 'string') {
        pinoLogger.info({ message: data, ...(context || {}) });
    }
    else {
        pinoLogger.info({ ...(data || {}), ...(context || {}) });
    }
};
export const logError = (data, error, context) => {
    if (typeof data === 'string') {
        const logData = { message: data, ...(context || {}) };
        if (error instanceof Error) {
            logData.error = { message: error.message, stack: error.stack, name: error.name };
        }
        else if (error) {
            logData.error = String(error);
        }
        pinoLogger.error(logData);
    }
    else {
        const logData = { ...(data || {}), ...(context || {}) };
        if (error instanceof Error) {
            logData.error = { message: error.message, stack: error.stack, name: error.name };
        }
        else if (error) {
            logData.error = String(error);
        }
        pinoLogger.error(logData);
    }
};
export const logWarn = (data, context) => {
    if (typeof data === 'string') {
        pinoLogger.warn({ message: data, ...(context || {}) });
    }
    else {
        pinoLogger.warn({ ...(data || {}), ...(context || {}) });
    }
};
export const logDebug = (data, context) => {
    if (typeof data === 'string') {
        pinoLogger.debug({ message: data, ...(context || {}) });
    }
    else {
        pinoLogger.debug({ ...(data || {}), ...(context || {}) });
    }
};
// Configuração do logger
export const configureLogger = (config) => {
    // Implementar configuração se necessário
    if (config.level) {
        // TODO: Implementar configuração de nível
    }
};
export default loggerInstance;
