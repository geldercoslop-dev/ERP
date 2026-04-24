import * as db from "../db/index.js";
/**
 * Auditoria persistente (audit_log) alinhada ao padrão já usado em vendedores/pedidos.
 */
export async function auditEntityChange(ctx, tenantId, action, entity, entityId, payload) {
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
