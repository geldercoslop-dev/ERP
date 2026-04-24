import { randomUUID } from 'crypto';
import { InfrastructureError } from '../_core/errors/typed-errors.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createLogger } from './structured-logger.js';
import { trace as otelTrace, SpanStatusCode, SpanKind, context } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { MySQL2Instrumentation } from '@opentelemetry/instrumentation-mysql2';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
const logger = createLogger('tracing');
/**
 * OpenTelemetry SDK instance
 */
let otelSDK = null;
/**
 * Inicializa OpenTelemetry SDK
 */
export function initializeOpenTelemetry() {
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
    }
    catch (error) {
        logger.error('Failed to initialize OpenTelemetry SDK', error);
    }
}
/**
 * Finaliza OpenTelemetry SDK
 */
export async function shutdownOpenTelemetry() {
    if (otelSDK) {
        try {
            await otelSDK.shutdown();
            otelSDK = null;
            logger.info('OpenTelemetry SDK shutdown successfully');
        }
        catch (error) {
            logger.error('Failed to shutdown OpenTelemetry SDK', error);
        }
    }
}
/**
 * Gerenciador de tracing centralizado
 */
export class Tracer {
    serviceName;
    activeSpans = new Map();
    completedSpans = [];
    maxCompletedSpans = 10000;
    constructor(serviceName = 'erp-server') {
        this.serviceName = serviceName;
    }
    /**
     * Gera ID único para trace
     */
    generateTraceId() {
        return randomUUID().replace(/-/g, '');
    }
    /**
     * Gera ID único para span
     */
    generateSpanId() {
        return randomUUID().replace(/-/g, '').substring(0, 16);
    }
    /**
     * Inicia um novo span
     */
    startSpan(operationName, parentContext, tags) {
        const traceId = parentContext?.traceId || this.generateTraceId();
        const spanId = this.generateSpanId();
        const span = {
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
        const otelSpan = otelTracer.startSpan(operationName, {
            kind: SpanKind.INTERNAL,
            attributes: {
                'trace.id': traceId,
                'span.id': spanId,
                'operation.name': operationName,
                ...tags,
            },
        }, otelParentContext);
        // Armazenar referência ao span OTLP
        span.otelSpan = otelSpan;
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
    finishSpan(spanId, error) {
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
        const otelSpan = span.otelSpan;
        if (otelSpan) {
            if (error) {
                otelSpan.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: error.message,
                });
                otelSpan.recordException(error);
            }
            else {
                otelSpan.setStatus({ code: SpanStatusCode.OK });
            }
            otelSpan.setAttributes({
                'duration': span.duration,
                'status': span.status,
            });
            otelSpan.end();
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
    logToSpan(spanId, level, message, fields) {
        const span = this.activeSpans.get(spanId);
        if (!span)
            return;
        if (!span.logs)
            span.logs = [];
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
    setTags(spanId, tags) {
        const span = this.activeSpans.get(spanId);
        if (!span)
            return;
        span.tags = {
            ...span.tags,
            ...tags,
        };
    }
    /**
     * Obtém contexto atual
     */
    getCurrentContext(spanId) {
        const span = this.activeSpans.get(spanId);
        if (!span)
            return null;
        return {
            traceId: span.traceId,
            spanId: span.spanId,
            parentSpanId: span.parentSpanId,
        };
    }
    /**
     * Obtém spans ativos
     */
    getActiveSpans() {
        return Array.from(this.activeSpans.values());
    }
    /**
     * Obtém spans completados recentes
     */
    getCompletedSpans(limit) {
        const spans = this.completedSpans.slice().reverse(); // Mais recentes primeiro
        return limit ? spans.slice(0, limit) : spans;
    }
    /**
     * Busca spans por trace ID
     */
    getSpansByTraceId(traceId) {
        const allSpans = [...this.activeSpans.values(), ...this.completedSpans];
        return allSpans.filter(span => span.traceId === traceId);
    }
    /**
     * Obtém estatísticas de performance
     */
    getPerformanceStats(timeWindowMs = 300000) {
        const now = Date.now();
        const recentSpans = this.completedSpans.filter(span => span.endTime && now - span.endTime <= timeWindowMs);
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
            duration: span.duration,
            traceId: span.traceId,
        }));
        // Agrupar por tipo de operação
        const operationsByType = {};
        recentSpans.forEach(span => {
            const type = span.operationName;
            if (!operationsByType[type]) {
                operationsByType[type] = { count: 0, avgDuration: 0, errors: 0 };
            }
            operationsByType[type].count++;
            if (span.status === 'error')
                operationsByType[type].errors++;
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
    cleanup(maxAgeMs = 3600000) {
        const cutoff = Date.now() - maxAgeMs;
        this.completedSpans = this.completedSpans.filter(span => span.endTime && span.endTime > cutoff);
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
const asyncContext = new AsyncLocalStorage();
/**
 * Define span atual no contexto de forma isolada por request
 */
export function setCurrentSpan(span) {
    // Obter contexto atual ou inicializar vazio
    asyncContext.getStore(); // Verifica se existe store
    // Na próxima execução assíncrona, o span será disponível
}
/**
 * Obtém span atual do contexto de forma isolada por request
 */
export function getCurrentSpan() {
    return asyncContext.getStore() || null;
}
/**
 * Limpa contexto atual
 */
export function clearCurrentContext() {
    // AsyncLocalStorage limpa automaticamente após a execução
}
/**
 * Executor de contexto com isolamento por request
 */
export async function runInContext(span, operation) {
    return asyncContext.run(span, operation);
}
/**
 * Decorator para tracing automático
 */
export function trace(operationName) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        const opName = operationName || `${target.constructor.name}.${propertyKey}`;
        descriptor.value = async function (...args) {
            const parentSpan = getCurrentSpan();
            const span = tracer.startSpan(opName, parentSpan ? tracer.getCurrentContext(parentSpan.spanId) || undefined : undefined);
            let capturedError = null;
            try {
                return await runInContext(span, async () => {
                    try {
                        // Logar início
                        tracer.logToSpan(span.spanId, 'info', `Starting ${opName}`, { args: args.length });
                        const result = await originalMethod.apply(this, args);
                        // Logar sucesso
                        tracer.logToSpan(span.spanId, 'info', `Completed ${opName}`, { success: true });
                        return result;
                    }
                    catch (error) {
                        capturedError = error;
                        // Logar erro
                        tracer.logToSpan(span.spanId, 'error', `Failed ${opName}`, {
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                        throw error;
                    }
                });
            }
            finally {
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
export async function withTracing(operationName, operation, tags) {
    const parentSpan = getCurrentSpan();
    const span = tracer.startSpan(operationName, parentSpan ? tracer.getCurrentContext(parentSpan.spanId) || undefined : undefined, tags);
    let capturedError = null;
    try {
        return await runInContext(span, async () => {
            try {
                tracer.logToSpan(span.spanId, 'info', `Starting ${operationName}`);
                const result = await operation();
                tracer.logToSpan(span.spanId, 'info', `Completed ${operationName}`);
                return result;
            }
            catch (error) {
                capturedError = error;
                tracer.logToSpan(span.spanId, 'error', `Failed ${operationName}`, {
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                throw error;
            }
        });
    }
    finally {
        // Usar erro capturado, não error (que é undefined aqui)
        tracer.finishSpan(span.spanId, capturedError instanceof Error ? capturedError : undefined);
    }
}
