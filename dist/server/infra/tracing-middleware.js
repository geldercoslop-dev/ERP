import { tracer } from '../infra/tracing.js';
import { trace as otelTrace, SpanKind, SpanStatusCode, context, trace } from '@opentelemetry/api';
import { createLogger } from '../infra/structured-logger.js';
const logger = createLogger('tracing-middleware');
/**
 * Middleware de tracing para tRPC - versão híbrida
 * Mantém tracing existente + adiciona OpenTelemetry
 */
export function createTracingMiddleware(operationName) {
    return async ({ next, path, type, rawInput, ctx }) => {
        // Gerar trace ID se não existir no contexto
        const traceId = ctx?.traceId || tracer.generateTraceId();
        // Iniciar span do tracer existente
        const existingSpan = tracer.startSpan(`trpc.${operationName}`, undefined, {
            'trpc.operation': operationName,
            'trpc.path': path,
            'trpc.type': type,
            'trpc.input_size': JSON.stringify(rawInput || {}).length,
        });
        // Iniciar span OpenTelemetry
        const otelTracer = otelTrace.getTracer('erp-server');
        const otelSpan = otelTracer.startSpan(`trpc.${operationName}`, {
            kind: SpanKind.SERVER,
            attributes: {
                'trpc.operation': operationName,
                'trpc.path': path,
                'trpc.type': type,
                'trace.id': traceId,
            },
        });
        // Propagar contexto OpenTelemetry
        const otelContext = trace.setSpan(context.active(), otelSpan);
        // Log início
        logger.info('tRPC operation started', {
            metadata: {
                traceId,
                operation: operationName,
                path,
                type,
                inputSize: JSON.stringify(rawInput || {}).length,
            },
        });
        const startTime = Date.now();
        try {
            // Executar com contexto OpenTelemetry
            const result = await context.with(otelContext, async () => {
                return await next({
                    ctx: {
                        ...ctx,
                        traceId,
                        existingSpan,
                        otelSpan,
                    },
                });
            });
            const duration = Date.now() - startTime;
            // Adicionar tags de sucesso
            tracer.setTags(existingSpan.spanId, {
                'trpc.success': true,
                'trpc.duration': duration,
                'trpc.output_size': JSON.stringify(result || {}).length,
            });
            otelSpan.setAttributes({
                'trpc.success': true,
                'trpc.duration': duration,
                'trpc.output_size': JSON.stringify(result || {}).length,
            });
            // Log sucesso
            logger.info('tRPC operation completed', {
                metadata: {
                    traceId,
                    operation: operationName,
                    duration,
                    success: true,
                },
            });
            // Finalizar spans
            tracer.finishSpan(existingSpan.spanId);
            otelSpan.setStatus({ code: SpanStatusCode.OK });
            otelSpan.end();
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            // Adicionar tags de erro
            tracer.setTags(existingSpan.spanId, {
                'trpc.success': false,
                'trpc.duration': duration,
                'trpc.error': errorMessage,
            });
            otelSpan.setAttributes({
                'trpc.success': false,
                'trpc.duration': duration,
                'trpc.error': errorMessage,
            });
            // Log erro
            logger.error('tRPC operation failed', error, {
                metadata: {
                    traceId,
                    operation: operationName,
                    duration,
                    error: errorMessage,
                },
            });
            // Finalizar spans com erro
            tracer.finishSpan(existingSpan.spanId, error);
            otelSpan.setStatus({
                code: SpanStatusCode.ERROR,
                message: errorMessage,
            });
            otelSpan.end();
            throw error;
        }
    };
}
/**
 * Middleware específico para pedidos
 */
export const pedidosTracingMiddleware = createTracingMiddleware('pedidos');
/**
 * Middleware específico para financeiro
 */
export const financeiroTracingMiddleware = createTracingMiddleware('financeiro');
/**
 * Middleware específico para LEO
 */
export const leoTracingMiddleware = createTracingMiddleware('leo');
/**
 * Middleware genérico para outras rotas
 */
export const genericTracingMiddleware = createTracingMiddleware('generic');
