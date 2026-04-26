/**
 * @audit-leo-specific-service
 * 
 * SERVIÇO DE AUDIT ESPECÍFICO PARA LEO
 * 
 * PAPEL:
 * - Auditoria de ações sintéticas LEO
 * - Delega para db.insertAuditLog (que deve delegar para audit-log.service.ts)
 * 
 * REGRA DE ARQUITETURA:
 * Este é um serviço ESPECÍFICO para LEO, não o serviço oficial.
 * 
 * Fluxo:
 * app-audit.service.ts → db.insertAuditLog → audit-log.service.ts (oficial)
 * 
 * Motivo:
 * - Payload específico LEO
 * - Caso de uso específico
 * 
 * TODO (fase futura):
 * Delegar diretamente para audit-log.service.ts
 * Remover dependência de db.insertAuditLog
 */
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
