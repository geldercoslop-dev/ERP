import { tracer } from './tracing';
import { createLogger } from './structured-logger';

const logger = createLogger('performance-logging');

/**
 * Interface para métricas de performance
 */
export interface PerformanceMetrics {
  operationName: string;
  traceId: string;
  spanId: string;
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  error?: string;
  tags?: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Registry de métricas de performance
 */
class PerformanceMetricsRegistry {
  private metrics: PerformanceMetrics[] = [];
  private maxMetrics: number = 50000;
  
  /**
   * Registra métrica de performance
   */
  record(metric: PerformanceMetrics): void {
    this.metrics.push(metric);
    
    // Manter apenas métricas recentes
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
    
    // Log estruturado
    this.logMetric(metric);
  }
  
  /**
   * Log estruturado da métrica
   */
  private logMetric(metric: PerformanceMetrics): void {
    const logData = {
      operation: metric.operationName,
      traceId: metric.traceId,
      spanId: metric.spanId,
      duration: metric.duration,
      success: metric.success,
      startTime: new Date(metric.startTime).toISOString(),
      endTime: new Date(metric.endTime).toISOString(),
      tags: metric.tags,
      metadata: metric.metadata,
      error: metric.error,
    };
    
    if (metric.success) {
      if (metric.duration > 5000) {
        logger.warn('Slow operation detected', { metadata: logData });
      } else {
        logger.debug('Operation completed', { metadata: logData });
      }
    } else {
      logger.error('Operation failed', new Error(metric.error || 'Unknown error'), { metadata: logData });
    }
  }
  
  /**
   * Obtém estatísticas agregadas
   */
  getStats(timeWindowMs: number = 300000): {
    totalOperations: number;
    averageDuration: number;
    successRate: number;
    slowestOperations: PerformanceMetrics[];
    fastestOperations: PerformanceMetrics[];
    operationsByType: Record<string, {
      count: number;
      avgDuration: number;
      successRate: number;
      minDuration: number;
      maxDuration: number;
    }>;
    errorRate: number;
    errorsByType: Record<string, number>;
  } {
    const now = Date.now();
    const recentMetrics = this.metrics.filter(
      metric => now - metric.endTime <= timeWindowMs
    );
    
    const totalOperations = recentMetrics.length;
    const successfulOperations = recentMetrics.filter(m => m.success);
    const successRate = totalOperations > 0 ? (successfulOperations.length / totalOperations) * 100 : 0;
    const errorRate = 100 - successRate;
    
    // Duração média
    const totalDuration = recentMetrics.reduce((sum, m) => sum + m.duration, 0);
    const averageDuration = totalOperations > 0 ? totalDuration / totalOperations : 0;
    
    // Operações mais lentas
    const slowestOperations = recentMetrics
      .filter(m => m.success)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);
    
    // Operações mais rápidas
    const fastestOperations = recentMetrics
      .filter(m => m.success)
      .sort((a, b) => a.duration - b.duration)
      .slice(0, 10);
    
    // Agrupar por tipo de operação
    const operationsByType: Record<string, {
      count: number;
      avgDuration: number;
      successRate: number;
      minDuration: number;
      maxDuration: number;
    }> = {};
    
    recentMetrics.forEach(metric => {
      const type = metric.operationName;
      if (!operationsByType[type]) {
        operationsByType[type] = {
          count: 0,
          avgDuration: 0,
          successRate: 0,
          minDuration: Infinity,
          maxDuration: 0,
        };
      }
      
      const stats = operationsByType[type];
      stats.count++;
      stats.avgDuration = ((stats.avgDuration * (stats.count - 1)) + metric.duration) / stats.count;
      stats.minDuration = Math.min(stats.minDuration, metric.duration);
      stats.maxDuration = Math.max(stats.maxDuration, metric.duration);
      
      if (metric.success) {
        stats.successRate = ((stats.successRate * (stats.count - 1)) + 100) / stats.count;
      } else {
        stats.successRate = ((stats.successRate * (stats.count - 1)) + 0) / stats.count;
      }
    });
    
    // Erros por tipo
    const errorsByType: Record<string, number> = {};
    recentMetrics
      .filter(m => !m.success && m.error)
      .forEach(metric => {
        const errorType = metric.error || 'Unknown';
        errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
      });
    
    return {
      totalOperations,
      averageDuration,
      successRate,
      slowestOperations,
      fastestOperations,
      operationsByType,
      errorRate,
      errorsByType,
    };
  }
  
  /**
   * Obtém métricas por trace ID
   */
  getMetricsByTraceId(traceId: string): PerformanceMetrics[] {
    return this.metrics.filter(metric => metric.traceId === traceId);
  }
  
  /**
   * Limpa métricas antigas
   */
  cleanup(maxAgeMs: number = 3600000): void {
    const cutoff = Date.now() - maxAgeMs;
    this.metrics = this.metrics.filter(metric => metric.endTime > cutoff);
  }
}

export const performanceRegistry = new PerformanceMetricsRegistry();

/**
 * Medidor de performance automático
 */
export class PerformanceMeasurer {
  private startTime: number;
  private operationName: string;
  private traceId: string;
  private spanId: string;
  private tags?: Record<string, any>;
  private metadata?: Record<string, any>;
  
  constructor(
    operationName: string,
    traceId: string,
    spanId: string,
    tags?: Record<string, any>,
    metadata?: Record<string, any>
  ) {
    this.operationName = operationName;
    this.traceId = traceId;
    this.spanId = spanId;
    this.tags = tags;
    this.metadata = metadata;
    this.startTime = Date.now();
  }
  
  /**
   * Finaliza medição e registra métrica
   */
  finish(success: boolean = true, error?: Error): void {
    const endTime = Date.now();
    const duration = endTime - this.startTime;
    
    const metric: PerformanceMetrics = {
      operationName: this.operationName,
      traceId: this.traceId,
      spanId: this.spanId,
      startTime: this.startTime,
      endTime,
      duration,
      success,
      error: error?.message,
      tags: this.tags,
      metadata: this.metadata,
    };
    
    performanceRegistry.record(metric);
  }
  
  /**
   * Adiciona metadata
   */
  addMetadata(key: string, value: any): void {
    if (!this.metadata) this.metadata = {};
    this.metadata[key] = value;
  }
  
  /**
   * Adiciona tag
   */
  addTag(key: string, value: any): void {
    if (!this.tags) this.tags = {};
    this.tags[key] = value;
  }
}

/**
 * Função para medir performance de operação
 */
export function measurePerformance<T>(
  operationName: string,
  operation: () => Promise<T>,
  tags?: Record<string, any>,
  metadata?: Record<string, any>
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    const { getCurrentSpan } = await import('./tracing');
    const currentSpan = getCurrentSpan();
    const traceId = currentSpan?.traceId || tracer.generateTraceId();
    const spanId = currentSpan?.spanId || tracer.generateSpanId();
    
    const measurer = new PerformanceMeasurer(operationName, traceId, spanId, tags, metadata);
    
    try {
      const result = await operation();
      measurer.finish(true);
      resolve(result);
    } catch (error) {
      measurer.finish(false, error as Error);
      reject(error);
    }
  });
}

/**
 * Decorator para measuring automático
 */
export function measure(operationName?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const opName = operationName || `${target.constructor.name}.${propertyKey}`;
    
    descriptor.value = async function (...args: any[]) {
      const traceId = tracer.generateTraceId();
      const spanId = tracer.generateSpanId();
      
      const tags = {
        'class': target.constructor.name,
        'method': propertyKey,
        'args_count': args.length,
      };
      
      const metadata = {
        args: args.length,
      };
      
      return measurePerformance(opName, () => originalMethod.apply(this, args), tags, metadata);
    };
    
    return descriptor;
  };
}

/**
 * Dashboard de performance
 */
export function getPerformanceDashboard(timeWindowMs: number = 300000): {
  summary: {
    totalOperations: number;
    averageDuration: number;
    successRate: number;
    errorRate: number;
  };
  slowest: Array<{ operation: string; duration: number; traceId: string }>;
  fastest: Array<{ operation: string; duration: number; traceId: string }>;
  byType: Record<string, {
    count: number;
    avgDuration: number;
    successRate: number;
    minDuration: number;
    maxDuration: number;
  }>;
  errors: Array<{ type: string; count: number; percentage: number }>;
  alerts: string[];
} {
  const stats = performanceRegistry.getStats(timeWindowMs);
  const alerts: string[] = [];
  
  // Gerar alerts
  if (stats.averageDuration > 2000) {
    alerts.push(`High average duration: ${stats.averageDuration.toFixed(0)}ms`);
  }
  
  if (stats.successRate < 95) {
    alerts.push(`Low success rate: ${stats.successRate.toFixed(1)}%`);
  }
  
  if (stats.errorRate > 5) {
    alerts.push(`High error rate: ${stats.errorRate.toFixed(1)}%`);
  }
  
  // Operações lentas
  const slowest = stats.slowestOperations.map(op => ({
    operation: op.operationName,
    duration: op.duration,
    traceId: op.traceId,
  }));
  
  // Operações rápidas
  const fastest = stats.fastestOperations.map(op => ({
    operation: op.operationName,
    duration: op.duration,
    traceId: op.traceId,
  }));
  
  // Erros
  const totalErrors = Object.values(stats.errorsByType).reduce((sum, count) => sum + count, 0);
  const errors = Object.entries(stats.errorsByType)
    .map(([type, count]) => ({
      type,
      count,
      percentage: totalErrors > 0 ? (count / totalErrors) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  return {
    summary: {
      totalOperations: stats.totalOperations,
      averageDuration: stats.averageDuration,
      successRate: stats.successRate,
      errorRate: stats.errorRate,
    },
    slowest,
    fastest,
    byType: stats.operationsByType,
    errors,
    alerts,
  };
}

/**
 * Health check baseado em performance
 */
export function getPerformanceHealth(): {
  healthy: boolean;
  issues: string[];
  score: number; // 0-100
} {
  const stats = performanceRegistry.getStats(300000); // Últimos 5 minutos
  let score = 100;
  const issues: string[] = [];
  
  // Penalizar por duração média
  if (stats.averageDuration > 1000) {
    score -= Math.min(30, stats.averageDuration / 100);
    issues.push(`High average duration: ${stats.averageDuration.toFixed(0)}ms`);
  }
  
  // Penalizar por taxa de erro
  if (stats.errorRate > 1) {
    score -= Math.min(40, stats.errorRate * 8);
    issues.push(`High error rate: ${stats.errorRate.toFixed(1)}%`);
  }
  
  // Penalizar por operações muito lentas
  const verySlowOps = stats.slowestOperations.filter(op => op.duration > 5000);
  if (verySlowOps.length > 0) {
    score -= Math.min(20, verySlowOps.length * 4);
    issues.push(`${verySlowOps.length} operations over 5s`);
  }
  
  return {
    healthy: score > 70,
    issues,
    score: Math.max(0, score),
  };
}
