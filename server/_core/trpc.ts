import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import type { TrpcContext } from "./context";
import { requireTenant } from "./tenant";
import { buildTrpcInvocationContext, runWithServiceInvocationAsync } from "./service-entry-guard";

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
