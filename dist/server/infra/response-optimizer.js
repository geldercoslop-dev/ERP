/**
 * Response Size Optimizer
 *
 * Ajuda a reduzir o tamanho das respostas HTTP
 * e otimizar performance da API
 */
/**
 * Otimiza response removendo campos desnecessários
 */
export function optimizeResponse(data, options = {}) {
    const { maxResponseSize = 1024 * 1024, // 1MB
    excludeFields = [], includeFields = [], compressResponse = false, } = options;
    // Se não há dados, retorna vazio
    if (!data || typeof data !== 'object') {
        return data;
    }
    // Se especificou campos para incluir, retorna apenas eles
    if (includeFields.length > 0) {
        const included = {};
        for (const field of includeFields) {
            if (field in data) {
                included[field] = data[field];
            }
        }
        return included;
    }
    // Remove campos excluídos
    if (excludeFields.length > 0) {
        const optimized = { ...data };
        for (const field of excludeFields) {
            if (field in optimized) {
                delete optimized[field];
            }
        }
        return optimized;
    }
    // Verifica tamanho da resposta
    const responseSize = JSON.stringify(data).length;
    if (responseSize > maxResponseSize) {
        console.warn(`[Response Optimizer] Response too large: ${responseSize} bytes (max: ${maxResponseSize})`);
        // Truncar campos grandes
        const truncated = {};
        for (const [key, value] of Object.entries(data)) {
            if (typeof value === 'string' && value.length > 1000) {
                truncated[key] = value.substring(0, 1000) + '... (truncated)';
            }
            else if (Array.isArray(value) && value.length > 100) {
                truncated[key] = value.slice(0, 100);
            }
            else if (typeof value === 'object' && value !== null) {
                // Recursivamente otimiza objetos aninhados
                truncated[key] = optimizeResponse(value, options);
            }
            else {
                truncated[key] = value;
            }
        }
        return truncated;
    }
    return data;
}
/**
 * Middleware Express para otimizar respostas
 */
export function responseOptimizerMiddleware(options = {}) {
    return (req, res, next) => {
        // Intercepta res.json para otimizar
        const originalJson = res.json;
        res.json = function (data, ...args) {
            const optimized = optimizeResponse(data, options);
            return originalJson.call(this, optimized, ...args);
        };
        // Intercepta res.send para otimizar
        const originalSend = res.send;
        res.send = function (data, ...args) {
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
export function getOptimizationOptions(entity, additionalOptions = {}) {
    const baseOptions = {
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
            ...ENTITY_EXCLUDE_FIELDS[entity],
        ];
    }
    return { ...baseOptions, ...additionalOptions };
}
/**
 * Cache simples para respostas
 */
const responseCache = new Map();
/**
 * Middleware de cache para respostas
 */
export function responseCacheMiddleware(options = {}) {
    const { ttl = 300000 } = options; // 5 minutos padrão
    return (req, res, next) => {
        const cacheKey = `${req.method}:${req.originalUrl}:${JSON.stringify(req.query)}`;
        // Verifica cache
        const cached = responseCache.get(cacheKey);
        if (cached && Date.now() < cached.expiresAt) {
            console.log(`[Cache] Cache hit for ${req.method} ${req.originalUrl}`);
            return res.json(cached.data);
        }
        // Intercepta res.json para armazenar em cache
        const originalJson = res.json;
        res.json = function (data, ...args) {
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
