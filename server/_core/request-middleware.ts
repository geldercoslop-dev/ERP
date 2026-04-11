import { randomUUID } from 'crypto';
import { systemLogger, apiLogger, logCriticalError } from './logger.js';
import { recordResponseTime, recordError } from './system-monitor.js';

/**
 * Middleware para adicionar request ID a todas as requisições
 */
interface MiddlewareContext {
  req?: {
    method?: string;
    url?: string;
    headers?: Record<string, unknown>;
    ip?: string;
    connection?: { remoteAddress?: string };
  };
  user?: { id?: number };
  tenantId?: number;
  requestId?: string;
  startTime?: number;
  logger?: unknown;
}

interface ProcedureContext {
  path?: string;
  type?: string;
  input?: unknown;
  user?: { id?: number };
  tenantId?: number;
  requestId?: string;
}

interface AuditContext {
  path?: string;
  type?: string;
  input?: unknown;
  user?: { id?: number };
  tenantId?: number;
  requestId?: string;
}

interface PerformanceContext {
  req?: {
    url?: string;
  };
  requestId?: string;
}

interface ChainContext {
  [key: string]: unknown;
}

export function addRequestId() {
  return async ({ ctx, next }: { ctx: MiddlewareContext; next: () => Promise<unknown> }) => {
    // Gerar request ID único
    const requestIdHeader = ctx.req?.headers?.['x-request-id'];
    const altRequestIdHeader = ctx.req?.headers?.['request-id'];
    const requestId = (typeof requestIdHeader === 'string' ? requestIdHeader : 
                      typeof altRequestIdHeader === 'string' ? altRequestIdHeader : 
                      randomUUID());
    
    // Adicionar ao contexto
    ctx.requestId = requestId;
    ctx.startTime = Date.now();
    
    // Adicionar ao logger
    const childLogger = systemLogger.child({ requestId });
    ctx.logger = childLogger;
    
    // Log de início da requisição
    childLogger.info({
      method: ctx.req?.method,
      url: ctx.req?.url,
      userAgent: ctx.req?.headers?.['user-agent'] as string,
      ip: ctx.req?.ip || ctx.req?.connection?.remoteAddress,
      userId: ctx.user?.id,
      tenantId: ctx.tenantId
    }, 'Request started');
    
    try {
      const result = await next();
      
      // Log de sucesso
      const duration = Date.now() - (ctx.startTime || 0);
      
      // Monitorar performance
      if (ctx.req?.url) {
        recordResponseTime(ctx.req.url, duration, ctx.requestId);
      }

      childLogger.info({
        duration: `${duration}ms`,
        status: 'success'
      }, 'Request completed');
      
      return result;
    } catch (error) {
      // Log de erro (o middleware de erro vai tratar)
      const duration = Date.now() - (ctx.startTime || 0);

      // Monitorar performance e erro
      if (ctx.req?.url) {
        recordResponseTime(ctx.req.url, duration, ctx.requestId);
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      recordError(errorMessage);

      // Log estruturado para erros críticos
      logCriticalError({
        errorType: 'API_REQUEST_FAILED',
        route: ctx.req?.url,
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        context: {
          requestId: ctx.requestId,
          userId: ctx.user?.id,
          tenantId: ctx.tenantId
        }
      });

      childLogger.error({
        error: errorMessage,
        duration: `${duration}ms`,
        status: 'error'
      }, 'Request failed');
      
      throw error;
    }
  };
}

/**
 * Middleware para logging de requisições HTTP
 */
export function logHttpRequest() {
  return async ({ ctx, next }: { ctx: MiddlewareContext; next: () => Promise<unknown> }) => {
    const startTime = Date.now();
    const requestId = ctx.requestId || 'unknown';
    
    try {
      const result = await next();
      const duration = Date.now() - startTime;
      
      apiLogger.info({
        requestId,
        method: ctx.req?.method,
        url: ctx.req?.url,
        statusCode: 200,
        duration: `${duration}ms`,
        userId: ctx.user?.id,
        tenantId: ctx.tenantId
      } as Record<string, unknown>, 'HTTP request successful');
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      apiLogger.error({
        requestId,
        method: ctx.req?.method,
        url: ctx.req?.url,
        error: error instanceof Error ? error.message : String(error),
        duration: `${duration}ms`,
        userId: ctx.user?.id,
        tenantId: ctx.tenantId
      }, 'HTTP request failed');
      
      throw error;
    }
  };
}

/**
 * Middleware para logging de procedures tRPC
 */
export function logTrpcProcedure() {
  return async ({ path, type, input, ctx, next }: { path: string; type: string; input: unknown; ctx: ProcedureContext; next: () => Promise<unknown> }) => {
    const startTime = Date.now();
    const requestId = ctx.requestId || randomUUID();
    
    // Log do início da procedure
    systemLogger.debug({
      requestId,
      path,
      type,
      input: type === 'mutation' ? input : '[REDACTED]', // Não logar input de queries sensíveis
      userId: ctx.user?.id,
      tenantId: ctx.tenantId
    }, 'tRPC procedure started');
    
    try {
      const result = await next();
      const duration = Date.now() - startTime;
      
      // Log do sucesso
      systemLogger.debug({
        requestId,
        path,
        type,
        duration: `${duration}ms`,
        resultType: typeof result,
        userId: ctx.user?.id,
        tenantId: ctx.tenantId
      }, 'tRPC procedure completed');
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Log do erro
      systemLogger.error({
        requestId,
        path,
        type,
        error: error instanceof Error ? error.message : String(error),
        duration: `${duration}ms`,
        userId: ctx.user?.id,
        tenantId: ctx.tenantId
      }, 'tRPC procedure failed');
      
      throw error;
    }
  };
}

/**
 * Middleware para performance monitoring
 */
export function performanceMonitor() {
  return async ({ ctx, next }: { ctx: PerformanceContext; next: () => Promise<unknown> }) => {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();
    const requestId = ctx.requestId || 'unknown';
    
    try {
      const result = await next();
      const duration = Date.now() - startTime;
      const endMemory = process.memoryUsage();
      
      // Log de performance
      systemLogger.info({
        requestId,
        performance: {
          duration: `${duration}ms`,
          memory: {
            heapUsed: endMemory.heapUsed - startMemory.heapUsed,
            heapTotal: endMemory.heapTotal - startMemory.heapTotal,
            external: endMemory.external - startMemory.external
          }
        }
      }, 'Performance metrics');
      
    // Adicionar performance ao resultado se for resposta padronizada
      if (result && typeof result === 'object' && 'meta' in result) {
        const resultObj = result as { meta?: Record<string, unknown> };
        resultObj.meta = {
          ...resultObj.meta,
          performance: {
            duration,
            memoryDelta: endMemory.heapUsed - startMemory.heapUsed
          }
        };
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      systemLogger.error({
        requestId,
        performance: {
          duration: `${duration}ms`,
          error: error instanceof Error ? error.message : String(error)
        }
      }, 'Performance error');
      
      throw error;
    }
  };
}

/**
 * Middleware para auditoria de endpoints críticos
 */
export function auditEndpoint(options: {
  criticalFields?: string[];
  logInput?: boolean;
  logResult?: boolean;
} = {}) {
  const { criticalFields = [], logInput = false, logResult = false } = options;
  
  return async ({ path, type, input, ctx, next }: { path: string; type: string; input: unknown; ctx: AuditContext; next: () => Promise<unknown> }) => {
    const requestId = ctx.requestId || 'unknown';
    const userId = ctx.user?.id;
    const tenantId = ctx.tenantId;
    
    // Log de auditoria
    const auditData: {
      requestId: string;
      path?: string;
      type?: string;
      userId?: number;
      tenantId?: number;
      timestamp: string;
      criticalData?: Record<string, unknown>;
      input?: unknown;
    } = {
      requestId,
      path,
      type,
      userId,
      tenantId,
      timestamp: new Date().toISOString()
    };
    
    // Adicionar campos críticos se especificado
    if (criticalFields.length > 0 && input && typeof input === 'object') {
      auditData.criticalData = {};
      const inputObj = input as Record<string, unknown>;
      criticalFields.forEach(field => {
        if (field in inputObj) {
          auditData.criticalData![field] = inputObj[field];
        }
      });
    }
    
    // Log completo do input se permitido
    if (logInput) {
      auditData.input = input;
    }
    
    systemLogger.info(auditData, 'Audit: Endpoint accessed');
    
    try {
      const result = await next();
      
      // Log do resultado se permitido
      if (logResult) {
        systemLogger.info({
          requestId,
          path,
          result,
          userId,
          tenantId
        }, 'Audit: Endpoint result');
      }
      
      return result;
    } catch (error) {
      // Log do erro na auditoria
      systemLogger.error({
        requestId,
        path,
        error: error instanceof Error ? error.message : String(error),
        userId,
        tenantId
      }, 'Audit: Endpoint error');
      
      throw error;
    }
  };
}

/**
 * Função para criar middlewares combinados
 */
interface ChainContext extends Record<string, unknown> {}

export function createMiddlewareChain(...middlewareFactories: Array<() => (ctx: ChainContext) => Promise<unknown>>) {
  return async (opts: unknown) => {
    let result: ChainContext = (opts || {}) as ChainContext;
    
    for (const factory of middlewareFactories) {
      const middleware = factory();
      const middlewareResult = await middleware(result);
      result = middlewareResult as ChainContext;
    }
    
    return result;
  };
}

/**
 * Middleware padrão para todas as requisições
 */
// Middleware padrão e crítico desabilitados temporariamente devido a incompatibilidade de tipos
// export const standardMiddleware = createMiddlewareChain(
//   addRequestId,
//   logHttpRequest,
//   performanceMonitor
// );

// export const criticalEndpointMiddleware = createMiddlewareChain(
//   addRequestId,
//   logHttpRequest,
//   auditEndpoint({
//     criticalFields: ['userId', 'clientId', 'orderId', 'amount'],
//     logInput: false,
//     logResult: false
//   }),
//   performanceMonitor
// );

/**
 * Função para gerar request ID
 */
export function generateRequestId(): string {
  return randomUUID();
}

/**
 * Função para extrair request ID do contexto
 */
export function getRequestId(ctx: { requestId?: string }): string {
  return ctx.requestId || 'unknown';
}

/**
 * Função para criar logger com request ID
 */
export function createRequestLogger(ctx: { requestId?: string }) {
  const requestId = getRequestId(ctx);
  return systemLogger.child({ requestId });
}
