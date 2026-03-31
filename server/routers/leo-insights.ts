/**
 * LEO Insights API Router
 * 
 * Endpoint para fornecer insights do LEO para dashboards
 */

import { Router, Request } from 'express';
import { getLeoInsights } from '../services/leo-insights.service.js';

const router = Router();

const DEFAULT_TENANT_ID = 1;

function tenantIdFromReq(req: Request): number {
  const id = (req as Request & { tenantId?: number }).tenantId;
  return typeof id === 'number' && Number.isInteger(id) ? id : DEFAULT_TENANT_ID;
}

/**
 * GET /leo/insights
 * 
 * Retorna insights completos do LEO incluindo:
 * - Análises de vendas, estoque e financeiro
 * - Previsões e tendências
 * - Alerts e sugestões acionáveis
 * - Métricas e health score
 */
router.get('/insights', async (req, res) => {
  try {
    console.log('[LEO Insights API] Requisitando insights completos');
    
    const insights = await getLeoInsights(tenantIdFromReq(req));
    
    // Adicionar headers para cache control
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json({
      success: true,
      data: insights,
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });

  } catch (error: unknown) {
    console.error('[LEO Insights API] Erro ao gerar insights:', error instanceof Error ? error.message : String(error));
    
    res.status(500).json({
      success: false,
      error: 'Erro interno ao gerar insights',
      details: error instanceof Error ? error.message : 'Erro desconhecido',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /leo/insights/alerts
 * 
 * Retorna apenas os alerts gerados pelo LEO
 */
router.get('/insights/alerts', async (req, res) => {
  try {
    const insights = await getLeoInsights(tenantIdFromReq(req));
    
    res.json({
      success: true,
      data: {
        alerts: insights.alerts,
        total: insights.alerts.length,
        criticos: insights.alerts.filter(a => a.tipo === 'critico').length,
        alertas: insights.alerts.filter(a => a.tipo === 'alerta').length,
        oportunidades: insights.alerts.filter(a => a.tipo === 'oportunidade').length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: unknown) {
    console.error('[LEO Insights API] Erro ao buscar alerts:', error instanceof Error ? error.message : String(error));
    
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar alerts',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /leo/insights/suggestions
 * 
 * Retorna apenas as sugestões geradas pelo LEO
 */
router.get('/insights/suggestions', async (req, res) => {
  try {
    const insights = await getLeoInsights(tenantIdFromReq(req));
    
    res.json({
      success: true,
      data: {
        suggestions: insights.suggestions,
        total: insights.suggestions.length,
        porTipo: {
          vendas: insights.suggestions.filter(s => s.tipo === 'vendas').length,
          estoque: insights.suggestions.filter(s => s.tipo === 'estoque').length,
          financeiro: insights.suggestions.filter(s => s.tipo === 'financeiro').length,
          operacional: insights.suggestions.filter(s => s.tipo === 'operacional').length
        },
        porPrioridade: {
          alta: insights.suggestions.filter(s => s.prioridade >= 3).length,
          media: insights.suggestions.filter(s => s.prioridade === 2).length,
          baixa: insights.suggestions.filter(s => s.prioridade === 1).length
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: unknown) {
    console.error('[LEO Insights API] Erro ao buscar suggestions:', error instanceof Error ? error.message : String(error));
    
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar suggestions',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /leo/insights/metrics
 * 
 * Retorna apenas as métricas calculadas pelo LEO
 */
router.get('/insights/metrics', async (req, res) => {
  try {
    const insights = await getLeoInsights(tenantIdFromReq(req));
    
    res.json({
      success: true,
      data: {
        metrics: insights.metrics,
        resumo: {
          totalMetricas: insights.metrics.length,
          positivas: insights.metrics.filter(m => m.status === 'positivo').length,
          alertas: insights.metrics.filter(m => m.status === 'alerta').length,
          negativas: insights.metrics.filter(m => m.status === 'negativo').length,
          metasAtingidas: insights.metrics.filter(m => m.atingiuMeta).length
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: unknown) {
    console.error('[LEO Insights API] Erro ao buscar metrics:', error instanceof Error ? error.message : String(error));
    
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar metrics',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /leo/insights/health
 * 
 * Retorna apenas o health score do negócio
 */
router.get('/insights/health', async (req, res) => {
  try {
    const insights = await getLeoInsights(tenantIdFromReq(req));
    
    res.json({
      success: true,
      data: {
        health: insights.health,
        recomendacoes: gerarRecomendacoesHealth(insights.health),
        statusDetalhado: {
          vendas: insights.health.fatores.vendas >= 70 ? 'bom' : 'atencao',
          estoque: insights.health.fatores.estoque >= 70 ? 'bom' : 'atencao',
          financeiro: insights.health.fatores.financeiro >= 70 ? 'bom' : 'atencao',
          operacional: insights.health.fatores.operacional >= 70 ? 'bom' : 'atencao'
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: unknown) {
    console.error('[LEO Insights API] Erro ao buscar health:', error instanceof Error ? error.message : String(error));
    
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar health score',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /leo/insights/summary
 * 
 * Retorna um resumo executivo dos insights
 */
router.get('/insights/summary', async (req, res) => {
  try {
    const insights = await getLeoInsights(tenantIdFromReq(req));
    
    const resumo = {
      geral: {
        healthScore: insights.health.score,
        status: insights.health.status,
        totalAlerts: insights.alerts.length,
        totalSuggestions: insights.suggestions.length,
        totalInsights: insights.insights.length
      },
      alertsPorTipo: {
        criticos: insights.alerts.filter(a => a.tipo === 'critico').length,
        alertas: insights.alerts.filter(a => a.tipo === 'alerta').length,
        oportunidades: insights.alerts.filter(a => a.tipo === 'oportunidade').length
      },
      topPrioridades: {
        alerts: insights.alerts.slice(0, 5).map(a => ({ titulo: a.titulo, urgencia: a.urgencia })),
        suggestions: insights.suggestions.slice(0, 5).map(s => ({ titulo: s.titulo, beneficio: s.beneficio }))
      },
      geradoEm: insights.geradoEm
    };

    res.json({
      success: true,
      data: resumo,
      timestamp: new Date().toISOString()
    });

  } catch (error: unknown) {
    console.error('[LEO Insights API] Erro ao gerar summary:', error instanceof Error ? error.message : String(error));
    
    res.status(500).json({
      success: false,
      error: 'Erro ao gerar resumo',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Gera recomendações baseadas no health score
 */
function gerarRecomendacoesHealth(health: {
  score: number;
  status: string;
  fatores?: { vendas: number; estoque: number; financeiro: number; operacional: number };
}): string[] {
  const recomendacoes: string[] = [];
  const fatores = health.fatores ?? { vendas: 0, estoque: 0, financeiro: 0, operacional: 0 };

  if (health.score < 40) {
    recomendacoes.push('Atenção crítica: Múltiplos indicadores abaixo do esperado');
    recomendacoes.push('Recomenda-se reunião de emergência para planejamento');
    recomendacoes.push('Considerar revisão completa de estratégias');
  } else if (health.score < 60) {
    recomendacoes.push('Atenção: Alguns indicadores precisam de melhorias');
    recomendacoes.push('Focar em áreas com scores mais baixos');
    recomendacoes.push('Revisar metas e planos de ação');
  } else if (health.score < 80) {
    recomendacoes.push('Situação estável com oportunidades de melhoria');
    recomendacoes.push('Monitorar tendências e ajustar operações');
  } else {
    recomendacoes.push('Excelente: Negócio operando acima das metas');
    recomendacoes.push('Manter foco em sustentação do crescimento');
  }

  if (fatores.vendas < 60) {
    recomendacoes.push('Revisar estratégia comercial e treinamento de equipe');
  }
  if (fatores.estoque < 60) {
    recomendacoes.push('Otimizar gestão de estoque e compras');
  }
  if (fatores.financeiro < 60) {
    recomendacoes.push('Revisar controle financeiro e fluxo de caixa');
  }
  if (fatores.operacional < 60) {
    recomendacoes.push('Melhorar processos e eficiência operacional');
  }

  return recomendacoes;
}

export default router;
