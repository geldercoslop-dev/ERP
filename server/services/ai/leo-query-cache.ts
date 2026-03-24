/**
 * Cache leve em memória para consultas frequentes do LEO.
 * Map com TTL; usar apenas em leituras (pedidos do dia, relatório vendas, estoque).
 * Nunca cachear operações de escrita.
 */

const DEFAULT_TTL_MS = 30_000; // 30 segundos

type CacheEntry = {
  value: unknown;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

function prune(): void {
  const now = Date.now();
  for (const [key, entry] of Array.from(cache.entries())) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

/**
 * Retorna valor em cache se existir e não estiver expirado.
 */
export function getCached<T = unknown>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

/**
 * Armazena valor no cache com TTL em ms (padrão 30s).
 */
export function setCached(key: string, value: unknown, ttlMs: number = DEFAULT_TTL_MS): void {
  if (cache.size > 500) prune();
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Invalida uma chave (útil após escritas em dados relacionados).
 */
export function invalidateCached(key: string): void {
  cache.delete(key);
}
