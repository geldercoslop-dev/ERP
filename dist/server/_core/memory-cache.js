/**
 * Módulo de cache in-memory simples
 *
 * Este módulo fornece uma implementação de cache in-memory usando Map
 * para reduzir a latência e evitar sobrecarga no banco de dados.
 */
import { logger } from './logger.js';
import { BoundedMap } from './bounded-map.js';
/**
 * Cache in-memory usando Map com LRU
 */
const MIN_TTL_SEC = Math.max(5, Number(process.env.CACHE_MIN_TTL_SEC) || 5);
const MAX_TTL_SEC = Math.min(600, Number(process.env.CACHE_MAX_TTL_SEC) || 300);
const MAX_ENTRIES = Math.min(20000, Math.max(500, Number(process.env.CACHE_MAX_ENTRIES) || 8000));
class MemoryCache {
    cache = new BoundedMap(MAX_ENTRIES);
    hitCount = 0;
    missCount = 0;
    defaultTtl = 30; // segundos
    /**
     * Obtém um valor do cache
     * @param key - Chave do cache
     * @returns O valor armazenado ou undefined se não encontrado ou expirado
     */
    get(key) {
        const item = this.cache.get(key);
        // Se o item não existe no cache
        if (!item) {
            this.missCount++;
            return undefined;
        }
        // Verifica se o item expirou
        const now = Date.now();
        if (now > item.expiresAt) {
            this.cache.delete(key);
            this.missCount++;
            return undefined;
        }
        // HARDENING: safe improvement - atualiza lastAccessed para LRU
        item.lastAccessed = now;
        this.hitCount++;
        return item.value;
    }
    /**
     * Armazena um valor no cache
     * @param key - Chave do cache
     * @param value - Valor a ser armazenado
     * @param ttl - Tempo de vida em segundos (opcional, padrão: 30s)
     */
    set(key, value, ttl = this.defaultTtl) {
        const sec = Math.min(MAX_TTL_SEC, Math.max(MIN_TTL_SEC, ttl || this.defaultTtl));
        const expiresAt = Date.now() + sec * 1000;
        const now = Date.now();
        // HARDENING: safe improvement - inclui lastAccessed para LRU
        this.cache.set(key, { value, expiresAt, lastAccessed: now });
    }
    /**
     * Remove um valor do cache
     * @param key - Chave do cache
     */
    delete(key) {
        this.cache.delete(key);
    }
    /**
     * Limpa o cache inteiro
     */
    clear() {
        this.cache.clear();
    }
    /**
     * Limpa itens expirados do cache
     */
    cleanup() {
        const now = Date.now();
        const toDelete = [];
        for (const [key, item] of this.cache.entries()) {
            if (now > item.expiresAt) {
                toDelete.push(key);
            }
        }
        // Remover itens expirados
        toDelete.forEach(key => this.cache.delete(key));
    }
    /**
     * Obtém todas as chaves do cache
     * @returns Array com todas as chaves do cache
     */
    getKeys() {
        return Array.from(this.cache.keys());
    }
    /**
     * Obtém estatísticas do cache
     */
    getStats() {
        const totalRequests = this.hitCount + this.missCount;
        const hitRate = totalRequests > 0 ? this.hitCount / totalRequests : 0;
        return {
            size: this.cache.size,
            hits: this.hitCount,
            misses: this.missCount,
            hitRate
        };
    }
    /**
     * Define o TTL padrão
     * @param seconds - Tempo de vida em segundos
     */
    setDefaultTtl(seconds) {
        this.defaultTtl = seconds;
    }
    /**
     * Invalida todas as chaves que correspondem a um padrão
     * @param pattern - Padrão para correspondência (string ou regex)
     * @returns Número de chaves invalidadas
     */
    invalidatePattern(pattern) {
        let count = 0;
        const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.cache.delete(key);
                count++;
            }
        }
        return count;
    }
}
// Instância global do cache
export const memoryCache = new MemoryCache();
/**
 * Função auxiliar para gerar chaves de cache
 * @param prefix - Prefixo da chave
 * @param params - Parâmetros para incluir na chave
 * @returns Chave de cache
 */
export function generateCacheKey(prefix, params) {
    if (!params)
        return prefix;
    // Ordenar as chaves para garantir consistência
    const sortedKeys = Object.keys(params).sort();
    const paramsString = sortedKeys
        .map(key => `${key}=${JSON.stringify(params[key])}`)
        .join('&');
    return `${prefix}:${paramsString}`;
}
/**
 * Função para envolver uma função com cache
 * @param fn - Função a ser envolvida
 * @param keyPrefix - Prefixo da chave de cache
 * @param options - Opções de cache
 * @returns Função envolvida com cache
 */
export function withCache(fn, keyPrefix, options = {}) {
    return async (...args) => {
        // Gerar chave de cache
        const key = options.key || generateCacheKey(keyPrefix, { args });
        // Tentar obter do cache
        const cachedValue = memoryCache.get(key);
        if (cachedValue !== undefined) {
            return cachedValue;
        }
        // Executar função original
        const result = await fn(...args);
        // Armazenar no cache
        memoryCache.set(key, result, options.ttl || 30);
        return result;
    };
}
/**
 * Função para envolver uma função com cache baseado em parâmetros específicos
 * @param fn - Função a ser envolvida
 * @param keyPrefix - Prefixo da chave de cache
 * @param paramsExtractor - Função para extrair parâmetros relevantes para a chave de cache
 * @param options - Opções de cache
 * @returns Função envolvida com cache
 */
export function withCacheByParams(fn, keyPrefix, paramsExtractor, options = {}) {
    return async (...args) => {
        // Extrair parâmetros relevantes
        const params = paramsExtractor(...args);
        // Gerar chave de cache
        const key = options.key || generateCacheKey(keyPrefix, params);
        // Tentar obter do cache
        const cachedValue = memoryCache.get(key);
        if (cachedValue !== undefined) {
            return cachedValue;
        }
        // Executar função original
        const result = await fn(...args);
        // Armazenar no cache
        memoryCache.set(key, result, options.ttl || 30);
        return result;
    };
}
/**
 * Inicializa o sistema de cache
 * @param options - Opções de inicialização
 */
export function initCache(options = {}) {
    // Definir TTL padrão
    if (options.defaultTtl) {
        memoryCache.setDefaultTtl(options.defaultTtl);
    }
    // Configurar limpeza periódica
    if (options.cleanupInterval) {
        setInterval(() => {
            memoryCache.cleanup();
        }, options.cleanupInterval * 1000);
    }
    logger.info({ options }, 'Cache in-memory initialized');
}
// Exportar funções e instância
export default {
    memoryCache,
    generateCacheKey,
    withCache,
    withCacheByParams,
    initCache
};
