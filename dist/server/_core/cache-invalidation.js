/**
 * Invalidação centralizada após mutações (estoque, produtos, dashboard).
 */
import { invalidateRelatedCaches } from "./safe-cache.js";
import { memoryCache as simpleRouterCache } from "../cache/simple-memory-cache.js";
import { clearDashboardCache } from "../tools/dashboard-cache.js";
export function invalidateInventoryCachesForTenant(tenantId) {
    invalidateRelatedCaches("inventory", { tenantId });
    simpleRouterCache.invalidatePattern("^produtos:list:");
    clearDashboardCache(tenantId);
}
export function invalidateClientesCachesForTenant(tenantId, clienteId) {
    invalidateRelatedCaches("clientes", { tenantId, id: clienteId });
    simpleRouterCache.invalidatePattern("^clientes:list:");
    clearDashboardCache(tenantId);
}
