import { Request, Response, NextFunction } from 'express';
import { tracer, withTracing, TraceSpan } from './tracing.js';
import { createLogger } from './structured-logger.js';

const logger = createLogger('request-tracing');

/**
 * Middleware de tracing para requests HTTP
 * Utiliza AsyncLocalStorage para isolar contexto por request
 */
export function requestTracingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Gerar trace ID para request
    const traceId = tracer.generateTraceId();
    
    // Adicionar trace ID ao request
    req.traceId = traceId;
    
    // Adicionar headers de tracing
    res.setHeader('X-Trace-Id', traceId);
    
    // Iniciar span principal do request
    const span = tracer.startSpan(
      `${req.method} ${req.path}`,
      undefined,
      {
        'http.method': req.method,
        'http.url': req.url,
        'http.path': req.path,
        'http.user_agent': req.get('User-Agent'),
        'http.remote_addr': req.ip,
        'http.x_forwarded_for': req.get('X-Forwarded-For'),
        'http.referer': req.get('Referer'),
        'http.content_length': req.get('Content-Length'),
        'http.content_type': req.get('Content-Type'),
      }
    );
    
    // Adicionar span ao request
    req.traceSpan = span;
    
    // Log início do request
    logger.info('Request started', {
      metadata: {
        traceId,
        method: req.method,
        path: req.path,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      },
    });
    
    // Interceptar response
    const originalJson = res.json;
    const originalSend = res.send;
    const originalEnd = res.end;
    
    let responseBody: unknown;
    let responseSize = 0;
    let endCalled = false;
    
    // Interceptar JSON responses
    res.json = function(data: unknown, ...args: unknown[]) {
      responseBody = data;
      responseSize = JSON.stringify(data).length;
      return originalJson.apply(this, [data, ...args] as never);
    };
    
    // Interceptar send responses
    res.send = function(data: unknown, ...args: unknown[]) {
      if (typeof data === 'string') {
        responseSize = Buffer.byteLength(data, 'utf8');
      } else if (Buffer.isBuffer(data)) {
        responseSize = data.length;
      }
      return originalSend.apply(this, [data, ...args] as never);
    };
    
    // Interceptar end para finalizar span
    res.end = function(...args: unknown[]) {
      if (endCalled) return originalEnd.apply(this, args as never);
      endCalled = true;
      
      const duration = Date.now() - span.startTime;
      
      // Adicionar tags de response
      tracer.setTags(span.spanId, {
        'http.status_code': res.statusCode,
        'http.response_size': responseSize,
        'http.response_time': duration,
        'http.success': res.statusCode < 400,
      });
      
      // Log detalhado do request
      logger.info('Request completed', {
        metadata: {
          traceId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          responseSize,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });
      
      // Finalizar span
      if (res.statusCode >= 400) {
        const responseBodyRecord = responseBody as Record<string, unknown> | null;
        const error = new Error(`HTTP ${res.statusCode}: ${responseBodyRecord?.error || responseBodyRecord?.message || 'Request failed'}`);
        tracer.finishSpan(span.spanId, error);
      } else {
        tracer.finishSpan(span.spanId);
      }
      
      return originalEnd.apply(this, args as never);
    };
    
    // Interceptar erros
    res.on('error', (error) => {
      tracer.setTags(span.spanId, {
        'http.status_code': 500,
        'http.error': true,
        'error.message': error.message,
      });
      
      logger.error('Request error', error, {
        metadata: {
          traceId,
          method: req.method,
          path: req.path,
          error: error.message,
        },
      });
      
      tracer.finishSpan(span.spanId, error);
    });
    
    next();
  };
}

/**
 * Middleware para tracing de database
 */
export function databaseTracingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const parentSpan = req.traceSpan;
    if (!parentSpan) {
      return next();
    }
    
    // Interceptar queries de database (simulado)
    const originalQuery = req.app?.locals?.database?.query;
    if (originalQuery) {
      req.app.locals.database.query = async function(sql: string, params?: unknown[]) {
        return withTracing(
          `database.query`,
          async () => {
            const startTime = Date.now();
            
            try {
              const result = await originalQuery.call(this, sql, params);
              
              // Log query sucesso
              logger.debug('Database query completed', {
                metadata: {
                  traceId: req.traceId,
                  sql: sql.substring(0, 100), // Primeiros 100 chars
                  params: params?.length || 0,
                  duration: Date.now() - startTime,
                  rows: result?.length || 0,
                },
              });
              
              return result;
              
            } catch (error) {
              // Log query erro
              logger.error('Database query failed', error as Error, {
                metadata: {
                  traceId: req.traceId,
                  sql: sql.substring(0, 100),
                  params: params?.length || 0,
                  duration: Date.now() - startTime,
                },
              });
              
              throw error;
            }
          },
          {
            'db.type': 'mysql',
            'db.operation': 'query',
            'db.sql_length': sql.length,
            'db.params_count': params?.length || 0,
          }
        );
      };
    }
    
    next();
  };
}

/**
 * Middleware para tracing de LEO AI
 */
export function leoTracingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const parentSpan = req.traceSpan;
    if (!parentSpan) {
      return next();
    }
    
    // Interceptar chamadas LEO (simulado)
    const originalLeoCall = req.app?.locals?.leo?.execute;
    if (originalLeoCall) {
      req.app.locals.leo.execute = async function(prompt: string, options?: Record<string, unknown>) {
        return withTracing(
          'leo.ai.execution',
          async () => {
            const startTime = Date.now();
            
            try {
              const result = await originalLeoCall.call(this, prompt, options);
              
              // Log LEO sucesso
              logger.debug('LEO AI execution completed', {
                metadata: {
                  traceId: req.traceId,
                  promptLength: prompt.length,
                  options: Object.keys(options || {}),
                  duration: Date.now() - startTime,
                  tokens: result?.tokens || 0,
                },
              });
              
              return result;
              
            } catch (error) {
              // Log LEO erro
              logger.error('LEO AI execution failed', error as Error, {
                metadata: {
                  traceId: req.traceId,
                  promptLength: prompt.length,
                  options: Object.keys(options || {}),
                  duration: Date.now() - startTime,
                },
              });
              
              throw error;
            }
          },
          {
            'ai.service': 'leo',
            'ai.operation': 'execution',
            'ai.prompt_length': prompt.length,
            'ai.options_count': Object.keys(options || {}).length,
          }
        );
      };
    }
    
    next();
  };
}

/**
 * Middleware para tracing de services
 */
export function serviceTracingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const parentSpan = req.traceSpan;
    if (!parentSpan) {
      return next();
    }
    
    // Interceptar chamadas de services (simulado)
    const originalServiceCall = req.app?.locals?.services?.call;
    if (originalServiceCall) {
      req.app.locals.services.call = async function(serviceName: string, method: string, ...args: unknown[]) {
        return withTracing(
          `service.${serviceName}.${method}`,
          async () => {
            const startTime = Date.now();
            
            try {
              const result = await originalServiceCall.call(this, serviceName, method, ...args);
              
              // Log service sucesso
              logger.debug('Service call completed', {
                metadata: {
                  traceId: req.traceId,
                  service: serviceName,
                  method,
                  args: args.length,
                  duration: Date.now() - startTime,
                },
              });
              
              return result;
              
            } catch (error) {
              // Log service erro
              logger.error('Service call failed', error as Error, {
                metadata: {
                  traceId: req.traceId,
                  service: serviceName,
                  method,
                  args: args.length,
                  duration: Date.now() - startTime,
                },
              });
              
              throw error;
            }
          },
          {
            'service.name': serviceName,
            'service.method': method,
            'service.args_count': args.length,
          }
        );
      };
    }
    
    next();
  };
}

/**
 * Middleware combinado de tracing
 */
export function tracingMiddleware() {
  return [
    requestTracingMiddleware(),
    databaseTracingMiddleware(),
    leoTracingMiddleware(),
    serviceTracingMiddleware(),
  ];
}

/**
 * Extensão de Request para incluir tracing
 */
declare global {
  namespace Express {
    interface Request {
      traceId?: string;
      traceSpan?: TraceSpan;
    }
  }
}

/**
 * Função helper para criar spans customizados
 */
export function createCustomSpan(
  req: Request,
  operationName: string,
  tags?: Record<string, unknown>
): TraceSpan | null {
  const parentSpan = req.traceSpan;
  if (!parentSpan) return null;
  
  const span = tracer.startSpan(
    operationName,
    tracer.getCurrentContext(parentSpan.spanId) ?? undefined,
    {
      'http.trace_id': req.traceId,
      ...tags,
    }
  );
  
  return span;
}

/**
 * Função helper para logar com trace ID
 */
export function logWithTrace(
  req: Request,
  level: string,
  message: string,
  metadata?: Record<string, unknown>
): void {
  const traceMetadata = {
    traceId: req.traceId,
    ...metadata,
  };
  
  switch (level) {
    case 'debug':
      logger.debug(message, { metadata: traceMetadata });
      break;
    case 'info':
      logger.info(message, { metadata: traceMetadata });
      break;
    case 'warn':
      logger.warn(message, { metadata: traceMetadata });
      break;
    case 'error':
      logger.error(message, new Error(message), { metadata: traceMetadata });
      break;
    default:
      logger.info(message, { metadata: traceMetadata });
  }
}
