/**
 * Invalidação centralizada após mutações (estoque, produtos, dashboard).
 */

import { invalidateRelatedCaches } from "./safe-cache";
import { memoryCache as simpleRouterCache } from "../cache/simple-memory-cache";
import { clearDashboardCache } from "../tools/dashboard-cache";

export function invalidateInventoryCachesForTenant(tenantId: number): void {
  invalidateRelatedCaches("inventory", { tenantId });
  simpleRouterCache.invalidatePattern("^produtos:list:");
  clearDashboardCache(tenantId);
}

export function invalidateClientesCachesForTenant(tenantId: number, clienteId?: number): void {
  invalidateRelatedCaches("clientes", { tenantId, id: clienteId });
  simpleRouterCache.invalidatePattern("^clientes:list:");
  clearDashboardCache(tenantId);
}
