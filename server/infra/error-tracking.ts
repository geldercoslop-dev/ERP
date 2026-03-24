import { recordRequest } from './metrics';
import { ErrorContext } from './logger-core';

/**
 * Lazy load do logger para evitar circular dependency
 */
let errorLoggerInstance: any = null;
function getErrorLogger() {
  if (!errorLoggerInstance) {
    const { createLogger } = require('./structured-logger');
    errorLoggerInstance = createLogger("error-tracking");
  }
  return errorLoggerInstance;
}

/**
 * Logger de erro estruturado com métricas
 */
export class StructuredErrorLogger {
  /**
   * Registra erro com contexto completo
   */
  static error(error: Error | string, context: ErrorContext = {}): void {
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
    
    // Log estruturado centralizado
    getErrorLogger().error(errorMessage, {
      requestId: context.requestId,
      tenantId: context.tenantId,
      userId: context.userId,
      path: context.path,
      method: context.method,
      duration: context.duration,
      metadata: {
        stack: errorStack,
        logEntry,
      },
    });
    
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
  static warn(message: string, context: ErrorContext = {}): void {
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
    
    getErrorLogger().warn(message, {
      requestId: context.requestId,
      tenantId: context.tenantId,
      userId: context.userId,
      path: context.path,
      method: context.method,
      duration: context.duration,
      metadata: { logEntry },
    });
  }
  
  /**
   * Registra info com contexto
   */
  static info(message: string, context: ErrorContext = {}): void {
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
    
    getErrorLogger().info(message, {
      requestId: context.requestId,
      tenantId: context.tenantId,
      userId: context.userId,
      path: context.path,
      method: context.method,
      duration: context.duration,
      metadata: { logEntry },
    });
  }
}

/**
 * Wrapper para funções async com tracking de erro
 */
export function withErrorTracking<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context: Partial<ErrorContext> = {}
): T {
  return (async (...args: any[]) => {
    const startTime = Date.now();
    
    try {
      const result = await fn(...args);
      return result;
    } catch (error) {
      StructuredErrorLogger.error(error as Error, {
        ...context,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }) as T;
}

/**
 * Middleware Express para tracking de erros
 */
export function errorTrackingMiddleware() {
  return (error: Error, req: any, res: any, next: any) => {
    const startTime = req.startTime || Date.now();
    const duration = Date.now() - startTime;
    
    StructuredErrorLogger.error(error, {
      route: req.path,
      method: req.method,
      path: req.url,
      payload: req.body,
      userId: req.user?.id,
      tenantId: req.tenantId,
      requestId: req.requestId,
      duration,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    });
    
    next(error);
  };
}
