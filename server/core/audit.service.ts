import { logger } from "../_core/logger.js";
import { logAudit as logAuditService } from "../services/audit-log.service.js";

export type AuditAction = "READ" | "WRITE" | "DELETE";

type AuditMetadata = {
  userId?: number;
  traceId?: string;
  payload?: unknown;
  [key: string]: unknown;
};

/**
 * Delegates audit logging to the service layer (server/services/audit-log.service.ts)
 * This core layer no longer accesses DB directly - it routes through the authorized service layer.
 */
export async function logAudit(
  tenantId: number,
  action: AuditAction,
  entity: string,
  metadata: AuditMetadata = {}
): Promise<void> {
  await logAuditService(tenantId, action, entity, metadata);
}
