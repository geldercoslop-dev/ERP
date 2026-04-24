import pino from "pino";
import { getObservabilityContext } from "./observability-context.js";
import { getCurrentTraceId } from "../_core/opentelemetry.js";
import { StructuredErrorLogger } from './error-tracking.js';
/**
 * Logger estruturado com timestamp e contexto padrão
 */
export class StructuredLogger {
    module;
    pinoLogger = pino({
        level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
        base: undefined,
    });
    constructor(module) {
        this.module = module || 'system';
    }
    /**
     * Cria entrada de log com timestamp padrão
     */
    createLogEntry(level, message, context = {}) {
        const observability = getObservabilityContext();
        const otelTraceId = getCurrentTraceId();
        return {
            timestamp: new Date().toISOString(),
            level,
            message,
            module: this.module,
            traceId: context.traceId ?? otelTraceId ?? observability?.traceId,
            requestId: context.requestId ?? observability?.requestId,
            ...context,
        };
    }
    /**
     * Log de debug
     */
    debug(message, context = {}) {
        const entry = this.createLogEntry('DEBUG', message, context);
        this.pinoLogger.debug(entry);
    }
    /**
     * Log de info
     */
    info(message, context = {}) {
        const entry = this.createLogEntry('INFO', message, context);
        this.pinoLogger.info(entry);
    }
    /**
     * Log de warning
     */
    warn(message, context = {}) {
        const entry = this.createLogEntry('WARN', message, context);
        this.pinoLogger.warn(entry);
    }
    /**
     * Log de erro — 2º arg pode ser Error/string (erro) ou objeto de contexto.
     */
    error(message, errorOrContext, maybeContext) {
        let error;
        let context = {};
        if (errorOrContext === undefined) {
            context = maybeContext ?? {};
        }
        else if (errorOrContext instanceof Error || typeof errorOrContext === "string") {
            error = errorOrContext;
            context = maybeContext ?? {};
        }
        else {
            context = { ...errorOrContext, ...maybeContext };
        }
        const errObj = error instanceof Error
            ? { message: error.message, stack: error.stack }
            : error
                ? { message: error }
                : typeof context.error === "string"
                    ? { message: context.error }
                    : context.error;
        const entry = this.createLogEntry("ERROR", message, {
            ...context,
            error: errObj,
        });
        this.pinoLogger.error(entry);
        if (error) {
            // Use StructuredErrorLogger imported at the top
            const meta = context.metadata;
            StructuredErrorLogger.error(error, {
                route: meta?.route,
                method: meta?.method,
                path: meta?.path,
                payload: context.payload,
                userId: context.userId,
                tenantId: context.tenantId,
                requestId: context.requestId,
                duration: context.duration,
            });
        }
    }
    /**
     * Log de performance
     */
    performance(operation, duration, context = {}) {
        this.info(`Performance: ${operation}`, {
            ...context,
            metadata: {
                ...context.metadata,
                operation,
                duration,
                performance: true,
            },
        });
    }
    /**
     * Log de request
     */
    request(method, path, statusCode, duration, context = {}) {
        const level = statusCode >= 400 ? 'WARN' : statusCode >= 500 ? 'ERROR' : 'INFO';
        this.createLogEntry(level, `${method} ${path} ${statusCode}`, {
            ...context,
            metadata: {
                ...context.metadata,
                method,
                path,
                statusCode,
                duration,
                request: true,
            },
        });
        const entry = this.createLogEntry(level, `${method} ${path} ${statusCode}`, {
            ...context,
            metadata: {
                method,
                path,
                statusCode,
                duration,
                request: true,
                ...context.metadata,
            },
        });
        if (level === "WARN")
            this.pinoLogger.warn(entry);
        else
            this.pinoLogger.info(entry);
    }
    /**
     * Log de database
     */
    database(query, duration, success, error, context = {}) {
        const level = !success || duration > 1000 ? 'WARN' : 'DEBUG';
        this.createLogEntry(level, `DB Query: ${query.substring(0, 100)}...`, {
            ...context,
            metadata: {
                ...context.metadata,
                query: query.substring(0, 200),
                duration,
                success,
                database: true,
            },
        });
        const entry = this.createLogEntry(level, `DB Query: ${query.substring(0, 100)}...`, {
            ...context,
            metadata: {
                query: query.substring(0, 200),
                duration,
                success,
                database: true,
                ...context.metadata,
            },
        });
        if (level === "WARN")
            this.pinoLogger.warn(entry);
        else
            this.pinoLogger.debug(entry);
    }
}
/**
 * Logger global para uso em todo o sistema
 */
let globalLogger = null;
export function getGlobalLogger() {
    if (!globalLogger) {
        globalLogger = new StructuredLogger();
    }
    return globalLogger;
}
/**
 * Factory para criar loggers específicos de módulo
 */
export function createLogger(module) {
    return new StructuredLogger(module);
}
/**
 * Decorator para adicionar logging a funções
 */
export function logExecution(logger) {
    return function (target, propertyName, descriptor) {
        const method = descriptor.value;
        const moduleLogger = logger || createLogger(target.constructor.name);
        descriptor.value = async function (...args) {
            const startTime = Date.now();
            moduleLogger.debug(`Starting ${propertyName}`, {
                function: propertyName,
                payload: args.length > 0 ? args[0] : undefined,
            });
            try {
                const result = await method.apply(this, args);
                const duration = Date.now() - startTime;
                moduleLogger.debug(`Completed ${propertyName}`, {
                    function: propertyName,
                    duration,
                    success: true,
                });
                return result;
            }
            catch (error) {
                const duration = Date.now() - startTime;
                moduleLogger.error(`Error in ${propertyName}`, error, {
                    function: propertyName,
                    duration,
                    success: false,
                });
                throw error;
            }
        };
        return descriptor;
    };
}
