/**
 * Logger centralizado do sistema
 * Implementação direta para evitar import circular
 */

import pino from 'pino';

const pinoLogger = pino({
  level: process.env.LOG_LEVEL || 'info'
});

export const logger = pinoLogger;

// Interface para contextos de log
export interface LogContext {
  [key: string]: unknown;
}

// Interface unificada do logger
export interface Logger {
  info(message: string, context?: LogContext): void;
  error(message: string, error?: Error, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
}

// Logger principal exportado
export const loggerInstance: Logger = {
  info: (message: string, context?: LogContext) => pinoLogger.info(context || {}, message),
  error: (message: string, error?: Error, context?: LogContext) => {
    if (error) {
      pinoLogger.error({ ...context, error: { message: error.message, stack: error.stack, name: error.name } }, message);
    } else {
      pinoLogger.error(context || {}, message);
    }
  },
  warn: (message: string, context?: LogContext) => pinoLogger.warn(context || {}, message),
  debug: (message: string, context?: LogContext) => pinoLogger.debug(context || {}, message),
};

// Funções de conveniência para compatibilidade
export const logInfo = (data: Record<string, unknown> | string, context?: LogContext) => {
  if (typeof data === 'string') {
    pinoLogger.info({ message: data, ...(context || {}) });
  } else {
    pinoLogger.info({ ...(data || {}), ...(context || {}) });
  }
};

export const logError = (data: Record<string, unknown> | string, error?: Error | unknown, context?: LogContext) => {
  if (typeof data === 'string') {
    const logData: Record<string, unknown> = { message: data, ...(context || {}) };
    if (error instanceof Error) {
      logData.error = { message: error.message, stack: error.stack, name: error.name };
    } else if (error) {
      logData.error = String(error);
    }
    pinoLogger.error(logData);
  } else {
    const logData: Record<string, unknown> = { ...(data || {}), ...(context || {}) };
    if (error instanceof Error) {
      logData.error = { message: error.message, stack: error.stack, name: error.name };
    } else if (error) {
      logData.error = String(error);
    }
    pinoLogger.error(logData);
  }
};

export const logWarn = (data: Record<string, unknown> | string, context?: LogContext) => {
  if (typeof data === 'string') {
    pinoLogger.warn({ message: data, ...(context || {}) });
  } else {
    pinoLogger.warn({ ...(data || {}), ...(context || {}) });
  }
};

export const logDebug = (data: Record<string, unknown> | string, context?: LogContext) => {
  if (typeof data === 'string') {
    pinoLogger.debug({ message: data, ...(context || {}) });
  } else {
    pinoLogger.debug({ ...(data || {}), ...(context || {}) });
  }
};

// Configuração do logger
export const configureLogger = (config: {
  level?: 'debug' | 'info' | 'warn' | 'error';
  enableConsole?: boolean;
  enableFile?: boolean;
}) => {
  // Implementar configuração se necessário
  if (config.level) {
    // TODO: Implementar configuração de nível
  }
};

export default loggerInstance;
