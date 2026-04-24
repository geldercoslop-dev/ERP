// Cache leve em memória com TTL para melhorar performance
// Objetivo: Reduzir carga no banco para consultas frequentes
// TTL: 30 segundos padrão
const MIN_TTL_MS = 5_000;
const MAX_TTL_MS = 10 * 60 * 1000;
const MAX_KEYS = Math.min(5000, Math.max(200, Number(process.env.SIMPLE_CACHE_MAX_KEYS) || 1500));
class SimpleMemoryCache {
    cache = new Map();
    defaultTTL;
    constructor(defaultTTL = 30000) {
        this.defaultTTL = Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, defaultTTL));
    }
    // Limpar entradas expiradas (executado automaticamente a cada acesso)
    cleanup() {
        const now = Date.now();
        const keysToDelete = [];
        this.cache.forEach((entry, key) => {
            if (entry.expiresAt <= now) {
                keysToDelete.push(key);
            }
        });
        keysToDelete.forEach(key => this.cache.delete(key));
    }
    // Obter valor do cache
    get(key) {
        this.cleanup();
        const entry = this.cache.get(key);
        if (!entry)
            return null;
        if (entry.expiresAt <= Date.now()) {
            this.cache.delete(key);
            return null;
        }
        return entry.data;
    }
    // Definir valor no cache com TTL opcional
    set(key, data, ttl) {
        const ms = Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, ttl ?? this.defaultTTL));
        if (this.cache.size >= MAX_KEYS) {
            this.evictOldest(Math.floor(MAX_KEYS * 0.1) + 1);
        }
        this.cache.set(key, { data, expiresAt: Date.now() + ms });
    }
    evictOldest(n) {
        const arr = Array.from(this.cache.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt);
        for (let i = 0; i < n && i < arr.length; i++) {
            this.cache.delete(arr[i][0]);
        }
    }
    // Remover entrada específica
    delete(key) {
        return this.cache.delete(key);
    }
    // Limpar todo o cache
    clear() {
        this.cache.clear();
    }
    // Obter estatísticas do cache
    getStats() {
        this.cleanup();
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
    // Invalidar cache por padrão (wildcard)
    invalidatePattern(pattern) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        const keysToDelete = [];
        this.cache.forEach((entry, key) => {
            if (regex.test(key)) {
                keysToDelete.push(key);
            }
        });
        keysToDelete.forEach(key => this.cache.delete(key));
    }
}
// Instância global do cache
export const memoryCache = new SimpleMemoryCache(30000); // 30 segundos
// Funções helper para cache específico
export const cacheKeys = {
    produtos: (filters = {}) => `produtos:list:${JSON.stringify(filters)}`,
    clientes: (filters = {}) => `clientes:list:${JSON.stringify(filters)}`,
    produtoById: (id) => `produto:${id}`,
    clienteById: (id) => `cliente:${id}`,
};
// Função para criar wrapper de cache para funções assíncronas
export function withCache(keyFn, fn, ttl) {
    return async (...args) => {
        const key = keyFn(...args);
        // Tentar obter do cache
        const cached = memoryCache.get(key);
        if (cached !== null) {
            return cached;
        }
        // Executar função e armazenar no cache
        const result = await fn(...args);
        memoryCache.set(key, result, ttl);
        return result;
    };
}
