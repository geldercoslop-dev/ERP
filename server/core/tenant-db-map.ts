import { getDb } from "../db/index.js";
import { assertTenantId } from "../_core/errors/assertions.js";
import type { Database } from "../db/core.js";

export const tenantDbMap = new Map<number, Database>();

export function setTenantDb(tenantId: number, db: Database): void {
  assertTenantId(tenantId);
  tenantDbMap.set(tenantId, db);
}

export function clearTenantDb(tenantId: number): void {
  assertTenantId(tenantId);
  tenantDbMap.delete(tenantId);
}

export async function getDbByTenant(tenantId: number): Promise<Database | null> {
  assertTenantId(tenantId);

  const mappedDb = tenantDbMap.get(tenantId);
  if (mappedDb) return mappedDb;

  return getDb();
}
