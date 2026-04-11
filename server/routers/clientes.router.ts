// --- Dependências externas ---
import { z } from "zod";
import { TRPCError } from "@trpc/server";

// --- Core ---
import { protectedProcedure, adminProcedure, router } from "../_core/trpc.js";
import { assertOwnership } from "../_core/ownership.js";
import { assertTenantId } from "../_core/errors/assertions.js";
import { resolveServiceActor } from "../_core/service-actor.js";

// --- DB e serviços ---
import * as clientesService from "../services/clientes.service.js";
import { validatePaginationParams, createPaginationMetadata } from "../utils/pagination.js";
import { memoryCache, cacheKeys, withCache } from "../cache/simple-memory-cache.js";

/** Retorna o vendedor do contexto (ctx.vendedor quando token "v:", senão busca por user). */
async function getVendedorFromContext(ctx: { user: { id: number; role: string } | null; vendedor?: Record<string, unknown> | null; tenantId?: number | null }) {
  if (ctx.vendedor) return ctx.vendedor;
  if (!ctx.user || ctx.user.role === "admin") return null;
  const tenantId = ctx.tenantId;
  assertTenantId(tenantId);
  const usersService = await import("../services/users.service.js");
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
          const tenantId = ctx.tenantId;
          assertTenantId(tenantId);
          let items: Record<string, unknown>[];
          let total: number;

          const actor = await resolveServiceActor(ctx);
          const result = await clientesService.listClientes(tenantId, actor, {
            page,
            pageSize,
          });

          if (!result.success || !result.data) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Falha ao listar clientes" });
          }

          items = result.data.items;
          total = result.data.total;
          
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
      const tenantId = ctx.tenantId;
          assertTenantId(tenantId);
      const actor = await resolveServiceActor(ctx);
      const result = await clientesService.listClientes(tenantId, actor, {
        busca: input.term,
        pageSize: 50,
      });
      if (!result.success || !result.data) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Falha ao buscar clientes" });
      }
      return result.data.items;
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
      const tenantId = ctx.tenantId;
          assertTenantId(tenantId);
      const vendedorId = ctx.user.role === "admin"
        ? input.vendedorIdPrincipal
        : (await getVendedorFromContext(ctx))?.id as number;
      return await clientesService.createCliente(tenantId, { 
        ...input, 
        userId: ctx.user.id,
        vendedorIdPrincipal: vendedorId 
      });
    }),

  buscaGlobal: protectedProcedure
    .input(z.object({ term: z.string(), limit: z.number().min(1).max(100).optional() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
          assertTenantId(tenantId);
      const actor = {
        id: ctx.user.id,
        role: ctx.user.role === 'admin' ? 'admin' : 'vendedor' as 'admin' | 'vendedor',
        vendedorId: ctx.user.id
      };
      const result = await clientesService.listClientes(tenantId, actor, {
        busca: input.term,
        pageSize: input.limit ?? 50,
      });
      if (!result.success || !result.data) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Falha ao buscar clientes" });
      }
      return result.data.items;
    }),

  getHistorico: protectedProcedure
    .input(z.object({ clienteId: z.number().int().positive(), limit: z.number().int().min(1).max(100).optional() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
          assertTenantId(tenantId);
      await assertOwnership(ctx, "cliente", input.clienteId);
      const actor = await resolveServiceActor(ctx);
      const result = await clientesService.getHistoricoCliente(tenantId, actor, input.clienteId, input.limit ?? 20);
      if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Falha ao buscar histórico" });
      return result.data ?? [];
    }),

  getVendedorPrincipal: protectedProcedure
    .input(z.object({ clienteId: z.number() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
          assertTenantId(tenantId);
      return await clientesService.getVendedorPrincipalDoCliente(tenantId, input.clienteId) ?? null;
    }),

  vinculate: protectedProcedure
    .input(z.object({ clienteId: z.number(), tipo: z.enum(["PRINCIPAL", "SECUNDARIO"]).optional() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
          assertTenantId(tenantId);
      const vendedor = await getVendedorFromContext(ctx) as { id: number } | null;
      if (!vendedor) throw new TRPCError({ code: "BAD_REQUEST", message: "Vendedor não identificado." });
      await clientesService.associarClienteVendedor(tenantId, input.clienteId, vendedor.id as number, input.tipo === "PRINCIPAL");
      return { success: true };
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
      const tenantId = ctx.tenantId;
          assertTenantId(tenantId);
      const actor = await resolveServiceActor(ctx);
      const { id, ...data } = input;
      return await clientesService.updateCliente(tenantId, actor, id, data);
    }),
  
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
          assertTenantId(tenantId);
      const actor = await resolveServiceActor(ctx);
      return await clientesService.deleteCliente(tenantId, actor, input.id);
    }),
});
