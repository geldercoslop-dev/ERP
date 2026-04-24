/**
 * Funções específicas do LEO para ServiceActor
 * Extraídas do core para isolamento semântico
 */
import { ValidationError } from "../../_core/errors/typed-errors.js";
/** Papel string usado em permissões de tools ("admin" | "vendedor"). */
export function leoRoleFromActor(actor) {
    return actor.role === "admin" ? "admin" : "vendedor";
}
/**
 * Monta ServiceActor a partir do contexto já preenchido pelo ActionExecutor.
 * @throws se contexto incompleto para escopo vendedor
 */
export function serviceActorFromLeoExecutionContext(ctx) {
    const role = (ctx.userRole || "").toLowerCase();
    if (role === "admin") {
        return { role: "admin" };
    }
    const vid = ctx.vendedorId;
    if (!vid || !Number.isInteger(vid) || vid <= 0) {
        throw new ValidationError("Contexto LEO incompleto: userRole/vendedorId obrigatórios para vendedor");
    }
    return { role: "vendedor", vendedorId: vid };
}
/**
 * Actor a partir do contexto runtime do LEO (ações/consultas).
 * @throws se não-admin sem vendedorId válido
 */
export function actorFromLeoRuntimeContext(ctx) {
    const r = (ctx.usuario?.role || "").toLowerCase();
    if (r === "admin") {
        const ADMIN_ACTOR = { role: "admin" };
        return ADMIN_ACTOR;
    }
    const vid = ctx.usuario?.vendedorId;
    if (vid != null && Number.isInteger(vid) && vid > 0) {
        return { role: "vendedor", vendedorId: vid };
    }
    throw new ValidationError("Contexto LEO incompleto: vendedorId obrigatório para consulta financeira como não-admin");
}
