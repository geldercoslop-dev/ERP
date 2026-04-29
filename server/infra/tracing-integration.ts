import { Request, Response, NextFunction } from "express";
import { tracer } from './tracing.js';
import { createLogger } from './structured-logger.js';

/**
 * Middleware para tracing de rotas HTTP
 */
export function routeTracingMiddleware(routeName: string) {
  const logger = createLogger('tracing-integration');
  return (req: Request, res: Response, next: NextFunction) => {
    const parentSpan = (req as { traceSpan?: unknown }).traceSpan;
    if (!parentSpan) {
      return next();
    }
    
    // Criar span específico da rota
    const routeSpan = tracer.startSpan(
      `route.${routeName}`,
      undefined,
      {
        'route.method': req.method,
        'route.path': req.path,
        'route.params': JSON.stringify(req.params),
        'route.query': JSON.stringify(req.query),
      }
    );
    
    // Log início da rota
    logger.debug('Route execution started', {
      metadata: {
        traceId: (req as { traceId?: string }).traceId,
        route: routeName,
        method: req.method,
        path: req.path,
      },
    });
    
    // Interceptar finalização
    const originalEnd = res.end.bind(res);
    (res as { end: Response["end"] }).end = ((...args: unknown[]) => {
      const duration = Date.now() - routeSpan.startTime;

      tracer.setTags(routeSpan.spanId, {
        "route.duration": duration,
        "route.status": (res as { statusCode: number }).statusCode,
      });

      logger.debug("Route execution completed", {
        metadata: {
          traceId: (req as { traceId?: string }).traceId,
          route: routeName,
          statusCode: (res as { statusCode: number }).statusCode,
          duration,
        },
      });

      if ((res as { statusCode: number }).statusCode >= 400) {
        const error = new Error(
          `Route ${routeName} failed with status ${(res as { statusCode: number }).statusCode}`
        );
        tracer.finishSpan(routeSpan.spanId, error);
      } else {
        tracer.finishSpan(routeSpan.spanId);
      }

      return (originalEnd as (...a: unknown[]) => Response)(...(args as never[])) as Response;
    }) as Response["end"];
    
    next();
  };
}

/**
 * Helper para criar spans customizados em controllers
 */
export function createControllerSpan(
  req: Request,
  controllerName: string,
  actionName: string,
  tags?: Record<string, any>
) {
  const parentSpan = (req as { traceSpan?: { spanId?: string } }).traceSpan;
  if (!parentSpan || !parentSpan.spanId) return null;
  
  const context = tracer.getCurrentContext(parentSpan.spanId);
  return tracer.startSpan(
    `controller.${controllerName}.${actionName}`,
    context ?? undefined,
    {
      'controller.name': controllerName,
      'controller.action': actionName,
      ...tags,
    }
  );
}

/**
 * Helper para tracing de database operations
 */
export async function withDatabaseTracing<T>(
  req: Request,
  operation: string,
  query: () => Promise<T>,
  params?: any[]
): Promise<T> {
  const parentSpan = (req as { traceSpan?: { spanId?: string } }).traceSpan;
  if (!parentSpan || !parentSpan.spanId) {
    return await query();
  }
  
  const context = tracer.getCurrentContext(parentSpan.spanId);
  const dbSpan = tracer.startSpan(
    `database.${operation}`,
    context ?? undefined,
    {
      'db.operation': operation,
      'db.params_count': params?.length || 0,
    }
  );
  
  try {
    tracer.logToSpan(dbSpan.spanId, 'info', `Starting ${operation}`, {
      params: params?.length || 0,
    });
    
    const result = await query();
    const duration = Date.now() - dbSpan.startTime;
    
    tracer.setTags(dbSpan.spanId, {
      'db.duration': duration,
      'db.success': true,
    });
    
    tracer.logToSpan(dbSpan.spanId, 'info', `Completed ${operation}`, {
      duration,
    });
    
    tracer.finishSpan(dbSpan.spanId);
    return result;
  } catch (error) {
    tracer.setTags(dbSpan.spanId, {
      'db.success': false,
      'db.error': error instanceof Error ? error.message : 'Unknown error',
    });
    
    tracer.logToSpan(dbSpan.spanId, 'error', `Failed ${operation}`, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    tracer.finishSpan(dbSpan.spanId, error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
}

/**
 * Helper para tracing de chamadas LEO
 */
export async function withLeoTracing<T>(
  req: Request,
  operation: string,
  leoCall: () => Promise<T>,
  prompt?: string,
  options?: any
): Promise<T> {
  const parentSpan = (req as { traceSpan?: { spanId?: string } }).traceSpan;
  if (!parentSpan || !parentSpan.spanId) {
    return await leoCall();
  }
  
  const context = tracer.getCurrentContext(parentSpan.spanId);
  const leoSpan = tracer.startSpan(
    `leo.${operation}`,
    context ?? undefined,
    {
      'leo.operation': operation,
      'leo.prompt_length': prompt?.length || 0,
      'leo.options_count': Object.keys(options || {}).length,
    }
  );
  
  try {
    tracer.logToSpan(leoSpan.spanId, 'info', `Starting LEO ${operation}`, {
      promptLength: prompt?.length || 0,
    });
    
    const result = await leoCall();
    const duration = Date.now() - leoSpan.startTime;
    
    tracer.setTags(leoSpan.spanId, {
      'leo.duration': duration,
      'leo.success': true,
    });
    
    tracer.logToSpan(leoSpan.spanId, 'info', `Completed LEO ${operation}`, {
      duration,
    });
    
    tracer.finishSpan(leoSpan.spanId);
    return result;
  } catch (error) {
    tracer.setTags(leoSpan.spanId, {
      'leo.success': false,
      'leo.error': error instanceof Error ? error.message : 'Unknown error',
    });
    
    tracer.logToSpan(leoSpan.spanId, 'error', `Failed LEO ${operation}`, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    tracer.finishSpan(leoSpan.spanId, error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
}

/**
 * Helper para tracing de chamadas de serviços externos
 */
export async function withServiceTracing<T>(
  req: Request,
  serviceName: string,
  methodName: string,
  serviceCall: () => Promise<T>,
  ...args: any[]
): Promise<T> {
  const parentSpan = (req as { traceSpan?: { spanId?: string } }).traceSpan;
  if (!parentSpan || !parentSpan.spanId) {
    return await serviceCall();
  }
  
  const context = tracer.getCurrentContext(parentSpan.spanId);
  const serviceSpan = tracer.startSpan(
    `service.${serviceName}.${methodName}`,
    context ?? undefined,
    {
      'service.name': serviceName,
      'service.method': methodName,
      'service.args_count': args.length,
    }
  );
  
  try {
    tracer.logToSpan(serviceSpan.spanId, 'info', `Starting ${serviceName}.${methodName}`, {
      args: args.length,
    });
    
    const startTime = Date.now();
    const result = await serviceCall();
    const duration = Date.now() - startTime;
    
    tracer.setTags(serviceSpan.spanId, {
      'service.duration': duration,
      'service.success': true,
    });
    
    tracer.logToSpan(serviceSpan.spanId, 'info', `Completed ${serviceName}.${methodName}`, {
      duration,
    });
    
    tracer.finishSpan(serviceSpan.spanId);
    return result;
  } catch (error) {
    tracer.setTags(serviceSpan.spanId, {
      'service.success': false,
      'service.error': error instanceof Error ? error.message : 'Unknown error',
    });
    
    tracer.logToSpan(serviceSpan.spanId, 'error', `Failed ${serviceName}.${methodName}`, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    tracer.finishSpan(serviceSpan.spanId, error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
}
