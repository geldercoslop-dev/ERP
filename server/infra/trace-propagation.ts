import { randomUUID } from 'crypto';
import { tracer } from './tracing.js';
import { createLogger } from './structured-logger.js';
import type { Request, Response, NextFunction } from 'express';

const logger = createLogger('trace-propagation');

/** Request com campos de tracing (sem redeclarar ip/headers do Express). */
export type RequestWithTrace = Request & {
  traceId?: string;
  traceSpan?: unknown;
};

export type ResponseWithTrace = Response;

/**
 * Headers padrão para tracing
 */
export const TRACE_HEADERS = {
  TRACE_ID: 'X-Trace-Id',
  SPAN_ID: 'X-Span-Id',
  PARENT_SPAN_ID: 'X-Parent-Span-Id',
  BAGGAGE_PREFIX: 'X-Baggage-',
} as const;

/**
 * Contexto de tracing propagável
 */
export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  baggage?: Record<string, string>;
}

/**
 * Gerador de trace IDs
 */
export class TraceIdGenerator {
  /**
   * Gera trace ID único
   */
  static generateTraceId(): string {
    return randomUUID().replace(/-/g, '');
  }
  
  /**
   * Gera span ID único
   */
  static generateSpanId(): string {
    return randomUUID().replace(/-/g, '').substring(0, 16);
  }
  
  /**
   * Gera trace ID com prefixo para identificação
   */
  static generateTraceIdWithPrefix(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = randomUUID().replace(/-/g, '').substring(0, 8);
    return `${prefix}_${timestamp}_${random}`;
  }
}

/**
 * Extrai contexto de tracing de headers HTTP
 */
export function extractTraceContext(headers: Record<string, string>): TraceContext | null {
  const traceId = headers[TRACE_HEADERS.TRACE_ID];
  const spanId = headers[TRACE_HEADERS.SPAN_ID];
  const parentSpanId = headers[TRACE_HEADERS.PARENT_SPAN_ID];
  
  if (!traceId || !spanId) {
    return null;
  }
  
  // Extrair baggage
  const baggage: Record<string, string> = {};
  Object.keys(headers).forEach(key => {
    if (key.startsWith(TRACE_HEADERS.BAGGAGE_PREFIX)) {
      const baggageKey = key.substring(TRACE_HEADERS.BAGGAGE_PREFIX.length);
      baggage[baggageKey] = headers[key];
    }
  });
  
  return {
    traceId,
    spanId,
    parentSpanId,
    baggage: Object.keys(baggage).length > 0 ? baggage : undefined,
  };
}

/**
 * Injeta contexto de tracing em headers HTTP
 */
export function injectTraceContext(headers: Record<string, string>, context: TraceContext): void {
  headers[TRACE_HEADERS.TRACE_ID] = context.traceId;
  headers[TRACE_HEADERS.SPAN_ID] = context.spanId;
  
  if (context.parentSpanId) {
    headers[TRACE_HEADERS.PARENT_SPAN_ID] = context.parentSpanId;
  }
  
  // Injetar baggage
  if (context.baggage) {
    Object.entries(context.baggage).forEach(([key, value]) => {
      headers[`${TRACE_HEADERS.BAGGAGE_PREFIX}${key}`] = value;
    });
  }
}

/**
 * Propagador de tracing para chamadas HTTP
 */
export class TracePropagator {
  /**
   * Prepara headers para requisição HTTP
   */
  static prepareHeaders(currentContext?: TraceContext): Record<string, string> {
    const headers: Record<string, string> = {};
    
    if (currentContext) {
      injectTraceContext(headers, currentContext);
    } else {
      // Criar novo contexto se não existir
      const newContext: TraceContext = {
        traceId: TraceIdGenerator.generateTraceId(),
        spanId: TraceIdGenerator.generateSpanId(),
      };
      
      injectTraceContext(headers, newContext);
    }
    
    return headers;
  }
  
  /**
   * Extrai contexto de resposta HTTP
   */
  static extractFromResponse(headers: Record<string, string>): TraceContext | null {
    return extractTraceContext(headers);
  }
  
  /**
   * Propaga contexto para chamada de API externa
   */
  static async propagateToExternalCall<T>(
    apiCall: (headers: Record<string, string>) => Promise<T>,
    operationName: string
  ): Promise<T> {
    // Note: getCurrentSpan() not available here, using undefined context
    const currentContext: TraceContext | undefined = undefined;
    
    const headers = this.prepareHeaders(currentContext);
    
    logger.debug('Propagating trace context to external call', {
      metadata: {
        operationName,
        traceId: headers[TRACE_HEADERS.TRACE_ID],
        spanId: headers[TRACE_HEADERS.SPAN_ID],
      },
    });
    
    try {
      const result = await apiCall(headers);
      
      logger.debug('External call completed', {
        metadata: {
          operationName,
          traceId: headers[TRACE_HEADERS.TRACE_ID],
          success: true,
        },
      });
      
      return result;
      
    } catch (error) {
      logger.error('External call failed', error as Error, {
        metadata: {
          operationName,
          traceId: headers[TRACE_HEADERS.TRACE_ID],
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      
      throw error;
    }
  }
}

/**
 * Propagador para LEO AI
 */
export class LeoTracePropagator {
  /**
   * Prepara contexto para chamada LEO
   */
  static prepareContext(currentContext?: TraceContext): Record<string, string> {
    const context: Record<string, string> = {};
    
    if (currentContext) {
      context.traceId = currentContext.traceId;
      context.spanId = currentContext.spanId;
      context.parentSpanId = currentContext.parentSpanId || '';
      
      // Adicionar baggage específico para LEO
      if (currentContext.baggage) {
        Object.assign(context, currentContext.baggage);
      }
    } else {
      // Criar novo contexto
      context.traceId = TraceIdGenerator.generateTraceId();
      context.spanId = TraceIdGenerator.generateSpanId();
      context.parentSpanId = '';
    }
    
    return context;
  }
  
  /**
   * Executa chamada LEO com tracing
   */
  static async executeWithTracing<T>(
    leoCall: (context: Record<string, string>) => Promise<T>,
    prompt: string,
    options?: any
  ): Promise<T> {
    // Note: getCurrentSpan() not available, using undefined context
    const currentContext: TraceContext | undefined = undefined;
    
    const leoContext = this.prepareContext(currentContext);
    
    logger.debug('Executing LEO AI with tracing', {
      metadata: {
        traceId: leoContext.traceId,
        promptLength: prompt.length,
        options: Object.keys(options || {}),
      },
    });
    
    try {
      const result = await leoCall(leoContext);
      
      logger.debug('LEO AI execution completed', {
        metadata: {
          traceId: leoContext.traceId,
          success: true,
        },
      });
      
      return result;
      
    } catch (error) {
      logger.error('LEO AI execution failed', error as Error, {
        metadata: {
          traceId: leoContext.traceId,
          promptLength: prompt.length,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      
      throw error;
    }
  }
}

/**
 * Propagador para Database
 */
export class DatabaseTracePropagator {
  /**
   * Prepara contexto para query database
   */
  static prepareContext(currentContext?: TraceContext): Record<string, string> {
    const context: Record<string, string> = {};
    
    if (currentContext) {
      context.traceId = currentContext.traceId;
      context.spanId = currentContext.spanId;
      context.parentSpanId = currentContext.parentSpanId || '';
      
      // Adicionar metadata específica de DB
      context.operation = 'database_query';
      context.timestamp = Date.now().toString();
    } else {
      // Criar novo contexto
      context.traceId = TraceIdGenerator.generateTraceId();
      context.spanId = TraceIdGenerator.generateSpanId();
      context.parentSpanId = '';
      context.operation = 'database_query';
      context.timestamp = Date.now().toString();
    }
    
    return context;
  }
  
  /**
   * Executa query com tracing
   */
  static async executeQueryWithTracing<T>(
    queryCall: (context: Record<string, string>) => Promise<T>,
    sql: string,
    params?: any[]
  ): Promise<T> {
    // Note: getCurrentSpan() not available, using undefined context
    const currentContext: TraceContext | undefined = undefined;
    
    const dbContext = this.prepareContext(currentContext);
    
    logger.debug('Executing database query with tracing', {
      metadata: {
        traceId: dbContext.traceId,
        sqlLength: sql.length,
        paramsCount: params?.length || 0,
      },
    });
    
    try {
      const result = await queryCall(dbContext);
      
      logger.debug('Database query completed', {
        metadata: {
          traceId: dbContext.traceId,
          success: true,
          rows: Array.isArray(result) ? result.length : 1,
        },
      });
      
      return result;
      
    } catch (error) {
      logger.error('Database query failed', error as Error, {
        metadata: {
          traceId: dbContext.traceId,
          sqlLength: sql.length,
          paramsCount: params?.length || 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      
      throw error;
    }
  }
}

/**
 * Propagador para Services
 */
export class ServiceTracePropagator {
  /**
   * Prepara contexto para chamada de service
   */
  static prepareContext(
    serviceName: string,
    method: string,
    currentContext?: TraceContext | undefined
  ): Record<string, string> {
    const context: Record<string, string> = {};
    
    if (currentContext) {
      context.traceId = currentContext.traceId;
      context.spanId = currentContext.spanId;
      context.parentSpanId = currentContext.parentSpanId || '';
      
      // Adicionar baggage específico do service
      if (currentContext.baggage) {
        Object.assign(context, currentContext.baggage);
      }
    } else {
      // Criar novo contexto
      context.traceId = TraceIdGenerator.generateTraceId();
      context.spanId = TraceIdGenerator.generateSpanId();
      context.parentSpanId = '';
    }
    
    // Metadata específica do service
    context.service = serviceName;
    context.method = method;
    context.operation = 'service_call';
    context.timestamp = Date.now().toString();
    
    return context;
  }
  
  /**
   * Executa service com tracing
   */
  static async executeWithTracing<T>(
    serviceCall: (context: Record<string, string>) => Promise<T>,
    serviceName: string,
    method: string,
    ...args: any[]
  ): Promise<T> {
    // Note: getCurrentSpan() not available, using undefined context
    const currentContext: TraceContext | undefined = undefined;
    
    const serviceContext = this.prepareContext(serviceName, method, currentContext);
    
    logger.debug('Executing service with tracing', {
      metadata: {
        traceId: serviceContext.traceId,
        service: serviceName,
        method,
        argsCount: args.length,
      },
    });
    
    try {
      const result = await serviceCall(serviceContext);
      
      logger.debug('Service execution completed', {
        metadata: {
          traceId: serviceContext.traceId,
          service: serviceName,
          method,
          success: true,
        },
      });
      
      return result;
      
    } catch (error) {
      logger.error('Service execution failed', error as Error, {
        metadata: {
          traceId: serviceContext.traceId,
          service: serviceName,
          method,
          argsCount: args.length,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      
      throw error;
    }
  }
}

/**
 * Middleware para propagar tracing entre microservices
 */
export function tracePropagationMiddleware() {
  return (req: RequestWithTrace, res: ResponseWithTrace, next: NextFunction) => {
    // Extrair contexto de headers de entrada
    const incomingContext = extractTraceContext(req.headers as Record<string, string>);
    
    if (incomingContext) {
      logger.debug('Trace context extracted from incoming request', {
        metadata: {
          incomingTraceId: incomingContext.traceId,
          incomingSpanId: incomingContext.spanId,
          path: req.path || 'unknown',
        },
      });
      
      // Usar contexto existente
      req.traceId = incomingContext.traceId;
      
      // Criar span com contexto pai
      const span = tracer.startSpan(
        `${req.method || 'GET'} ${req.path || '/'}`,
        incomingContext,
        {
          'http.method': req.method || 'GET',
          'http.url': req.url || '',
          'http.path': req.path || '/',
          'http.propagated': true,
        }
      );
      
      req.traceSpan = span;
    } else {
      // Criar novo contexto (middleware de request tracing vai cuidar disso)
      logger.debug('No incoming trace context, creating new', {
        metadata: {
          path: req.path || 'unknown',
          method: req.method || 'GET',
        },
      });
    }
    
    // Adicionar headers de saída
    if (res.on) {
      res.on('finish', () => {
        if (req.traceId && res.setHeader) {
          res.setHeader(TRACE_HEADERS.TRACE_ID, req.traceId);
        }
      });
    }
    
    next();
  };
}
