/**
 * Cache simples para insights do dashboard (60 segundos).
 * Evita recalcular a cada requisição.
 */
const TTL_MS = 60 * 1000;
const MAX_TENANTS = 200;
const cache = new Map();
export function getDashboardCache(tenantId) {
    const entry = cache.get(tenantId);
    if (!entry || Date.now() > entry.expiresAt)
        return null;
    entry.lastAccess = Date.now();
    return entry.data;
}
export function setDashboardCache(tenantId, data) {
    if (cache.size >= MAX_TENANTS) {
        let oldest = null;
        let oldestT = Infinity;
        for (const [tid, e] of cache.entries()) {
            if (e.lastAccess < oldestT) {
                oldestT = e.lastAccess;
                oldest = tid;
            }
        }
        if (oldest !== null)
            cache.delete(oldest);
    }
    cache.set(tenantId, {
        data: data,
        expiresAt: Date.now() + TTL_MS,
        lastAccess: Date.now(),
    });
}
export function clearDashboardCache(tenantId) {
    if (tenantId !== undefined)
        cache.delete(tenantId);
    else
        cache.clear();
}
