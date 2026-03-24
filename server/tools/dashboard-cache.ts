/**
 * Cache simples para insights do dashboard (60 segundos).
 * Evita recalcular a cada requisição.
 */

const TTL_MS = 60 * 1000;
const MAX_TENANTS = 200;

type CacheEntry<T> = { data: T; expiresAt: number; lastAccess: number };

const cache = new Map<number, CacheEntry<Record<string, unknown>>>();

export function getDashboardCache<T = Record<string, unknown>>(tenantId: number): T | null {
  const entry = cache.get(tenantId) as CacheEntry<T> | undefined;
  if (!entry || Date.now() > entry.expiresAt) return null;
  entry.lastAccess = Date.now();
  return entry.data;
}

export function setDashboardCache<T = Record<string, unknown>>(tenantId: number, data: T): void {
  if (cache.size >= MAX_TENANTS) {
    let oldest: number | null = null;
    let oldestT = Infinity;
    for (const [tid, e] of cache.entries()) {
      if (e.lastAccess < oldestT) {
        oldestT = e.lastAccess;
        oldest = tid;
      }
    }
    if (oldest !== null) cache.delete(oldest);
  }
  cache.set(tenantId, {
    data: data as Record<string, unknown>,
    expiresAt: Date.now() + TTL_MS,
    lastAccess: Date.now(),
  });
}

export function clearDashboardCache(tenantId?: number): void {
  if (tenantId !== undefined) cache.delete(tenantId);
  else cache.clear();
}
