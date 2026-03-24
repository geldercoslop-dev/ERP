/**
 * LEO Sales Analytics Engine
 * 
 * Motor de análise de vendas para gerar insights automáticos do negócio
 */

import * as db from "../leo-erp-data.facade";
import { eq, sql, and, desc, ne } from "drizzle-orm";
import { PedidoStatus } from "../../shared/domain-status";

export type VendaDiaria = {
  data: string;
  totalPedidos: number;
  valorTotal: number;
  ticketMedio: number;
};

export type ProdutoMaisVendido = {
  produtoId: number;
  descricao: string;
  quantidade: number;
  valorTotal: number;
  crescimento: number;
};

export type ClienteMaisAtivo = {
  clienteNome: string;
  quantidadePedidos: number;
  valorTotal: number;
  ultimoPedido: Date;
  frequencia: string;
};

export type SalesAnalytics = {
  vendasUltimos30Dias: VendaDiaria[];
  produtosMaisVendidos: ProdutoMaisVendido[];
  clientesMaisAtivos: ClienteMaisAtivo[];
  resumo: {
    totalPedidos: number;
    totalFaturamento: number;
    ticketMedio: number;
    crescimentoVendas: number;
    diaMelhorVenda: string;
    produtoEstrela: string;
  };
};

/**
 * Busca vendas dos últimos 30 dias agrupadas por dia
 */
export async function getVendasUltimos30Dias(tenantId: number): Promise<VendaDiaria[]> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return [];

  try {
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

    const vendas = await dbConnection
      .select({
        data: sql<string>`DATE(${db.pedidos.createdAt})`.as('data'),
        totalPedidos: sql<number>`COUNT(*)`.as('totalPedidos'),
        valorTotal: sql<number>`COALESCE(SUM(${db.pedidos.total}), 0)`.as('valorTotal')
      })
      .from(db.pedidos)
      .where(
        and(
          eq(db.pedidos.tenantId, tenantId),
          sql`${db.pedidos.createdAt} >= ${trintaDiasAtras}`,
          ne(db.pedidos.status, PedidoStatus.CANCELADO)
        )
      )
      .groupBy(sql`DATE(${db.pedidos.createdAt})`)
      .orderBy(sql`DATE(${db.pedidos.createdAt})`);

    return vendas.map((venda) => ({
      ...venda,
      ticketMedio:
        Number(venda.totalPedidos) > 0 ? Number(venda.valorTotal) / Number(venda.totalPedidos) : 0,
    }));
  } catch (error: unknown) {
    console.error('[LEO Sales Analytics] Erro em getVendasUltimos30Dias:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Identifica os produtos mais vendidos com análise de crescimento
 */
export async function getProdutosMaisVendidos(tenantId: number, limite: number = 10): Promise<ProdutoMaisVendido[]> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return [];

  try {
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
    
    const sessentaDiasAtras = new Date();
    sessentaDiasAtras.setDate(sessentaDiasAtras.getDate() - 60);

    // Período atual (últimos 30 dias)
    const periodoAtual = await dbConnection
      .select({
        produtoId: db.itensPedido.produtoId,
        descricao: db.produtos.descricao,
        quantidade: sql<number>`SUM(${db.itensPedido.quantidade})`.as('quantidade'),
        valorTotal: sql<number>`SUM(${db.itensPedido.quantidade} * ${db.itensPedido.valorUnitario})`.as('valorTotal')
      })
      .from(db.itensPedido)
      .innerJoin(db.pedidos, eq(db.pedidos.id, db.itensPedido.pedidoId))
      .innerJoin(db.produtos, eq(db.produtos.id, db.itensPedido.produtoId))
      .where(
        and(
          eq(db.pedidos.tenantId, tenantId),
          sql`${db.pedidos.createdAt} >= ${trintaDiasAtras}`,
          ne(db.pedidos.status, PedidoStatus.CANCELADO)
        )
      )
      .groupBy(db.itensPedido.produtoId, db.produtos.descricao);

    // Período anterior (30-60 dias atrás)
    const periodoAnterior = await dbConnection
      .select({
        produtoId: db.itensPedido.produtoId,
        quantidade: sql<number>`SUM(${db.itensPedido.quantidade})`.as('quantidade')
      })
      .from(db.itensPedido)
      .innerJoin(db.pedidos, eq(db.pedidos.id, db.itensPedido.pedidoId))
      .where(
        and(
          eq(db.pedidos.tenantId, tenantId),
          sql`${db.pedidos.createdAt} >= ${sessentaDiasAtras}`,
          sql`${db.pedidos.createdAt} < ${trintaDiasAtras}`,
          ne(db.pedidos.status, PedidoStatus.CANCELADO)
        )
      )
      .groupBy(db.itensPedido.produtoId);

    // Calcular crescimento
    const mapaAnterior = new Map<number, number>();
    periodoAnterior.forEach(item => {
      if (item.produtoId) mapaAnterior.set(item.produtoId, item.quantidade);
    });

    const produtosComCrescimento = periodoAtual.map(item => {
      if (!item.produtoId) return null; // Pular itens sem produtoId
      const quantidadeAnterior = mapaAnterior.get(item.produtoId) || 0;
      const crescimento = quantidadeAnterior > 0 
        ? ((item.quantidade - quantidadeAnterior) / quantidadeAnterior) * 100 
        : 0;

      return {
        ...item,
        crescimento: Number(crescimento.toFixed(1))
      };
    }).filter(Boolean) as Array<{ crescimento: number; produtoId: number; descricao: string; quantidade: number; valorTotal: number }>;

    return produtosComCrescimento
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, limite);
  } catch (error: unknown) {
    console.error('[LEO Sales Analytics] Erro em getProdutosMaisVendidos:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Identifica os clientes mais ativos com análise de frequência
 */
export async function getClientesMaisAtivos(tenantId: number, limite: number = 10): Promise<ClienteMaisAtivo[]> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return [];

  try {
    const noventaDiasAtras = new Date();
    noventaDiasAtras.setDate(noventaDiasAtras.getDate() - 90);

    const clientes = await dbConnection
      .select({
        clienteNome: db.pedidos.clienteNome,
        quantidadePedidos: sql<number>`COUNT(*)`.as('quantidadePedidos'),
        valorTotal: sql<number>`COALESCE(SUM(${db.pedidos.total}), 0)`.as('valorTotal'),
        ultimoPedido: sql<Date>`MAX(${db.pedidos.createdAt})`.as('ultimoPedido')
      })
      .from(db.pedidos)
      .where(
        and(
          eq(db.pedidos.tenantId, tenantId),
          sql`${db.pedidos.createdAt} >= ${noventaDiasAtras}`,
          ne(db.pedidos.status, PedidoStatus.CANCELADO),
          sql`${db.pedidos.clienteNome} IS NOT NULL`,
          sql`${db.pedidos.clienteNome} != ''`
        )
      )
      .groupBy(db.pedidos.clienteNome)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(limite);

    return clientes.map((cliente) => {
      const diasDesdeUltimoPedido = Math.floor((Date.now() - cliente.ultimoPedido.getTime()) / (1000 * 60 * 60 * 24));
      let frequencia = 'Inativo';
      
      if (diasDesdeUltimoPedido <= 7) {
        frequencia = 'Semanal';
      } else if (diasDesdeUltimoPedido <= 15) {
        frequencia = 'Quinzenal';
      } else if (diasDesdeUltimoPedido <= 30) {
        frequencia = 'Mensal';
      } else if (diasDesdeUltimoPedido <= 60) {
        frequencia = 'Bimensal';
      }

      return {
        ...cliente,
        frequencia
      };
    });
  } catch (error: unknown) {
    console.error('[LEO Sales Analytics] Erro em getClientesMaisAtivos:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Gera análise completa de vendas
 */
export async function getSalesAnalytics(tenantId: number): Promise<SalesAnalytics> {
  const [vendasDiarias, produtosMaisVendidos, clientesMaisAtivos] = await Promise.all([
    getVendasUltimos30Dias(tenantId),
    getProdutosMaisVendidos(tenantId),
    getClientesMaisAtivos(tenantId)
  ]);

  // Calcular resumo
  const totalPedidos = vendasDiarias.reduce((sum, v) => sum + v.totalPedidos, 0);
  const totalFaturamento = vendasDiarias.reduce((sum, v) => sum + v.valorTotal, 0);
  const ticketMedio = totalPedidos > 0 ? totalFaturamento / totalPedidos : 0;

  // Encontrar melhor dia de venda
  const diaMelhorVenda = vendasDiarias.reduce((melhor, atual) => 
    atual.valorTotal > melhor.valorTotal ? atual : melhor, 
    vendasDiarias[0] || { data: '', valorTotal: 0 }
  );

  // Calcular crescimento (comparando com período anterior)
  const crescimentoVendas = await calcularCrescimentoVendas(tenantId);

  return {
    vendasUltimos30Dias: vendasDiarias,
    produtosMaisVendidos,
    clientesMaisAtivos,
    resumo: {
      totalPedidos,
      totalFaturamento,
      ticketMedio: Number(ticketMedio.toFixed(2)),
      crescimentoVendas,
      diaMelhorVenda: diaMelhorVenda.data,
      produtoEstrela: produtosMaisVendidos[0]?.descricao || 'N/A'
    }
  };
}

/**
 * Calcula crescimento percentual das vendas
 */
async function calcularCrescimentoVendas(tenantId: number): Promise<number> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return 0;

  try {
    const agora = new Date();
    const ultimos30Dias = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
    const periodoAnteriorInicio = new Date(agora.getTime() - 60 * 24 * 60 * 60 * 1000);
    const periodoAnteriorFim = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [periodoAtual] = await dbConnection
      .select({ total: sql<number>`COALESCE(SUM(${db.pedidos.total}), 0)` })
      .from(db.pedidos)
      .where(
        and(
          eq(db.pedidos.tenantId, tenantId),
          sql`${db.pedidos.createdAt} >= ${ultimos30Dias}`,
          ne(db.pedidos.status, PedidoStatus.CANCELADO)
        )
      );

    const [periodoAnterior] = await dbConnection
      .select({ total: sql<number>`COALESCE(SUM(${db.pedidos.total}), 0)` })
      .from(db.pedidos)
      .where(
        and(
          eq(db.pedidos.tenantId, tenantId),
          sql`${db.pedidos.createdAt} >= ${periodoAnteriorInicio}`,
          sql`${db.pedidos.createdAt} < ${periodoAnteriorFim}`,
          ne(db.pedidos.status, PedidoStatus.CANCELADO)
        )
      );

    const totalAtual = periodoAtual?.total || 0;
    const totalAnterior = periodoAnterior?.total || 0;

    return totalAnterior > 0 ? ((totalAtual - totalAnterior) / totalAnterior) * 100 : 0;
  } catch (error: unknown) {
    console.error('[LEO Sales Analytics] Erro em calcularCrescimentoVendas:', error instanceof Error ? error.message : String(error));
    return 0;
  }
}
