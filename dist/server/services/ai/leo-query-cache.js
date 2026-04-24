/**
 * Cache leve em memória para consultas frequentes do LEO.
 * Map com TTL; usar apenas em leituras (pedidos do dia, relatório vendas, estoque).
 * Nunca cachear operações de escrita.
 */
const DEFAULT_TTL_MS = 30_000; // 30 segundos
const cache = new Map();
function prune() {
    const now = Date.now();
    for (const [key, entry] of Array.from(cache.entries())) {
        if (entry.expiresAt <= now)
            cache.delete(key);
    }
}
/**
 * Retorna valor em cache se existir e não estiver expirado.
 */
export function getCached(key) {
    const entry = cache.get(key);
    if (!entry)
        return null;
    if (entry.expiresAt <= Date.now()) {
        cache.delete(key);
        return null;
    }
    return entry.value;
}
/**
 * Armazena valor no cache com TTL em ms (padrão 30s).
 */
export function setCached(key, value, ttlMs = DEFAULT_TTL_MS) {
    if (cache.size > 500)
        prune();
    cache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
    });
}
/**
 * Invalida uma chave (útil após escritas em dados relacionados).
 */
export function invalidateCached(key) {
    cache.delete(key);
}
