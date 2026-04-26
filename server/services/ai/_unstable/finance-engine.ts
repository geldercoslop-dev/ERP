/**
 * Motor financeiro do LEO: boletos, contas a pagar/receber, recebimentos por vendedor, inadimplência por cliente.
 */
import * as db from "../../../db/index.js";
import * as financeService from "../../finance.service.js";
import * as usersService from "../../users.service.js";
import { BoletoStatus, ContaPagarStatus, ContaReceberStatus } from "../../../shared/domain-status.js";
import { ADMIN_ACTOR } from "../../../_core/service-actor.js";
import { inArray } from "drizzle-orm";
import { assertDbConnection } from "../../../_core/errors/assertions.js";
import { ValidationError } from "../../../_core/errors/typed-errors.js";

export type Periodo = { inicio: Date; fim: Date };

function parseTenantId(tenantId: string): number {
  const parsed = Number(tenantId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError("TENANT_ID_REQUIRED: tenantId deve ser inteiro positivo");
  }
  return parsed;
}

function periodoSemana(): Periodo {
  const fim = new Date();
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - 7);
  inicio.setHours(0, 0, 0, 0);
  fim.setHours(23, 59, 59, 999);
  return { inicio, fim };
}

/** Boletos vencidos (status ATRASADO ou ABERTO/PARCIAL com dataVencimento < hoje). */
export async function boletosVencidos(tenantId: string): Promise<{ total: number; quantidade: number }> {
  const tenantIdNum = parseTenantId(tenantId);
  const conn = await db.getDb();
  assertDbConnection(conn);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const rows = await conn
    .select({
      valorAberto: db.boletos.valorAberto,
    })
    .from(db.boletos)
    .where(
      db.and(
        db.eq(db.boletos.tenantId, tenantIdNum),
        inArray(db.boletos.status, [BoletoStatus.ABERTO, BoletoStatus.PARCIAL, BoletoStatus.ATRASADO]),
        db.sql`DATE(${db.boletos.dataVencimento}) < DATE(${hoje})`
      )
    );
  const total = rows.reduce((s: number, r: { valorAberto?: unknown }) => s + Number(r.valorAberto ?? 0), 0);
  return { total, quantidade: rows.length };
}

/** Boletos a vencer (próximos 30 dias). */
export async function boletosAVencer(tenantId: string, dias = 30): Promise<{ total: number; quantidade: number }> {
  const tenantIdNum = parseTenantId(tenantId);
  const conn = await db.getDb();
  assertDbConnection(conn);
  const hoje = new Date();
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + dias);
  const rows = await conn
    .select({ valorAberto: db.boletos.valorAberto })
    .from(db.boletos)
    .where(
      db.and(
        db.eq(db.boletos.tenantId, tenantIdNum),
        inArray(db.boletos.status, [BoletoStatus.ABERTO, BoletoStatus.PARCIAL]),
        db.sql`DATE(${db.boletos.dataVencimento}) >= DATE(${hoje})`,
        db.sql`DATE(${db.boletos.dataVencimento}) <= DATE(${limite})`
      )
    );
  const total = rows.reduce((s: number, r: { valorAberto?: unknown }) => s + Number(r.valorAberto ?? 0), 0);
  return { total, quantidade: rows.length };
}

/** Contas a pagar (PENDENTE). */
export async function contasAPagar(tenantId: string): Promise<{ total: number; quantidade: number }> {
  const tenantIdNum = parseTenantId(tenantId);
  const { items } = await financeService.listContasPagar(tenantIdNum, ADMIN_ACTOR, { status: ContaPagarStatus.PENDENTE });
  const pend = Array.isArray(items) ? items : [];
  const total = pend.reduce((s: number, x: { valor?: unknown }) => s + Number((x as { valor?: number }).valor ?? 0), 0);
  return { total, quantidade: pend.length };
}

/** Contas a receber (PENDENTE). */
export async function contasAReceber(tenantId: string): Promise<{ total: number; quantidade: number }> {
  const tenantIdNum = parseTenantId(tenantId);
  const { items } = await financeService.listContasReceber(tenantIdNum, ADMIN_ACTOR, { status: ContaReceberStatus.PENDENTE });
  const pend = Array.isArray(items) ? items : [];
  const total = pend.reduce((s: number, x: { valor?: unknown }) => s + Number((x as { valor?: number }).valor ?? 0), 0);
  return { total, quantidade: pend.length };
}

/** Recebimentos por vendedor em um período. */
export async function recebimentosPorVendedor(
  periodo: Periodo,
  tenantId: string
): Promise<{ vendedorId: number; vendedorNome: string; total: number }[]> {
  const tenantIdNum = parseTenantId(tenantId);
  const conn = await db.getDb();
  assertDbConnection(conn);
  const rows = await conn
    .select({
      vendedorId: db.contasReceber.vendedorId,
      total: db.sql<string>`COALESCE(SUM(${db.contasReceber.valor}), 0)`,
    })
    .from(db.contasReceber)
    .where(
      db.and(
        db.eq(db.contasReceber.tenantId, tenantIdNum),
        db.eq(db.contasReceber.status, ContaReceberStatus.RECEBIDA),
        db.sql`DATE(${db.contasReceber.dataRecebimento}) >= DATE(${periodo.inicio})`,
        db.sql`DATE(${db.contasReceber.dataRecebimento}) <= DATE(${periodo.fim})`
      )
    )
    .groupBy(db.contasReceber.vendedorId);
  const vendedoresResult = await usersService.listVendedores?.(tenantIdNum) || { vendedores: [], total: 0, page: 1, limit: 50 };
  const vendedoresPayload = vendedoresResult as { vendedores?: Array<{ id?: number | null; nome?: string | null }> };
  const vendedores = vendedoresPayload.vendedores ?? [];
  const nomes = new Map(vendedores.map((v) => [v.id ?? 0, String(v.nome ?? "")]));
  return (rows as { vendedorId: number | null; total: string }[]).map((r) => ({
    vendedorId: r.vendedorId ?? 0,
    vendedorNome: String(nomes.get(r.vendedorId ?? 0) ?? "N/A"),
    total: Number(r.total ?? 0),
  }));
}

/** Inadimplência por cliente: soma contas a receber PENDENTE agrupado por clienteNome. */
export async function inadimplenciaPorCliente(tenantId: string): Promise<
  { clienteNome: string; total: number; quantidade: number }[]
> {
  const tenantIdNum = parseTenantId(tenantId);
  const conn = await db.getDb();
  assertDbConnection(conn);
  const rows = await conn
    .select({
      clienteNome: db.contasReceber.clienteNome,
      total: db.sql<string>`COALESCE(SUM(${db.contasReceber.valor}), 0)`,
      quantidade: db.sql<number>`COUNT(*)`,
    })
    .from(db.contasReceber)
    .where(db.and(db.eq(db.contasReceber.tenantId, tenantIdNum), db.eq(db.contasReceber.status, ContaReceberStatus.PENDENTE)))
    .groupBy(db.contasReceber.clienteNome)
    .orderBy(db.desc(db.sql`SUM(${db.contasReceber.valor})`))
    .limit(50);
  return rows.map((r: { clienteNome?: string | null; total?: string; quantidade?: number }) => ({
    clienteNome: r.clienteNome ?? "",
    total: Number(r.total ?? 0),
    quantidade: Number(r.quantidade ?? 0),
  }));
}

/** Debito de um cliente por nome (contas a receber PENDENTE onde clienteNome contém o termo). */
export async function debitoPorCliente(nomeCliente: string, tenantId: string): Promise<{ total: number; itens: number }> {
  const tenantIdNum = parseTenantId(tenantId);
  const { items } = await financeService.listContasReceber(tenantIdNum, ADMIN_ACTOR, {
    status: ContaReceberStatus.PENDENTE,
    pageSize: 1000,
  });
  const list = Array.isArray(items) ? items : [];
  const pend = list.filter(
    (x: { status?: string; clienteNome?: string }) =>
      x.status === ContaReceberStatus.PENDENTE && String(x.clienteNome ?? "").toLowerCase().includes(nomeCliente.toLowerCase())
  );
  const total = pend.reduce((s: number, x: { valor?: unknown }) => s + Number((x as { valor?: number }).valor ?? 0), 0);
  return { total, itens: pend.length };
}

/** Boletos de um cliente por nome (busca cliente por nome, depois boletos por clienteId). */
export async function boletosPorCliente(
  nomeCliente: string,
  tenantId: string
): Promise<{ id: number; numeroPedido: number; valorAberto: number; dataVencimento: Date; status: string }[]> {
  const tenantIdNum = parseTenantId(tenantId);
  const conn = await db.getDb();
  assertDbConnection(conn);
  const term = `%${nomeCliente.trim()}%`;
  const clientesRows = await conn
    .select({ id: db.clientes.id })
    .from(db.clientes)
    .where(db.and(db.eq(db.clientes.tenantId, tenantIdNum), db.sql`${db.clientes.nome} LIKE ${term}`))
    .limit(1);
  if (clientesRows.length === 0) return [];
  const clienteId = (clientesRows[0] as { id: number }).id;
  const lista = await conn
    .select()
    .from(db.boletos)
    .where(db.and(db.eq(db.boletos.tenantId, tenantIdNum), db.eq(db.boletos.clienteId, clienteId)));
  return lista.map((b) => ({
    id: b.id,
    numeroPedido: b.numeroPedido ?? 0,
    valorAberto: Number(b.valorAberto ?? 0),
    dataVencimento: b.dataVencimento,
    status: b.status ?? BoletoStatus.ABERTO,
  }));
}

/** Recebimentos no período (ex.: esta semana). */
export async function recebimentosNoPeriodo(periodo: Periodo, tenantId: string): Promise<{ total: number }> {
  const tenantIdNum = parseTenantId(tenantId);
  const conn = await db.getDb();
  assertDbConnection(conn);
  const [r] = await conn
    .select({
      total: db.sql<string>`COALESCE(SUM(${db.contasReceber.valor}), 0)`,
    })
    .from(db.contasReceber)
    .where(
      db.and(
        db.eq(db.contasReceber.tenantId, tenantIdNum),
        db.eq(db.contasReceber.status, ContaReceberStatus.RECEBIDA),
        db.sql`DATE(${db.contasReceber.dataRecebimento}) >= DATE(${periodo.inicio})`,
        db.sql`DATE(${db.contasReceber.dataRecebimento}) <= DATE(${periodo.fim})`
      )
    );
  return { total: Number((r as { total?: string } | undefined)?.total ?? 0) };
}
