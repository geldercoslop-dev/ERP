// --- Dependências externas ---
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
// --- Core ---
import { protectedProcedure, adminProcedure, router } from "../_core/trpc.js";
import { assertTenantId } from "../_core/errors/assertions.js";
import { withServiceGuard } from "../types/service-guard.js";
// --- Serviços ---
import * as inventoryService from "../services/inventory.service.js";
import * as promocoesService from "../services/promocoes.service.js";
import { validatePaginationParams, createPaginationMetadata } from "../utils/pagination.js";
import { cacheKeys, withCache } from "../cache/simple-memory-cache.js";
import { invalidateInventoryCachesForTenant } from "../_core/cache-invalidation.js";
// --- DB apenas para operações específicas que ainda não foram migradas ---
import * as db from "../db/index.js";
import { getInsertId } from "../db/index.js";
/** Retorna o vendedor do contexto (ctx.vendedor quando token "v:", senão busca por user). */
async function getVendedorFromContext(ctx) {
    if (ctx.vendedor)
        return ctx.vendedor;
    if (!ctx.user || ctx.user.role === "admin")
        return null;
    const tenantId = ctx.tenantId;
    assertTenantId(tenantId);
    const usersService = await import("../services/users.service.js");
    return (await usersService.getVendedorById(ctx.user.id, tenantId)) ?? null;
}
export const produtosRouter = router({
    list: protectedProcedure
        .input(z.object({
        page: z.number().min(1).optional(),
        pageSize: z.number().min(1).optional(),
    }).optional())
        .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        assertTenantId(tenantId);
        const { page, pageSize } = validatePaginationParams(input?.page, input?.pageSize);
        const cacheKey = cacheKeys.produtos({ tenantId, page, pageSize });
        return await withCache(() => cacheKey, async () => {
            return await withServiceGuard(async () => {
                const items = await inventoryService.getAllProdutosComPrecoVigente(tenantId);
                const total = Array.isArray(items) ? items.length : 0;
                const metadata = createPaginationMetadata(page, pageSize, total);
                return { items, ...metadata };
            }, {
                serviceName: 'Produtos',
                methodName: 'list',
                expectedType: 'paginated'
            });
        }, 20000)();
    }),
    getById: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        assertTenantId(tenantId);
        return await inventoryService.getProdutoById(tenantId, input.id) ?? null;
    }),
    create: adminProcedure
        .input(z.record(z.string(), z.unknown()))
        .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        assertTenantId(tenantId);
        const r = await inventoryService.createProduto(tenantId, input);
        invalidateInventoryCachesForTenant(tenantId);
        return r;
    }),
    update: adminProcedure
        .input(z.object({
        id: z.number(),
        version: z.number().optional(),
        descricao: z.string().min(1, "Descrição é obrigatória"),
        marca: z.string().optional().nullable(),
        valorVenda: z.number().min(0, "Valor de venda não pode ser negativo"),
        custo: z.number().min(0, "Custo não pode ser negativo"),
        estoque: z.preprocess((v) => (v === "" || v == null ? 0 : typeof v === "string" ? Number(v) : v), z.number().int().min(0).refine((n) => !Number.isNaN(n), { message: "Estoque inválido" })),
        prazoGarantia: z.number().int("Prazo de garantia deve ser um número inteiro").min(0, "Prazo de garantia não pode ser negativo"),
        ativo: z.boolean().optional(),
        grupoId: z.number().optional().nullable(),
    }))
        .mutation(async ({ input, ctx }) => {
        const { id, version, ...data } = input;
        const tenantId = ctx.tenantId;
        assertTenantId(tenantId);
        try {
            const patch = {
                ...data,
                custo: Number(data.custo).toFixed(2),
                valorVenda: Number(data.valorVenda).toFixed(2),
            };
            const r = await inventoryService.updateProduto(tenantId, id, patch, version);
            invalidateInventoryCachesForTenant(tenantId);
            return r;
        }
        catch (error) {
            if (error instanceof Error && error.message.includes("modificado por outro usuário")) {
                throw new TRPCError({
                    code: 'CONFLICT',
                    message: error.message
                });
            }
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: error instanceof Error ? error.message : 'Erro ao atualizar produto'
            });
        }
    }),
    delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        assertTenantId(tenantId);
        await inventoryService.deleteProduto(tenantId, input.id);
        invalidateInventoryCachesForTenant(tenantId);
        return { ok: true };
    }),
    buscar: protectedProcedure
        .input(z.object({
        query: z.string().optional(),
        page: z.number().min(1).optional(),
        pageSize: z.number().min(1).max(100).optional(),
    }))
        .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        assertTenantId(tenantId);
        const query = (input.query ?? "").trim();
        const page = input.page ?? 1;
        const pageSize = Math.min(input.pageSize ?? (query ? 50 : 50), 100);
        const { items, total } = await inventoryService.getProdutosComPrecoVigentePaged(tenantId, { refDate: new Date(), page, pageSize, query });
        return {
            produtos: items,
            total,
            page,
            pageSize,
            hasMore: (page - 1) * pageSize + items.length < total,
        };
    }),
    atualizarEstoque: adminProcedure
        .input(z.object({
        id: z.number(),
        quantidade: z.preprocess((v) => (v === "" || v == null ? 0 : typeof v === "string" ? Number(v) : v), z.number().int().min(1).refine((n) => !Number.isNaN(n), { message: "Quantidade inválida" })),
        tipo: z.enum(['entrada', 'saida'])
    }))
        .mutation(async ({ input, ctx }) => {
        const traceId = nanoid(10);
        const qtd = input.tipo === "entrada" ? input.quantidade : -input.quantidade;
        const vendedor = await getVendedorFromContext(ctx);
        const audit = {
            actorUserId: ctx.user?.role === "admin" ? ctx.user.id : undefined,
            actorVendedorId: ctx.user?.role !== "admin" && vendedor ? vendedor.id : undefined,
            traceId,
            motivo: "atualizarEstoque",
        };
        try {
            const tenantId = ctx.tenantId;
            assertTenantId(tenantId);
            await inventoryService.updateEstoqueProduto(tenantId, {
                id: input.id,
                quantidade: qtd,
                audit: {
                    ...audit,
                    actorVendedorId: audit.actorVendedorId
                }
            });
            return { message: "Estoque atualizado" };
        }
        catch (e) {
            if (e instanceof Error && e.message.includes("Estoque insuficiente")) {
                throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
            }
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao atualizar estoque" });
        }
    }),
});
export const coresRouter = router({
    list: protectedProcedure.query(async ({ ctx }) => {
        const tenantId = ctx.tenantId;
        assertTenantId(tenantId);
        return await inventoryService.listCores(tenantId);
    }),
    create: adminProcedure
        .input(z.object({ nome: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        assertTenantId(tenantId);
        return await inventoryService.createCor(tenantId, { tenantId, nome: input.nome });
    }),
    update: adminProcedure
        .input(z.object({ id: z.number(), nome: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        assertTenantId(tenantId);
        await inventoryService.updateCor(tenantId, input.id, { nome: input.nome });
        return { ok: true };
    }),
    delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        assertTenantId(tenantId);
        await inventoryService.deleteCor(tenantId, input.id);
        return { ok: true };
    }),
});
export const gruposPrecificacaoRouter = router({
    list: protectedProcedure.query(async ({ ctx }) => {
        const tenantId = ctx.tenantId;
        assertTenantId(tenantId);
        return await inventoryService.listGruposPrecificacao(tenantId);
    }),
    create: adminProcedure
        .input(z.object({ nome: z.string().min(1), idempotencyKey: z.string().max(64).optional() }))
        .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        assertTenantId(tenantId);
        const { idempotencyKey, ...data } = input;
        const executeCommand = await import("../_core/command.js").then(m => m.executeCommand);
        const commandResult = await import("../_core/command.js").then(m => m.commandResult);
        const isInProgress = await import("../../shared/idempotency.js").then(m => m.isInProgress);
        const result = await executeCommand({ commandName: "gruposPrecificacao.create", idempotencyKey: idempotencyKey ?? undefined }, async (tx) => {
            const res = await tx.insert(db.gruposPrecificacao).values({ tenantId, ...data });
            const id = getInsertId(res);
            return { ...commandResult(true, ["Grupo criado"]), id };
        });
        if (isInProgress(result))
            return result;
        return result;
    }),
    update: adminProcedure
        .input(z.object({
        id: z.number(),
        nome: z.string().min(1),
        descontoFabrica: z.number().optional(),
        ipi: z.number().optional(),
        frete: z.number().optional(),
        montagem: z.number().optional(),
        lucro: z.number().optional(),
        comissao: z.number().optional(),
        jurosCartao: z.number().optional(),
        prazoGarantia: z.number().optional(),
    }))
        .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        assertTenantId(tenantId);
        const { id, ...data } = input;
        await inventoryService.updateGrupoPrecificacao(tenantId, id, data);
        return { ok: true };
    }),
    delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        assertTenantId(tenantId);
        await inventoryService.deleteGrupoPrecificacao(tenantId, input.id);
        return { ok: true };
    }),
});
export const ajusteEstoqueRouter = router({
    rapido: adminProcedure
        .input(z.object({
        produtoId: z.number().min(1),
        quantidade: z.preprocess((v) => (v === "" || v == null ? 0 : typeof v === "string" ? Number(v) : v), z.number().int().min(1).refine((n) => !Number.isNaN(n), { message: "Quantidade inválida" })),
        tipo: z.enum(["entrada", "saida"]),
    }))
        .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        assertTenantId(tenantId);
        const traceId = nanoid(10);
        const out = await inventoryService.ajusteRapidoEstoque(tenantId, input.produtoId, input.quantidade, input.tipo, {
            actorUserId: ctx.user.id,
            traceId,
            motivo: "ajuste_rapido",
        });
        return { ...out, traceId };
    }),
});
export const promocoesRouter = router({
    list: protectedProcedure.query(async ({ ctx }) => {
        const tenantId = ctx.tenantId;
        assertTenantId(tenantId);
        return await promocoesService.listPromocoes(tenantId);
    }),
    detalhes: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        assertTenantId(tenantId);
        return await promocoesService.getPromocaoById(tenantId, input.id);
    }),
    create: adminProcedure
        .input(z.object({
        nome: z.string().min(2),
        inicio: z.coerce.date(),
        fim: z.coerce.date(),
        ativo: z.boolean().optional(),
        itens: z.array(z.object({ produtoId: z.number().min(1), precoPromocional: z.coerce.number().min(0) })).default([]),
    }))
        .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        assertTenantId(tenantId);
        const promo = await promocoesService.createPromocao(tenantId, {
            nome: input.nome,
            inicio: input.inicio,
            fim: input.fim,
            ativo: input.ativo,
        });
        if (input.itens.length > 0) {
            for (const item of input.itens) {
                await promocoesService.addPromocaoItem(tenantId, promo.id, item);
            }
        }
        return promo;
    }),
    update: adminProcedure
        .input(z.object({
        id: z.number(),
        nome: z.string().min(2),
        inicio: z.coerce.date(),
        fim: z.coerce.date(),
        ativo: z.boolean(),
    }))
        .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        assertTenantId(tenantId);
        const { id, ...data } = input;
        return await promocoesService.updatePromocao(tenantId, id, data);
    }),
    delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        assertTenantId(tenantId);
        return await promocoesService.deletePromocao(tenantId, input.id);
    }),
});
export const notasEntradaRouter = router({
    create: adminProcedure
        .input(z.object({
        marca: z.string().min(1),
        dataChegada: z.string(),
        valorTotal: z.number().positive(),
        formaPagamento: z.enum(['PIX', 'DINHEIRO', 'BOLETO', 'CHEQUE', 'CARTAO']),
        observacao: z.string().optional(),
        parcelas: z.array(z.object({
            parcela: z.number().int().min(1),
            valor: z.number().positive(),
            dataVencimento: z.string(),
        })).optional(),
        itens: z.array(z.object({
            produtoId: z.number(),
            quantidade: z.number().int().positive(),
            custoUnit: z.number().positive().optional(),
        })).min(1),
    }))
        .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        assertTenantId(tenantId);
        await db.criarNotaEntrada(tenantId, {
            marca: input.marca,
            dataChegada: new Date(input.dataChegada),
            valorTotal: input.valorTotal,
            formaPagamento: input.formaPagamento,
            observacao: input.observacao,
            parcelas: input.parcelas?.map(p => ({ ...p, dataVencimento: new Date(p.dataVencimento) })),
            itens: input.itens,
            createdBy: ctx.user?.id,
        });
        return { ok: true };
    }),
});
