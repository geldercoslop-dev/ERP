/**
 * Logger com rotação automática - Simplificado
 *
 * Implementação simplificada sem dependências externas
 */
import path from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
// Configuração do logger
const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');
const LOG_MAX_SIZE = process.env.LOG_MAX_SIZE ? parseInt(process.env.LOG_MAX_SIZE) : 50 * 1024 * 1024; // 50MB
const LOG_MAX_FILES = process.env.LOG_MAX_FILES ? parseInt(process.env.LOG_MAX_FILES) : 7; // 7 dias
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
// Garante que o diretório de logs existe
if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
}
// Logger simplificado
const logInfo = (message, context) => {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level: 'info', message, ...context };
    try {
        writeFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n', { flag: 'a' });
    }
    catch (error) {
        console.error('Erro ao escrever log:', error);
    }
};
const logError = (message, error, context) => {
    const timestamp = new Date().toISOString();
    const err = error instanceof Error ? error : (error != null ? new Error(String(error)) : undefined);
    const logEntry = {
        timestamp,
        level: 'error',
        message,
        ...(err && { error: err.message, stack: err.stack }),
        ...context
    };
    try {
        writeFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n', { flag: 'a' });
    }
    catch (writeError) {
        console.error('Erro ao escrever log:', writeError);
    }
};
const logWarn = (message, context) => {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level: 'warn', message, ...context };
    try {
        writeFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n', { flag: 'a' });
    }
    catch (error) {
        console.error('Erro ao escrever log:', error);
    }
};
const logDebug = (message, context) => {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level: 'debug', message, ...context };
    try {
        writeFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n', { flag: 'a' });
    }
    catch (error) {
        console.error('Erro ao escrever log:', error);
    }
};
// Logger simplificado
export const rotationLogger = {
    info: logInfo,
    error: logError,
    warn: logWarn,
    debug: logDebug,
};
// Export functions individualmente para compatibilidade
export { logInfo, logError, logWarn, logDebug };
// Função para obter estatísticas dos logs
export const getLogStats = () => {
    return {
        logDir: LOG_DIR,
        logFile: LOG_FILE,
        maxSize: LOG_MAX_SIZE,
        maxFiles: LOG_MAX_FILES,
        level: LOG_LEVEL,
    };
};
// Função para forçar rotação manual (simplificada)
export const rotateLogs = () => {
    // Implementação simplificada - não faz nada por enquanto
    console.log('Rotação de logs solicitada (não implementada)');
};
