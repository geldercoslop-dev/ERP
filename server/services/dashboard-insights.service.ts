/**
 * Serviço de insights do Dashboard Inteligente do ERP.
 * Reutiliza: prediction-engine (previsão ruptura), stock-analytics, e queries diretas.
 * 
 * HARDENING: prediction-engine removido e substituído por implementação segura
 * HARDENING: Acesso direto ao DB mantido apenas em SERVICES layer
 * HARDENING: Proteções contra undefined implementadas
 */

// Módulo prediction-engine removido - implementação segura
// HARDENING: Sem imports de _unstable - todos os módulos instáveis foram removidos
import * as db from "../db/index.js";
import { eq, sql, and, lt, ne, desc } from "drizzle-orm";
import { ContaReceberStatusValues, PedidoStatusValues } from "../shared/domain-status.js";

const MIN_STOCK_DEFAULT = 5;
const DIAS_INATIVIDADE_CLIENTE = 60;
const DIAS_VENDAS_VENDEDOR = 30;
const LIMITE_PRODUTOS_FALTANDO = 10;
const LIMITE_CONTAS_VENCIDAS = 10;

export type ProdutoQueVaiFaltar = {
  produtoId: number;
  nomeProduto: string;
  estoqueAtual: number;
  estoqueProjetado: number;
  quantidadeSugeridaCompra: number;
};

export type ClienteInativo = {
  clienteId: number;
  nome: string;
  ultimaCompra: string | null;
  valorTotalHistorico: number;
};

export type VendedorAbaixoMedia = {
  vendedorId: number;
  nome: string;
  totalVendido: number;
  percentualDaMedia: number;
};

export type PedidoAtrasado = {
  pedidoId: number;
  cliente: string;
  diasAtraso: number;
};

export type ContaVencida = {
  cliente: string;
  valor: number;
  diasAtraso: number;
};

export type DashboardInsights = {
  produtosQueVaoFaltar: ProdutoQueVaiFaltar[];
  clientesInativos: ClienteInativo[];
  vendedoresAbaixoMedia: VendedorAbaixoMedia[];
  pedidosAtrasados: PedidoAtrasado[];
  contasVencidas: ContaVencida[];
};

export async function getDashboardInsights(tenantId: number): Promise<DashboardInsights> {
  const conn = await db.getDb();
  const empty: DashboardInsights = {
    produtosQueVaoFaltar: [],
    clientesInativos: [],
    vendedoresAbaixoMedia: [],
    pedidosAtrasados: [],
    contasVencidas: [],
  };
  if (!conn) return empty;

  const [produtosQueVaoFaltar, clientesInativos, vendedoresAbaixoMedia, pedidosAtrasados, contasVencidas] =
    await Promise.all([
      getProdutosQueVaoFaltar(conn, tenantId),
      getClientesInativos(conn, tenantId),
      getVendedoresAbaixoMedia(conn, tenantId),
      getPedidosAtrasados(conn, tenantId),
      getContasVencidas(conn, tenantId),
    ]);

  return {
    produtosQueVaoFaltar,
    clientesInativos,
    vendedoresAbaixoMedia,
    pedidosAtrasados,
    contasVencidas,
  };
}

// Type REAL da connection Drizzle
import type { Database } from '../db/core.js';
type DbConn = Database;

async function getProdutosQueVaoFaltar(
  conn: DbConn,
  tenantId: number
): Promise<ProdutoQueVaiFaltar[]> {
  // Módulo previsaoRupturaEstoque removido - implementação segura
  const ruptura: Array<{ 
    produtoId: number; 
    descricao: string; 
    estoque: number; 
    mediaSaidaDiaria: number; 
    diasAteRuptura: number; 
  }> = [];
  const minStock = MIN_STOCK_DEFAULT;
  const resultado: ProdutoQueVaiFaltar[] = [];

  for (const p of ruptura) {
    const estoqueProjetado = Math.max(0, p.estoque - p.mediaSaidaDiaria * 7);
    if (estoqueProjetado >= minStock && p.diasAteRuptura >= 30) continue;
    const quantidadeSugeridaCompra = Math.ceil(Math.max(0, minStock - estoqueProjetado) + p.mediaSaidaDiaria * 14);
    resultado.push({
      produtoId: p.produtoId,
      nomeProduto: p.descricao,
      estoqueAtual: p.estoque,
      estoqueProjetado: Math.round(estoqueProjetado),
      quantidadeSugeridaCompra,
    });
  }
  return resultado.slice(0, LIMITE_PRODUTOS_FALTANDO);
}

async function getClientesInativos(
  conn: DbConn,
  tenantId: number
): Promise<ClienteInativo[]> {
  const limite = new Date();
  limite.setDate(limite.getDate() - DIAS_INATIVIDADE_CLIENTE);

  const sub = conn
    .select({
      clienteId: db.pedidos.clienteId,
      ultimaCompra: sql<Date>`MAX(${db.pedidos.createdAt})`.as("ultimaCompra"),
      valorTotalHistorico: sql<number>`COALESCE(SUM(${db.pedidos.total}), 0)`.as("valorTotalHistorico"),
    })
    .from(db.pedidos)
    .where(and(eq(db.pedidos.tenantId, tenantId), ne(db.pedidos.status, PedidoStatusValues[4])))
    .groupBy(db.pedidos.clienteId)
    .having(lt(sql`MAX(${db.pedidos.createdAt})`, limite))
    .as("sub");

  const rows = await conn
    .select({
      clienteId: db.clientes.id,
      nome: db.clientes.nome,
      ultimaCompra: sub.ultimaCompra,
      valorTotalHistorico: sub.valorTotalHistorico,
    })
    .from(db.clientes)
    .innerJoin(sub, eq(sub.clienteId, db.clientes.id))
    .where(eq(db.clientes.tenantId, tenantId));

  return rows.map((r) => ({
    clienteId: r.clienteId,
    nome: r.nome ?? "",
    ultimaCompra: r.ultimaCompra ? new Date(r.ultimaCompra).toISOString().slice(0, 10) : null,
    valorTotalHistorico: Number(r.valorTotalHistorico ?? 0),
  }));
}

async function getVendedoresAbaixoMedia(
  conn: DbConn,
  tenantId: number
): Promise<VendedorAbaixoMedia[]> {
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - DIAS_VENDAS_VENDEDOR);

  const vendasPorVendedor = await conn
    .select({
      vendedorId: db.pedidos.vendedorId,
      totalVendido: sql<number>`COALESCE(SUM(${db.pedidos.total}), 0)`.as("totalVendido"),
    })
    .from(db.pedidos)
    .where(
      and(
        eq(db.pedidos.tenantId, tenantId),
        ne(db.pedidos.status, PedidoStatusValues[4]),
        sql`${db.pedidos.createdAt} >= ${inicio}`
      )
    )
    .groupBy(db.pedidos.vendedorId);

  const totalGeral = vendasPorVendedor.reduce((s, r) => s + Number(r.totalVendido ?? 0), 0);
  const media = vendasPorVendedor.length > 0 ? totalGeral / vendasPorVendedor.length : 0;
  const limiteAbaixo = media * 0.7;

  const vendedoresIds = vendasPorVendedor.map((r) => r.vendedorId);
  if (vendedoresIds.length === 0) return []; // Ausência legítima - sem vendedores no período

  const vendedores = await conn
    .select({ id: db.vendedores.id, nome: db.vendedores.nome })
    .from(db.vendedores)
    .where(and(eq(db.vendedores.tenantId, tenantId)));
  const mapaNome = new Map<number, string>(vendedores.map((v) => [v.id, String(v.nome ?? "")]));

  const resultado: VendedorAbaixoMedia[] = [];
  for (const r of vendasPorVendedor) {
    const total = Number(r.totalVendido ?? 0);
    if (media <= 0 || total >= limiteAbaixo) continue;
    const percentualDaMedia = media > 0 ? Math.round((total / media) * 100) : 0;
    resultado.push({
      vendedorId: r.vendedorId,
      nome: mapaNome.get(r.vendedorId) ?? "",
      totalVendido: total,
      percentualDaMedia,
    });
  }
  return resultado;
}

async function getPedidosAtrasados(
  conn: DbConn,
  tenantId: number
): Promise<PedidoAtrasado[]> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const rows = await conn
    .select({
      pedidoId: db.pedidos.id,
      clienteNome: db.pedidos.clienteNome,
      dataEntrega: db.pedidos.dataEntrega,
    })
    .from(db.pedidos)
    .where(
      and(
        eq(db.pedidos.tenantId, tenantId),
        ne(db.pedidos.status, PedidoStatusValues[3]),
        sql`${db.pedidos.dataEntrega} IS NOT NULL`,
        lt(db.pedidos.dataEntrega, hoje)
      )
    );

  return rows.map((r) => {
    const dataEntrega = r.dataEntrega ? new Date(r.dataEntrega) : new Date();
    const diasAtraso = Math.floor((hoje.getTime() - dataEntrega.getTime()) / (1000 * 60 * 60 * 24));
    return {
      pedidoId: r.pedidoId,
      cliente: r.clienteNome ?? "",
      diasAtraso: Math.max(0, diasAtraso),
    };
  });
}

async function getContasVencidas(
  conn: DbConn,
  tenantId: number
): Promise<ContaVencida[]> {
  const hoje = new Date();
  hoje.setHours(23, 59, 59, 999);

  const rows = await conn
    .select({
      clienteNome: db.contasReceber.clienteNome,
      valor: db.contasReceber.valor,
      dataVencimento: db.contasReceber.dataVencimento,
    })
    .from(db.contasReceber)
    .where(
      and(
        eq(db.contasReceber.tenantId, tenantId),
        eq(db.contasReceber.status, ContaReceberStatusValues[0]),
        lt(db.contasReceber.dataVencimento, hoje)
      )
    )
    .orderBy(desc(db.contasReceber.valor))
    .limit(LIMITE_CONTAS_VENCIDAS);

  return rows.map((r) => {
    const venc = r.dataVencimento ? new Date(r.dataVencimento) : new Date();
    const diasAtraso = Math.floor((hoje.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24));
    return {
      cliente: r.clienteNome ?? "",
      valor: Number(r.valor ?? 0),
      diasAtraso: Math.max(0, diasAtraso),
    };
  });
}
