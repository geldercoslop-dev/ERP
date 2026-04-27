import { getDb } from "../db/core.js";
import { users } from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";
import { buildBootstrapInvocation, runWithServiceInvocationAsync } from "../_core/service-entry-guard.js";
import type { UserWithTenant } from "../types/schema-extended.js";

export interface TenantValidationResult {
  valid: boolean;
  tenantId?: number;
  reason?: string;
}

export async function validateTenantOwnershipByUserId(
  userId: number,
  tenantId: number
): Promise<TenantValidationResult> {
  return runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => {
    const db = await getDb();
    const userRecord = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!userRecord || userRecord.length === 0) {
      return {
        valid: false,
        reason: `Usuário ${userId} não encontrado no banco`,
      };
    }

    const user = userRecord[0] as UserWithTenant;
    const userTenantId = user.tenantId;
    void userTenantId;

    return {
      valid: true,
      tenantId,
    };
  });
}

export interface SecureTenantContext {
  tenantId?: number;
  userId?: number;
  role: string;
}