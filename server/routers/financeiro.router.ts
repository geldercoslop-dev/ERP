// --- Dependências externas ---
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";

// --- Shared ---
import { isInProgress } from "@shared/idempotency";

// --- Core ---
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { assertOwnership } from "../_core/ownership";
import { executeCommand, commandResult } from "../_core/command";
import { requireTenant } from "../_core/tenant";
import { financeiroTracingMiddleware } from "../infra/tracing-middleware";

// --- DB e serviços ---
import type { SQL } from "drizzle-orm";
import * as financeService from "../services/finance.service";
import * as usersService from "../services/users.service";
import * as pdfService from "../services/reports/pdf.service";
import * as db from "../db/index";
import { auditEntityChange } from "../_core/domain-audit";
import { resolveServiceActor, ADMIN_ACTOR } from "../_core/service-actor";

/** Retorna o vendedor do contexto (ctx.vendedor quando token "v:", senão busca por user). */
async function getVendedorFromContext(ctx: { user: { id: number; role: string } | null; vendedor?: Record<string, unknown> | null; tenantId?: number | null }) {
  if (ctx.vendedor) return ctx.vendedor;
  if (!ctx.user || ctx.user.role === "admin") return null;
  const tenantId = ctx.tenantId;
  if (!tenantId) return null;
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
      const db_conn = await db.getDb();
      if (!db_conn) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Banco indisponível." });

      const page = input?.page ?? 1;
      const pageSize = Math.min(input?.pageSize ?? 100, 100);
      const offset = (page - 1) * pageSize;

      const whereParts: SQL[] = [];
      if (ctx.user.role !== 'admin') {
        const vendedor = await getVendedorFromContext(ctx) as { id: number } | null;
        if (!vendedor) return [];
        whereParts.push(db.eq(db.boletos.vendedorId, vendedor.id));
      }

      const busca = (input?.busca ?? "").trim();
      if (busca) {
        if (/^\d+$/.test(busca)) {
          const n = Number(busca);
          whereParts.push(db.or(
            db.eq(db.boletos.id, n),
            db.eq(db.boletos.numeroPedido, n)
          ) as any);
        } else {
          const normalized = busca.replace(/\s/g, "");
          const cleaned = normalized.replace(/\./g, "").replace(",", ".");
          const isMoney = /^\d+(\.\d{1,2})?$/.test(cleaned);
          if (isMoney) {
            const v = Number(cleaned);
            if (Number.isFinite(v)) {
              const val = v.toFixed(2);
              whereParts.push(db.or(
                db.sql`${db.boletos.valorOriginal} = ${val}`,
                db.sql`${db.boletos.valorAberto} = ${val}`
              ) as any);
            }
          } else {
            const term = `%${busca}%`;
            whereParts.push(db.sql`${db.clientes.nome} LIKE ${term}`);
          }
        }
      }

      const where = whereParts.length
        ? (whereParts.length === 1 ? whereParts[0] : db.and(...whereParts))
        : undefined;

      return await db_conn.select({
        id: db.boletos.id,
        numeroPedido: db.boletos.numeroPedido,
        valorOriginal: db.boletos.valorOriginal,
        valorAberto: db.boletos.valorAberto,
        dataVencimento: db.boletos.dataVencimento,
        status: db.boletos.status,
        createdAt: db.boletos.createdAt,
        clienteId: db.boletos.clienteId,
        clienteNome: db.clientes.nome,
      })
      .from(db.boletos)
      .innerJoin(db.clientes, db.eq(db.boletos.clienteId, db.clientes.id))
      .where(where!)
      .orderBy(db.desc(db.boletos.createdAt))
      .limit(pageSize)
      .offset(offset) ?? [];
    }),
  
  baixarParcial: adminProcedure
    .input(z.object({
      boletoId: z.number(),
      valorPago: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = await requireTenant(ctx);
      const out = await financeService.baixarBoletoParcial(tenantId, input.boletoId, input.valorPago);
      await auditEntityChange(ctx, tenantId, "BAIXA", "boleto", input.boletoId, {
        valorPago: input.valorPago,
      });
      return out;
    }),

  gerarPDF: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = await requireTenant(ctx);
      await assertOwnership(ctx, "boleto", input.id);
      return await pdfService.gerarBoletoPDF(tenantId, input.id);
    }),

  gerarExtrato: protectedProcedure
    .input(z.object({ clienteId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = await requireTenant(ctx);
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
      const tenantId = await requireTenant(ctx);
      if (ctx.user.role !== "admin") {
        const logisticaService = await import("../services/logistica.service");
        const carga = await logisticaService.getCargaById(tenantId, input.cargaId);
        if (!carga) throw new TRPCError({ code: "NOT_FOUND", message: "Carga não encontrada." });
        const cargaData = carga as Record<string, unknown>;
        const pedidosIds = Array.isArray(cargaData.pedidos)
          ? (cargaData.pedidos as Array<{ id: number }>).map((p) => p.id)
          : [];
        if (pedidosIds.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "Carga sem pedidos." });
        const vendedor = await getVendedorFromContext(ctx) as { id: number } | null;
        if (!vendedor) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." });
        const db_conn = await db.getDb();
        if (!db_conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
        const rows = await db_conn.select({ vendedorId: db.pedidos.vendedorId }).from(db.pedidos).where(db.and(db.inArray(db.pedidos.id, pedidosIds), db.eq(db.pedidos.tenantId, tenantId)));
        const todosDoVendedor = rows.every((r: Record<string, unknown>) => (r.vendedorId as number) === vendedor.id);
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
      const tenantId = await requireTenant(ctx);
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
      const tenantId = await requireTenant(ctx);
      return await pdfService.gerarRelatorioFinanceiroPDF(tenantId, input.tipo, input.mesAno);
    }),
});

export const contasReceberRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const tenantId = await requireTenant(ctx);
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
      const tenantId = await requireTenant(ctx);
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
      const tenantId = await requireTenant(ctx);
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
      const tenantId = await requireTenant(ctx);
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
      const tenantId = await requireTenant(ctx);
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
      const tenantId = await requireTenant(ctx);
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
      const tenantId = await requireTenant(ctx);
      const out = await financeService.pagarConta(tenantId, input.id, input.valorPago);
      await auditEntityChange(ctx, tenantId, "BAIXA", "conta_pagar", input.id, {
        valorPago: input.valorPago,
      });
      return out;
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = await requireTenant(ctx);
      return await financeService.deleteContaPagar(tenantId, input.id);
    }),
});

export const contasFixasRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const tenantId = await requireTenant(ctx);
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
      const tenantId = await requireTenant(ctx);
      return await financeService.createContaFixa(tenantId, {
        descricao: input.nome,
        valor: input.valorPadrao,
        diaVencimento: input.diaVencimento,
        planoContasId: input.planoContasId ?? null,
      });
    }),
  gerarMes: adminProcedure
    .input(z.object({ mesAno: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = await requireTenant(ctx);
      return await financeService.gerarContasFixasMes(tenantId, input.mesAno);
    }),
});

export const caixaMensalRouter = router({
  get: adminProcedure
    .input(z.object({ mesAno: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const tenantId = await requireTenant(ctx);
      return await financeService.getCaixaMensal(tenantId, input.mesAno);
    }),
  listAll: adminProcedure
    .query(async ({ ctx }) => {
      const tenantId = await requireTenant(ctx);
      return await financeService.getAllCaixaMensal(tenantId);
    }),
});

export const planoContasRouter = router({
  list: protectedProcedure
    .input(z.object({ tipo: z.enum(["RECEITA", "DESPESA"]).optional() }))
    .query(async ({ input, ctx }) => {
      const tenantId = await requireTenant(ctx);
      return await financeService.getPlanoContas(tenantId, input.tipo);
    }),
  create: adminProcedure
    .input(z.object({ 
      nome: z.string(), 
      tipo: z.enum(["RECEITA", "DESPESA"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = await requireTenant(ctx);
      return await financeService.createPlanoContas(tenantId, {
        ...input,
        ativo: true,
      });
    }),
  update: adminProcedure
    .input(z.object({ id: z.number(), nome: z.string().min(1), tipo: z.enum(["RECEITA", "DESPESA"]), idempotencyKey: z.string().max(64).optional() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = await requireTenant(ctx);
      const { idempotencyKey, ...data } = input;
      const result = await executeCommand(
        { commandName: "planoContas.update", idempotencyKey: idempotencyKey ?? undefined },
        async (tx) => {
          await (tx as any).update(db.planoContas).set({ nome: data.nome, tipo: data.tipo }).where(db.eq(db.planoContas.id, data.id));
          return commandResult(true, ["Plano de contas atualizado"]);
        }
      );
      if (isInProgress(result)) return result;
      return { ok: true as const };
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number(), idempotencyKey: z.string().max(64).optional() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = await requireTenant(ctx);
      const result = await executeCommand(
        { commandName: "planoContas.delete", idempotencyKey: input.idempotencyKey ?? undefined },
        async (tx) => {
          await (tx as any).delete(db.planoContas).where(db.eq(db.planoContas.id, input.id));
          return commandResult(true, ["Plano de contas excluído"]);
        }
      );
      if (isInProgress(result)) return result;
      return { ok: true as const };
    }),
});

export const comissoesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = await requireTenant(ctx);
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
      const tenantId = await requireTenant(ctx);
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
