import { TRPCError } from '@trpc/server';

/**
 * Middleware para habilitar batching de requests tRPC
 * Reduz número de requisições HTTP para múltiplas operações
 */
export function createBatchMiddleware() {
  return async ({ ctx, next }: { ctx: any; next: () => Promise<any> }) => {
    // Adiciona suporte a batching no contexto
    ctx.batchRequests = [];
    
    return next();
  };
}

/**
 * Middleware para limitar tamanho de batch
 */
export function batchLimiterMiddleware(maxSize: number = 50) {
  return async ({ ctx, next }: { ctx: any; next: () => Promise<any> }) => {
    const batchRequests = ctx.batchRequests || [];
    
    if (batchRequests.length > maxSize) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Batch size too large. Maximum ${maxSize} requests per batch.`,
      });
    }
    
    return next();
  };
}

/**
 * Middleware para timeout de batch
 */
export function batchTimeoutMiddleware(timeoutMs: number = 100) {
  return async ({ ctx, next }: { ctx: any; next: () => Promise<any> }) => {
    const startTime = Date.now();
    
    const result = await next();
    
    const duration = Date.now() - startTime;
    if (duration > timeoutMs) {
      console.warn(`[Batch] Request took too long: ${duration}ms (timeout: ${timeoutMs}ms)`);
    }
    
    return result;
  };
}

/**
 * Middleware para logging de batches
 */
export function batchLoggerMiddleware() {
  return async ({ ctx, next }: { ctx: any; next: () => Promise<any> }) => {
    const startTime = Date.now();
    const batchRequests = ctx.batchRequests || [];
    
    if (batchRequests.length > 1) {
      console.log(`[Batch] Processing ${batchRequests.length} requests`);
    }
    
    const result = await next();
    
    const duration = Date.now() - startTime;
    if (batchRequests.length > 1) {
      console.log(`[Batch] Completed ${batchRequests.length} requests in ${duration}ms`);
    }
    
    return result;
  };
}

/**
 * Middleware completo para batching
 */
export function batchingMiddleware(options: {
  maxSize?: number;
  timeout?: number;
  enableLogging?: boolean;
} = {}) {
  const {
    maxSize = 50,
    timeout = 100,
    enableLogging = true,
  } = options;

  const middlewares = [
    createBatchMiddleware(),
    batchLimiterMiddleware(maxSize),
  ];
  
  if (enableLogging) {
    middlewares.push(batchLoggerMiddleware());
  }
  
  middlewares.push(batchTimeoutMiddleware(timeout));
  
  return middlewares;
}
