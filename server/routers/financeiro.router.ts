// --- Dependências externas ---
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";

// --- Shared ---
import { isInProgress } from "../../shared/idempotency.js";

// --- Core ---
import { protectedProcedure, adminProcedure, router } from "../_core/trpc.js";
import { assertOwnership } from "../_core/ownership.js";
import { executeCommand, commandResult } from "../_core/command.js";
import { assertTenantId } from "../_core/errors/assertions.js";
import { financeiroTracingMiddleware } from "../infra/tracing-middleware.js";

// --- DB e serviços ---
import * as financeService from "../services/finance.service.js";
import * as usersService from "../services/users.service.js";
import * as pdfService from "../services/reports/pdf.service.js";
import { auditEntityChange } from "../_core/domain-audit.js";
import { resolveServiceActor, ADMIN_ACTOR } from "../_core/service-actor.js";

/** Retorna o vendedor do contexto (ctx.vendedor quando token "v:", senão busca por user). */
async function getVendedorFromContext(ctx: { user: { id: number; role: string } | null; vendedor?: Record<string, unknown> | null; tenantId?: number | null }) {
  if (ctx.vendedor) return ctx.vendedor;
  if (!ctx.user || ctx.user.role === "admin") return null;
  const tenantId = ctx.tenantId;
  assertTenantId(tenantId);
  return (await usersService.getVendedorById(ctx.user.id, tenantId)) ?? null;
}

export const boletosRouter = router({
  list: protectedProcedure
    .input(z.object({
      busca: z.string().optional(),
      page: z.number().min(1).optional(),
      pageSize: z.number().min(1).max(100).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      let vendedorId: number | undefined;
      if (ctx.user.role !== 'admin') {
        const vendedor = await getVendedorFromContext(ctx) as { id: number } | null;
        if (!vendedor) return [];
        vendedorId = vendedor.id;
      }

      return await financeService.listBoletos(ctx.tenantId ?? 0, {
        vendedorId,
        busca: input?.busca,
        page: input?.page,
        pageSize: input?.pageSize,
      });
    }),
  
  baixarParcial: adminProcedure
    .input(z.object({
      boletoId: z.number(),
      valorPago: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
      const out = await financeService.baixarBoletoParcial(tenantId, input.boletoId, input.valorPago);
      await auditEntityChange(ctx, tenantId, "BAIXA", "boleto", input.boletoId, {
        valorPago: input.valorPago,
      });
      return out;
    }),

  gerarPDF: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
      await assertOwnership(ctx, "boleto", input.id);
      return await pdfService.gerarBoletoPDF(tenantId, input.id);
    }),

  gerarExtrato: protectedProcedure
    .input(z.object({ clienteId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
      let vendedorIdFilter: number | undefined;
      if (ctx.user.role !== "admin") {
        const vendedor = await getVendedorFromContext(ctx) as { id: number } | null;
        if (!vendedor) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." });
        const lista = await financeService.getBoletosByVendedor(tenantId, vendedor.id);
        const doCliente = lista.items.filter((b) => Number(b.clienteId) === input.clienteId);
        if (doCliente.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "Nenhum boleto seu para este cliente." });
        vendedorIdFilter = vendedor.id;
      }
      return await pdfService.gerarExtratoClientePDF(tenantId, input.clienteId, vendedorIdFilter);
    }),

  gerarBoletosCarga: protectedProcedure
    .input(z.object({ 
      cargaId: z.number(),
      pedidoNumero: z.number().optional()
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
      if (ctx.user.role !== "admin") {
        const logisticaService = await import("../services/logistica.service.js");
        const carga = await logisticaService.getCargaById(tenantId, input.cargaId);
        if (!carga) throw new TRPCError({ code: "NOT_FOUND", message: "Carga não encontrada." });
        const cargaData = carga as Record<string, unknown>;
        const pedidosIds = Array.isArray(cargaData.pedidos)
          ? (cargaData.pedidos as Array<{ id: number }>).map((p) => p.id)
          : [];
        if (pedidosIds.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "Carga sem pedidos." });
        const vendedor = await getVendedorFromContext(ctx) as { id: number } | null;
        if (!vendedor) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." });
        const todosDoVendedor = await financeService.checkPedidosBelongToVendedor(tenantId, pedidosIds, vendedor.id);
        if (!todosDoVendedor) throw new TRPCError({ code: "FORBIDDEN", message: "Carga contém pedidos de outro vendedor." });
      }
      return await pdfService.gerarBoletosCargaPDF(tenantId, input.cargaId, input.pedidoNumero);
    }),

  gerarZip: protectedProcedure
    .input(z.object({
      boletoIds: z.array(z.number()).min(1),
      pedidoNumero: z.number(),
      clienteNome: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
      if (ctx.user.role !== "admin") {
        const vendedor = await getVendedorFromContext(ctx) as { id: number } | null;
        if (!vendedor) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." });
        for (const bid of input.boletoIds) {
          const b = await financeService.getBoletoById(tenantId, bid);
          if (!b) throw new TRPCError({ code: "NOT_FOUND", message: `Boleto ${bid} não encontrado.` });
          if (b.vendedorId !== vendedor.id) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado a um ou mais boletos." });
        }
      }
      return await pdfService.gerarZipBoletos(tenantId, input);
    }),

  gerarRelatorio: protectedProcedure
    .input(z.object({ 
      tipo: z.enum(['PAGAR', 'RECEBER']),
      mesAno: z.string()
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
      return await pdfService.gerarRelatorioFinanceiroPDF(tenantId, input.tipo, input.mesAno);
    }),
});

export const contasReceberRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
      const actor = await resolveServiceActor(ctx);
      const result = await financeService.listContasReceber(tenantId, actor, { status: input?.status });
      return result.items;
    }),
  
  create: protectedProcedure
    .input(z.object({
      pedidoNumero: z.number().optional(),
      clienteNome: z.string().min(1),
      descricao: z.string().min(1),
      valor: z.number(),
      dataVencimento: z.string(),
      formaPagamento: z.string().optional(),
      observacoes: z.string().optional(),
      idempotencyKey: z.string().max(64).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
      try {
        const result = await executeCommand(
          { commandName: "contasReceber.create", idempotencyKey: input.idempotencyKey },
          async (tx) => {
            let vendedorId: number | undefined;
            if (ctx.user.role !== "admin") {
              const vendedor = await getVendedorFromContext(ctx) as { id: number } | null;
              vendedorId = vendedor?.id;
            }
            await financeService.createContaReceber(
              tenantId,
              {
                pedidoNumero: input.pedidoNumero,
                clienteNome: input.clienteNome,
                descricao: input.descricao,
                valor: input.valor,
                dataVencimento: new Date(input.dataVencimento),
                status: 'PENDENTE',
                observacoes: input.observacoes,
                vendedorId: vendedorId!,
              }
            );
            return { ok: true, traceId: nanoid(10), success: true };
          }
        );
        if (isInProgress(result)) return result;
        await auditEntityChange(ctx, tenantId, "create", "conta_receber", null, {
          clienteNome: input.clienteNome,
          valor: input.valor,
        });
        return { success: true };
      } catch (e) {
        throw e;
      }
    }),
  
  marcarRecebida: protectedProcedure
    .input(z.object({
      id: z.number(),
      dataRecebimento: z.string(),
      formaPagamento: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
      await assertOwnership(ctx, "conta_receber", input.id);
      const out = await financeService.marcarContaRecebida(tenantId, input.id, input.dataRecebimento, input.formaPagamento);
      await auditEntityChange(ctx, tenantId, "update", "conta_receber", input.id, {
        dataRecebimento: input.dataRecebimento,
        formaPagamento: input.formaPagamento,
      });
      return out;
    }),
  
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
      await assertOwnership(ctx, "conta_receber", input.id);
      const out = await financeService.deleteContaReceber(tenantId, input.id);
      await auditEntityChange(ctx, tenantId, "delete", "conta_receber", input.id, {});
      return out;
    }),
});

export const contasPagarRouter = router({
  list: adminProcedure
    .input(z.object({ 
      status: z.enum(['PENDENTE', 'PAGO']).optional(),
      fornecedor: z.string().optional()
    }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
      const result = await financeService.listContasPagar(tenantId, ADMIN_ACTOR, {
        status: input.status,
        fornecedor: input.fornecedor,
      });
      return result.items;
    }),
  create: adminProcedure
    .input(z.object({
      fornecedor: z.string(),
      descricao: z.string().optional(),
      valor: z.string(),
      dataVencimento: z.preprocess(
        (v) => (typeof v === "string" || typeof v === "number") ? new Date(v) : v,
        z.date().refine((d) => !Number.isNaN(d.getTime()), { message: "Data de vencimento inválida" })
      ),
      planoContasId: z.number().optional(),
      observacoes: z.string().optional()
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
      return await financeService.createContaPagar(tenantId, {
        fornecedor: input.fornecedor,
        descricao: input.descricao || '',
        valor: Number(input.valor),
        dataVencimento: input.dataVencimento,
        status: 'PENDENTE',
        planoContasId: input.planoContasId,
        observacoes: input.observacoes
      });
    }),
  pagar: adminProcedure
    .input(z.object({ id: z.number(), valorPago: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
      const out = await financeService.pagarConta(tenantId, input.id, input.valorPago);
      await auditEntityChange(ctx, tenantId, "BAIXA", "conta_pagar", input.id, {
        valorPago: input.valorPago,
      });
      return out;
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
      return await financeService.deleteContaPagar(tenantId, input.id);
    }),
});

export const contasFixasRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
    return await financeService.listContasFixas(tenantId);
  }),
  create: adminProcedure
    .input(z.object({
      nome: z.string(),
      valorPadrao: z.string(),
      diaVencimento: z.number(),
      planoContasId: z.number().optional()
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
      return await financeService.createContaFixa(tenantId, {
        tenantId,
        nome: input.nome,
        descricao: input.nome,
        valor: input.valorPadrao,
        diaVencimento: input.diaVencimento,
        planoContasId: input.planoContasId ?? null,
        fornecedorId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }),
  gerarMes: adminProcedure
    .input(z.object({ mesAno: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
      return await financeService.gerarContasFixasMes(tenantId, input.mesAno);
    }),
});

export const caixaMensalRouter = router({
  get: adminProcedure
    .input(z.object({ mesAno: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
      return await financeService.getCaixaMensal(tenantId, input.mesAno);
    }),
  listAll: adminProcedure
    .query(async ({ ctx }) => {
      const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
      return await financeService.getAllCaixaMensal(tenantId);
    }),
});

export const planoContasRouter = router({
  list: protectedProcedure
    .input(z.object({ tipo: z.enum(["RECEITA", "DESPESA"]).optional() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
      return await financeService.getPlanoContas(tenantId, input.tipo);
    }),
  create: adminProcedure
    .input(z.object({ 
      nome: z.string(), 
      tipo: z.enum(["RECEITA", "DESPESA"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
      return await financeService.createPlanoContas(tenantId, {
        tenantId,
        ...input,
        ativo: true,
      });
    }),
  update: adminProcedure
    .input(z.object({ id: z.number(), nome: z.string().min(1), tipo: z.enum(["RECEITA", "DESPESA"]), idempotencyKey: z.string().max(64).optional() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
      const { idempotencyKey, ...data } = input;
      const result = await executeCommand(
        { commandName: "planoContas.update", idempotencyKey: idempotencyKey ?? undefined },
        async () => {
          await financeService.updatePlanoContas(tenantId, data.id, { nome: data.nome, tipo: data.tipo });
          return commandResult(true, ["Plano de contas atualizado"]);
        }
      );
      if (isInProgress(result)) return result;
      return { ok: true as const };
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number(), idempotencyKey: z.string().max(64).optional() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
      const result = await executeCommand(
        { commandName: "planoContas.delete", idempotencyKey: input.idempotencyKey ?? undefined },
        async () => {
          await financeService.deletePlanoContas(tenantId, input.id);
          return commandResult(true, ["Plano de contas excluído"]);
        }
      );
      if (isInProgress(result)) return result;
      return { ok: true as const };
    }),
});

export const comissoesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
    if (ctx.user.role === "admin") {
      return await financeService.getAllComissoes(tenantId);
    }
    const vendedor = await getVendedorFromContext(ctx) as { id: number } | null;
    if (!vendedor) return [];
    return await financeService.getComissoesByVendedor(tenantId, vendedor.id);
  }),
  marcarPaga: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      assertTenantId(tenantId);
      return await financeService.marcarComissaoPaga(tenantId, input.id);
    }),
});

// Create router with middleware
const financeiroRouterWithMiddleware = router({
  boletos: boletosRouter,
  contasReceber: contasReceberRouter,
  contasPagar: contasPagarRouter,
  contasFixas: contasFixasRouter,
  caixaMensal: caixaMensalRouter,
  planoContas: planoContasRouter,
  comissoes: comissoesRouter,
});

// Apply middleware and export
export const financeiroRouter = financeiroRouterWithMiddleware;
