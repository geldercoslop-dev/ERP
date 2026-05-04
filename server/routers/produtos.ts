import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc.js";
import type { Produto, NewProduto } from "../../shared/types/index.js";
import { createSuccessResponse, createErrorResponse, createPaginatedResponse } from "../_core/api-response.js";
import { requireTenant } from "../_core/tenant.js";
import * as inventoryService from "../services/cached-inventory.service.js";
import { calculateProdutoInitialStock } from "../services/inventory.service.js";
import type { ApiResponse } from "../_core/api-response.js";
import { createLogger } from "../infra/structured-logger.js";
import * as skuService from "../services/sku.service.js";
import { ValidationError } from "../_core/errors/typed-errors.js";

const logger = createLogger("produtos-router");

// Schema de validação
const corItemSchema = z.object({
  estoque: z.number().min(0).default(0),
});

const variacaoItemSchema = z.object({
  estoque: z.number().min(0).default(0),
});

const createProdutoSchema = z.object({
  descricao: z.string().min(1, "Descrição é obrigatória"),
  marca: z.string().optional(),
  fornecedor: z.string().optional(),
  categoria: z.string().optional(),
  custo: z.number().min(0, "Custo deve ser positivo"),
  descontoFabrica: z.number().min(0).max(100).default(0),
  ipi: z.number().min(0).max(100).default(0),
  frete: z.number().min(0).default(0),
  montagem: z.number().min(0).default(0),
  lucro: z.number().min(0).default(0),
  comissao: z.number().min(0).max(100).default(0),
  jurosCartao: z.number().min(0).max(100).default(0),
  valorVenda: z.number().min(0, "Valor de venda deve ser positivo"),
  prazoGarantia: z.number().min(0).default(90),
  grupoId: z.number().optional(),
  estoque: z.number().min(0).default(0),
  ativo: z.boolean().default(true),
  bloquearEstoqueNegativo: z.boolean().default(true),
  cores: z.array(corItemSchema).optional(),
  variacoes: z.array(variacaoItemSchema).optional(),
});

const updateProdutoSchema = createProdutoSchema.partial().extend({
  id: z.number(),
});

// Schemas de validação para SKU
const createSkuSchema = z.object({
  produtoId: z.number().int().positive(),
  corId: z.number().int().positive().nullable().optional(),
  descricaoSku: z.string().min(1, "Descrição do SKU é obrigatória"),
  skuCode: z.string().nullable().optional(),
  tamanho: z.string().nullable().optional(),
  temEspelho: z.boolean().default(false),
  atributosJson: z.string().nullable().optional(),
  estoque: z.number().int().default(0),
  bloquearEstoqueNegativo: z.boolean().default(true),
  acrescimoCusto: z.union([z.number(), z.string()]).optional(),
  valorVenda: z.union([z.number(), z.string()]).nullable().optional(),
  ativo: z.boolean().default(true),
});

const updateSkuSchema = z.object({
  skuId: z.number().int().positive(),
  corId: z.number().int().positive().nullable().optional(),
  descricaoSku: z.string().min(1).optional(),
  skuCode: z.string().nullable().optional(),
  tamanho: z.string().nullable().optional(),
  temEspelho: z.boolean().optional(),
  atributosJson: z.string().nullable().optional(),
  acrescimoCusto: z.union([z.number(), z.string()]).optional(),
  valorVenda: z.union([z.number(), z.string()]).nullable().optional(),
  ativo: z.boolean().optional(),
  bloquearEstoqueNegativo: z.boolean().optional(),
});

const setSkuEstoqueSchema = z.object({
  skuId: z.number().int().positive(),
  estoque: z.number().int(),
  motivo: z.string().optional(),
});

// Router de produtos
export const produtosRouter = router({
  // Listar produtos (PROTEGIDO)
  list: protectedProcedure
    .input(z.object({
      busca: z.string().optional(),
      ativo: z.boolean().optional(),
      categoria: z.string().optional(),
      marca: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input, ctx }): Promise<ApiResponse<Awaited<ReturnType<typeof inventoryService.getAllProdutosComPrecoVigente>>>> => {
      try {
        const tenantId = await requireTenant(ctx);
        const { items, total } = await inventoryService.getProdutosComPrecoVigentePaged(tenantId, {
          refDate: new Date(),
          page: Math.floor(input.offset / input.limit) + 1,
          pageSize: input.limit,
          query: input.busca,
          ativo: input.ativo,
          categoria: input.categoria,
          marca: input.marca
        });
        
        const page = Math.floor(input.offset / input.limit) + 1;
        return createPaginatedResponse(
          items,
          total,
          page,
          input.limit,
          "Produtos listados com sucesso"
        );
      } catch (error) {
        logger.error("Erro ao listar produtos", error instanceof Error ? error : new Error(String(error)), { operation: "list" });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao buscar produtos",
        });
      }
    }),

  // Criar produto
  create: protectedProcedure
    .input(createProdutoSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const tenantId = await requireTenant(ctx);
        const estoqueTotal = calculateProdutoInitialStock(input);
        const payload: Record<string, unknown> = {
          ...input,
          tenantId,
          estoque: estoqueTotal,
          custo: input.custo?.toString(),
          descontoFabrica: input.descontoFabrica?.toString(),
          ipi: input.ipi?.toString(),
          frete: input.frete?.toString(),
          montagem: input.montagem?.toString(),
          lucro: input.lucro?.toString(),
          comissao: input.comissao?.toString(),
          jurosCartao: input.jurosCartao?.toString(),
          valorVenda: input.valorVenda?.toString(),
          prazoGarantia: input.prazoGarantia != null ? Number(input.prazoGarantia) : undefined
        };
        const produto = await inventoryService.createProduto(tenantId, payload as Parameters<typeof inventoryService.createProduto>[1]);
        return createSuccessResponse(produto, "Produto criado com sucesso");
      } catch (error) {
        logger.error("Erro ao criar produto", error instanceof Error ? error : new Error(String(error)), { operation: "create" });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao criar produto",
        });
      }
    }),

  // Atualizar produto
  update: protectedProcedure
    .input(updateProdutoSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const tenantId = await requireTenant(ctx);
        // Verificar se o produto existe
        const existing = await inventoryService.getProdutoById(tenantId, input.id);
        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Produto não encontrado",
          });
        }

        const updatePayload: Record<string, unknown> = {
          ...input,
          custo: input.custo?.toString(),
          descontoFabrica: input.descontoFabrica?.toString(),
          ipi: input.ipi?.toString(),
          frete: input.frete?.toString(),
          montagem: input.montagem?.toString(),
          lucro: input.lucro?.toString(),
          comissao: input.comissao?.toString(),
          jurosCartao: input.jurosCartao?.toString()
        };
        const produto = await inventoryService.updateProduto(tenantId, input.id, updatePayload as Parameters<typeof inventoryService.updateProduto>[2]);
        return {
          success: true,
          data: produto,
        };
      } catch (error) {
        logger.error("Erro ao atualizar produto", error instanceof Error ? error : new Error(String(error)), { operation: "update" });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao atualizar produto",
        });
      }
    }),

  // Excluir produto
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const tenantId = await requireTenant(ctx);
        await inventoryService.deleteProduto(tenantId, input.id);
        return createSuccessResponse(null, "Produto removido com sucesso");
      } catch (error) {
        logger.error("Erro ao excluir produto", error instanceof Error ? error : new Error(String(error)), { operation: "delete" });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao excluir produto",
        });
      }
    }),

  // Buscar por ID (PROTEGIDO)
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      try {
        const tenantId = await requireTenant(ctx);
        const produto = await inventoryService.getProdutoById(tenantId, input.id);
        if (!produto) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Produto não encontrado",
          });
        }
        return {
          success: true,
          data: produto,
        };
      } catch (error) {
        logger.error("Erro ao buscar produto", error instanceof Error ? error : new Error(String(error)), { operation: "getById" });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao buscar produto",
        });
      }
    }),

  // Atualizar estoque
  updateEstoque: protectedProcedure
    .input(z.object({
      id: z.number(),
      estoque: z.number().min(0),
      motivo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const tenantId = await requireTenant(ctx);
        const produto = await inventoryService.updateEstoqueProduto(tenantId, {
          id: input.id,
          quantidade: input.estoque,
          audit: {
            usuario: (ctx as { user?: { name?: string } }).user?.name || "Sistema",
            motivo: input.motivo || "Ajuste manual",
          }
        });
        return {
          success: true,
          data: produto,
        };
      } catch (error) {
        logger.error("Erro ao atualizar estoque", error instanceof Error ? error : new Error(String(error)), { operation: "updateEstoque" });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao atualizar estoque",
        });
      }
    }),

  // Buscar produtos com estoque baixo (PROTEGIDO)
  getEstoqueBaixo: protectedProcedure
    .input(z.object({
      limite: z.number().min(0).default(5),
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const tenantId = await requireTenant(ctx);
        const { items, total } = await inventoryService.getProdutosEstoqueBaixo(tenantId, input.limite);
        return {
          success: true,
          data: items.slice(0, input.limit),
          total: items.length,
        };
      } catch (error) {
        logger.error("Erro ao buscar estoque baixo", error instanceof Error ? error : new Error(String(error)), { operation: "getEstoqueBaixo" });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao buscar estoque baixo",
        });
      }
    }),

  // ===== SKUS (Nested procedures) =====
  skus: router({
    // Listar SKUs por produto
    listByProduto: protectedProcedure
      .input(z.object({ produtoId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        try {
          const tenantId = await requireTenant(ctx);
          const skus = await skuService.listSkusByProduto(tenantId, input.produtoId);
          return createSuccessResponse(skus, "SKUs listados com sucesso");
        } catch (error) {
          if (error instanceof ValidationError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
          }
          logger.error("Erro ao listar SKUs", error instanceof Error ? error : new Error(String(error)), { operation: "listByProduto" });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao listar SKUs" });
        }
      }),

    // Buscar SKU por ID
    getById: protectedProcedure
      .input(z.object({ skuId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        try {
          const tenantId = await requireTenant(ctx);
          const sku = await skuService.getSkuById(tenantId, input.skuId);
          if (!sku) {
            throw new TRPCError({ code: "NOT_FOUND", message: "SKU não encontrado" });
          }
          return createSuccessResponse(sku, "SKU encontrado");
        } catch (error) {
          if (error instanceof ValidationError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
          }
          logger.error("Erro ao buscar SKU", error instanceof Error ? error : new Error(String(error)), { operation: "getById" });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao buscar SKU" });
        }
      }),

    // Criar SKU
    create: protectedProcedure
      .input(createSkuSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const tenantId = await requireTenant(ctx);
          const result = await skuService.createSku(tenantId, input);
          return createSuccessResponse(result, "SKU criado com sucesso");
        } catch (error) {
          if (error instanceof ValidationError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
          }
          logger.error("Erro ao criar SKU", error instanceof Error ? error : new Error(String(error)), { operation: "create" });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao criar SKU" });
        }
      }),

    // Atualizar SKU
    update: protectedProcedure
      .input(updateSkuSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const tenantId = await requireTenant(ctx);
          const { skuId, ...updateData } = input;
          const result = await skuService.updateSku(tenantId, skuId, updateData);
          return createSuccessResponse(result, "SKU atualizado com sucesso");
        } catch (error) {
          if (error instanceof ValidationError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
          }
          logger.error("Erro ao atualizar SKU", error instanceof Error ? error : new Error(String(error)), { operation: "update" });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao atualizar SKU" });
        }
      }),

    // Ajustar estoque de SKU
    setEstoque: protectedProcedure
      .input(setSkuEstoqueSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const tenantId = await requireTenant(ctx);
          const actorUserId = ctx.user?.id;
          const actorVendedorId = ctx.vendedor?.id;
          const result = await skuService.setSkuEstoque(tenantId, input.skuId, {
            estoque: input.estoque,
            motivo: input.motivo,
            actorUserId,
            actorVendedorId,
          });
          return createSuccessResponse(result, "Estoque do SKU ajustado com sucesso");
        } catch (error) {
          if (error instanceof ValidationError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
          }
          logger.error("Erro ao ajustar estoque do SKU", error instanceof Error ? error : new Error(String(error)), { operation: "setEstoque" });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao ajustar estoque do SKU" });
        }
      }),
  }),
});
