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
