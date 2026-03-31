import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../infra/structured-logger.js';

const logger = createLogger('failure-logger');

/**
 * Interface para informações de falha
 */
export interface FailureInfo {
  operation: string;
  error: Error;
  duration?: number;
  context?: Record<string, any>;
  timestamp: number;
  stack?: string;
}

/**
 * Registry de falhas para análise
 */
class FailureRegistry {
  private failures: FailureInfo[] = [];
  private maxFailures: number = 1000;
  
  /**
   * Registra falha
   */
  record(failure: FailureInfo): void {
    this.failures.push(failure);
    
    // Manter apenas falhas recentes
    if (this.failures.length > this.maxFailures) {
      this.failures = this.failures.slice(-this.maxFailures);
    }
    
    // Log estruturado
    this.logFailure(failure);
  }
  
  /**
   * Log estruturado da falha
   */
  private logFailure(failure: FailureInfo): void {
    const logData = {
      operation: failure.operation,
      error: failure.error.message,
      stack: failure.error.stack,
      duration: failure.duration,
      context: failure.context,
      timestamp: new Date(failure.timestamp).toISOString(),
    };
    
    // Log baseado no tipo de erro
    if (failure.error.name === 'TimeoutError') {
      logger.error('Operation timeout', failure.error, { metadata: logData });
    } else if (failure.error.message.includes('Circuit breaker')) {
      logger.error('Circuit breaker triggered', failure.error, { metadata: logData });
    } else if (failure.error.message.includes('backpressure')) {
      logger.error('Backpressure limit exceeded', failure.error, { metadata: logData });
    } else if (failure.error.message.includes('Database')) {
      logger.error('Database operation failed', failure.error, { metadata: logData });
    } else {
      logger.error('Operation failed', failure.error, { metadata: logData });
    }
  }
  
  /**
   * Obtém estatísticas de falhas
   */
  getStats(timeWindowMs: number = 3600000): {
    total: number;
    byOperation: Record<string, number>;
    byErrorType: Record<string, number>;
    averageDuration: number;
    recentFailures: FailureInfo[];
  } {
    const now = Date.now();
    const recentFailures = this.failures.filter(f => now - f.timestamp <= timeWindowMs);
    
    const byOperation: Record<string, number> = {};
    const byErrorType: Record<string, number> = {};
    let totalDuration = 0;
    let durationCount = 0;
    
    recentFailures.forEach(failure => {
      // Agrupar por operação
      byOperation[failure.operation] = (byOperation[failure.operation] || 0) + 1;
      
      // Agrupar por tipo de erro
      const errorType = failure.error.name || 'Unknown';
      byErrorType[errorType] = (byErrorType[errorType] || 0) + 1;
      
      // Calcular duração média
      if (failure.duration) {
        totalDuration += failure.duration;
        durationCount++;
      }
    });
    
    return {
      total: recentFailures.length,
      byOperation,
      byErrorType,
      averageDuration: durationCount > 0 ? totalDuration / durationCount : 0,
      recentFailures: recentFailures.slice(-10), // Últimas 10 falhas
    };
  }
  
  /**
   * Limpa registry
   */
  clear(): void {
    this.failures = [];
  }
}

export const failureRegistry = new FailureRegistry();

/**
 * Middleware para logging de falhas em requests
 */
export function failureLoggerMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Intercepta erros
    const originalJson = res.json;
    res.json = function(data: any, ...args: any[]) {
      const duration = Date.now() - startTime;
      
      // Logar respostas de erro
      if (res.statusCode >= 400) {
        const error = new Error(`HTTP ${res.statusCode}: ${data?.error || data?.message || 'Unknown error'}`);
        
        failureRegistry.record({
          operation: `${req.method} ${req.path}`,
          error,
          duration,
          context: {
            statusCode: res.statusCode,
            url: req.url,
            method: req.method,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            body: req.body,
            params: req.params,
            query: req.query,
            response: data,
          },
          timestamp: Date.now(),
          stack: error.stack,
        });
      }
      
      return originalJson.call(this, data);
    };
    
    // Intercepta erros não capturados
    res.on('error', (error) => {
      const duration = Date.now() - startTime;
      
      failureRegistry.record({
        operation: `${req.method} ${req.path}`,
        error,
        duration,
        context: {
          url: req.url,
          method: req.method,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        },
        timestamp: Date.now(),
        stack: error.stack,
      });
    });
    
    next();
  };
}

/**
 * Decorator para logging de falhas em métodos
 */
export function logFailures(operationName?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const opName = operationName || `${target.constructor.name}.${propertyKey}`;
    
    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      
      try {
        const result = await originalMethod.apply(this, args);
        return result;
        
      } catch (error) {
        const duration = Date.now() - startTime;
        
        failureRegistry.record({
          operation: opName,
          error: error instanceof Error ? error : new Error(String(error)),
          duration,
          context: {
            args: args.length,
            className: target.constructor.name,
            methodName: propertyKey,
          },
          timestamp: Date.now(),
          stack: error instanceof Error ? error.stack : undefined,
        });
        
        throw error;
      }
    };
    
    return descriptor;
  };
}

/**
 * Log manual de falhas
 */
export function logFailure(
  operation: string,
  error: Error,
  context?: Record<string, any>,
  duration?: number
): void {
  failureRegistry.record({
    operation,
    error,
    duration,
    context,
    timestamp: Date.now(),
    stack: error.stack,
  });
}

/**
 * Obtém dashboard de falhas
 */
export function getFailureDashboard(timeWindowMs: number = 3600000): {
  summary: {
    total: number;
    rate: number;
    averageDuration: number;
  };
  topOperations: Array<{ operation: string; count: number; percentage: number }>;
  topErrors: Array<{ errorType: string; count: number; percentage: number }>;
  recentFailures: FailureInfo[];
  alerts: string[];
} {
  const stats = failureRegistry.getStats(timeWindowMs);
  const windowHours = timeWindowMs / 3600000;
  const alerts: string[] = [];
  
  // Gerar alerts
  if (stats.total > 100) {
    alerts.push(`High failure rate: ${stats.total} failures in ${windowHours.toFixed(1)}h`);
  }
  
  if (stats.averageDuration > 5000) {
    alerts.push(`Slow operations: ${stats.averageDuration.toFixed(0)}ms average duration`);
  }
  
  // Top operações
  const topOperations = Object.entries(stats.byOperation)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([operation, count]) => ({
      operation,
      count,
      percentage: stats.total > 0 ? (count / stats.total) * 100 : 0,
    }));
  
  // Top erros
  const topErrors = Object.entries(stats.byErrorType)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([errorType, count]) => ({
      errorType,
      count,
      percentage: stats.total > 0 ? (count / stats.total) * 100 : 0,
    }));
  
  return {
    summary: {
      total: stats.total,
      rate: stats.total / windowHours, // falhas por hora
      averageDuration: stats.averageDuration,
    },
    topOperations,
    topErrors,
    recentFailures: stats.recentFailures,
    alerts,
  };
}

/**
 * Health check baseado em falhas
 */
export function getFailureHealth(): {
  healthy: boolean;
  issues: string[];
  score: number; // 0-100
} {
  const stats = failureRegistry.getStats(300000); // Últimos 5 minutos
  let score = 100;
  const issues: string[] = [];
  
  // Penalizar por taxa de falhas
  if (stats.total > 10) {
    score -= Math.min(30, stats.total * 2);
    issues.push(`High failure rate: ${stats.total} failures in 5min`);
  }
  
  // Penalizar por falhas recorrentes
  const operationCounts = Object.values(stats.byOperation);
  const maxOperationFailures = Math.max(...operationCounts, 0);
  if (maxOperationFailures > 5) {
    score -= Math.min(20, maxOperationFailures * 3);
    issues.push(`Recurrent failures in single operation`);
  }
  
  // Penalizar por duração
  if (stats.averageDuration > 3000) {
    score -= Math.min(15, stats.averageDuration / 200);
    issues.push(`Slow failure recovery: ${stats.averageDuration.toFixed(0)}ms`);
  }
  
  return {
    healthy: score > 70,
    issues,
    score: Math.max(0, score),
  };
}
