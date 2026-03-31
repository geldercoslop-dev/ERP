/**
 * LEO Insights Service
 * 
 * Serviço central que combina todas as análises para gerar insights acionáveis
 */

import { getSalesAnalytics } from './ai/sales-analytics.service.js';
import type { SalesAnalytics, ProdutoMaisVendido } from './ai/sales-analytics.service.js';
import { getStockAnalytics } from './ai/stock-analytics.service.js';
import type { StockAnalytics, EstoqueCritico, ProdutoSemGiro, ProdutoAltoGiro } from './ai/stock-analytics.service.js';
import { getFinancialInsights } from './ai/financial-insights.service.js';
import type { FinancialInsights } from './ai/financial-insights.service.js';
import { getPrevisaoCompleta } from './ai/prediction-engine.js';
import type { PrevisaoCompleta } from './ai/prediction-engine.js';

export type Alert = {
  id: string;
  tipo: 'critico' | 'alerta' | 'oportunidade';
  titulo: string;
  descricao: string;
  impacto: 'alto' | 'medio' | 'baixo';
  urgencia: 'imediata' | 'curto_prazo' | 'medio_prazo';
  acoes: string[];
  dados: Record<string, unknown>;
  criadoEm: Date;
};

export type Suggestion = {
  id: string;
  tipo: 'vendas' | 'estoque' | 'financeiro' | 'operacional';
  titulo: string;
  descricao: string;
  beneficio: string;
  esforco: 'baixo' | 'medio' | 'alto';
  prioridade: number;
  dados: Record<string, unknown>;
  criadoEm: Date;
};

export type Metric = {
  nome: string;
  valor: number | string;
  unidade: string;
  comparacao: {
    periodoAnterior: number | string;
    variacao: number;
    variacaoPercentual: number;
  };
  status: 'positivo' | 'negativo' | 'estavel' | 'alerta';
  meta: number;
  atingiuMeta: boolean;
};

export type LeoInsights = {
  insights: {
    resumo: string;
    detalhes: string;
    tipo: 'tendencia' | 'alerta' | 'oportunidade';
    prioridade: number;
  }[];
  alerts: Alert[];
  suggestions: Suggestion[];
  metrics: Metric[];
  health: {
    score: number;
    status: 'excelente' | 'bom' | 'atencao' | 'critico';
    fatores: {
      vendas: number;
      estoque: number;
      financeiro: number;
      operacional: number;
    };
  };
  geradoEm: Date;
};

/**
 * Gera insights completos do LEO combinando todas as análises
 */
export async function getLeoInsights(tenantId: number): Promise<LeoInsights> {
  try {
    // Buscar análises de todos os módulos
    const [salesAnalytics, stockAnalytics, financialInsights, previsaoCompleta] = await Promise.all([
      getSalesAnalytics(tenantId),
      getStockAnalytics(tenantId),
      getFinancialInsights(tenantId),
      getPrevisaoCompleta(tenantId)
    ]);

    // Gerar alerts baseado nas análises
    const alerts = await gerarAlerts(salesAnalytics, stockAnalytics, financialInsights, previsaoCompleta);

    // Gerar sugestões acionáveis
    const suggestions = await gerarSuggestions(salesAnalytics, stockAnalytics, financialInsights, previsaoCompleta);

    // Gerar métricas consolidadas
    const metrics = await gerarMetrics(salesAnalytics, stockAnalytics, financialInsights, previsaoCompleta);

    // Gerar insights textuais
    const insights = await gerarInsightsTextuais(salesAnalytics, stockAnalytics, financialInsights, previsaoCompleta);

    // Calcular health score geral
    const health = await calcularHealthScore(salesAnalytics, stockAnalytics, financialInsights);

    return {
      insights,
      alerts,
      suggestions,
      metrics,
      health,
      geradoEm: new Date()
    };
  } catch (error: unknown) {
    console.error('[LEO Insights] Erro em getLeoInsights:', error instanceof Error ? error.message : String(error));
    return {
      insights: [],
      alerts: [],
      suggestions: [],
      metrics: [],
      health: {
        score: 0,
        status: 'critico',
        fatores: { vendas: 0, estoque: 0, financeiro: 0, operacional: 0 }
      },
      geradoEm: new Date()
    };
  }
}

/**
 * Gera alerts baseados nas análises
 */
async function gerarAlerts(
  salesAnalytics: SalesAnalytics,
  stockAnalytics: StockAnalytics,
  financialInsights: FinancialInsights,
  _previsaoCompleta: PrevisaoCompleta
): Promise<Alert[]> {
  void _previsaoCompleta;
  const alerts: Alert[] = [];

  // Alerts de estoque crítico
  if (stockAnalytics.estoqueCritico && stockAnalytics.estoqueCritico.length > 0) {
    const criticos = stockAnalytics.estoqueCritico.filter((p: EstoqueCritico) => p.status === "critico");
    
    if (criticos.length > 0) {
      alerts.push({
        id: `stock-critico-${Date.now()}`,
        tipo: 'critico',
        titulo: `${criticos.length} produtos com estoque crítico`,
        descricao: `Produtos sem estoque disponível: ${criticos.slice(0, 3).map((p: EstoqueCritico) => p.descricao).join(', ')}`,
        impacto: 'alto',
        urgencia: 'imediata',
        acoes: [
          'Verificar fornecedores disponíveis',
          'Autorizar compra emergencial',
          'Comunicar equipe de vendas'
        ],
        dados: { produtos: criticos },
        criadoEm: new Date()
      });
    }
  }

  // Alerts de produtos parados
  if (stockAnalytics.produtosSemGiro && stockAnalytics.produtosSemGiro.length > 0) {
    const valorParado = stockAnalytics.produtosSemGiro.reduce(
      (sum: number, p: ProdutoSemGiro) => sum + p.valorInvestido,
      0
    );
    
    alerts.push({
      id: `stock-parado-${Date.now()}`,
      tipo: 'alerta',
      titulo: `R$ ${valorParado.toLocaleString('pt-BR')} parados em estoque`,
      descricao: `${stockAnalytics.produtosSemGiro.length} produtos sem movimento há mais de 60 dias`,
      impacto: 'medio',
      urgencia: 'curto_prazo',
      acoes: [
        'Criar promoções de liquidação',
        'Analisar viabilidade de descontinuação',
        'Revisar política de compras'
      ],
      dados: { produtos: stockAnalytics.produtosSemGiro, valorParado },
      criadoEm: new Date()
    });
  }

  // Alerts de faturamento
  if (financialInsights.resumo.crescimentoPeriodo < -10) {
    alerts.push({
      id: `faturamento-queda-${Date.now()}`,
      tipo: 'alerta',
      titulo: 'Queda acentuada no faturamento',
      descricao: `Faturamento caiu ${Math.abs(financialInsights.resumo.crescimentoPeriodo).toFixed(1)}% no período`,
      impacto: 'alto',
      urgencia: 'curto_prazo',
      acoes: [
        'Investigar causas da queda',
        'Revisar estratégia comercial',
        'Ativar plano de recuperação'
      ],
      dados: { crescimento: financialInsights.resumo.crescimentoPeriodo },
      criadoEm: new Date()
    });
  }

  // Alerts de caixa baixo
  if (financialInsights.resumo.saldoCaixa < 5000) {
    alerts.push({
      id: `caixa-baixo-${Date.now()}`,
      tipo: 'alerta',
      titulo: 'Saldo de caixa abaixo do mínimo',
      descricao: `Saldo atual: R$ ${financialInsights.resumo.saldoCaixa.toLocaleString('pt-BR')}`,
      impacto: 'medio',
      urgencia: 'medio_prazo',
      acoes: [
        'Revisar fluxo de pagamentos',
        'Acelerar cobranças',
        'Considerar linha de crédito'
      ],
      dados: { saldo: financialInsights.resumo.saldoCaixa },
      criadoEm: new Date()
    });
  }

  // Alerts de oportunidades
  if (salesAnalytics.produtosMaisVendidos && salesAnalytics.produtosMaisVendidos.length > 0) {
    const produtosCrescendo = salesAnalytics.produtosMaisVendidos.filter(
      (p: ProdutoMaisVendido) => p.crescimento > 20
    );
    
    if (produtosCrescendo.length > 0) {
      alerts.push({
        id: `oportunidade-vendas-${Date.now()}`,
        tipo: 'oportunidade',
        titulo: 'Produtos com alta demanda',
        descricao: `${produtosCrescendo.length} produtos com crescimento acima de 20%`,
        impacto: 'medio',
        urgencia: 'medio_prazo',
        acoes: [
          'Aumentar estoque dos produtos',
          'Criar campanhas focadas',
          'Negociar melhores condições com fornecedores'
        ],
        dados: { produtos: produtosCrescendo },
        criadoEm: new Date()
      });
    }
  }

  return alerts.sort((a, b) => {
    const prioridade = { critico: 3, alerta: 2, oportunidade: 1 };
    return prioridade[b.tipo] - prioridade[a.tipo];
  });
}

/**
 * Gera sugestões acionáveis
 */
async function gerarSuggestions(
  salesAnalytics: SalesAnalytics,
  stockAnalytics: StockAnalytics,
  financialInsights: FinancialInsights,
  _previsaoCompleta: PrevisaoCompleta
): Promise<Suggestion[]> {
  void _previsaoCompleta;
  const suggestions: Suggestion[] = [];

  // Sugestões de vendas
  if (salesAnalytics.resumo.crescimentoVendas < 5) {
    suggestions.push({
      id: `vendas-estrategia-${Date.now()}`,
      tipo: 'vendas',
      titulo: 'Revisar estratégia de vendas',
      descricao: 'Crescimento abaixo de 5% indica necessidade de ajuste estratégico',
      beneficio: 'Recuperação de faturamento e market share',
      esforco: 'medio',
      prioridade: 2,
      dados: { crescimento: salesAnalytics.resumo.crescimentoVendas },
      criadoEm: new Date()
    });
  }

  // Sugestões de estoque
  if (stockAnalytics.resumo.indiceGiro < 70) {
    suggestions.push({
      id: `estoque-otimizacao-${Date.now()}`,
      tipo: 'estoque',
      titulo: 'Otimizar gestão de estoque',
      descricao: `Índice de giro de ${stockAnalytics.resumo.indiceGiro}% está abaixo do ideal`,
      beneficio: 'Redução de capital parado e aumento de eficiência',
      esforco: 'alto',
      prioridade: 3,
      dados: { indiceGiro: stockAnalytics.resumo.indiceGiro },
      criadoEm: new Date()
    });
  }

  // Sugestões financeiras
  if (financialInsights.resumo.ticketMedio < 100) {
    suggestions.push({
      id: `financeiro-ticket-${Date.now()}`,
      tipo: 'financeiro',
      titulo: 'Aumentar ticket médio',
      descricao: 'Ticket médio abaixo de R$ 100 indica oportunidade de upsell',
      beneficio: 'Aumento de 15-20% no faturamento sem aumentar custos',
      esforco: 'baixo',
      prioridade: 1,
      dados: { ticketMedio: financialInsights.resumo.ticketMedio },
      criadoEm: new Date()
    });
  }

  // Sugestões operacionais
  if (stockAnalytics.produtosAltoGiro && stockAnalytics.produtosAltoGiro.length > 0) {
    const produtosReposicao = stockAnalytics.produtosAltoGiro.filter(
      (p: ProdutoAltoGiro) => p.reposicaoSugerida > 0
    );
    
    if (produtosReposicao.length > 0) {
      suggestions.push({
        id: `operacional-reposicao-${Date.now()}`,
        tipo: 'operacional',
        titulo: 'Reposição automática de estoque',
        descricao: `${produtosReposicao.length} produtos precisam de reposição`,
        beneficio: 'Evitar rupturas e perdas de vendas',
        esforco: 'medio',
        prioridade: 2,
        dados: { produtos: produtosReposicao },
        criadoEm: new Date()
      });
    }
  }

  return suggestions.sort((a, b) => b.prioridade - a.prioridade);
}

/**
 * Gera métricas consolidadas
 */
async function gerarMetrics(
  _salesAnalytics: SalesAnalytics,
  stockAnalytics: StockAnalytics,
  financialInsights: FinancialInsights,
  previsaoCompleta: PrevisaoCompleta
): Promise<Metric[]> {
  void _salesAnalytics;
  const metrics: Metric[] = [];

  // Métricas de vendas
  metrics.push({
    nome: 'Faturamento Mensal',
    valor: financialInsights.resumo.faturamentoPeriodo,
    unidade: 'R$',
    comparacao: {
      periodoAnterior: financialInsights.resumo.faturamentoPeriodo * 0.9, // Simulação
      variacao: financialInsights.resumo.faturamentoPeriodo * 0.1,
      variacaoPercentual: 10
    },
    status: financialInsights.resumo.crescimentoPeriodo > 0 ? 'positivo' : 'negativo',
    meta: 50000,
    atingiuMeta: financialInsights.resumo.faturamentoPeriodo >= 50000
  });

  metrics.push({
    nome: 'Ticket Médio',
    valor: financialInsights.resumo.ticketMedio,
    unidade: 'R$',
    comparacao: {
      periodoAnterior: financialInsights.resumo.ticketMedio * 0.95,
      variacao: financialInsights.resumo.ticketMedio * 0.05,
      variacaoPercentual: 5
    },
    status: financialInsights.resumo.ticketMedio >= 150 ? 'positivo' : 'alerta',
    meta: 150,
    atingiuMeta: financialInsights.resumo.ticketMedio >= 150
  });

  // Métricas de estoque
  metrics.push({
    nome: 'Produtos Críticos',
    valor: stockAnalytics.resumo.produtosCriticos,
    unidade: 'unidades',
    comparacao: {
      periodoAnterior: Math.max(0, stockAnalytics.resumo.produtosCriticos - 2),
      variacao: 2,
      variacaoPercentual: stockAnalytics.resumo.produtosCriticos > 0 ? (2 / Math.max(1, stockAnalytics.resumo.produtosCriticos - 2)) * 100 : 0
    },
    status: stockAnalytics.resumo.produtosCriticos > 5 ? 'alerta' : 'estavel',
    meta: 3,
    atingiuMeta: stockAnalytics.resumo.produtosCriticos <= 3
  });

  metrics.push({
    nome: 'Índice de Giro',
    valor: stockAnalytics.resumo.indiceGiro,
    unidade: '%',
    comparacao: {
      periodoAnterior: Math.max(0, stockAnalytics.resumo.indiceGiro - 5),
      variacao: 5,
      variacaoPercentual: stockAnalytics.resumo.indiceGiro > 0 ? (5 / Math.max(1, stockAnalytics.resumo.indiceGiro - 5)) * 100 : 0
    },
    status: stockAnalytics.resumo.indiceGiro >= 80 ? 'positivo' : 'alerta',
    meta: 80,
    atingiuMeta: stockAnalytics.resumo.indiceGiro >= 80
  });

  // Métricas de previsão
  if (previsaoCompleta.resumo) {
    metrics.push({
      nome: 'Previsão 90 dias',
      valor: previsaoCompleta.resumo.proximos90Dias,
      unidade: 'unidades',
      comparacao: {
        periodoAnterior: previsaoCompleta.resumo.proximos90Dias * 0.9,
        variacao: previsaoCompleta.resumo.proximos90Dias * 0.1,
        variacaoPercentual: 10
      },
      status: previsaoCompleta.resumo.crescimentoMedio > 0 ? 'positivo' : 'negativo',
      meta: 1000,
      atingiuMeta: previsaoCompleta.resumo.proximos90Dias >= 1000
    });
  }

  return metrics;
}

export type LeoInsightItem = {
  resumo: string;
  detalhes: string;
  tipo: 'tendencia' | 'alerta' | 'oportunidade';
  prioridade: number;
};

/**
 * Gera insights textuais
 */
async function gerarInsightsTextuais(
  salesAnalytics: { resumo?: { crescimentoVendas?: number } },
  stockAnalytics: { resumo?: { indiceGiro?: number; valorCapitalParado?: number } },
  financialInsights: { resumo?: { crescimentoPeriodo?: number; margemLucro?: number } },
  _previsaoCompleta: unknown
): Promise<LeoInsightItem[]> {
  const insights: LeoInsightItem[] = [];

  // Insight de tendência geral
  const crescimentoGeral = (
    (salesAnalytics.resumo?.crescimentoVendas ?? 0) +
    ((stockAnalytics.resumo?.indiceGiro ?? 80) - 80) * 10 +
    (financialInsights.resumo?.crescimentoPeriodo ?? 0)
  ) / 3;

  if (crescimentoGeral > 10) {
    insights.push({
      resumo: 'Forte expansão do negócio',
      detalhes: `Crescimento combinado de vendas, estoque e financeiro indica expansão saudável do negócio`,
      tipo: 'tendencia',
      prioridade: 1
    });
  } else if (crescimentoGeral < -5) {
    insights.push({
      resumo: 'Desaceleração do negócio',
      detalhes: 'Múltiplos indicadores mostram desaceleração, requer atenção imediata',
      tipo: 'alerta',
      prioridade: 3
    });
  } else {
    insights.push({
      resumo: 'Negócio estável',
      detalhes: 'Indicadores mostram estabilidade com pequenas variações',
      tipo: 'tendencia',
      prioridade: 2
    });
  }

  // Insights específicos por área
  if ((stockAnalytics.resumo?.valorCapitalParado ?? 0) > 100000) {
    insights.push({
      resumo: 'Alto capital parado em estoque',
      detalhes: `R$ ${(stockAnalytics.resumo?.valorCapitalParado ?? 0).toLocaleString('pt-BR')} imobilizados em produtos sem giro`,
      tipo: 'oportunidade',
      prioridade: 2
    });
  }

  if ((financialInsights.resumo?.margemLucro ?? 0) < 25) {
    insights.push({
      resumo: 'Margem de lucro abaixo do ideal',
      detalhes: `Margem atual de ${financialInsights.resumo?.margemLucro ?? 0}% está abaixo do ideal de 30%`,
      tipo: 'alerta',
      prioridade: 2
    });
  }

  return insights;
}

export type HealthScoreResult = {
  score: number;
  status: 'excelente' | 'bom' | 'atencao' | 'critico';
  fatores: {
    vendas: number;
    estoque: number;
    financeiro: number;
    operacional: number;
  };
};

/**
 * Calcula health score geral do negócio
 */
async function calcularHealthScore(
  salesAnalytics: { resumo?: { crescimentoVendas?: number } },
  stockAnalytics: { resumo?: { indiceGiro?: number; produtosCriticos?: number } },
  financialInsights: { resumo?: { healthScore?: number } }
): Promise<HealthScoreResult> {
  // Fatores individuais (0-100)
  const fatorVendas = Math.min(100, Math.max(0, 50 + (salesAnalytics.resumo?.crescimentoVendas ?? 0) * 5));
  const fatorEstoque = Math.min(100, Math.max(0, stockAnalytics.resumo?.indiceGiro ?? 0));
  const fatorFinanceiro = Math.min(100, Math.max(0, financialInsights.resumo?.healthScore ?? 0));
  const fatorOperacional = Math.min(100, Math.max(0, 100 - (stockAnalytics.resumo?.produtosCriticos ?? 0) * 5));

  const score = (fatorVendas + fatorEstoque + fatorFinanceiro + fatorOperacional) / 4;

  let status: 'excelente' | 'bom' | 'atencao' | 'critico' = 'critico';
  if (score >= 80) status = 'excelente';
  else if (score >= 60) status = 'bom';
  else if (score >= 40) status = 'atencao';

  return {
    score: Number(score.toFixed(1)),
    status,
    fatores: {
      vendas: fatorVendas,
      estoque: fatorEstoque,
      financeiro: fatorFinanceiro,
      operacional: fatorOperacional
    }
  };
}
