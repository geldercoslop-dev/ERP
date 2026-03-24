/**
 * Response Size Optimizer
 * 
 * Ajuda a reduzir o tamanho das respostas HTTP
 * e otimizar performance da API
 */

export interface ResponseOptimizationOptions {
  maxResponseSize?: number; // bytes
  excludeFields?: string[];
  includeFields?: string[];
  compressResponse?: boolean;
  enableCache?: boolean;
  cacheTTL?: number; // segundos
}

/**
 * Otimiza response removendo campos desnecessários
 */
export function optimizeResponse<T extends Record<string, any>>(
  data: T,
  options: ResponseOptimizationOptions = {}
): Partial<T> {
  const {
    maxResponseSize = 1024 * 1024, // 1MB
    excludeFields = [],
    includeFields = [],
    compressResponse = false,
  } = options;

  // Se não há dados, retorna vazio
  if (!data || typeof data !== 'object') {
    return data;
  }

  // Se especificou campos para incluir, retorna apenas eles
  if (includeFields.length > 0) {
    const included: Partial<T> = {};
    for (const field of includeFields) {
      if (field in data) {
        included[field as keyof T] = data[field];
      }
    }
    return included;
  }

  // Remove campos excluídos
  if (excludeFields.length > 0) {
    const optimized: Partial<T> = { ...data };
    for (const field of excludeFields) {
      if (field in optimized) {
        delete (optimized as any)[field];
      }
    }
    return optimized;
  }

  // Verifica tamanho da resposta
  const responseSize = JSON.stringify(data).length;
  if (responseSize > maxResponseSize) {
    console.warn(`[Response Optimizer] Response too large: ${responseSize} bytes (max: ${maxResponseSize})`);
    
    // Truncar campos grandes
    const truncated: Partial<T> = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string' && value.length > 1000) {
        (truncated as any)[key] = value.substring(0, 1000) + '... (truncated)';
      } else if (Array.isArray(value) && value.length > 100) {
        (truncated as any)[key] = value.slice(0, 100);
      } else if (typeof value === 'object' && value !== null) {
        // Recursivamente otimiza objetos aninhados
        (truncated as any)[key] = optimizeResponse(value, options);
      } else {
        (truncated as any)[key] = value;
      }
    }
    return truncated;
  }

  return data;
}

/**
 * Middleware Express para otimizar respostas
 */
export function responseOptimizerMiddleware(options: ResponseOptimizationOptions = {}) {
  return (req: any, res: any, next: any) => {
    // Intercepta res.json para otimizar
    const originalJson = res.json;
    res.json = function(data: any, ...args: any[]) {
      const optimized = optimizeResponse(data, options);
      return originalJson.call(this, optimized, ...args);
    };
    
    // Intercepta res.send para otimizar
    const originalSend = res.send;
    res.send = function(data: any, ...args: any[]) {
      if (typeof data === 'object' && data !== null) {
        const optimized = optimizeResponse(data, options);
        return originalSend.call(this, optimized, ...args);
      }
      return originalSend.call(this, data, ...args);
    };
    
    next();
  };
}

/**
 * Campos comuns para excluir em respostas de listas
 */
export const COMMON_EXCLUDE_FIELDS = [
  'password',
  'senha',
  'token',
  'secret',
  'hash',
  'salt',
  'internalNotes',
  'debugInfo',
  'rawData',
  'tempData',
];

/**
 * Campos específicos para diferentes entidades
 */
export const ENTITY_EXCLUDE_FIELDS = {
  users: ['password', 'loginMethod', 'lastSignedIn'],
  vendedores: ['senha'],
  clientes: ['telefoneNorm', 'nomeNorm', 'sobrenomeNorm'],
  pedidos: ['dataCriacao'],
  produtos: ['rawData'],
};

/**
 * Obtém opções de otimização para uma entidade específica
 */
export function getOptimizationOptions(
  entity: string,
  additionalOptions: Partial<ResponseOptimizationOptions> = {}
): ResponseOptimizationOptions {
  const baseOptions: ResponseOptimizationOptions = {
    maxResponseSize: 512 * 1024, // 512KB
    excludeFields: [...COMMON_EXCLUDE_FIELDS],
    compressResponse: true,
    enableCache: true,
    cacheTTL: 300, // 5 minutos
  };

  // Adiciona campos específicos da entidade
  if (entity in ENTITY_EXCLUDE_FIELDS) {
    baseOptions.excludeFields = [
      ...(baseOptions.excludeFields || []),
      ...ENTITY_EXCLUDE_FIELDS[entity as keyof typeof ENTITY_EXCLUDE_FIELDS],
    ];
  }

  return { ...baseOptions, ...additionalOptions };
}

/**
 * Cache simples para respostas
 */
const responseCache = new Map<string, { data: any; expiresAt: number }>();

/**
 * Middleware de cache para respostas
 */
export function responseCacheMiddleware(options: { ttl?: number } = {}) {
  const { ttl = 300000 } = options; // 5 minutos padrão
  
  return (req: any, res: any, next: any) => {
    const cacheKey = `${req.method}:${req.originalUrl}:${JSON.stringify(req.query)}`;
    
    // Verifica cache
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      console.log(`[Cache] Cache hit for ${req.method} ${req.originalUrl}`);
      return res.json(cached.data);
    }
    
    // Intercepta res.json para armazenar em cache
    const originalJson = res.json;
    res.json = function(data: any, ...args: any[]) {
      // Armazena em cache apenas para GET requests
      if (req.method === 'GET' && data) {
        responseCache.set(cacheKey, {
          data,
          expiresAt: Date.now() + ttl,
        });
      }
      return originalJson.call(this, data, ...args);
    };
    
    next();
  };
}
