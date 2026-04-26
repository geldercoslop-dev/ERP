/**
 * @audit-wrapper-service
 * 
 * WRAPPER SIMPLIFICADO DE AUDIT
 * 
 * PAPEL:
 * - Interface simplificada para audit de domínio
 * - Delega para db.insertAuditLog (que deve delegar para audit-log.service.ts)
 * 
 * REGRA DE ARQUITETURA:
 * Este é um WRAPPER, não o serviço oficial de escrita.
 * 
 * Fluxo:
 * domain-audit.ts → db.insertAuditLog → audit-log.service.ts (oficial)
 * 
 * Motivo:
 * - Interface simplificada para routers
 * - Abstração de complexidade
 * 
 * TODO (fase futura):
 * Delegar diretamente para audit-log.service.ts
 * Remover dependência de db.insertAuditLog
 */
import type { AuditAction } from "../db/core.js";
import * as db from "../db/index.js";

type RouterCtxUser = { id: number; role: string } | null | undefined;

/**
 * Auditoria persistente (audit_log) alinhada ao padrão já usado em vendedores/pedidos.
 */
export async function auditEntityChange(
  ctx: { user: RouterCtxUser },
  tenantId: number,
  action: AuditAction,
  entity: string,
  entityId: string | number | null | undefined,
  payload?: Record<string, unknown>
): Promise<void> {
  const u = ctx.user;
  await db.insertAuditLog({
    tenantId,
    actorUserId: u?.role === "admin" ? u.id : null,
    actorVendedorId: u && u.role !== "admin" ? u.id : null,
    action,
    entity,
    entityId: entityId ?? null,
    payloadJson: payload ? JSON.stringify(payload) : null,
  });
}
