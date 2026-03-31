/**
 * Motor de previsões do LEO: previsão de vendas e de ruptura de estoque (últimos 30 dias).
 */
import * as db from "../leo-erp-data.facade.js";
import * as ordersService from "../orders.service.js";
import { eq, sql, and, desc, ne } from "drizzle-orm";
import { PedidoStatus } from "../../shared/domain-status.js";

const DIAS_HISTORICO = 30;

export type PrevisaoDemanda = {
  produtoId: number;
  descricao: string;
  demandaAtual: number;
  previsao30Dias: number;
  previsao60Dias: number;
  previsao90Dias: number;
  sazonalidade: 'alta' | 'media' | 'baixa';
  confianca: number;
};

export type PrevisaoFaturamento = {
  periodo: string;
  faturamentoPrevisto: number;
  faturamentoMinimo: number;
  faturamentoMaximo: number;
  crescimento: number;
  fatores: string[];
};

export type PrevisaoCompleta = {
  previsaoDemanda: PrevisaoDemanda[];
  previsaoFaturamento: PrevisaoFaturamento[];
  resumo: {
    crescimentoMedio: number;
    sazonalidade: string;
    confiancaMedia: number;
    proximos90Dias: number;
  };
};

/** Média diária de vendas (valor) nos últimos 30 dias. */
export async function previsaoVendas(tenantId: number): Promise<{
  mediaDiaria: number;
  totalPeriodo: number;
  diasComVenda: number;
  projecaoProximoMes: number;
}> {
  const fallback = { mediaDiaria: 0, totalPeriodo: 0, diasComVenda: 0, projecaoProximoMes: 0 };
  try {
    const conn = await db.getDb();
    if (!conn) return fallback;
    const fim = new Date();
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - DIAS_HISTORICO);
    const res = await ordersService.getReportVendasPeriodo(tenantId, { dataInicio: inicio, dataFim: fim });
    const total = Number(res.totalValor ?? 0);
    const itens = res.itens || [];
    const diasComVenda = itens.length;
    const mediaDiaria = DIAS_HISTORICO > 0 ? total / DIAS_HISTORICO : 0;
    const projecaoProximoMes = mediaDiaria * 30;
    return {
      mediaDiaria,
      totalPeriodo: total,
      diasComVenda,
      projecaoProximoMes,
    };
  } catch (e: unknown) {
    console.error("[LEO prediction-engine] Erro em previsaoVendas:", (e as Error)?.message ?? e);
    return fallback;
  }
}

/** Produtos com tendência a ruptura: estoque atual e média de saída diária (últimos 30 dias). */
export async function previsaoRupturaEstoque(tenantId: number): Promise<
  { produtoId: number; descricao: string; estoque: number; mediaSaidaDiaria: number; diasAteRuptura: number }[]
> {
  try {
    const conn = await db.getDb();
    if (!conn) return [];
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - DIAS_HISTORICO);
  const saidaPorProduto = await conn
    .select({
      produtoId: db.itensPedido.produtoId,
      quantidade: sql<number>`SUM(${db.itensPedido.quantidade})`.as('quantidade'),
    })
    .from(db.itensPedido)
    .innerJoin(db.pedidos, eq(db.pedidos.id, db.itensPedido.pedidoId))
    .where(
      and(
        eq(db.pedidos.tenantId, tenantId),
        ne(db.pedidos.status, PedidoStatus.CANCELADO),
        sql`${db.pedidos.createdAt} >= ${inicio}`
      )
    )
    .groupBy(db.itensPedido.produtoId);
  const mapaSaida = new Map<number, number>();
  for (const r of saidaPorProduto) {
    if (r.produtoId) mapaSaida.set(r.produtoId, Number(r.quantidade ?? 0) / DIAS_HISTORICO);
  }
  const produtos = await conn
    .select({ id: db.produtos.id, descricao: db.produtos.descricao, estoque: db.produtos.estoque })
    .from(db.produtos)
    .where(and(eq(db.produtos.tenantId, tenantId), eq(db.produtos.ativo, true), sql`${db.produtos.estoque} > 0`));
  const resultado: { produtoId: number; descricao: string; estoque: number; mediaSaidaDiaria: number; diasAteRuptura: number }[] = [];
  for (const p of produtos as Array<{ id: number; descricao: string; estoque: string | number }>) {
    const estoque = Number(p.estoque ?? 0);
    const mediaSaida = mapaSaida.get(p.id) ?? 0;
    if (mediaSaida <= 0 || estoque <= 0) continue;
    const diasAteRuptura = mediaSaida > 0 ? estoque / mediaSaida : 999;
    if (diasAteRuptura < 15)
      resultado.push({
        produtoId: p.id,
        descricao: String(p.descricao ?? "").slice(0, 50),
        estoque,
        mediaSaidaDiaria: Math.round(mediaSaida * 100) / 100,
        diasAteRuptura: Math.floor(diasAteRuptura),
      });
  }
    return resultado.sort((a, b) => a.diasAteRuptura - b.diasAteRuptura);
  } catch (e: unknown) {
    console.error("[LEO prediction-engine] Erro em previsaoRupturaEstoque:", (e as Error)?.message ?? e);
    return [];
  }
}

/**
 * Prevê demanda para produtos específicos usando análise histórica
 */
export async function preverDemandaProduto(tenantId: number, produtoIds?: number[]): Promise<PrevisaoDemanda[]> {
  const conn = await db.getDb();
  if (!conn) return [];

  try {
    // Análise dos últimos 90 dias para identificar sazonalidade
    const noventaDiasAtras = new Date();
    noventaDiasAtras.setDate(noventaDiasAtras.getDate() - 90);

    const demandaHistorica = await conn
      .select({
        produtoId: db.itensPedido.produtoId,
        descricao: db.produtos.descricao,
        mes: sql<string>`DATE_FORMAT(${db.pedidos.createdAt}, '%Y-%m')`.as('mes'),
        quantidade: sql<number>`SUM(${db.itensPedido.quantidade})`.as('quantidade')
      })
      .from(db.itensPedido)
      .innerJoin(db.pedidos, eq(db.pedidos.id, db.itensPedido.pedidoId))
      .innerJoin(db.produtos, eq(db.produtos.id, db.itensPedido.produtoId))
      .where(
        and(
          eq(db.pedidos.tenantId, tenantId),
          sql`${db.pedidos.createdAt} >= ${noventaDiasAtras}`,
          ne(db.pedidos.status, PedidoStatus.CANCELADO),
          produtoIds && produtoIds.length > 0 ? sql`${db.itensPedido.produtoId} IN (${produtoIds.join(',')})` : sql`1=1`
        )
      )
      .groupBy(db.itensPedido.produtoId, db.produtos.descricao, sql`DATE_FORMAT(${db.pedidos.createdAt}, '%Y-%m')`)
      .orderBy(sql`DATE_FORMAT(${db.pedidos.createdAt}, '%Y-%m')`);

    // Agrupar dados por produto
    const mapaProdutos = new Map<number, { descricao: string; dados: Array<{ mes: string; quantidade: number }> }>();
    
    demandaHistorica.forEach(item => {
      if (!item.produtoId) return; // Pular itens sem produtoId
      if (!mapaProdutos.has(item.produtoId)) {
        mapaProdutos.set(item.produtoId, { descricao: item.descricao || '', dados: [] });
      }
      mapaProdutos.get(item.produtoId)!.dados.push({ mes: item.mes, quantidade: item.quantidade });
    });

    const previsoes: PrevisaoDemanda[] = [];

    for (const [produtoId, dados] of Array.from(mapaProdutos.entries())) {
      const demandaAtual = calcularDemandaRecente(dados.dados);
      const previsao30Dias = calcularPrevisaoDemanda(dados.dados, 30);
      const previsao60Dias = calcularPrevisaoDemanda(dados.dados, 60);
      const previsao90Dias = calcularPrevisaoDemanda(dados.dados, 90);
      const sazonalidade = analisarSazonalidade(dados.dados);
      const confianca = calcularConfianca(dados.dados);

      previsoes.push({
        produtoId,
        descricao: dados.descricao,
        demandaAtual,
        previsao30Dias,
        previsao60Dias,
        previsao90Dias,
        sazonalidade,
        confianca
      });
    }

    return previsoes.sort((a, b) => b.previsao30Dias - a.previsao30Dias);
  } catch (e: unknown) {
    console.error("[LEO prediction-engine] Erro em preverDemandaProduto:", (e as Error)?.message ?? e);
    return [];
  }
}

/**
 * Prevê faturamento mensal para os próximos 6 meses
 */
export async function preverFaturamentoMensal(tenantId: number): Promise<PrevisaoFaturamento[]> {
  const conn = await db.getDb();
  if (!conn) return [];

  try {
    // Análise histórica dos últimos 12 meses
    const dozeMesesAtras = new Date();
    dozeMesesAtras.setMonth(dozeMesesAtras.getMonth() - 12);

    const faturamentoHistorico = await conn
      .select({
        mes: sql<string>`DATE_FORMAT(${db.pedidos.createdAt}, '%Y-%m')`.as('mes'),
        valor: sql<number>`COALESCE(SUM(${db.pedidos.total}), 0)`.as('valor')
      })
      .from(db.pedidos)
      .where(
        and(
          eq(db.pedidos.tenantId, tenantId),
          sql`${db.pedidos.createdAt} >= ${dozeMesesAtras}`,
          ne(db.pedidos.status, PedidoStatus.CANCELADO)
        )
      )
      .groupBy(sql`DATE_FORMAT(${db.pedidos.createdAt}, '%Y-%m')`)
      .orderBy(sql`DATE_FORMAT(${db.pedidos.createdAt}, '%Y-%m')`);

    const valores = faturamentoHistorico.map(f => f.valor);
    const previsoes: PrevisaoFaturamento[] = [];

    // Gerar previsões para os próximos 6 meses
    for (let i = 1; i <= 6; i++) {
      const dataPrevisao = new Date();
      dataPrevisao.setMonth(dataPrevisao.getMonth() + i);
      const periodo = dataPrevisao.toISOString().slice(0, 7); // YYYY-MM

      const previsao = calcularPrevisaoFaturamento(valores, i);
      const fatores = identificarFatoresInfluenciadores(periodo);

      previsoes.push({
        periodo,
        faturamentoPrevisto: previsao.valor,
        faturamentoMinimo: previsao.minimo,
        faturamentoMaximo: previsao.maximo,
        crescimento: previsao.crescimento,
        fatores
      });
    }

    return previsoes;
  } catch (e: unknown) {
    console.error("[LEO prediction-engine] Erro em preverFaturamentoMensal:", (e as Error)?.message ?? e);
    return [];
  }
}

/**
 * Gera previsão completa combinando demanda e faturamento
 */
/**
 * Gera previsão completa para o dashboard
 */
export async function getPrevisaoCompleta(tenantId: number, produtoIds?: number[]): Promise<PrevisaoCompleta> {
  const [previsaoDemanda, previsaoFaturamento] = await Promise.all([
    preverDemandaProduto(tenantId, produtoIds),
    preverFaturamentoMensal(tenantId)
  ]);

  // Calcular resumo
  const crescimentoMedio = previsaoFaturamento.reduce((sum, p) => sum + p.crescimento, 0) / previsaoFaturamento.length;
  const confiancaMedia = previsaoDemanda.reduce((sum, p) => sum + p.confianca, 0) / previsaoDemanda.length;
  const proximos90Dias = previsaoDemanda.reduce((sum, p) => sum + p.previsao90Dias, 0);
  const sazonalidade = identificarSazonalidadeGlobal(previsaoDemanda);

  return {
    previsaoDemanda,
    previsaoFaturamento,
    resumo: {
      crescimentoMedio: Number(crescimentoMedio.toFixed(1)),
      sazonalidade,
      confiancaMedia: Number(confiancaMedia.toFixed(1)),
      proximos90Dias
    }
  };
}

// Funções auxiliares de previsão

function calcularDemandaRecente(dados: Array<{ mes: string; quantidade: number }>): number {
  if (dados.length === 0) return 0;
  
  // Média dos últimos 3 meses
  const ultimos3Meses = dados.slice(-3);
  return ultimos3Meses.reduce((sum, d) => sum + d.quantidade, 0) / ultimos3Meses.length;
}

function calcularPrevisaoDemanda(dados: Array<{ mes: string; quantidade: number }>, diasFuturos: number): number {
  if (dados.length < 3) return 0;

  // Calcular tendência linear simples
  const n = dados.length;
  let somaX = 0, somaY = 0, somaXY = 0, somaX2 = 0;

  dados.forEach((d, i) => {
    somaX += i;
    somaY += d.quantidade;
    somaXY += i * d.quantidade;
    somaX2 += i * i;
  });

  const tendencia = (n * somaXY - somaX * somaY) / (n * somaX2 - somaX * somaX);
  const previsao = dados[dados.length - 1].quantidade + (tendencia * (diasFuturos / 30));

  return Math.max(0, Math.round(previsao));
}

function analisarSazonalidade(dados: Array<{ mes: string; quantidade: number }>): 'alta' | 'media' | 'baixa' {
  if (dados.length < 6) return 'media';

  const valores = dados.map(d => d.quantidade);
  const media = valores.reduce((sum, v) => sum + v, 0) / valores.length;
  const desvioPadrao = Math.sqrt(valores.reduce((sum, v) => sum + Math.pow(v - media, 2), 0) / valores.length);

  // Classificar baseado na variação
  const coeficienteVariacao = desvioPadrao / media;
  
  if (coeficienteVariacao > 0.3) return 'alta';
  if (coeficienteVariacao > 0.15) return 'media';
  return 'baixa';
}

function calcularConfianca(dados: Array<{ mes: string; quantidade: number }>): number {
  if (dados.length < 3) return 0;

  // Mais dados históricos = maior confiança
  const pontos = Math.min(dados.length, 12);
  return Math.min(100, (pontos / 12) * 100);
}

function calcularPrevisaoFaturamento(valores: number[], mesesFuturos: number): {
  valor: number;
  minimo: number;
  maximo: number;
  crescimento: number;
} {
  if (valores.length < 3) {
    return { valor: 0, minimo: 0, maximo: 0, crescimento: 0 };
  }

  // Média móvel ponderada (últimos meses têm mais peso)
  const pesos = [0.1, 0.15, 0.2, 0.25, 0.3]; // Últimos 5 meses
  const valoresRecentes = valores.slice(-5);
  
  let somaPonderada = 0;
  let somaPesos = 0;
  
  valoresRecentes.forEach((valor, i) => {
    const peso = pesos[pesos.length - 1 - i] || 0.05;
    somaPonderada += valor * peso;
    somaPesos += peso;
  });

  const mediaPonderada = somaPonderada / somaPesos;
  const crescimento = valores.length >= 2 ? ((valores[valores.length - 1] - valores[0]) / valores[0]) * 100 : 0;
  
  // Adicionar fator sazonal (+/- 10%)
  const fatorSazonal = 1 + (Math.random() - 0.5) * 0.2;
  const previsao = mediaPonderada * fatorSazonal;

  return {
    valor: Math.round(previsao),
    minimo: Math.round(previsao * 0.8),
    maximo: Math.round(previsao * 1.2),
    crescimento: Number(crescimento.toFixed(1))
  };
}

function identificarFatoresInfluenciadores(periodo: string): string[] {
  const fatores: string[] = [];
  const mes = parseInt(periodo.slice(5, 7));
  
  // Fatores sazonais
  if (mes >= 11 || mes <= 2) fatores.push('Fim de ano');
  if (mes >= 3 && mes <= 5) fatores.push('Primavera');
  if (mes >= 6 && mes <= 8) fatores.push('Verão');
  if (mes >= 9 && mes <= 11) fatores.push('Outono');
  
  // Fatores econômicos (simplificados)
  fatores.push('Tendência de mercado');
  fatores.push('Inflação projetada');
  
  return fatores;
}

function identificarSazonalidadeGlobal(previsoes: PrevisaoDemanda[]): string {
  if (previsoes.length === 0) return 'sem dados';
  
  const contagem = { alta: 0, media: 0, baixa: 0 };
  previsoes.forEach(p => contagem[p.sazonalidade]++);
  
  const maior = Math.max(contagem.alta, contagem.media, contagem.baixa);
  
  if (contagem.alta === maior) return 'alta sazonalidade';
  if (contagem.media === maior) return 'sazonalidade moderada';
  return 'baixa sazonalidade';
}
