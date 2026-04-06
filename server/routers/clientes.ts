import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "../_core/trpc.js";
import { assertOwnership } from "../_core/ownership.js";
import { enforceAuth, validateOwnership, requireTenant } from "../_core/tenant.js";
import type { Cliente, NewCliente } from "../../shared/types/index.js";
import { createSuccessResponse, createErrorResponse, createPaginatedResponse } from "../_core/api-response.js";
import * as clientesService from "../services/cached-clientes.service.js";
import { resolveServiceActor } from "../_core/service-actor.js";
import { auditEntityChange } from "../_core/domain-audit.js";

// Schema de validação
const createClienteSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  telefone: z.string().min(1, "Telefone é obrigatório"),
  email: z.string().email().optional(),
  cidade: z.string().optional(),
  endereco: z.string().optional(),
  cpfCnpj: z.string().optional(),
});

const updateClienteSchema = createClienteSchema.partial().extend({
  id: z.number(),
});

// Router de clientes
export const clientesRouter = router({
  // Listar clientes (PROTEGIDO)
  list: protectedProcedure
    .input(z.object({
      busca: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const tenantId = await requireTenant(ctx);
        const actor = await resolveServiceActor(ctx);
        const result = await clientesService.listClientes(tenantId, actor, {
          page: Math.floor(input.offset / input.limit) + 1,
          pageSize: input.limit,
          busca: input.busca
        });
        if (!result.success || !result.data) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Erro ao buscar clientes" });
        }
        const { items, total } = result.data;
        
        const page = Math.floor(input.offset / input.limit) + 1;
        return createPaginatedResponse(
          items,
          total,
          page,
          input.limit,
          "Clientes listados com sucesso"
        );
      } catch (error) {
        console.error("Erro ao listar clientes:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao buscar clientes",
        });
      }
    }),

  // Criar cliente
  create: protectedProcedure
    .input(createClienteSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const tenantId = await requireTenant(ctx);
        const actor = await resolveServiceActor(ctx);
        if (actor.userId == null || actor.userId <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "userId do ator ausente para criar cliente." });
        }
        const cliente = await clientesService.createCliente(tenantId, { ...input, userId: actor.userId });
        return createSuccessResponse(cliente, "Cliente criado com sucesso");
      } catch (error) {
        console.error("Erro ao criar cliente:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao criar cliente",
        });
      }
    }),

  // Atualizar cliente
  update: protectedProcedure
    .input(updateClienteSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const tenantId = await requireTenant(ctx);
        const actor = await resolveServiceActor(ctx);
        const existing = await clientesService.getClienteById(tenantId, actor, input.id);
        if (!existing || (typeof existing === "object" && "success" in existing && !existing.success)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Cliente não encontrado",
          });
        }

        const cliente = await clientesService.updateCliente(tenantId, actor, input.id, input);
        return {
          success: true,
          data: cliente,
        };
      } catch (error) {
        console.error("Erro ao atualizar cliente:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao atualizar cliente",
        });
      }
    }),

  // Excluir cliente
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const tenantId = await requireTenant(ctx);
        const actor = await resolveServiceActor(ctx);
        const existing = await clientesService.getClienteById(tenantId, actor, input.id);
        if (!existing || (typeof existing === "object" && "success" in existing && !existing.success)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Cliente não encontrado",
          });
        }

        await clientesService.deleteCliente(tenantId, actor, input.id);
        await auditEntityChange(ctx, tenantId, "delete", "cliente", input.id, { id: input.id });
        return {
          success: true,
          message: "Cliente excluído com sucesso",
        };
      } catch (error) {
        console.error("Erro ao excluir cliente:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao excluir cliente",
        });
      }
    }),

  // Buscar por ID (PROTEGIDO)
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      try {
        const tenantId = await requireTenant(ctx);
        const actor = {
          id: ctx.user?.id || 0,
          role: ctx.user?.role === 'admin' ? 'admin' : 'vendedor' as 'admin' | 'vendedor',
          vendedorId: ctx.user?.id || 0
        };
        const existing = await clientesService.getClienteById(tenantId, actor, input.id);
        if (!existing || (typeof existing === "object" && "success" in existing && !existing.success)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Cliente não encontrado",
          });
        }
        return {
          success: true,
          data: existing,
        };
      } catch (error) {
        console.error("Erro ao buscar cliente:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao buscar cliente",
        });
      }
    }),

  // Histórico de compras (PROTEGIDO)
  getHistorico: protectedProcedure
    .input(z.object({
      clienteId: z.number(),
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const tenantId = await requireTenant(ctx);
        const actor = await resolveServiceActor(ctx);
        const historico = await clientesService.getHistoricoCliente(tenantId, actor, input.clienteId, input.limit);
        return {
          success: true,
          data: historico,
        };
      } catch (error) {
        console.error("Erro ao buscar histórico:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao buscar histórico do cliente",
        });
      }
    }),
});
