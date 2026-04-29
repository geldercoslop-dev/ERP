import { randomUUID } from 'crypto';
import { InfrastructureError } from '../_core/errors/typed-errors.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createLogger } from './structured-logger.js';
import { trace as otelTrace, Span, SpanStatusCode, SpanKind, context, Context } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { MySQL2Instrumentation } from '@opentelemetry/instrumentation-mysql2';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const logger = createLogger('tracing');

/**
 * OpenTelemetry SDK instance
 */
let otelSDK: NodeSDK | null = null;

/**
 * Inicializa OpenTelemetry SDK
 */
export function initializeOpenTelemetry(): void {
  if (otelSDK) {
    logger.warn('OpenTelemetry SDK already initialized');
    return;
  }

  try {
    // Configurar exporter OTLP
    const exporter = new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
      headers: process.env.OTEL_EXPORTER_OTLP_HEADERS ? 
        Object.fromEntries(process.env.OTEL_EXPORTER_OTLP_HEADERS.split(',').map(h => h.split('='))) : 
        undefined,
    });

    otelSDK = new NodeSDK({
      serviceName: 'erp-server',
      traceExporter: exporter,
      instrumentations: [
        new HttpInstrumentation(),
        new MySQL2Instrumentation(),
        new IORedisInstrumentation(),
      ],
    });

    otelSDK.start();
    
    logger.info('OpenTelemetry SDK initialized with OTLP exporter', {
      metadata: {
        exporterUrl: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
        serviceName: 'erp-server',
      },
    });
  } catch (error) {
    logger.error('Failed to initialize OpenTelemetry SDK', error as Error);
  }
}

/**
 * Finaliza OpenTelemetry SDK
 */
export async function shutdownOpenTelemetry(): Promise<void> {
  if (otelSDK) {
    try {
      await otelSDK.shutdown();
      otelSDK = null;
      logger.info('OpenTelemetry SDK shutdown successfully');
    } catch (error) {
      logger.error('Failed to shutdown OpenTelemetry SDK', error as Error);
    }
  }
}

/**
 * Interface para Span de tracing
 */
export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tags?: Record<string, unknown>;
  logs?: Array<{
    timestamp: number;
    level: string;
    message: string;
    fields?: Record<string, unknown>;
  }>;
  status?: 'ok' | 'error';
  error?: Error;
}

/**
 * Interface para contexto de tracing
 */
export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  baggage?: Record<string, string>;
}

/**
 * Gerenciador de tracing centralizado
 */
export class Tracer {
  private activeSpans: Map<string, TraceSpan> = new Map();
  private completedSpans: TraceSpan[] = [];
  private maxCompletedSpans: number = 10000;
  
  constructor(private serviceName: string = 'erp-server') {}
  
  /**
   * Gera ID único para trace
   */
  generateTraceId(): string {
    return randomUUID().replace(/-/g, '');
  }
  
  /**
   * Gera ID único para span
   */
  generateSpanId(): string {
    return randomUUID().replace(/-/g, '').substring(0, 16);
  }
  
  /**
   * Inicia um novo span
   */
  startSpan(
    operationName: string,
    parentContext?: TraceContext,
    tags?: Record<string, unknown>
  ): TraceSpan {
    const traceId = parentContext?.traceId || this.generateTraceId();
    const spanId = this.generateSpanId();
    
    const span: TraceSpan = {
      traceId,
      spanId,
      parentSpanId: parentContext?.spanId,
      operationName,
      startTime: Date.now(),
      tags: {
        service: this.serviceName,
        ...tags,
      },
      logs: [],
      status: 'ok',
    };
    
    this.activeSpans.set(spanId, span);
    
    // Criar span OpenTelemetry correspondente
    const otelTracer = otelTrace.getTracer(this.serviceName);
    const otelParentContext = parentContext ? 
      otelTrace.setSpan(context.active(), otelTrace.wrapSpanContext({
        traceId: parentContext.traceId,
        spanId: parentContext.spanId,
        traceFlags: 1,
      })) : undefined;
    
    const otelSpan = otelTracer.startSpan(
      operationName,
      {
        kind: SpanKind.INTERNAL,
        attributes: {
          'trace.id': traceId,
          'span.id': spanId,
          'operation.name': operationName,
          ...tags,
        },
      },
      otelParentContext
    );
    
    // Armazenar referência ao span OTLP
    (span as { otelSpan?: unknown }).otelSpan = otelSpan;
    
    logger.debug('Span started', {
      metadata: {
        traceId,
        spanId,
        operationName,
        parentSpanId: parentContext?.spanId,
      },
    });
    
    return span;
  }
  
  /**
   * Finaliza um span
   */
  finishSpan(spanId: string, error?: Error): TraceSpan {
    const span = this.activeSpans.get(spanId);
    if (!span) {
      logger.warn('Attempted to finish non-existent span', {
        metadata: { spanId },
      });
      throw new InfrastructureError(`Span ${spanId} not found`);
    }
    
    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    
    if (error) {
      span.status = 'error';
      span.error = error;
      span.tags = {
        ...span.tags,
        'error': true,
        'error.message': error.message,
        'error.stack': error.stack,
      };
    }
    
    // Finalizar span OpenTelemetry correspondente
    const otelSpan = (span as { otelSpan?: { setStatus?: (status: unknown) => void; recordException?: (error: Error) => void; setAttributes?: (attrs: unknown) => void; end?: () => void } }).otelSpan;
    if (otelSpan) {
      if (error) {
        otelSpan.setStatus?.({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        otelSpan.recordException?.(error);
      } else {
        otelSpan.setStatus?.({ code: SpanStatusCode.OK });
      }
      
      otelSpan.setAttributes?.({
        'duration': span.duration,
        'status': span.status,
      });
      
      otelSpan.end?.();
    }
    
    // Mover para completed spans
    this.activeSpans.delete(spanId);
    this.completedSpans.push(span);
    
    // Manter limite de completed spans
    if (this.completedSpans.length > this.maxCompletedSpans) {
      this.completedSpans = this.completedSpans.slice(-this.maxCompletedSpans);
    }
    
    logger.debug('Span finished', {
      metadata: {
        traceId: span.traceId,
        spanId: span.spanId,
        operationName: span.operationName,
        duration: span.duration,
        status: span.status,
      },
    });
    
    return span;
  }
  
  /**
   * Adiciona log ao span
   */
  logToSpan(spanId: string, level: string, message: string, fields?: Record<string, unknown>): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;
    
    if (!span.logs) span.logs = [];
    
    span.logs.push({
      timestamp: Date.now(),
      level,
      message,
      fields,
    });
  }
  
  /**
   * Adiciona tags ao span
   */
  setTags(spanId: string, tags: Record<string, unknown>): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;
    
    span.tags = {
      ...span.tags,
      ...tags,
    };
  }
  
  /**
   * Obtém contexto atual
   */
  getCurrentContext(spanId: string): TraceContext | null {
    const span = this.activeSpans.get(spanId);
    if (!span) return null;
    
    return {
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
    };
  }
  
  /**
   * Obtém spans ativos
   */
  getActiveSpans(): TraceSpan[] {
    return Array.from(this.activeSpans.values());
  }
  
  /**
   * Obtém spans completados recentes
   */
  getCompletedSpans(limit?: number): TraceSpan[] {
    const spans = this.completedSpans.slice().reverse(); // Mais recentes primeiro
    return limit ? spans.slice(0, limit) : spans;
  }
  
  /**
   * Busca spans por trace ID
   */
  getSpansByTraceId(traceId: string): TraceSpan[] {
    const allSpans = [...this.activeSpans.values(), ...this.completedSpans];
    return allSpans.filter(span => span.traceId === traceId);
  }
  
  /**
   * Obtém estatísticas de performance
   */
  getPerformanceStats(timeWindowMs: number = 300000): {
    totalOperations: number;
    averageDuration: number;
    slowestOperations: Array<{ operationName: string; duration: number; traceId: string }>;
    errorRate: number;
    operationsByType: Record<string, { count: number; avgDuration: number; errors: number }>;
  } {
    const now = Date.now();
    const recentSpans = this.completedSpans.filter(
      span => span.endTime && now - span.endTime <= timeWindowMs
    );
    
    const totalOperations = recentSpans.length;
    const errors = recentSpans.filter(span => span.status === 'error');
    const errorRate = totalOperations > 0 ? (errors.length / totalOperations) * 100 : 0;
    
    // Duração média
    const totalDuration = recentSpans.reduce((sum, span) => sum + (span.duration || 0), 0);
    const averageDuration = totalOperations > 0 ? totalDuration / totalOperations : 0;
    
    // Operações mais lentas
    const slowestOperations = recentSpans
      .filter(span => span.duration)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 10)
      .map(span => ({
        operationName: span.operationName,
        duration: span.duration!,
        traceId: span.traceId,
      }));
    
    // Agrupar por tipo de operação
    const operationsByType: Record<string, { count: number; avgDuration: number; errors: number }> = {};
    
    recentSpans.forEach(span => {
      const type = span.operationName;
      if (!operationsByType[type]) {
        operationsByType[type] = { count: 0, avgDuration: 0, errors: 0 };
      }
      
      operationsByType[type].count++;
      if (span.status === 'error') operationsByType[type].errors++;
      
      // Atualizar duração média
      const current = operationsByType[type];
      current.avgDuration = ((current.avgDuration * (current.count - 1)) + (span.duration || 0)) / current.count;
    });
    
    return {
      totalOperations,
      averageDuration,
      slowestOperations,
      errorRate,
      operationsByType,
    };
  }
  
  /**
   * Limpa spans antigos
   */
  cleanup(maxAgeMs: number = 3600000): void {
    const cutoff = Date.now() - maxAgeMs;
    
    this.completedSpans = this.completedSpans.filter(
      span => span.endTime && span.endTime > cutoff
    );
  }
}

/**
 * Instância global do tracer
 */
export const tracer = new Tracer('erp-server');

/**
 * AsyncLocalStorage para contexto isolado por request
 * Garante que cada request tenha seu próprio contexto de tracing
 */
const asyncContext = new AsyncLocalStorage<TraceSpan>();

/**
 * Define span atual no contexto de forma isolada por request
 */
export function setCurrentSpan(span: TraceSpan): void {
  // Obter contexto atual ou inicializar vazio
  asyncContext.getStore(); // Verifica se existe store
  // Na próxima execução assíncrona, o span será disponível
}

/**
 * Obtém span atual do contexto de forma isolada por request
 */
export function getCurrentSpan(): TraceSpan | null {
  return asyncContext.getStore() || null;
}

/**
 * Limpa contexto atual
 */
export function clearCurrentContext(): void {
  // AsyncLocalStorage limpa automaticamente após a execução
}

/**
 * Executor de contexto com isolamento por request
 */
export async function runInContext<T>(span: TraceSpan, operation: () => Promise<T>): Promise<T> {
  return asyncContext.run(span, operation);
}

/**
 * Decorator para tracing automático
 */
export function trace(operationName?: string) {
  return function (target: object, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const opName = operationName || `${target.constructor.name}.${propertyKey}`;
    
    descriptor.value = async function (...args: unknown[]) {
      const parentSpan = getCurrentSpan();
      const span = tracer.startSpan(opName, parentSpan ? tracer.getCurrentContext(parentSpan.spanId) || undefined : undefined);
      
      let capturedError: unknown = null;
      
      try {
        return await runInContext(span, async () => {
          try {
            // Logar início
            tracer.logToSpan(span.spanId, 'info', `Starting ${opName}`, { args: args.length });
            
            const result = await originalMethod.apply(this, args);
            
            // Logar sucesso
            tracer.logToSpan(span.spanId, 'info', `Completed ${opName}`, { success: true });
            
            return result;
            
          } catch (error) {
            capturedError = error;
            
            // Logar erro
            tracer.logToSpan(span.spanId, 'error', `Failed ${opName}`, { 
              error: error instanceof Error ? error.message : 'Unknown error'
            });
            
            throw error;
          }
        });
        
      } finally {
        // Usar erro capturado, não error (que é undefined aqui)
        tracer.finishSpan(span.spanId, capturedError instanceof Error ? capturedError : undefined);
      }
    };
    
    return descriptor;
  };
}

/**
 * Função para executar operação com tracing manual
 */
export async function withTracing<T>(
  operationName: string,
  operation: () => Promise<T>,
  tags?: Record<string, unknown>
): Promise<T> {
  const parentSpan = getCurrentSpan();
  const span = tracer.startSpan(operationName, parentSpan ? tracer.getCurrentContext(parentSpan.spanId) || undefined : undefined, tags);
  
  let capturedError: unknown = null;
  
  try {
    return await runInContext(span, async () => {
      try {
        tracer.logToSpan(span.spanId, 'info', `Starting ${operationName}`);
        
        const result = await operation();
        
        tracer.logToSpan(span.spanId, 'info', `Completed ${operationName}`);
        
        return result;
        
      } catch (error) {
        capturedError = error;
        
        tracer.logToSpan(span.spanId, 'error', `Failed ${operationName}`, { 
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        throw error;
      }
    });
    
  } finally {
    // Usar erro capturado, não error (que é undefined aqui)
    tracer.finishSpan(span.spanId, capturedError instanceof Error ? capturedError : undefined);
  }
}
