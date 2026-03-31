/**
 * Motor financeiro do LEO: boletos, contas a pagar/receber, recebimentos por vendedor, inadimplência por cliente.
 */
import * as db from "../leo-erp-data.facade.js";
import * as financeService from "../finance.service.js";
import { ADMIN_ACTOR } from "../../_core/service-actor.js";
import * as usersService from "../users.service.js";
import { BoletoStatus, ContaPagarStatus, ContaReceberStatus } from "../../shared/domain-status.js";
import { inArray } from "drizzle-orm";

/** Tenant padrão para contexto LEO quando não há sessão. */
const DEFAULT_LEO_TENANT_ID = 1;

export type Periodo = { inicio: Date; fim: Date };

function periodoSemana(): Periodo {
  const fim = new Date();
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - 7);
  inicio.setHours(0, 0, 0, 0);
  fim.setHours(23, 59, 59, 999);
  return { inicio, fim };
}

/** Boletos vencidos (status ATRASADO ou ABERTO/PARCIAL com dataVencimento < hoje). */
export async function boletosVencidos(): Promise<{ total: number; quantidade: number }> {
  const conn = await db.getDb();
  if (!conn) return { total: 0, quantidade: 0 };
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const rows = await conn
    .select({
      valorAberto: db.boletos.valorAberto,
    })
    .from(db.boletos)
    .where(
      db.and(
        inArray(db.boletos.status, [BoletoStatus.ABERTO, BoletoStatus.PARCIAL, BoletoStatus.ATRASADO]),
        db.sql`DATE(${db.boletos.dataVencimento}) < DATE(${hoje})`
      )
    );
  const total = rows.reduce((s: number, r: { valorAberto?: unknown }) => s + Number(r.valorAberto ?? 0), 0);
  return { total, quantidade: rows.length };
}

/** Boletos a vencer (próximos 30 dias). */
export async function boletosAVencer(dias = 30): Promise<{ total: number; quantidade: number }> {
  const conn = await db.getDb();
  if (!conn) return { total: 0, quantidade: 0 };
  const hoje = new Date();
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + dias);
  const rows = await conn
    .select({ valorAberto: db.boletos.valorAberto })
    .from(db.boletos)
    .where(
      db.and(
        inArray(db.boletos.status, [BoletoStatus.ABERTO, BoletoStatus.PARCIAL]),
        db.sql`DATE(${db.boletos.dataVencimento}) >= DATE(${hoje})`,
        db.sql`DATE(${db.boletos.dataVencimento}) <= DATE(${limite})`
      )
    );
  const total = rows.reduce((s: number, r: { valorAberto?: unknown }) => s + Number(r.valorAberto ?? 0), 0);
  return { total, quantidade: rows.length };
}

/** Contas a pagar (PENDENTE). */
export async function contasAPagar(tenantId: number = DEFAULT_LEO_TENANT_ID): Promise<{ total: number; quantidade: number }> {
  const { items } = await financeService.listContasPagar(tenantId, ADMIN_ACTOR, { status: ContaPagarStatus.PENDENTE });
  const pend = Array.isArray(items) ? items : [];
  const total = pend.reduce((s: number, x: { valor?: unknown }) => s + Number((x as { valor?: number }).valor ?? 0), 0);
  return { total, quantidade: pend.length };
}

/** Contas a receber (PENDENTE). */
export async function contasAReceber(tenantId: number = DEFAULT_LEO_TENANT_ID): Promise<{ total: number; quantidade: number }> {
  const { items } = await financeService.listContasReceber(tenantId, ADMIN_ACTOR, { status: ContaReceberStatus.PENDENTE });
  const pend = Array.isArray(items) ? items : [];
  const total = pend.reduce((s: number, x: { valor?: unknown }) => s + Number((x as { valor?: number }).valor ?? 0), 0);
  return { total, quantidade: pend.length };
}

/** Recebimentos por vendedor em um período. */
export async function recebimentosPorVendedor(
  periodo: Periodo,
  tenantId: number = DEFAULT_LEO_TENANT_ID
): Promise<{ vendedorId: number; vendedorNome: string; total: number }[]> {
  const conn = await db.getDb();
  if (!conn) return [];
  const rows = await conn
    .select({
      vendedorId: db.contasReceber.vendedorId,
      total: db.sql<string>`COALESCE(SUM(${db.contasReceber.valor}), 0)`,
    })
    .from(db.contasReceber)
    .where(
      db.and(
        db.eq(db.contasReceber.tenantId, tenantId),
        db.eq(db.contasReceber.status, ContaReceberStatus.RECEBIDA),
        db.sql`DATE(${db.contasReceber.dataRecebimento}) >= DATE(${periodo.inicio})`,
        db.sql`DATE(${db.contasReceber.dataRecebimento}) <= DATE(${periodo.fim})`
      )
    )
    .groupBy(db.contasReceber.vendedorId);
  const vendedoresResult = await usersService.listVendedores?.(tenantId) || { vendedores: [], total: 0, page: 1, limit: 50 };
  const vendedores = vendedoresResult.vendedores || [];
  const nomes = new Map(vendedores.map((v: Record<string, unknown>) => [(v.id as number) ?? 0, (v.nome as string) ?? ""]));
  return (rows as { vendedorId: number | null; total: string }[]).map((r) => ({
    vendedorId: r.vendedorId ?? 0,
    vendedorNome: nomes.get(r.vendedorId ?? 0) ?? "N/A",
    total: Number(r.total ?? 0),
  }));
}

/** Inadimplência por cliente: soma contas a receber PENDENTE agrupado por clienteNome. */
export async function inadimplenciaPorCliente(tenantId: number = DEFAULT_LEO_TENANT_ID): Promise<
  { clienteNome: string; total: number; quantidade: number }[]
> {
  const conn = await db.getDb();
  if (!conn) return [];
  const rows = await conn
    .select({
      clienteNome: db.contasReceber.clienteNome,
      total: db.sql<string>`COALESCE(SUM(${db.contasReceber.valor}), 0)`,
      quantidade: db.sql<number>`COUNT(*)`,
    })
    .from(db.contasReceber)
    .where(db.and(db.eq(db.contasReceber.tenantId, tenantId), db.eq(db.contasReceber.status, ContaReceberStatus.PENDENTE)))
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
export async function debitoPorCliente(nomeCliente: string, tenantId: number = DEFAULT_LEO_TENANT_ID): Promise<{ total: number; itens: number }> {
  const { items } = await financeService.listContasReceber(tenantId, ADMIN_ACTOR, {
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
  tenantId: number = DEFAULT_LEO_TENANT_ID
): Promise<{ id: number; numeroPedido: number; valorAberto: number; dataVencimento: Date; status: string }[]> {
  const conn = await db.getDb();
  if (!conn) return [];
  const term = `%${nomeCliente.trim()}%`;
  const clientesRows = await conn
    .select({ id: db.clientes.id })
    .from(db.clientes)
    .where(db.and(db.eq(db.clientes.tenantId, tenantId), db.sql`${db.clientes.nome} LIKE ${term}`))
    .limit(1);
  if (clientesRows.length === 0) return [];
  const clienteId = (clientesRows[0] as { id: number }).id;
  const lista = await conn
    .select()
    .from(db.boletos)
    .where(db.and(db.eq(db.boletos.tenantId, tenantId), db.eq(db.boletos.clienteId, clienteId)));
  return lista.map((b: { id: number; numeroPedido: number | null; valorAberto: unknown; dataVencimento: Date; status: string | null }) => ({
    id: b.id,
    numeroPedido: b.numeroPedido ?? 0,
    valorAberto: Number(b.valorAberto ?? 0),
    dataVencimento: b.dataVencimento,
    status: b.status ?? BoletoStatus.ABERTO,
  }));
}

/** Recebimentos no período (ex.: esta semana). */
export async function recebimentosNoPeriodo(periodo: Periodo, tenantId: number = DEFAULT_LEO_TENANT_ID): Promise<{ total: number }> {
  const conn = await db.getDb();
  if (!conn) return { total: 0 };
  const [r] = await conn
    .select({
      total: db.sql<string>`COALESCE(SUM(${db.contasReceber.valor}), 0)`,
    })
    .from(db.contasReceber)
    .where(
      db.and(
        db.eq(db.contasReceber.tenantId, tenantId),
        db.eq(db.contasReceber.status, ContaReceberStatus.RECEBIDA),
        db.sql`DATE(${db.contasReceber.dataRecebimento}) >= DATE(${periodo.inicio})`,
        db.sql`DATE(${db.contasReceber.dataRecebimento}) <= DATE(${periodo.fim})`
      )
    );
  return { total: Number((r as { total?: string } | undefined)?.total ?? 0) };
}
