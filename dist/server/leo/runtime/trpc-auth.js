/**
 * Roles LEO para autorização fina (admin = users.role admin; operador = vendedor autenticado).
 * Extraídos do core para isolamento semântico
 */
import { UNAUTHED_ERR_MSG } from "../../../shared/const.js";
import { TRPCError } from "@trpc/server";
import { initTRPC } from "@trpc/server";
function ctxHasLeoRole(ctx, role) {
    if (!ctx.user)
        return false;
    if (role === "admin") {
        return ctx.user.role === "admin";
    }
    return ctx.user.role !== "admin" && ctx.vendedor != null;
}
/**
 * Middleware tRPC: exige pelo menos uma das roles permitidas.
 * - admin: `ctx.user.role === "admin"`
 * - operador: sessão vendedor (`ctx.vendedor`) com user não-admin
 */
export function requireRole(...allowed) {
    const t = initTRPC.context().create({});
    return t.middleware(async (opts) => {
        const { ctx, next } = opts;
        if (!ctx.user) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
        }
        const ok = allowed.some((r) => ctxHasLeoRole(ctx, r));
        if (!ok) {
            throw new TRPCError({
                code: "FORBIDDEN",
                message: "Sem permissão para esta ação.",
            });
        }
        return next({ ctx });
    });
}
