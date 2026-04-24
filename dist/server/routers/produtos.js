import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc.js";
import { createSuccessResponse, createPaginatedResponse } from "../_core/api-response.js";
import { requireTenant } from "../_core/tenant.js";
import * as inventoryService from "../services/cached-inventory.service.js";
// Schema de validação
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
});
const updateProdutoSchema = createProdutoSchema.partial().extend({
    id: z.number(),
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
        .query(async ({ input, ctx }) => {
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
            return createPaginatedResponse(items, total, page, input.limit, "Produtos listados com sucesso");
        }
        catch (error) {
            console.error("Erro ao listar produtos:", error);
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
            const payload = {
                ...input,
                tenantId,
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
            const produto = await inventoryService.createProduto(tenantId, payload);
            return createSuccessResponse(produto, "Produto criado com sucesso");
        }
        catch (error) {
            console.error("Erro ao criar produto:", error);
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
            const updatePayload = {
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
            const produto = await inventoryService.updateProduto(tenantId, input.id, updatePayload);
            return {
                success: true,
                data: produto,
            };
        }
        catch (error) {
            console.error("Erro ao atualizar produto:", error);
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
        }
        catch (error) {
            console.error("Erro ao excluir produto:", error);
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
        }
        catch (error) {
            console.error("Erro ao buscar produto:", error);
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
                    usuario: ctx.user?.name || "Sistema",
                    motivo: input.motivo || "Ajuste manual",
                }
            });
            return {
                success: true,
                data: produto,
            };
        }
        catch (error) {
            console.error("Erro ao atualizar estoque:", error);
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
        }
        catch (error) {
            console.error("Erro ao buscar estoque baixo:", error);
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Erro ao buscar estoque baixo",
            });
        }
    }),
});
