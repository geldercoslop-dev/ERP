import { insertAuditLog } from "../db/core.js";

/**
 * Auditoria para ações sintéticas / LEO (payload em JSON).
 */
export async function logLeoSyntheticAudit(params: {
  tenantId: number;
  payloadJson: string;
  entity?: string;
  entityId?: string | number | null;
}): Promise<void> {
  await insertAuditLog({
    tenantId: params.tenantId,
    action: "leo_action",
    entity: params.entity ?? "leo",
    entityId: params.entityId != null ? String(params.entityId) : null,
    payloadJson: params.payloadJson,
  });
}
