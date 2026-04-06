/**
 * LEO Stock Analytics Engine
 * 
 * Motor de análise de estoque para detectar produtos críticos, sem giro e com alto giro
 */

import * as db from "../../db/index.js";
import * as db from "../../../db/index.js";
import { PedidoStatus } from "../../../shared/domain-status.js";

export type EstoqueCritico = {
  produtoId: number;
  descricao: string;
  estoqueAtual: number;
  estoqueMinimo: number;
  diasRuptura: number;
  status: 'critico' | 'alerta' | 'normal';
  prioridade: number;
};

export type ProdutoSemGiro = {
  produtoId: number;
  descricao: string;
  estoqueAtual: number;
  diasSemMovimento: number;
  valorInvestido: number;
  custoOportunidade: number;
};

export type ProdutoAltoGiro = {
  produtoId: number;
  descricao: string;
  estoqueAtual: number;
  giroMedioDiario: number;
  coberturaEstoque: number;
  reposicaoSugerida: number;
  tendencia: 'alta' | 'estavel' | 'crescente';
};

export type StockAnalytics = {
  estoqueCritico: EstoqueCritico[];
  produtosSemGiro: ProdutoSemGiro[];
  produtosAltoGiro: ProdutoAltoGiro[];
  resumo: {
    totalProdutos: number;
    produtosCriticos: number;
    valorEstoqueCritico: number;
    produtosParados: number;
    valorCapitalParado: number;
    indiceGiro: number;
  };
};

/**
 * Identifica produtos com estoque crítico ou abaixo do mínimo
 */
export async function getEstoqueCritico(tenantId: number): Promise<EstoqueCritico[]> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return [];

  try {
    const produtos = await dbConnection
      .select({
        produtoId: db.produtos.id,
        descricao: db.produtos.descricao,
        estoqueAtual: db.produtos.estoque,
        estoqueMinimo: sql<number>`0`.as('estoqueMinimo')
      })
      .from(db.produtos)
      .where(and(eq(db.produtos.tenantId, tenantId), eq(db.produtos.ativo, true)));

    // Calcular consumo médio diário dos últimos 30 dias
    const consumoMedio = await calcularConsumoMedioDiario(tenantId);

    const estoqueCritico: EstoqueCritico[] = [];

    for (const produto of produtos) {
      const estoque = Number(produto.estoqueAtual || 0);
      const estoqueMin = Number(produto.estoqueMinimo || 0);
      const consumoDiario = consumoMedio.get(produto.produtoId) || 0;

      let diasRuptura = 0;
      let status: 'critico' | 'alerta' | 'normal' = 'normal';
      let prioridade = 0;

      if (consumoDiario > 0) {
        diasRuptura = Math.floor(estoque / consumoDiario);
      }

      // Definir status baseado no estoque atual vs mínimo
      if (estoque <= 0) {
        status = 'critico';
        prioridade = 100;
      } else if (estoque < estoqueMin) {
        status = 'alerta';
        prioridade = 50;
      } else if (diasRuptura <= 7) {
        status = 'critico';
        prioridade = 80;
      } else if (diasRuptura <= 15) {
        status = 'alerta';
        prioridade = 40;
      }

      if (status !== 'normal') {
        estoqueCritico.push({
          produtoId: produto.produtoId,
          descricao: produto.descricao || '',
          estoqueAtual: estoque,
          estoqueMinimo: estoqueMin,
          diasRuptura,
          status,
          prioridade
        });
      }
    }

    return estoqueCritico.sort((a, b) => b.prioridade - a.prioridade);
  } catch (error: unknown) {
    console.error('[LEO Stock Analytics] Erro em getEstoqueCritico:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Identifica produtos sem movimento (parados no estoque)
 */
export async function getProdutosSemGiro(tenantId: number, diasParado: number = 60): Promise<ProdutoSemGiro[]> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return [];

  try {
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - diasParado);

    // Produtos com estoque > 0
    const produtosComEstoque = await dbConnection
      .select({
        produtoId: db.produtos.id,
        descricao: db.produtos.descricao,
        estoqueAtual: db.produtos.estoque,
        precoCusto: db.produtos.custo
      })
      .from(db.produtos)
      .where(
        and(
          eq(db.produtos.tenantId, tenantId),
          eq(db.produtos.ativo, true),
          sql`${db.produtos.estoque} > 0`
        )
      );

    // Verificar última venda de cada produto
    const produtosSemGiro: ProdutoSemGiro[] = [];

    for (const produto of produtosComEstoque) {
      const [ultimaVenda] = await dbConnection
        .select({ data: sql<Date>`MAX(${db.pedidos.createdAt})` })
        .from(db.itensPedido)
        .innerJoin(db.pedidos, eq(db.pedidos.id, db.itensPedido.pedidoId))
        .where(
          and(
            eq(db.pedidos.tenantId, tenantId),
            eq(db.itensPedido.produtoId, produto.produtoId),
            ne(db.pedidos.status, PedidoStatus.CANCELADO)
          )
        );

      const estoque = Number(produto.estoqueAtual || 0);
      const precoCusto = Number(produto.precoCusto || 0);
      const valorInvestido = estoque * precoCusto;

      let diasSemMovimento = diasParado;
      if (ultimaVenda?.data) {
        diasSemMovimento = Math.floor((Date.now() - ultimaVenda.data.getTime()) / (1000 * 60 * 60 * 24));
      }

      // Se está parado há mais de X dias
      if (diasSemMovimento >= diasParado) {
        produtosSemGiro.push({
          produtoId: produto.produtoId,
          descricao: produto.descricao || '',
          estoqueAtual: estoque,
          diasSemMovimento,
          valorInvestido,
          custoOportunidade: valorInvestido * 0.15 // 15% ao ano de custo de oportunidade
        });
      }
    }

    return produtosSemGiro.sort((a, b) => b.diasSemMovimento - a.diasSemMovimento);
  } catch (error: unknown) {
    console.error('[LEO Stock Analytics] Erro em getProdutosSemGiro:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Identifica produtos com alto giro de estoque
 */
export async function getProdutosAltoGiro(tenantId: number): Promise<ProdutoAltoGiro[]> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return [];

  try {
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

    // Consumo dos últimos 30 dias
    const consumo = await dbConnection
      .select({
        produtoId: db.itensPedido.produtoId,
        descricao: db.produtos.descricao,
        estoqueAtual: db.produtos.estoque,
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
          ne(db.pedidos.status, PedidoStatus.CANCELADO),
          sql`${db.produtos.estoque} > 0`
        )
      )
      .groupBy(db.itensPedido.produtoId, db.produtos.descricao, db.produtos.estoque);

    const produtosAltoGiro: ProdutoAltoGiro[] = [];

    for (const item of consumo) {
      const estoque = Number(item.estoqueAtual || 0);
      const giroMedioDiario = item.quantidade / 30;
      const coberturaEstoque = giroMedioDiario > 0 ? estoque / giroMedioDiario : 999;

      // Calcular tendência comparando com período anterior
      if (!item.produtoId) continue; // Pular itens sem produtoId
      const tendencia = await calcularTendenciaProduto(tenantId, item.produtoId);

      // Sugerir reposição baseado na cobertura
      let reposicaoSugerida = 0;
      if (coberturaEstoque < 15) {
        reposicaoSugerida = Math.ceil(giroMedioDiario * 30 - estoque);
      }

      produtosAltoGiro.push({
        produtoId: item.produtoId,
        descricao: item.descricao || '',
        estoqueAtual: estoque,
        giroMedioDiario: Number(giroMedioDiario.toFixed(2)),
        coberturaEstoque: Number(coberturaEstoque.toFixed(0)) as number,
        reposicaoSugerida,
        tendencia
      });
    }

    return produtosAltoGiro
      .sort((a, b) => b.giroMedioDiario - a.giroMedioDiario)
      .slice(0, 20);
  } catch (error: unknown) {
    console.error('[LEO Stock Analytics] Erro em getProdutosAltoGiro:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Gera análise completa de estoque
 */
export async function getStockAnalytics(tenantId: number): Promise<StockAnalytics> {
  const [estoqueCritico, produtosSemGiro, produtosAltoGiro] = await Promise.all([
    getEstoqueCritico(tenantId),
    getProdutosSemGiro(tenantId),
    getProdutosAltoGiro(tenantId)
  ]);

  // Calcular resumo
  const totalProdutos = await getTotalProdutosAtivos(tenantId);
  const produtosCriticos = estoqueCritico.length;
  const valorEstoqueCritico = estoqueCritico.reduce((sum, p) => {
    const precoMedio = 50; // Estimativa - deveria vir do banco
    return sum + (p.estoqueAtual * precoMedio);
  }, 0);
  
  const produtosParados = produtosSemGiro.length;
  const valorCapitalParado = produtosSemGiro.reduce((sum, p) => sum + p.valorInvestido, 0);
  
  // Índice de giro = produtos com giro / total de produtos
  const indiceGiro = totalProdutos > 0 ? ((totalProdutos - produtosParados) / totalProdutos) * 100 : 0;

  return {
    estoqueCritico,
    produtosSemGiro,
    produtosAltoGiro,
    resumo: {
      totalProdutos,
      produtosCriticos,
      valorEstoqueCritico,
      produtosParados,
      valorCapitalParado,
      indiceGiro: Number(indiceGiro.toFixed(1))
    }
  };
}

/**
 * Calcula consumo médio diário por produto
 */
async function calcularConsumoMedioDiario(tenantId: number): Promise<Map<number, number>> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return new Map();

  try {
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

    const consumo = await dbConnection
      .select({
        produtoId: db.itensPedido.produtoId,
        quantidade: sql<number>`SUM(${db.itensPedido.quantidade})`.as('quantidade')
      })
      .from(db.itensPedido)
      .innerJoin(db.pedidos, eq(db.pedidos.id, db.itensPedido.pedidoId))
      .where(
        and(
          eq(db.pedidos.tenantId, tenantId),
          sql`${db.pedidos.createdAt} >= ${trintaDiasAtras}`,
          ne(db.pedidos.status, PedidoStatus.CANCELADO)
        )
      )
      .groupBy(db.itensPedido.produtoId);

    const mapa = new Map<number, number>();
    consumo.forEach(item => {
      if (item.produtoId) mapa.set(item.produtoId, item.quantidade / 30); // Média diária
    });

    return mapa;
  } catch (error: unknown) {
    console.error('[LEO Stock Analytics] Erro em calcularConsumoMedioDiario:', error instanceof Error ? error.message : String(error));
    return new Map();
  }
}

/**
 * Calcula tendência de vendas de um produto
 */
async function calcularTendenciaProduto(tenantId: number, produtoId: number): Promise<'alta' | 'estavel' | 'crescente'> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return 'estavel';

  try {
    const agora = new Date();
    const ultimos15Dias = new Date(agora.getTime() - 15 * 24 * 60 * 60 * 1000);
    const periodoAnteriorInicio = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [vendasAtuais] = await dbConnection
      .select({ total: sql<number>`SUM(${db.itensPedido.quantidade})` })
      .from(db.itensPedido)
      .innerJoin(db.pedidos, eq(db.pedidos.id, db.itensPedido.pedidoId))
      .where(
        and(
          eq(db.pedidos.tenantId, tenantId),
          eq(db.itensPedido.produtoId, produtoId),
          sql`${db.pedidos.createdAt} >= ${ultimos15Dias}`,
          ne(db.pedidos.status, PedidoStatus.CANCELADO)
        )
      );

    const [vendasAnteriores] = await dbConnection
      .select({ total: sql<number>`SUM(${db.itensPedido.quantidade})` })
      .from(db.itensPedido)
      .innerJoin(db.pedidos, eq(db.pedidos.id, db.itensPedido.pedidoId))
      .where(
        and(
          eq(db.pedidos.tenantId, tenantId),
          eq(db.itensPedido.produtoId, produtoId),
          sql`${db.pedidos.createdAt} >= ${periodoAnteriorInicio}`,
          sql`${db.pedidos.createdAt} < ${ultimos15Dias}`,
          ne(db.pedidos.status, PedidoStatus.CANCELADO)
        )
      );

    const atual = Number(vendasAtuais?.total || 0);
    const anterior = Number(vendasAnteriores?.total || 0);

    if (atual > anterior * 1.2) return 'crescente';
    if (atual > 10 && atual > anterior) return 'alta';
    return 'estavel';
  } catch (error: unknown) {
    console.error('[LEO Stock Analytics] Erro em calcularTendenciaProduto:', error instanceof Error ? error.message : String(error));
    return 'estavel';
  }
}

/**
 * Busca total de produtos ativos
 */
async function getTotalProdutosAtivos(tenantId: number): Promise<number> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return 0;

  try {
    const [result] = await dbConnection
      .select({ count: sql<number>`COUNT(*)` })
      .from(db.produtos)
      .where(and(eq(db.produtos.tenantId, tenantId), eq(db.produtos.ativo, true)));

    return result?.count || 0;
  } catch (error: unknown) {
    console.error('[LEO Stock Analytics] Erro em getTotalProdutosAtivos:', error instanceof Error ? error.message : String(error));
    return 0;
  }
}
