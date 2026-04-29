/**
 * @audit-wrapper-service
 * 
 * WRAPPER SIMPLIFICADO DE AUDIT
 * 
 * PAPEL:
 * - Interface simplificada para audit de domínio
 * - Delegar diretamente para audit-log.service.ts
 * 
 * REGRA DE ARQUITETURA:
 * Este é um WRAPPER, não o serviço oficial de escrita.
 * 
 * Fluxo:
 * domain-audit.ts → audit-log.service.ts (oficial)
 * 
 * Motivo:
 * - Interface simplificada para routers
 * - Abstração de complexidade
 */
import type { AuditAction } from "../db/core.js";
import { logAuditAction } from "../services/audit-log.service.js";

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
  await logAuditAction(
    action,
    entity,
    payload || {},
    {
      tenantId,
      actorUserId: u?.role === "admin" ? u.id : undefined,
      actorVendedorId: u && u.role !== "admin" ? u.id : undefined,
      entityId: entityId != null ? String(entityId) : undefined,
    }
  );
}
