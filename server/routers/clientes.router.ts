// --- Dependências externas ---
import { z } from "zod";
import { TRPCError } from "@trpc/server";

// --- Core ---
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { assertOwnership } from "../_core/ownership";
import { requireTenant } from "../_core/tenant";
import { resolveServiceActor } from "../_core/service-actor";

// --- DB e serviços ---
import * as clientesService from "../services/clientes.service";
import { validatePaginationParams, createPaginationMetadata } from "../utils/pagination";
import { memoryCache, cacheKeys, withCache } from "../cache/simple-memory-cache";

/** Retorna o vendedor do contexto (ctx.vendedor quando token "v:", senão busca por user). */
async function getVendedorFromContext(ctx: { user: { id: number; role: string } | null; vendedor?: Record<string, unknown> | null; tenantId?: number | null }) {
  if (ctx.vendedor) return ctx.vendedor;
  if (!ctx.user || ctx.user.role === "admin") return null;
  const tenantId = ctx.tenantId;
  if (!tenantId) return null;
  const usersService = await import("../services/users.service");
  return (await usersService.getVendedorById(ctx.user.id, tenantId)) ?? null;
}

export const clientesRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().min(1).optional(),
      pageSize: z.number().min(1).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const { page, pageSize } = validatePaginationParams(input?.page, input?.pageSize);
      
      const cacheKey = cacheKeys.clientes({ 
        page, 
        pageSize, 
        role: ctx.user.role,
        vendedorId: ctx.user.role === "admin" ? undefined : (await getVendedorFromContext(ctx))?.id
      });
      
      return await withCache(
        () => cacheKey,
        async () => {
          const tenantId = await requireTenant(ctx);
          let items: Record<string, unknown>[];
          let total: number;

          const actor = await resolveServiceActor(ctx);
          const result = await clientesService.listClientes(tenantId, actor, {
            page,
            pageSize,
          });
          
          items = result.items;
          total = result.total;
          
          const metadata = createPaginationMetadata(page, pageSize, total);
          
          return {
            items,
            ...metadata,
          };
        },
        30000
      )();
    }),
  
  search: protectedProcedure
    .input(z.object({ term: z.string() }))
    .query(async ({ input, ctx }) => {
      const tenantId = await requireTenant(ctx);
      const actor = await resolveServiceActor(ctx);
      const { items } = await clientesService.listClientes(tenantId, actor, {
        busca: input.term,
        pageSize: 50,
      });
      return items;
    }),
  
  create: adminProcedure
    .input(z.object({
      nome: z.string().min(1, "Informe o nome"),
      telefone: z.string().min(1, "Informe o telefone"),
      telefoneRecado: z.string().optional(),
      cpf: z.string().optional(),
      cep: z.string().optional(),
      rua: z.string().optional(),
      numero: z.string().optional(),
      bairro: z.string().optional(),
      cidade: z.string().optional(),
      uf: z.string().optional(),
      referencia: z.string().optional(),
      condominio: z.string().optional(),
      bloco: z.string().optional(),
      apartamento: z.string().optional(),
      vendedorIdPrincipal: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = await requireTenant(ctx);
      const vendedorId = ctx.user.role === "admin"
        ? input.vendedorIdPrincipal
        : (await getVendedorFromContext(ctx))?.id as number;
      return await clientesService.createCliente(tenantId, { ...input, vendedorIdPrincipal: vendedorId });
    }),

  buscaGlobal: protectedProcedure
    .input(z.object({ term: z.string(), limit: z.number().min(1).max(100).optional() }))
    .query(async ({ input, ctx }) => {
      const tenantId = await requireTenant(ctx);
      const actor = {
        id: ctx.user.id,
        role: ctx.user.role === 'admin' ? 'admin' : 'vendedor' as 'admin' | 'vendedor',
        vendedorId: ctx.user.id
      };
      const { items } = await clientesService.listClientes(tenantId, actor, {
        busca: input.term,
        pageSize: input.limit ?? 50,
      });
      return items;
    }),

  getHistorico: protectedProcedure
    .input(z.object({ clienteId: z.number().int().positive(), limit: z.number().int().min(1).max(100).optional() }))
    .query(async ({ input, ctx }) => {
      const tenantId = await requireTenant(ctx);
      await assertOwnership(ctx, "cliente", input.clienteId);
      const db = await import("../db");
      const db_conn = await db.getDb();
      if (!db_conn) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Banco indisponível." });
      const limit = input.limit ?? 20;
      return await db_conn
        .select({
          id: db.pedidos.id,
          numero: db.pedidos.numero,
          total: db.pedidos.total,
          status: db.pedidos.status,
          createdAt: db.pedidos.createdAt,
          dataEntrega: db.pedidos.dataEntrega,
        })
        .from(db.pedidos)
        .where(db.eq(db.pedidos.clienteId, input.clienteId))
        .orderBy(db.desc(db.pedidos.createdAt))
        .limit(limit) ?? [];
    }),

  getVendedorPrincipal: protectedProcedure
    .input(z.object({ clienteId: z.number() }))
    .query(async ({ input, ctx }) => {
      const tenantId = await requireTenant(ctx);
      return await clientesService.getVendedorPrincipalDoCliente(tenantId, input.clienteId) ?? null;
    }),

  vinculate: protectedProcedure
    .input(z.object({ clienteId: z.number(), tipo: z.enum(["PRINCIPAL", "SECUNDARIO"]).optional() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = await requireTenant(ctx);
      const vendedor = await getVendedorFromContext(ctx) as { id: number } | null;
      if (!vendedor) throw new TRPCError({ code: "BAD_REQUEST", message: "Vendedor não identificado." });
      await clientesService.associarClienteVendedor(tenantId, input.clienteId, vendedor.id as number, input.tipo === "PRINCIPAL");
      return { ok: true };
    }),
  
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      nome: z.string().min(1, "Informe o nome").optional(),
      telefone: z.string().min(1, "Informe o telefone").optional(),
      telefoneRecado: z.string().optional(),
      cpf: z.string().optional(),
      cep: z.string().optional(),
      rua: z.string().optional(),
      numero: z.string().optional(),
      bairro: z.string().optional(),
      cidade: z.string().optional(),
      uf: z.string().optional(),
      referencia: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = await requireTenant(ctx);
      await assertOwnership(ctx, "cliente", input.id);
      const { id, ...data } = input;
      return await clientesService.updateCliente(tenantId, id, data);
    }),
  
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = await requireTenant(ctx);
      return await clientesService.deleteCliente(tenantId, input.id);
    }),
});
