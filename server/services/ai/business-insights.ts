/**
 * Insights de negócio do LEO: produto mais vendido, queda de vendas, cliente que parou de comprar,
 * produto sem giro, tempo médio de entrega.
 */
import * as db from "../leo-erp-data.facade";
import { eq, and, sql, ne } from "drizzle-orm";
import { PedidoStatus } from "../../shared/domain-status";
import { gerarInsights } from "./insight-engine";
import * as ordersService from "../orders.service";

const DIAS_SEM_GIRO = 60;
const DIAS_CLIENTE_PARADO = 90;

export type BusinessInsight = {
  tipo: string;
  titulo: string;
  valor: string | number;
  detalhe?: string;
};

/** Produto mais vendido no último mês (por quantidade). */
export async function produtoMaisVendido(tenantId: number): Promise<BusinessInsight | null> {
  const inicio = new Date();
  inicio.setMonth(inicio.getMonth() - 1);
  const rows = await ordersService.getReportProdutosMaisVendidos(tenantId, {
    dataInicio: inicio,
    dataFim: new Date(),
    limit: 1,
  });
  const p = rows[0];
  if (!p) return null;
  return {
    tipo: "produto_mais_vendido",
    titulo: "Produto mais vendido (mês)",
    valor: String(p.descricao ?? "").slice(0, 50),
    detalhe: `${Number(p.quantidade ?? 0)} un — R$ ${Number(p.valorTotal ?? 0).toFixed(2)}`,
  };
}

/** Queda de vendas (semana atual vs anterior) — usa insight-engine. */
export async function quedaVendas(tenantId: number): Promise<BusinessInsight | null> {
  const insights = await gerarInsights(tenantId);
  const q = insights.find((i) => i.tipo === "vendas" && i.mensagem.includes("Queda"));
  if (!q) return null;
  return { tipo: "queda_vendas", titulo: "Queda de vendas", valor: q.mensagem };
}

/** Clientes que compraram antes mas não nos últimos DIAS_CLIENTE_PARADO. */
export async function clientesQuePararamDeComprar(tenantId: number): Promise<BusinessInsight | null> {
  const conn = await db.getDb();
  if (!conn) return null;
  const limite = new Date();
  limite.setDate(limite.getDate() - DIAS_CLIENTE_PARADO);
  
  const comPedidoAntigo = await conn
    .select({
      clienteId: db.pedidos.clienteId,
      clienteNome: db.pedidos.clienteNome,
      ultimoPedido: sql<string>`MAX(DATE(${db.pedidos.createdAt}))`.as("ultimoPedido"),
    })
    .from(db.pedidos)
    .where(and(
      eq(db.pedidos.tenantId, tenantId),
      ne(db.pedidos.status, PedidoStatus.CANCELADO)
    ))
    .groupBy(db.pedidos.clienteId, db.pedidos.clienteNome);
    
  const parados = (comPedidoAntigo as Array<{ ultimoPedido?: string | null; clienteNome?: string | null }>).filter(
    (r) => r.ultimoPedido && new Date(r.ultimoPedido) < limite
  );
  if (parados.length === 0) return null;
  return {
    tipo: "cliente_parou_comprar",
    titulo: "Clientes que pararam de comprar",
    valor: parados.length,
    detalhe: `Sem compra há mais de ${DIAS_CLIENTE_PARADO} dias. Ex.: ${String(parados[0]?.clienteNome ?? "").slice(0, 30)}`,
  };
}

/** Produtos com estoque > 0 e sem venda nos últimos DIAS_SEM_GIRO. */
export async function produtoSemGiro(tenantId: number): Promise<BusinessInsight | null> {
  const conn = await db.getDb();
  if (!conn) return null;
  const limite = new Date();
  limite.setDate(limite.getDate() - DIAS_SEM_GIRO);
  
  const comEstoque = await conn
    .select({ id: db.produtos.id, descricao: db.produtos.descricao, estoque: db.produtos.estoque })
    .from(db.produtos)
    .where(and(
      eq(db.produtos.tenantId, tenantId),
      eq(db.produtos.ativo, true), 
      sql`${db.produtos.estoque} > 0`
    ));
    
  let semGiro = 0;
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
          sql`${db.pedidos.createdAt} >= ${limite}`
        )
      )
      .limit(1);
    if (!venda[0]?.id) semGiro++;
  }
  if (semGiro === 0) return null;
  return {
    tipo: "produto_sem_giro",
    titulo: "Produtos sem giro",
    valor: semGiro,
    detalhe: `Produtos com estoque mas sem venda há ${DIAS_SEM_GIRO} dias.`,
  };
}

/** Tempo médio de entrega (em dias). */
export async function tempoMedioEntrega(tenantId: number): Promise<BusinessInsight | null> {
  const conn = await db.getDb();
  if (!conn) return null;
  
  const entregues = await conn
    .select({
      id: db.pedidos.id,
      createdAt: db.pedidos.createdAt,
      dataEntrega: db.pedidos.dataEntrega,
    })
    .from(db.pedidos)
    .where(and(
      eq(db.pedidos.tenantId, tenantId),
      eq(db.pedidos.status, PedidoStatus.ENTREGUE), 
      sql`${db.pedidos.dataEntrega} IS NOT NULL`
    ))
    .limit(100);
    
  if (entregues.length === 0) return null;
  
  let somaDias = 0;
  for (const e of entregues) {
    const inicio = new Date(e.createdAt);
    const fim = e.dataEntrega ? new Date(e.dataEntrega) : new Date();
    somaDias += (fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24);
  }
  
  const media = somaDias / entregues.length;
  return {
    tipo: "tempo_entrega",
    titulo: "Tempo médio de entrega",
    valor: `${media.toFixed(1)} dias`,
    detalhe: `Baseado nos últimos ${entregues.length} pedidos entregues.`,
  };
}

/** Retorna todos os insights de negócio. */
export async function getBusinessInsights(tenantId: number): Promise<BusinessInsight[]> {
  const out: BusinessInsight[] = [];
  const [p1, p2, p3, p4, p5] = await Promise.all([
    produtoMaisVendido(tenantId),
    quedaVendas(tenantId),
    clientesQuePararamDeComprar(tenantId),
    produtoSemGiro(tenantId),
    tempoMedioEntrega(tenantId),
  ]);
  if (p1) out.push(p1);
  if (p2) out.push(p2);
  if (p3) out.push(p3);
  if (p4) out.push(p4);
  if (p5) out.push(p5);
  return out;
}
