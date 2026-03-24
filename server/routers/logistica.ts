import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import * as db from "../db/index";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import type { Carga, NewCarga, PedidoCarga, NewPedidoCarga } from "@shared/types";
import { requireTenant } from "../_core/tenant";
import * as logisticaService from "../services/logistica.service";

// Schema de validação
const createCargaSchema = z.object({
  cidadeRota: z.string().optional(),
  dataEntrega: z.string().optional(),
  observacoes: z.string().optional(),
  pedidosIds: z.array(z.number()).optional(),
});

const addPedidoCargaSchema = z.object({
  cargaId: z.number(),
  pedidoId: z.number(),
  ordemEntrega: z.number().min(1),
  horarioPrevisto: z.string().optional(),
  observacao: z.string().optional(),
});

const updatePedidoCargaSchema = z.object({
  pedidoCargaId: z.number(),
  ordemEntrega: z.number().min(1).optional(),
  horarioPrevisto: z.string().optional(),
  horarioReal: z.string().optional(),
  observacao: z.string().optional(),
  entregue: z.boolean().nullable().optional(),
});

// Router de logística
export const logisticaRouter = router({
  // Listar cargas
  listCargas: publicProcedure
    .input(z.object({
      status: z.enum(["ABERTA", "EM_ROTA", "ENTREGUE"]).optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const tenantId = await requireTenant(ctx);
        const { items, total } = await logisticaService.listCargas(tenantId, {
          status: input.status,
          dataInicio: input.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input.dataFim ? new Date(input.dataFim) : undefined,
          page: Math.floor(input.offset / input.limit) + 1,
          pageSize: input.limit
        });
        
        return {
          success: true,
          data: items,
          total,
          page: Math.floor(input.offset / input.limit) + 1,
          pageSize: input.limit
        };
      } catch (error) {
        console.error("Erro ao listar cargas:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao buscar cargas",
        });
      }
    }),

  // Criar carga
  createCarga: protectedProcedure
    .input(createCargaSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const tenantId = await requireTenant(ctx);
        const numero = Math.floor(Math.random() * 1000000);
        const carga = await logisticaService.createCarga(tenantId, {
          numero,
          cidadeRota: input.cidadeRota,
          dataEntrega: input.dataEntrega ? new Date(input.dataEntrega) : new Date(),
          status: 'ABERTA',
        });
        
        // Associar pedidos à carga
        if (input.pedidosIds && input.pedidosIds.length > 0) {
          await logisticaService.addPedidosToCarga(tenantId, carga.id, input.pedidosIds);
        }
        
        return {
          success: true,
          data: carga,
        };
      } catch (error) {
        console.error("Erro ao criar carga:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao criar carga",
        });
      }
    }),

  // Buscar carga por ID com pedidos
  getCargaById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      try {
        const tenantId = await requireTenant(ctx);
        const carga = await logisticaService.getCargaById(tenantId, input.id);
        if (!carga) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Carga não encontrada",
          });
        }
        
        return {
          success: true,
          data: carga,
        };
      } catch (error) {
        console.error("Erro ao buscar carga:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao buscar carga",
        });
      }
    }),

  // Adicionar pedido à carga
  addPedidoCarga: protectedProcedure
    .input(addPedidoCargaSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const tenantId = await requireTenant(ctx);
        await logisticaService.addPedidosToCarga(tenantId, input.cargaId, [input.pedidoId]);
        
        return {
          success: true,
          message: "Pedido adicionado à carga com sucesso",
        };
      } catch (error) {
        console.error("Erro ao adicionar pedido à carga:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao adicionar pedido à carga",
        });
      }
    }),

  // Atualizar pedido da carga
  updatePedidoCarga: protectedProcedure
    .input(updatePedidoCargaSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const tenantId = await requireTenant(ctx);
        const pedidoCarga = await logisticaService.updatePedidoCarga(tenantId, input.pedidoCargaId, {
          ordemEntrega: input.ordemEntrega,
          horarioPrevisto: input.horarioPrevisto,
          horarioReal: input.horarioReal || null,
          observacao: input.observacao,
          entregue: input.entregue ?? null,
        });
        
        return {
          success: true,
          data: pedidoCarga,
        };
      } catch (error) {
        console.error("Erro ao atualizar pedido da carga:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao atualizar pedido da carga",
        });
      }
    }),

  // Remover pedido da carga
  removePedidoCarga: protectedProcedure
    .input(z.object({
      cargaId: z.number(),
      pedidoId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const tenantId = await requireTenant(ctx);
        await logisticaService.removePedidosFromCarga(tenantId, input.cargaId, [input.pedidoId]);
        
        return {
          success: true,
          message: "Pedido removido da carga com sucesso",
        };
      } catch (error) {
        console.error("Erro ao remover pedido da carga:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao remover pedido da carga",
        });
      }
    }),

  // Atualizar status da carga
  updateCargaStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["ABERTA", "EM_ROTA", "ENTREGUE"]),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const tenantId = await requireTenant(ctx);
        const carga = await logisticaService.updateCargaStatus(tenantId, {
          id: input.id,
          status: input.status,
        });
        
        return {
          success: true,
          data: carga,
        };
      } catch (error) {
        console.error("Erro ao atualizar status da carga:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao atualizar status da carga",
        });
      }
    }),

  // Gerar relatório de entrega
  gerarRelatorioEntrega: publicProcedure
    .input(z.object({ cargaId: z.number() }))
    .query(async ({ input, ctx }) => {
      try {
        const tenantId = await requireTenant(ctx);
        const carga = await logisticaService.getCargaById(tenantId, input.cargaId);
        if (!carga) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Carga não encontrada",
          });
        }
        
        // Buscar pedidos da carga usando o serviço (TODO: Criar getPedidosCarga no serviço se não existir)
        const dbConn = await db.getDb();
        if (!dbConn) throw new Error("Database not available");

        const pedidosCargaRows = await dbConn
          .select({
            pedido: db.pedidos,
            pedidoCarga: db.pedidosCarga,
          })
          .from(db.pedidosCarga)
          .innerJoin(db.pedidos, eq(db.pedidos.id, db.pedidosCarga.pedidoId))
          .innerJoin(db.cargas, eq(db.cargas.id, db.pedidosCarga.cargaId))
          .where(and(eq(db.pedidosCarga.cargaId, input.cargaId), eq(db.cargas.tenantId, tenantId)));
        
        // Buscar dados completos dos pedidos
        const relatorio = pedidosCargaRows.map(row => ({
          pedido: row.pedido.numero,
          cliente: row.pedido.clienteNome,
          valor: row.pedido.total,
          bairro: row.pedido.clienteBairro || "N/A",
          entregue: row.pedidoCarga.entregue,
        }));
        
        return {
          success: true,
          data: {
            carga: {
              numero: (carga as any).numero,
              cidadeRota: (carga as any).cidadeRota,
              dataEntrega: (carga as any).dataEntrega,
              status: (carga as any).status,
            },
            pedidos: relatorio,
          },
        };
      } catch (error) {
        console.error("Erro ao gerar relatório de entrega:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao gerar relatório de entrega",
        });
      }
    }),

  // Finalizar carga
  finalizarCarga: protectedProcedure
    .input(z.object({
      id: z.number(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const tenantId = await requireTenant(ctx);
        // Atualizar status da carga via serviço
        await logisticaService.finalizarCarga(tenantId, input.id);
        
        return {
          success: true,
          message: "Carga finalizada com sucesso",
        };
      } catch (error) {
        console.error("Erro ao finalizar carga:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao finalizar carga",
        });
      }
    }),
});
