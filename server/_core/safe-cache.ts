/**
 * Módulo de cache seguro integrado com service-safety
 * 
 * Este módulo estende o cache in-memory com validações de segurança
 * e integração com o sistema de proteção de serviços.
 */

import { memoryCache, withCache, withCacheByParams, CacheOptions } from './memory-cache.js';
import { isArraySafe, isObjectSafe, hasValidId, ensureArray, ensureObject, ensureCreatedResult } from './service-safety.js';
import { logInfo, logWarning, logError, LogLevel, ErrorType } from './service-logger.js';
import { nanoid } from 'nanoid';

/**
 * Tipos de operações de cache
 */
export enum CacheOperation {
  HIT = 'HIT',
  MISS = 'MISS',
  STORE = 'STORE',
  INVALIDATE = 'INVALIDATE',
  VALIDATE_FAIL = 'VALIDATE_FAIL'
}

/**
 * Estatísticas de operações de cache
 */
interface CacheStats {
  hits: number;
  misses: number;
  stores: number;
  invalidations: number;
  validationFailures: number;
  lastOperation: {
    type: CacheOperation;
    key: string;
    timestamp: number;
    service?: string;
    method?: string;
  } | null;
}

// Estatísticas globais de cache
const cacheStats: CacheStats = {
  hits: 0,
  misses: 0,
  stores: 0,
  invalidations: 0,
  validationFailures: 0,
  lastOperation: null
};

/**
 * Registra uma operação de cache e atualiza estatísticas
 * @param operation - Tipo de operação
 * @param key - Chave do cache
 * @param context - Contexto da operação
 */
function recordCacheOperation(
  operation: CacheOperation,
  key: string,
  context?: { service?: string; method?: string }
): void {
  const { service, method } = context || {};
  
  // Atualizar estatísticas
  switch (operation) {
    case CacheOperation.HIT:
      cacheStats.hits++;
      break;
    case CacheOperation.MISS:
      cacheStats.misses++;
      break;
    case CacheOperation.STORE:
      cacheStats.stores++;
      break;
    case CacheOperation.INVALIDATE:
      cacheStats.invalidations++;
      break;
    case CacheOperation.VALIDATE_FAIL:
      cacheStats.validationFailures++;
      break;
  }
  
  // Registrar última operação
  cacheStats.lastOperation = {
    type: operation,
    key,
    timestamp: Date.now(),
    service,
    method
  };
  
  // Logar operação
  const level = operation === CacheOperation.VALIDATE_FAIL ? LogLevel.WARNING : LogLevel.DEBUG;
  const message = `Cache ${operation}: ${key}${service ? ` [${service}.${method}]` : ''}`;
  
  if (level === LogLevel.WARNING) {
    logWarning(ErrorType.INVALID_CACHE_VALUE, message, { service, method });
  } else if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_CACHE === 'true') {
    logInfo(message, { service, method });
  }
}

/**
 * Obtém estatísticas do cache
 */
export function getCacheStats(): CacheStats & { hitRate: number } {
  const totalRequests = cacheStats.hits + cacheStats.misses;
  const hitRate = totalRequests > 0 ? cacheStats.hits / totalRequests : 0;
  
  return {
    ...cacheStats,
    hitRate
  };
}

/**
 * Valida um valor antes de armazená-lo no cache
 * @param value - Valor a ser validado
 * @param expectedType - Tipo esperado ('array', 'object', 'id')
 * @returns true se o valor for válido, false caso contrário
 */
function validateCacheValue(value: unknown, expectedType?: 'array' | 'object' | 'id'): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  
  if (expectedType === 'array' && !isArraySafe(value)) {
    return false;
  }
  
  if (expectedType === 'object' && !isObjectSafe(value)) {
    return false;
  }
  
  if (expectedType === 'id' && !hasValidId(value)) {
    return false;
  }
  
  return true;
}

/**
 * Função para envolver uma função com cache seguro
 * @param fn - Função a ser envolvida
 * @param keyPrefix - Prefixo da chave de cache
 * @param options - Opções de cache
 * @returns Função envolvida com cache seguro
 */
export function withSafeCache<T, Args extends any[]>(
  fn: (...args: Args) => Promise<T>,
  keyPrefix: string,
  options: CacheOptions & { 
    expectedType?: 'array' | 'object' | 'id';
    serviceName?: string;
    methodName?: string;
  } = {}
): (...args: Args) => Promise<T> {
  const { expectedType, serviceName, methodName, ...cacheOptions } = options;
  
  return async (...args: Args): Promise<T> => {
    const traceId = nanoid(10);
    const context = { service: serviceName, method: methodName, traceId };
    
    // Gerar chave de cache
    const key = cacheOptions.key || `${keyPrefix}:${JSON.stringify({ args })}`;
    
    // Tentar obter do cache
    const cachedValue = memoryCache.get<T>(key);
    if (cachedValue !== undefined) {
      recordCacheOperation(CacheOperation.HIT, key, context);
      return cachedValue;
    }
    
    recordCacheOperation(CacheOperation.MISS, key, context);
    
    // Executar função original
    const result = await fn(...args);
    
    // Validar resultado antes de armazenar no cache
    if (!validateCacheValue(result, expectedType)) {
      recordCacheOperation(CacheOperation.VALIDATE_FAIL, key, context);
      return result;
    }
    
    // Armazenar no cache
    memoryCache.set(key, result, cacheOptions.ttl);
    recordCacheOperation(CacheOperation.STORE, key, context);
    
    return result;
  };
}

/**
 * Função para envolver uma função com cache seguro baseado em parâmetros específicos
 * @param fn - Função a ser envolvida
 * @param keyPrefix - Prefixo da chave de cache
 * @param paramsExtractor - Função para extrair parâmetros relevantes para a chave de cache
 * @param options - Opções de cache
 * @returns Função envolvida com cache seguro
 */
export function withSafeCacheByParams<T, Args extends any[]>(
  fn: (...args: Args) => Promise<T>,
  keyPrefix: string,
  paramsExtractor: (...args: Args) => Record<string, any>,
  options: CacheOptions & { 
    expectedType?: 'array' | 'object' | 'id';
    serviceName?: string;
    methodName?: string;
  } = {}
): (...args: Args) => Promise<T> {
  const { expectedType, serviceName, methodName, ...cacheOptions } = options;
  
  return async (...args: Args): Promise<T> => {
    const traceId = nanoid(10);
    const context = { service: serviceName, method: methodName, traceId };
    
    // Extrair parâmetros relevantes
    const params = paramsExtractor(...args);
    
    // Gerar chave de cache
    const key = cacheOptions.key || `${keyPrefix}:${JSON.stringify(params)}`;
    
    // Tentar obter do cache
    const cachedValue = memoryCache.get<T>(key);
    if (cachedValue !== undefined) {
      recordCacheOperation(CacheOperation.HIT, key, context);
      return cachedValue;
    }
    
    recordCacheOperation(CacheOperation.MISS, key, context);
    
    // Executar função original
    const result = await fn(...args);
    
    // Validar resultado antes de armazenar no cache
    if (!validateCacheValue(result, expectedType)) {
      recordCacheOperation(CacheOperation.VALIDATE_FAIL, key, context);
      return result;
    }
    
    // Armazenar no cache
    memoryCache.set(key, result, cacheOptions.ttl);
    recordCacheOperation(CacheOperation.STORE, key, context);
    
    return result;
  };
}

/**
 * Função para envolver uma função que retorna uma lista com cache seguro
 * @param fn - Função a ser envolvida
 * @param keyPrefix - Prefixo da chave de cache
 * @param paramsExtractor - Função para extrair parâmetros relevantes
 * @param options - Opções de cache
 * @returns Função envolvida com cache seguro que garante retorno de array
 */
export function withSafeCacheList<T, Args extends any[]>(
  fn: (...args: Args) => Promise<T[]>,
  keyPrefix: string,
  paramsExtractor: (...args: Args) => Record<string, any>,
  options: CacheOptions & { 
    serviceName?: string;
    methodName?: string;
  } = {}
): (...args: Args) => Promise<T[]> {
  const { serviceName, methodName, ...cacheOptions } = options;
  
  return async (...args: Args): Promise<T[]> => {
    const traceId = nanoid(10);
    const context = { service: serviceName, method: methodName, traceId };
    
    // Extrair parâmetros relevantes
    const params = paramsExtractor(...args);
    
    // Gerar chave de cache
    const key = cacheOptions.key || `${keyPrefix}:${JSON.stringify(params)}`;
    
    // Tentar obter do cache
    const cachedValue = memoryCache.get<T[]>(key);
    if (cachedValue !== undefined) {
      recordCacheOperation(CacheOperation.HIT, key, context);
      return cachedValue;
    }
    
    recordCacheOperation(CacheOperation.MISS, key, context);
    
    // Executar função original
    const rawResult = await fn(...args);
    
    // Aplicar ensureArray para garantir que o resultado é um array válido
    const safeResult = ensureArray(rawResult, context);
    
    // Armazenar no cache apenas se for um array válido
    if (isArraySafe(safeResult)) {
      memoryCache.set(key, safeResult, cacheOptions.ttl);
      recordCacheOperation(CacheOperation.STORE, key, context);
    } else {
      recordCacheOperation(CacheOperation.VALIDATE_FAIL, key, context);
    }
    
    return safeResult;
  };
}

/**
 * Função para envolver uma função que retorna um objeto com cache seguro
 * @param fn - Função a ser envolvida
 * @param keyPrefix - Prefixo da chave de cache
 * @param paramsExtractor - Função para extrair parâmetros relevantes
 * @param options - Opções de cache
 * @returns Função envolvida com cache seguro que garante retorno de objeto
 */
export function withSafeCacheObject<T extends Record<string, any>, Args extends any[]>(
  fn: (...args: Args) => Promise<T | null>,
  keyPrefix: string,
  paramsExtractor: (...args: Args) => Record<string, any>,
  options: CacheOptions & { 
    serviceName?: string;
    methodName?: string;
  } = {}
): (...args: Args) => Promise<T | null> {
  const { serviceName, methodName, ...cacheOptions } = options;
  
  return async (...args: Args): Promise<T | null> => {
    const traceId = nanoid(10);
    const context = { service: serviceName, method: methodName, traceId };
    
    // Extrair parâmetros relevantes
    const params = paramsExtractor(...args);
    
    // Gerar chave de cache
    const key = cacheOptions.key || `${keyPrefix}:${JSON.stringify(params)}`;
    
    // Tentar obter do cache
    const cachedValue = memoryCache.get<T | null>(key);
    if (cachedValue !== undefined) {
      recordCacheOperation(CacheOperation.HIT, key, context);
      return cachedValue;
    }
    
    recordCacheOperation(CacheOperation.MISS, key, context);
    
    // Executar função original
    const rawResult = await fn(...args);
    
    // Aplicar ensureObject para garantir que o resultado é um objeto válido ou null
    const safeResult = ensureObject(rawResult, context);
    
    // Armazenar no cache apenas se for um objeto válido ou null explícito
    if (safeResult === null || isObjectSafe(safeResult)) {
      memoryCache.set(key, safeResult, cacheOptions.ttl);
      recordCacheOperation(CacheOperation.STORE, key, context);
    } else {
      recordCacheOperation(CacheOperation.VALIDATE_FAIL, key, context);
    }
    
    return safeResult;
  };
}

/**
 * Função para envolver uma função que retorna um resultado de criação com cache seguro
 * @param fn - Função a ser envolvida
 * @param keyPrefix - Prefixo da chave de cache
 * @param paramsExtractor - Função para extrair parâmetros relevantes
 * @param options - Opções de cache
 * @returns Função envolvida com cache seguro que garante retorno de { id: number }
 */
export function withSafeCacheCreated<Args extends any[]>(
  fn: (...args: Args) => Promise<{ id: number }>,
  keyPrefix: string,
  paramsExtractor: (...args: Args) => Record<string, any>,
  options: CacheOptions & { 
    serviceName?: string;
    methodName?: string;
  } = {}
): (...args: Args) => Promise<{ id: number }> {
  const { serviceName, methodName, ...cacheOptions } = options;
  
  return async (...args: Args): Promise<{ id: number }> => {
    const traceId = nanoid(10);
    const context = { service: serviceName, method: methodName, traceId };
    
    // Para operações de criação, NÃO usamos cache para leitura
    // Executar função original
    const rawResult = await fn(...args);
    
    // Aplicar ensureCreatedResult para garantir que o resultado tem um ID válido
    const safeResult = ensureCreatedResult(rawResult, context);
    
    // Invalidar caches relacionados após criação
    const params = paramsExtractor(...args);
    const cacheKey = `${keyPrefix}:${JSON.stringify(params)}`;
    invalidateRelatedCaches(keyPrefix.split(':')[0], params);
    recordCacheOperation(CacheOperation.INVALIDATE, cacheKey, context);
    
    return safeResult;
  };
}

/**
 * Extrai tenantId do sufixo JSON da chave (ex.: inventory:produto:{"tenantId":1,"id":2})
 */
function parseTenantFromKey(key: string, servicePrefix: string): number | null {
  if (!key.startsWith(`${servicePrefix}:`)) return null;
  const idx = key.indexOf(":{");
  if (idx === -1) return null;
  try {
    const meta = JSON.parse(key.slice(idx)) as { tenantId?: number };
    return typeof meta.tenantId === "number" ? meta.tenantId : null;
  } catch {
    return null;
  }
}

/**
 * Invalida caches relacionados a um determinado serviço (por tenant).
 * Chaves reais: `prefix:{"tenantId":N,...}` — o regex antigo nunca batia.
 */
export function invalidateRelatedCaches(servicePrefix: string, params: Record<string, any> = {}): void {
  const tenantId = params.tenantId;
  if (tenantId === undefined || tenantId === null) return;
  const tid = Number(tenantId);
  if (!Number.isFinite(tid)) return;

  const keys = memoryCache.getKeys();
  const specificId = params.id !== undefined && params.id !== null ? Number(params.id) : null;

  for (const key of keys) {
    if (!key.startsWith(`${servicePrefix}:`)) continue;
    const kt = parseTenantFromKey(key, servicePrefix);
    if (kt !== tid) continue;

    if (specificId !== null && Number.isFinite(specificId)) {
      const idx = key.indexOf(":{");
      let meta: { id?: number } = {};
      if (idx !== -1) {
        try {
          meta = JSON.parse(key.slice(idx)) as { id?: number };
        } catch {
          meta = {};
        }
      }
      if (meta.id !== undefined && Number(meta.id) !== specificId) continue;
    }
    memoryCache.delete(key);
  }

  recordCacheOperation(CacheOperation.INVALIDATE, `${servicePrefix}:tenant:${tid}`, {
    service: servicePrefix,
  });
}

export { memoryCache };