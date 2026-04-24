import { getDb } from "../db/index.js";
import { InfrastructureError } from '../_core/errors/typed-errors.js';
export const tenantDbMap = new Map();
function assertTenantId(tenantId) {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
        throw new InfrastructureError("TENANT_REQUIRED");
    }
}
export function setTenantDb(tenantId, db) {
    assertTenantId(tenantId);
    tenantDbMap.set(tenantId, db);
}
export function clearTenantDb(tenantId) {
    assertTenantId(tenantId);
    tenantDbMap.delete(tenantId);
}
export async function getDbByTenant(tenantId) {
    assertTenantId(tenantId);
    const mappedDb = tenantDbMap.get(tenantId);
    if (mappedDb)
        return mappedDb;
    return getDb();
}
