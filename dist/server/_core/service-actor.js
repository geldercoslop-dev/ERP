import * as db from "../db/index.js";
import { ValidationError, InfrastructureError } from "./errors/typed-errors.js";
/** Ator administrativo (visão completa do tenant). */
export const ADMIN_ACTOR = { role: "admin" };
export function assertVendedorActor(actor) {
    if (actor.role !== "vendedor")
        return;
    if (!actor.vendedorId || !Number.isInteger(actor.vendedorId) || actor.vendedorId <= 0) {
        throw new ValidationError("vendedorId obrigatório e válido para papel vendedor");
    }
}
/**
 * Resolve vendedor a partir do contexto tRPC (mesma regra que routers: ctx.vendedor → userId → id legado).
 * `userId` no ator é sempre o `users.id` dono da carteira (alinha a `clientes.userId`), não o id da linha em `vendedores`.
 */
export async function resolveServiceActor(ctx) {
    if (!ctx.user) {
        throw new ValidationError("Usuário não autenticado");
    }
    if (ctx.user.role === "admin") {
        return { role: "admin", userId: ctx.user.id };
    }
    if (!ctx.tenantId || ctx.tenantId <= 0) {
        throw new ValidationError("tenantId obrigatório para resolver actor de serviço");
    }
    const tenantId = String(ctx.tenantId);
    const v = ctx.vendedor ??
        (await db.getVendedorByUserId(ctx.user.id)) ??
        (await db.getVendedorById(ctx.user.id));
    if (!v) {
        throw new InfrastructureError("Não foi possível resolver o vendedor para este usuário");
    }
    let ownerUserId;
    if (v.userId != null && v.userId > 0) {
        ownerUserId = v.userId;
    }
    else if (ctx.session?.tokenKind === "user") {
        ownerUserId = ctx.user.id;
    }
    if (ownerUserId == null || ownerUserId <= 0) {
        throw new InfrastructureError("Vendedor sem user_id vinculado para ownership de cliente");
    }
    return { role: "vendedor", userId: ownerUserId, vendedorId: v.id };
}
/** Escopo financeiro: null = admin (sem filtro por vendedor); número = obrigatório em queries. */
export function financeScopeVendedorId(actor) {
    if (actor.role === "admin")
        return null;
    assertVendedorActor(actor);
    return actor.vendedorId;
}
