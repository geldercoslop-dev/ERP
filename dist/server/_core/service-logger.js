/**
 * Sistema de log estruturado para serviços
 *
 * Este módulo fornece funções para registrar logs estruturados
 * relacionados a erros e avisos nos serviços.
 */
import { nanoid } from 'nanoid';
/**
 * Níveis de log
 */
export var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "DEBUG";
    LogLevel["INFO"] = "INFO";
    LogLevel["WARNING"] = "WARNING";
    LogLevel["ERROR"] = "ERROR";
    LogLevel["CRITICAL"] = "CRITICAL";
})(LogLevel || (LogLevel = {}));
/**
 * Tipos de erro
 */
export var ErrorType;
(function (ErrorType) {
    ErrorType["INVALID_ARRAY"] = "INVALID_ARRAY";
    ErrorType["INVALID_OBJECT"] = "INVALID_OBJECT";
    ErrorType["INVALID_ID"] = "INVALID_ID";
    ErrorType["CREATE_INVALID_RETURN"] = "CREATE_INVALID_RETURN";
    ErrorType["UPDATE_INVALID_RETURN"] = "UPDATE_INVALID_RETURN";
    ErrorType["DELETE_INVALID_RETURN"] = "DELETE_INVALID_RETURN";
    ErrorType["UNDEFINED_RETURN"] = "UNDEFINED_RETURN";
    ErrorType["NULL_RETURN"] = "NULL_RETURN";
    ErrorType["UNEXPECTED_ERROR"] = "UNEXPECTED_ERROR";
    // Tipos de erro específicos para cache
    ErrorType["INVALID_CACHE_VALUE"] = "INVALID_CACHE_VALUE";
    ErrorType["CACHE_STORE_FAILED"] = "CACHE_STORE_FAILED";
    ErrorType["CACHE_INVALIDATION_FAILED"] = "CACHE_INVALIDATION_FAILED";
})(ErrorType || (ErrorType = {}));
/**
 * Contador de erros por tipo
 */
const errorCounts = {};
/**
 * Timestamp do último alerta crítico
 */
let lastCriticalAlert = 0;
/**
 * Contador de erros no último minuto
 */
let errorsLastMinute = 0;
/**
 * Timestamp do último reset do contador de erros por minuto
 */
let lastMinuteReset = Date.now();
/**
 * Limite de erros por minuto para considerar um problema crítico
 */
const CRITICAL_ERROR_THRESHOLD = 10;
/**
 * Intervalo de tempo (em ms) para considerar um problema crítico
 */
const CRITICAL_ERROR_INTERVAL = 60000; // 1 minuto
/**
 * Registra um log estruturado
 * @param level - O nível do log
 * @param type - O tipo do erro
 * @param message - A mensagem do log
 * @param details - Detalhes adicionais
 * @returns O log estruturado
 */
export function logStructured(level, type, message, details) {
    const now = Date.now();
    const traceId = details?.traceId || nanoid(10);
    // Incrementar contador de erros
    if (level === LogLevel.ERROR || level === LogLevel.CRITICAL) {
        errorCounts[type] = (errorCounts[type] || 0) + 1;
        errorsLastMinute++;
        // Resetar contador de erros por minuto se necessário
        if (now - lastMinuteReset > CRITICAL_ERROR_INTERVAL) {
            lastMinuteReset = now;
            errorsLastMinute = 1;
        }
        // Verificar se atingiu o limite de erros por minuto
        if (errorsLastMinute >= CRITICAL_ERROR_THRESHOLD && now - lastCriticalAlert > CRITICAL_ERROR_INTERVAL) {
            lastCriticalAlert = now;
            console.error(`🚨 CRITICAL SYSTEM ISSUE: ${errorsLastMinute} errors in the last minute`);
            // Registrar contagem de erros por tipo
            console.error('Error counts by type:');
            Object.entries(errorCounts).forEach(([errorType, count]) => {
                console.error(`  ${errorType}: ${count}`);
            });
        }
    }
    const log = {
        timestamp: new Date(now).toISOString(),
        level,
        type,
        message,
        service: details?.service,
        method: details?.method,
        traceId,
        payload: details?.payload,
        stack: details?.error?.stack
    };
    // Formatar e exibir o log
    let logMessage = `[${log.level}] [${log.type}] [${log.traceId}]`;
    if (log.service)
        logMessage += ` [${log.service}]`;
    if (log.method)
        logMessage += `.${log.method}`;
    logMessage += `: ${log.message}`;
    switch (level) {
        case LogLevel.DEBUG:
            console.debug(logMessage);
            break;
        case LogLevel.INFO:
            console.info(logMessage);
            break;
        case LogLevel.WARNING:
            console.warn(logMessage);
            break;
        case LogLevel.ERROR:
        case LogLevel.CRITICAL:
            console.error(logMessage);
            if (log.payload)
                console.error('Payload:', log.payload);
            if (log.stack)
                console.error('Stack:', log.stack);
            break;
    }
    return log;
}
/**
 * Registra um log de depuração
 * @param message - A mensagem do log
 * @param details - Detalhes adicionais
 * @returns O log estruturado
 */
export function logDebug(message, details) {
    return logStructured(LogLevel.DEBUG, 'DEBUG', message, details);
}
/**
 * Registra um log informativo
 * @param message - A mensagem do log
 * @param details - Detalhes adicionais
 * @returns O log estruturado
 */
export function logInfo(message, details) {
    return logStructured(LogLevel.INFO, 'INFO', message, details);
}
/**
 * Registra um log de aviso
 * @param type - O tipo do aviso
 * @param message - A mensagem do log
 * @param details - Detalhes adicionais
 * @returns O log estruturado
 */
export function logWarning(type, message, details) {
    return logStructured(LogLevel.WARNING, type, message, details);
}
/**
 * Registra um log de erro
 * @param type - O tipo do erro
 * @param message - A mensagem do log
 * @param details - Detalhes adicionais
 * @returns O log estruturado
 */
export function logError(type, message, details) {
    return logStructured(LogLevel.ERROR, type, message, details);
}
/**
 * Registra um log crítico
 * @param type - O tipo do erro crítico
 * @param message - A mensagem do log
 * @param details - Detalhes adicionais
 * @returns O log estruturado
 */
export function logCritical(type, message, details) {
    return logStructured(LogLevel.CRITICAL, type, message, details);
}
/**
 * Obtém as estatísticas de erro
 * @returns As estatísticas de erro
 */
export function getErrorStats() {
    const totalErrors = Object.values(errorCounts).reduce((sum, count) => sum + count, 0);
    return {
        totalErrors,
        errorsByType: { ...errorCounts },
        errorsLastMinute
    };
}
/**
 * Reseta as estatísticas de erro
 */
export function resetErrorStats() {
    Object.keys(errorCounts).forEach(key => {
        errorCounts[key] = 0;
    });
    errorsLastMinute = 0;
    lastMinuteReset = Date.now();
}
