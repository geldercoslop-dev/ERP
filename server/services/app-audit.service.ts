/**
 * @audit-leo-specific-service
 * 
 * SERVIÇO DE AUDIT ESPECÍFICO PARA LEO
 * 
 * PAPEL:
 * - Auditoria de ações sintéticas LEO
 * - Delega para audit-service.ts (serviço oficial)
 * 
 * REGRA DE ARQUITETURA:
 * Este é um serviço ESPECÍFICO para LEO, não o serviço oficial de auditoria.
 * 
 * Fluxo:
 * app-audit.service.ts → audit-service.ts (oficial)
 * 
 * Motivo:
 * - Payload específico LEO
 * - Caso de uso específico
 */
import { insertAuditLog } from "./audit-service.js";

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
