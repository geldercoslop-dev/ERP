import { getDb } from "../db/core.js";
import { users } from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";
import { buildBootstrapInvocation, runWithServiceInvocationAsync } from "../runtime/service-invocation.js";
export async function validateTenantOwnershipByUserId(userId, tenantId) {
    return runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => {
        const db = await getDb();
        const userRecord = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!userRecord || userRecord.length === 0) {
            return {
                valid: false,
                reason: `Usuário ${userId} não encontrado no banco`,
            };
        }
        const user = userRecord[0];
        const userTenantId = user.tenantId;
        void userTenantId;
        return {
            valid: true,
            tenantId,
        };
    });
}
