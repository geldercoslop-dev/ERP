/**
 * Sistema de Métricas e Monitoramento
 * 
 * Coleta e armazena métricas do sistema para monitoramento
 */

export interface RequestMetrics {
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  timestamp: Date;
  userAgent?: string;
  ip?: string;
  userId?: number;
  tenantId?: number;
}

export interface DatabaseMetrics {
  query: string;
  duration: number;
  timestamp: Date;
  success: boolean;
  error?: string;
  tenantId?: number;
}

export interface SystemMetrics {
  timestamp: Date;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    usage: number;
  };
  activeConnections: number;
  requestsPerMinute: number;
  errorsPerMinute: number;
}

export interface CounterMetrics {
  request_count: number;
  error_count: number;
  request_duration_total_ms: number;
  redis_request_count: number;
  redis_error_count: number;
  redis_duration_total_ms: number;
}

class MetricsCollector {
  private requestMetrics: RequestMetrics[] = [];
  private databaseMetrics: DatabaseMetrics[] = [];
  private systemMetrics: SystemMetrics[] = [];
  private counters: CounterMetrics = {
    request_count: 0,
    error_count: 0,
    request_duration_total_ms: 0,
    redis_request_count: 0,
    redis_error_count: 0,
    redis_duration_total_ms: 0,
  };
  private maxMetricsSize = 10000; // Mantém últimas 10k métricas

  /**
   * Registra métricas de request
   */
  recordRequest(metrics: RequestMetrics): void {
    this.requestMetrics.push(metrics);
    this.counters.request_count += 1;
    this.counters.request_duration_total_ms += metrics.duration;
    if (metrics.statusCode >= 400) this.counters.error_count += 1;
    this.trimMetrics();
  }

  /**
   * Registra métricas de database
   */
  recordDatabase(metrics: DatabaseMetrics): void {
    this.databaseMetrics.push(metrics);
    this.trimMetrics();
  }

  recordRedis(durationMs: number, success: boolean): void {
    this.counters.redis_request_count += 1;
    this.counters.redis_duration_total_ms += durationMs;
    if (!success) this.counters.redis_error_count += 1;
  }

  /**
   * Registra métricas do sistema
   */
  recordSystem(metrics: SystemMetrics): void {
    this.systemMetrics.push(metrics);
    this.trimMetrics();
  }

  /**
   * Obtém métricas de requests do último período
   */
  getRequestMetrics(minutes: number = 5): RequestMetrics[] {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.requestMetrics.filter(m => m.timestamp >= cutoff);
  }

  /**
   * Obtém métricas de database lentas (>300ms)
   */
  getSlowQueries(limit: number = 50): DatabaseMetrics[] {
    return this.databaseMetrics
      .filter(m => m.duration > 300)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Obtém estatísticas de requests
   */
  getRequestStats(minutes: number = 5): {
    total: number;
    averageDuration: number;
    errorsPerMinute: number;
    slowestRequests: RequestMetrics[];
    statusCodes: Record<number, number>;
  } {
    const metrics = this.getRequestMetrics(minutes);
    const errors = metrics.filter(m => m.statusCode >= 400);
    
    return {
      total: metrics.length,
      averageDuration: metrics.length > 0 
        ? metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length 
        : 0,
      errorsPerMinute: errors.length,
      slowestRequests: metrics
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 10),
      statusCodes: metrics.reduce((acc, m) => {
        acc[m.statusCode] = (acc[m.statusCode] || 0) + 1;
        return acc;
      }, {} as Record<number, number>),
    };
  }

  /**
   * Obtém métricas atuais do sistema
   */
  getCurrentSystemMetrics(): SystemMetrics {
    const memUsage = process.memoryUsage();
    const totalMem = memUsage.heapTotal;
    const usedMem = memUsage.heapUsed;
    
    return {
      timestamp: new Date(),
      memory: {
        used: usedMem,
        total: totalMem,
        percentage: (usedMem / totalMem) * 100,
      },
      cpu: {
        usage: 0, // TODO: Implementar medição de CPU
      },
      activeConnections: 0, // TODO: Implementar contagem de conexões
      requestsPerMinute: this.getRequestMetrics(1).length,
      errorsPerMinute: this.getRequestStats(1).errorsPerMinute,
    };
  }

  /**
   * Mantém o tamanho do array de métricas sob controle
   */
  private trimMetrics(): void {
    if (this.requestMetrics.length > this.maxMetricsSize) {
      this.requestMetrics = this.requestMetrics.slice(-this.maxMetricsSize);
    }
    if (this.databaseMetrics.length > this.maxMetricsSize) {
      this.databaseMetrics = this.databaseMetrics.slice(-this.maxMetricsSize);
    }
    if (this.systemMetrics.length > this.maxMetricsSize) {
      this.systemMetrics = this.systemMetrics.slice(-this.maxMetricsSize);
    }
  }

  /**
   * Limpa métricas antigas
   */
  clearOldMetrics(olderThanMinutes: number = 60): void {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    
    this.requestMetrics = this.requestMetrics.filter(m => m.timestamp >= cutoff);
    this.databaseMetrics = this.databaseMetrics.filter(m => m.timestamp >= cutoff);
    this.systemMetrics = this.systemMetrics.filter(m => m.timestamp >= cutoff);
  }

  getCounters(): CounterMetrics {
    return { ...this.counters };
  }
}

// Singleton instance
export const metrics = new MetricsCollector();

// Funções de conveniência
export const recordRequest = (requestMetrics: RequestMetrics) => metrics.recordRequest(requestMetrics);
export const recordDatabase = (dbMetrics: DatabaseMetrics) => metrics.recordDatabase(dbMetrics);
export const recordSystemMetrics = () => metrics.recordSystem(metrics.getCurrentSystemMetrics());
export const recordRedis = (durationMs: number, success: boolean) => metrics.recordRedis(durationMs, success);
