/**
 * Motor de insights do LEO: detecta automaticamente situações relevantes.
 */
import * as db from "../../../db/index.js";
import { eq, and, sql, ne } from "drizzle-orm";
import { PedidoStatus, ContaReceberStatus } from "../../../shared/domain-status.js";
import * as financeService from "../../finance.service.js";
import { ADMIN_ACTOR } from "../../../_core/service-actor.js";
import { assertDbConnection } from "../../../_core/errors/assertions.js";

export type Insight = {
  tipo: string;
  mensagem: string;
  severidade: "info" | "alerta" | "critico";
};

/** Compara vendas da última semana com a anterior para detectar queda/crescimento. */
async function compararVendasSemanas(tenantId: number): Promise<{ variacao: number; tipo: "queda" | "crescimento" | "estavel" }> {
  const conn = await db.getDb();
  assertDbConnection(conn);
  const hoje = new Date();
  const fimEsta = new Date(hoje);
  const inicioEsta = new Date(hoje);
  inicioEsta.setDate(inicioEsta.getDate() - 7);
  const inicioAnterior = new Date(inicioEsta);
  inicioAnterior.setDate(inicioAnterior.getDate() - 7);
  
  const esta = await conn
    .select({
      total: sql<string>`COALESCE(SUM(${db.pedidos.total}), 0)`,
      qtd: sql<number>`COUNT(*)`,
    })
    .from(db.pedidos)
    .where(
      and(
        eq(db.pedidos.tenantId, tenantId),
        ne(db.pedidos.status, PedidoStatus.CANCELADO),
        sql`${db.pedidos.createdAt} >= ${inicioEsta}`,
        sql`${db.pedidos.createdAt} < ${fimEsta}`
      )
    );

  const anterior = await conn
    .select({
      total: sql<string>`COALESCE(SUM(${db.pedidos.total}), 0)`,
    })
    .from(db.pedidos)
    .where(
      and(
        eq(db.pedidos.tenantId, tenantId),
        ne(db.pedidos.status, PedidoStatus.CANCELADO),
        sql`${db.pedidos.createdAt} >= ${inicioAnterior}`,
        sql`${db.pedidos.createdAt} < ${inicioEsta}`
      )
    );

  const vEsta = Number(esta[0]?.total ?? 0);
  const vAnt = Number(anterior[0]?.total ?? 0);
  if (vAnt === 0) return { variacao: 0, tipo: "estavel" };
  const variacao = (vEsta - vAnt) / vAnt;
  if (variacao <= -0.1) return { variacao, tipo: "queda" };
  if (variacao >= 0.1) return { variacao, tipo: "crescimento" };
  return { variacao, tipo: "estavel" };
}

/** Clientes com contas a receber PENDENTE (inadimplentes). */
async function clientesInadimplentes(tenantId: number): Promise<number> {
  const { items } = await financeService.listContasReceber(tenantId, ADMIN_ACTOR, {
    status: ContaReceberStatus.PENDENTE,
  });
  const nomes = new Set(items.map((x) => String(x.clienteNome ?? "")));
  return nomes.size;
}

/** Produtos com estoque > 0 e sem venda nos últimos 30 dias (parado). */
async function estoqueParado(tenantId: number): Promise<number> {
  const conn = await db.getDb();
  assertDbConnection(conn);
  const limite = new Date();
  limite.setDate(limite.getDate() - 30);
  
  const comEstoque = await conn
    .select({ id: db.produtos.id })
    .from(db.produtos)
    .where(and(
      eq(db.produtos.tenantId, tenantId),
      sql`${db.produtos.estoque} > 0`, 
      eq(db.produtos.ativo, true)
    ));
    
  let parados = 0;
  for (const p of comEstoque) {
    const venda = await conn
      .select({ id: db.pedidos.id })
      .from(db.itensPedido)
      .innerJoin(db.pedidos, eq(db.pedidos.id, db.itensPedido.pedidoId))
      .where(
        and(
          eq(db.pedidos.tenantId, tenantId),
          eq(db.itensPedido.produtoId, p.id),
          ne(db.pedidos.status, PedidoStatus.CANCELADO),
          sql`${db.pedidos.updatedAt} >= ${limite}`
        )
    )
      .limit(1);
    if (!venda[0]?.id) parados++;
  }
  return parados;
}

/** Produtos com estoque <= 5 (baixo). */
async function estoqueBaixo(tenantId: number): Promise<number> {
  const conn = await db.getDb();
  assertDbConnection(conn);
  const r = await conn
    .select({ count: sql<number>`COUNT(*)` })
    .from(db.produtos)
    .where(and(
      eq(db.produtos.tenantId, tenantId),
      eq(db.produtos.ativo, true), 
      sql`${db.produtos.estoque} <= 5`
    ));
  return Number(r[0]?.count ?? 0);
}

/** Gera lista de insights para o dashboard. */
export async function gerarInsights(tenantId: number): Promise<Insight[]> {
  const res: Insight[] = [];
  try {
    const v = await compararVendasSemanas(tenantId);
    if (v.tipo === "queda") {
      res.push({
        tipo: "vendas",
        mensagem: `Queda de ${Math.abs(Math.round(v.variacao * 100))}% nas vendas em relação à semana passada.`,
        severidade: "alerta",
      });
    }

    const inad = await clientesInadimplentes(tenantId);
    if (inad > 0) {
      res.push({
        tipo: "financeiro",
        mensagem: `${inad} cliente(s) com pagamentos pendentes.`,
        severidade: inad > 5 ? "critico" : "info",
      });
    }

    const parado = await estoqueParado(tenantId);
    if (parado > 0) {
      res.push({
        tipo: "estoque",
        mensagem: `${parado} produto(s) em estoque sem saída nos últimos 30 dias.`,
        severidade: "info",
      });
    }

    const baixo = await estoqueBaixo(tenantId);
    if (baixo > 0) {
      res.push({
        tipo: "estoque",
        mensagem: `${baixo} produto(s) com estoque baixo (5 ou menos).`,
        severidade: "alerta",
      });
    }
  } catch (e) {
    console.error("[LEO insight-engine] Erro ao gerar insights:", e);
  }
  return res;
}
