import { ErrorContext } from './logger-core.js';
import pino from "pino";
import { getObservabilityContext } from "./observability-context.js";
import { getCurrentTraceId } from "../_core/opentelemetry.js";
import { StructuredErrorLogger } from './error-tracking.js';

export interface LogContext {
  timestamp?: string;
  level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message?: string;
  module?: string;
  function?: string;
  userId?: number;
  tenantId?: number;
  requestId?: string;
  traceId?: string;
  duration?: number;
  success?: boolean;
  payload?: Record<string, unknown>;
  status?: string;
  query?: string;
  delay?: number;
  size?: number;
  errorKey?: string;
  severity?: string;
  name?: string;
  operation?: string;
  activeRequests?: number;
  state?: string;
  nextAttemptTime?: number | string;
  count?: number;
  method?: string;
  path?: string;
  url?: string;
  ip?: string;
  threshold?: number;
  totalCount?: number;
  recentCount?: number;
  firstSeen?: string;
  lastSeen?: string;
  maxConcurrent?: number;
  queueSize?: number;
  maxQueueSize?: number;
  failureCount?: number;
  failureThreshold?: number;
  /** Texto curto de erro no contexto (evita confundir com objeto Error) */
  errorMessage?: string;
  error?: string | { message: string; stack?: string };
  metadata?: Record<string, unknown>;
  paramsCount?: number;
  hasQuery?: boolean;
  hasExecute?: boolean;
  rowsAffected?: number;
  key?: string;
  argsCount?: number;
  resultType?: string;
  operationsCount?: number;
  instrumentedMethods?: string[];
  hasPipeline?: boolean;
}

/** Contexto de log com campos livres (evita TS2353 em logger.error) */
export type LogContextInput = Partial<LogContext> & Record<string, unknown>;

/**
 * Logger estruturado com timestamp e contexto padrão
 */
export class StructuredLogger {
  private module: string;
  private readonly pinoLogger = pino({
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
    base: undefined,
  });
  
  constructor(module?: string) {
    this.module = module || 'system';
  }
  
  /**
   * Cria entrada de log com timestamp padrão
   */
  private createLogEntry(level: LogContext['level'], message: string, context: Partial<LogContext> = {}): LogContext {
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
  debug(message: string, context: Partial<LogContext> = {}): void {
    const entry = this.createLogEntry('DEBUG', message, context);
    this.pinoLogger.debug(entry);
  }
  
  /**
   * Log de info
   */
  info(message: string, context: Partial<LogContext> = {}): void {
    const entry = this.createLogEntry('INFO', message, context);
    this.pinoLogger.info(entry);
  }
  
  /**
   * Log de warning
   */
  warn(message: string, context: Partial<LogContext> = {}): void {
    const entry = this.createLogEntry('WARN', message, context);
    this.pinoLogger.warn(entry);
  }
  
  /**
   * Log de erro — 2º arg pode ser Error/string (erro) ou objeto de contexto.
   */
  error(
    message: string,
    errorOrContext?: Error | string | LogContextInput,
    maybeContext?: LogContextInput
  ): void {
    let error: Error | string | undefined;
    let context: LogContextInput = {};
    if (errorOrContext === undefined) {
      context = maybeContext ?? {};
    } else if (errorOrContext instanceof Error || typeof errorOrContext === "string") {
      error = errorOrContext;
      context = maybeContext ?? {};
    } else {
      context = { ...errorOrContext, ...maybeContext };
    }

    const errObj =
      error instanceof Error
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
      const meta = context.metadata as Record<string, string> | undefined;
      StructuredErrorLogger.error(error, {
        route: meta?.route as string | undefined,
        method: meta?.method as string | undefined,
        path: meta?.path as string | undefined,
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
  performance(operation: string, duration: number, context: Partial<LogContext> = {}): void {
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
  request(method: string, path: string, statusCode: number, duration: number, context: Partial<LogContext> = {}): void {
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
    if (level === "WARN") this.pinoLogger.warn(entry);
    else this.pinoLogger.info(entry);
  }
  
  /**
   * Log de database
   */
  database(query: string, duration: number, success: boolean, error?: string, context: Partial<LogContext> = {}): void {
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
    if (level === "WARN") this.pinoLogger.warn(entry);
    else this.pinoLogger.debug(entry);
  }
}

/**
 * Logger global para uso em todo o sistema
 */
let globalLogger: StructuredLogger | null = null;
export function getGlobalLogger(): StructuredLogger {
  if (!globalLogger) {
    globalLogger = new StructuredLogger();
  }
  return globalLogger;
}

/**
 * Factory para criar loggers específicos de módulo
 */
export function createLogger(module: string): StructuredLogger {
  return new StructuredLogger(module);
}

/**
 * Decorator para adicionar logging a funções
 */
export function logExecution(logger?: StructuredLogger) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const moduleLogger = logger || createLogger(target.constructor.name);
    
    descriptor.value = async function (...args: any[]) {
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
      } catch (error) {
        const duration = Date.now() - startTime;
        
        moduleLogger.error(`Error in ${propertyName}`, error as Error, {
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
