import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "../../shared/const.js";
import { initTRPC, TRPCError } from "@trpc/server";
import type { TrpcContext } from "./context.js";
import { requireTenant } from "./tenant.js";
import { buildTrpcInvocationContext, runWithServiceInvocationAsync } from "./service-entry-guard.js";

/** Roles LEO para autorização fina (admin = users.role admin; operador = vendedor autenticado). */
export type LeoRole = "admin" | "operador";

function ctxHasLeoRole(ctx: TrpcContext, role: LeoRole): boolean {
  if (!ctx.user) return false;
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
export function requireRole(...allowed: LeoRole[]) {
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

// Sem SuperJSON: evita "Unable to transform response from server" quando
// o servidor devolve erros em JSON puro (problema conhecido tRPC v11 + superjson).
const t = initTRPC.context<TrpcContext>().create({});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  const user = ctx.user;
  const store = buildTrpcInvocationContext({ ...ctx, user });
  return runWithServiceInvocationAsync(store, async () =>
    next({
      ctx: {
        ...ctx,
        user,
      },
    })
  );
});

export const protectedProcedure = t.procedure.use(requireUser);

/** Procedure autenticada com tenant obrigatório (isolamento multi-tenant). */
export const tenantProcedure = protectedProcedure.use(
  t.middleware(async (opts) => {
    const tenantId = await requireTenant(opts.ctx);
    return opts.next({ ctx: { ...opts.ctx, tenantId } });
  })
);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
