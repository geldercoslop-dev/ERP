/**
 * Sistema de Insights do LEO
 *
 * Analisa dados do ERP e gera sugestões inteligentes
 * Identifica oportunidades, riscos e padrões de negócio
 */

import type { Payload } from '../../../shared/types/index.js';
import { leoErpObserver } from '../perception/leo-erp-observer.js';
import { leoTaskQueue } from '../tasks/leo-task-queue.js';
import { insertLeoLegacyActionLog } from '../../services/leo-action-log.service.js';
import { InfrastructureError } from '../../_core/errors/typed-errors.js';

type InsertLeoActionLogParams = { usuario: string; acao: string; entidade: string; dados?: string | null; resultado: string };

async function insertLeoActionLog(params: InsertLeoActionLogParams): Promise<void> {
  await insertLeoLegacyActionLog(params);
}

/** Forma esperada do contexto ERP (cast a partir de Payload) */
interface ErpContextShape {
  vendas?: {
    quedaVendas?: boolean;
    percentualQueda?: number;
    percentualCrescimento?: number;
    ontem?: number;
    hoje?: number;
    picoPedidos?: boolean;
    percentualAumento?: number;
    produtoMaisVendido?: Array<{ produto: string; quantidade: number; valor: number }>;
    produtosQueda?: Array<{ produto: string; percentualQueda: number; vendasAnteriores: number; vendasAtuais: number }>;
  };
  pedidos?: { hoje?: number; total?: number };
  produtos?: {
    estoqueCritico?: number;
    semEstoque?: number;
    total?: number;
    parados?: number;
    valorTotalEstoque?: number;
  };
  clientes?: { inativos?: number; total?: number; semCompra?: number; novos?: number };
  financeiro?: {
    vencendoHoje?: number;
    contasReceber?: number;
    contasPagar?: number;
    valorAtrasado?: number;
  };
  logistica?: {
    entregasAtrasadas?: number;
    entregasHoje?: number;
    rotasPendentes?: number;
  };
}

export interface Insight {
  id: string;
  tipo: 'oportunidade' | 'risco' | 'tendencia' | 'recomendacao' | 'alerta' | 'padrao' | 'previsao';
  titulo: string;
  descricao: string;
  impacto: 'baixo' | 'medio' | 'alto' | 'critico';
  urgencia: 'baixa' | 'media' | 'alta' | 'critica';
  dados: Payload;
  timestamp: Date;
  status: 'ativo' | 'resolvido' | 'ignorado';
  acaoSugerida?: string;
  responsavel?: string;
  dataResolucao?: Date;
  resolucao?: string;
  probabilidade: number;
  validade: number;
  categoria?: 'vendas' | 'estoque' | 'clientes' | 'financeiro' | 'logistica' | 'operacional';
  tendencia?: 'crescente' | 'decrescente' | 'estavel' | 'volatil';
  previsao?: {
    proximoMes?: number;
    confianca?: number;
    cenario?: 'otimista' | 'realista' | 'pessimista';
  };
}

export interface InsightConfig {
  analiseVendas: boolean;
  analiseEstoque: boolean;
  analiseClientes: boolean;
  analiseFinanceiro: boolean;
  analiseLogistica: boolean; // Novo
  analiseConcorrencia: boolean;
  limiarAlertas: {
    vendasQueda: number; // percentual
    vendasCrescimento: number; // percentual
    estoqueCritico: number;
    inatividadeCliente: number; // dias
    taxaErroSistema: number; // percentual
    ticketAtrasado: number; // horas
    mediaTempoResolucao: number; // horas
    picoPedidos: number; // percentual
    atrasoEntrega: number; // horas
  };
  frequenciaAnalises: {
    vendas: '1h' | '6h' | '24h' | '7d' | '30d';
    estoque: '1h' | '6h' | '24h' | '7d' | '30d';
    clientes: '24h' | '7d' | '30d';
    financeiro: '24h' | '7d' | '30d';
    logistica: '6h' | '24h' | '7d' | '30d'; // Novo
    performance: '5m' | '15m' | '1h' | '6h';
  };
  previsoes: {
    habilitado: boolean;
    horizonteDias: number;
    modelos: ('media_movel' | 'regressao' | 'sazonalidade')[];
  };
}

export interface BusinessMetric {
  nome: string;
  valor: number;
  unidade: string;
  tendencia: 'crescente' | 'estavel' | 'decrescente';
  variacao: number; // percentual
  comparacao: {
    periodo: string;
    valorAnterior: number;
    valorAtual: number;
  };
  meta?: number;
  desempenho?: 'excelente' | 'bom' | 'regular' | 'ruim';
}

export interface Recommendation {
  tipo: 'acao' | 'melhoria' | 'investigacao' | 'automacao' | 'previsao';
  titulo: string;
  descricao: string;
  prioridade: 'baixa' | 'media' | 'alta' | 'critica';
  esforco: 'baixo' | 'medio' | 'alto';
  impactoEsperado: 'baixo' | 'medio' | 'alto' | 'critico';
  passos: string[];
  kpis: string[];
  responsavel: string;
  prazo?: string;
  custoEstimado?: number;
  retornoEstimado?: number;
  risco?: string;
}

/**
 * Gerador de insights do Leo
 */
class LeoInsights {
  private static instance: LeoInsights;
  private config: InsightConfig;
  private insightsAtivos = new Map<string, Insight>();
  private isRunning: boolean = false;
  private analysisInterval?: NodeJS.Timeout;

  private constructor() {
    this.config = {
      analiseVendas: true,
      analiseEstoque: true,
      analiseClientes: true,
      analiseFinanceiro: true,
      analiseLogistica: true, // Novo
      analiseConcorrencia: true,
      limiarAlertas: {
        vendasQueda: 15, // 15% de queda
        vendasCrescimento: 25, // 25% de crescimento
        estoqueCritico: 5, // 5 produtos
        inatividadeCliente: 30, // 30 dias
        taxaErroSistema: 5, // 5% de erros
        ticketAtrasado: 2, // 2 horas
        mediaTempoResolucao: 24, // 24 horas
        picoPedidos: 50, // 50% de aumento
        atrasoEntrega: 24, // 24 horas
      },
      frequenciaAnalises: {
        vendas: '1h',
        estoque: '1h',
        clientes: '24h',
        financeiro: '24h',
        logistica: '6h', // Novo
        performance: '15m',
      },
      previsoes: {
        habilitado: true,
        horizonteDias: 30,
        modelos: ['media_movel'],
      },
    };
  }

  public static getInstance(): LeoInsights {
    if (!LeoInsights.instance) {
      LeoInsights.instance = new LeoInsights();
    }
    return LeoInsights.instance;
  }

  /**
   * Converte string de intervalo para milissegundos
   */
  private getIntervaloMs(intervalo: string): number {
    const map: Record<string, number> = {
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    };
    return map[intervalo] || 60 * 60 * 1000; // Default 1h
  }

  /**
   * Inicia o sistema de insights
   */
  async iniciar(config?: Partial<InsightConfig>): Promise<{ success: boolean; message: string }> {
    try {
      if (this.isRunning) {
        return {
          success: false,
          message: 'Sistema de insights já está em execução',
        };
      }

      // Mesclar configuração
      if (config) {
        this.config = { ...this.config, ...config };
      }

      console.log('🔍 Iniciando sistema de insights do Leo...');
      console.log('⚙️ Configuração:', this.config);

      this.isRunning = true;

      // Iniciar análises periódicas
      this.startPeriodicAnalyses();

      // Executar análise inicial
      await this.executarAnaliseCompleta();

      await insertLeoActionLog({
        usuario: 'leo-insights',
        acao: 'iniciar_sistema_insights',
        entidade: 'leo_insights',
        dados: JSON.stringify({
          config: this.config,
          timestamp: new Date(),
        }),
        resultado: 'SUCESSO',
      });

      return {
        success: true,
        message: 'Sistema de insights iniciado com sucesso',
      };
    } catch (error) {
      console.error('[LeoInsights] Erro ao iniciar sistema:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao iniciar sistema de insights',
      };
    }
  }

  /**
   * Para o sistema de insights
   */
  async parar(): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.isRunning) {
        return {
          success: false,
          message: 'Sistema de insights não está em execução',
        };
      }

      console.log('⏹️ Parando sistema de insights do Leo...');

      this.isRunning = false;

      if (this.analysisInterval) {
        clearInterval(this.analysisInterval);
        this.analysisInterval = undefined;
      }

      await insertLeoActionLog({
        usuario: 'leo-insights',
        acao: 'parar_sistema_insights',
        entidade: 'leo_insights',
        dados: JSON.stringify({
          timestamp: new Date(),
        }),
        resultado: 'SUCESSO',
      });

      return {
        success: true,
        message: 'Sistema de insights parado com sucesso',
      };
    } catch (error) {
      console.error('[LeoInsights] Erro ao parar sistema:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao parar sistema de insights',
      };
    }
  }

  /**
   * Executa análise completa do sistema
   */
  async executarAnaliseCompleta(): Promise<Insight[]> {
    try {
      console.log('🔍 Executando análise completa do sistema...');
      
      const insights: Insight[] = [];
      
      // Análise de vendas
      if (this.config.analiseVendas) {
        const vendasInsights = await this.analisarVendas();
        insights.push(...vendasInsights);
      }

      // Análise de estoque
      if (this.config.analiseEstoque) {
        const estoqueInsights = await this.analisarEstoque();
        insights.push(...estoqueInsights);
      }

      // Análise de clientes
      if (this.config.analiseClientes) {
        const clientesInsights = await this.analisarClientes();
        insights.push(...clientesInsights);
      }

      // Análise financeira
      if (this.config.analiseFinanceiro) {
        const financeiroInsights = await this.analisarFinanceiro();
        insights.push(...financeiroInsights);
      }

      // Análise de performance
      if (this.config.analiseConcorrencia) {
        const performanceInsights = await this.analisarPerformance();
        insights.push(...performanceInsights);
      }

      // Análise de logística
      if (this.config.analiseLogistica) {
        const logisticaInsights = await this.analisarLogistica();
        insights.push(...logisticaInsights);
      }

      // Análise de tendências
      const tendenciaInsights = await this.analisarTendencias();
      insights.push(...tendenciaInsights);

      // Análise preditiva
      if (this.config.previsoes.habilitado) {
        const previsoes = await this.gerarPrevisoes();
        insights.push(...previsoes);
      }

      // Salvar insights gerados
      for (const insight of insights) {
        this.insightsAtivos.set(insight.id, insight);
      }

      console.log(`🔍 Análise concluída: ${insights.length} insights gerados`);
      
      return insights;
    } catch (error) {
      console.error('[LeoInsights] Erro na análise completa:', error);
      throw new InfrastructureError('Falha na análise completa', { cause: error });
    }
  }

  /**
   * Analisa dados de vendas e gera insights
   */
  private async analisarVendas(): Promise<Insight[]> {
    try {
      const raw = await leoErpObserver.collectErpContext();
      const contexto = raw as ErpContextShape;
      const insights: Insight[] = [];
      const vendas = contexto?.vendas;
      const pedidos = contexto?.pedidos;

      if (vendas?.quedaVendas && (vendas.percentualQueda ?? 0) >= this.config.limiarAlertas.vendasQueda) {
        const pct = vendas.percentualQueda ?? 0;
        insights.push({
          id: `venda_queda_${Date.now()}`,
          tipo: 'risco',
          titulo: 'Queda significativa nas vendas',
          descricao: `Vendas caíram ${pct.toFixed(1)}% nas últimas 24h`,
          impacto: this.calcularImpacto(pct),
          urgencia: this.calcularUrgencia(pct),
          dados: {
            percentualQueda: pct,
            valorPerdido: (vendas.ontem ?? 0) * (pct / 100),
            periodo: '24h',
          },
          timestamp: new Date(),
          status: 'ativo',
          probabilidade: 0.8,
          validade: 85,
          acaoSugerida: 'Investigar causas da queda e planejar ações de recuperação',
        });
      }

      const pctCresc = vendas?.percentualCrescimento ?? 0;
      if (pctCresc >= this.config.limiarAlertas.vendasCrescimento) {
        insights.push({
          id: `venda_crescimento_${Date.now()}`,
          tipo: 'oportunidade',
          titulo: 'Crescimento expressivo nas vendas',
          descricao: `Vendas cresceram ${pctCresc.toFixed(1)}% nas últimas 24h`,
          impacto: this.calcularImpacto(pctCresc),
          urgencia: this.calcularUrgencia(pctCresc),
          dados: {
            percentualCrescimento: pctCresc,
            valorAdicional: (vendas?.hoje ?? 0) * (pctCresc / 100),
            periodo: '24h',
          },
          timestamp: new Date(),
          status: 'ativo',
          probabilidade: 0.7,
          validade: 90,
          categoria: 'vendas',
          tendencia: 'crescente',
          acaoSugerida: 'Analisar fatores do crescimento e replicar estratégias',
        });
      }

      if (vendas?.picoPedidos) {
        const pctAum = vendas.percentualAumento ?? 0;
        insights.push({
          id: `pico_pedidos_${Date.now()}`,
          tipo: 'alerta',
          titulo: 'Pico anormal de pedidos detectado',
          descricao: `Aumento de ${pctAum.toFixed(0)}% nos pedidos`,
          impacto: 'alto',
          urgencia: 'alta',
          dados: {
            percentualAumento: pctAum,
            pedidosHoje: pedidos?.hoje,
            mediaNormal: (pedidos?.total ?? 0) / 30,
          },
          timestamp: new Date(),
          status: 'ativo',
          probabilidade: 0.8,
          validade: 95,
          categoria: 'vendas',
          tendencia: 'volatil',
          acaoSugerida: 'Verificar capacidade de atendimento e preparação de equipe',
        });
      }

      const produtoMaisVendido = vendas?.produtoMaisVendido;
      const produtoTop = produtoMaisVendido?.[0];
      if (produtoTop) {
        insights.push({
          id: `produto_top_${Date.now()}`,
          tipo: 'oportunidade',
          titulo: `Produto em alta: ${produtoTop.produto}`,
          descricao: `Produto "${produtoTop.produto}" gerou ${produtoTop.quantidade} vendas no valor de R$${produtoTop.valor.toLocaleString('pt-BR')}`,
          impacto: 'alto',
          urgencia: 'media',
          dados: {
            produto: produtoTop.produto,
            quantidade: produtoTop.quantidade,
            valor: produtoTop.valor,
          },
          timestamp: new Date(),
          status: 'ativo',
          probabilidade: 0.9,
          validade: 95,
          categoria: 'vendas',
          tendencia: 'crescente',
          acaoSugerida: 'Considerar aumento de estoque e campanhas de marketing',
        });
      }

      const produtosQueda = vendas?.produtosQueda ?? [];
      for (const produto of produtosQueda.slice(0, 3)) {
        insights.push({
          id: `produto_queda_${Date.now()}_${produto.produto}`,
          tipo: 'risco',
          titulo: `Queda nas vendas: ${produto.produto}`,
          descricao: `Produto "${produto.produto}" com queda de ${produto.percentualQueda.toFixed(1)}% nas vendas`,
          impacto: 'medio',
          urgencia: 'media',
          dados: {
            produto: produto.produto,
            percentualQueda: produto.percentualQueda,
            vendasAnteriores: produto.vendasAnteriores,
            vendasAtuais: produto.vendasAtuais,
          },
          timestamp: new Date(),
          status: 'ativo',
          probabilidade: 0.7,
          validade: 85,
          categoria: 'vendas',
          tendencia: 'decrescente',
          acaoSugerida: 'Investigar causas da queda e planejar ações de recuperação',
        });
      }

      return insights;
    } catch (error) {
      console.error('[LeoInsights] Erro na análise de vendas:', error);
      throw new InfrastructureError('Falha na análise de vendas', { cause: error });
    }
  }

  /**
   * Analisa dados de estoque e gera insights
   */
  private async analisarEstoque(): Promise<Insight[]> {
    try {
      const raw = await leoErpObserver.collectErpContext();
      const contexto = raw as ErpContextShape;
      const insights: Insight[] = [];
      const produtos = contexto?.produtos ?? {};

      const estoqueCritico = produtos.estoqueCritico ?? 0;
      if (estoqueCritico > 0) {
        insights.push({
          id: `estoque_critico_${Date.now()}`,
          tipo: 'risco',
          titulo: 'Estoque crítico detectado',
          descricao: `${estoqueCritico} produtos com estoque crítico precisam de atenção imediata`,
          impacto: this.calcularImpacto(estoqueCritico),
          urgencia: 'critica',
          dados: {
            produtosCriticos: estoqueCritico,
            totalProdutos: produtos.total,
          },
          timestamp: new Date(),
          status: 'ativo',
          probabilidade: 0.95,
          validade: 90,
          acaoSugerida: 'Gerar pedidos de compra automáticos para produtos críticos',
        });
      }

      const semEstoque = produtos.semEstoque ?? 0;
      if (semEstoque > 0) {
        insights.push({
          id: `estoque_zerado_${Date.now()}`,
          tipo: 'risco',
          titulo: 'Produtos sem estoque',
          descricao: `${semEstoque} produtos estão sem estoque, causando perda de vendas`,
          impacto: 'critico',
          urgencia: 'critica',
          dados: {
            produtosSemEstoque: semEstoque,
            totalProdutos: produtos.total,
          },
          timestamp: new Date(),
          status: 'ativo',
          probabilidade: 0.9,
          validade: 95,
          acaoSugerida: 'Identificar causas da falta e acionar reposição imediata',
        });
      }

      const parados = produtos.parados ?? 0;
      const totalProdutos = produtos.total ?? 1;
      if (parados > 0) {
        insights.push({
          id: `produtos_parados_${Date.now()}`,
          tipo: 'risco',
          titulo: 'Produtos sem movimento detectados',
          descricao: `${parados} produtos estão sem vendas há mais de 30 dias`,
          impacto: 'medio',
          urgencia: 'media',
          dados: {
            produtosParados: parados,
            totalProdutos,
            percentual: (parados / totalProdutos) * 100,
          },
          timestamp: new Date(),
          status: 'ativo',
          probabilidade: 0.7,
          validade: 80,
          categoria: 'estoque',
          tendencia: 'estavel',
          acaoSugerida: 'Avaliar necessidade de promoções ou descontinuação de produtos',
        });
      }

      const valorTotalEstoque = produtos.valorTotalEstoque ?? 0;
      const valorMedioEstoque = totalProdutos > 0 ? valorTotalEstoque / totalProdutos : 0;
      const limiarExcesso = valorMedioEstoque * 2;

      if (valorMedioEstoque > limiarExcesso) {
        insights.push({
          id: `excesso_estoque_${Date.now()}`,
          tipo: 'alerta',
          titulo: 'Excesso de estoque identificado',
          descricao: `Valor médio em estoque (R$${valorMedioEstoque.toLocaleString('pt-BR')}) acima do limite recomendado`,
          impacto: 'medio',
          urgencia: 'media',
          dados: {
            valorMedioEstoque,
            limiteExcesso: limiarExcesso,
            totalProdutos,
          },
          timestamp: new Date(),
          status: 'ativo',
          probabilidade: 0.6,
          validade: 80,
          categoria: 'estoque',
          tendencia: 'crescente',
          acaoSugerida: 'Analisar causas do excesso e planejar otimização',
        });
      }

      return insights;
    } catch (error) {
      console.error('[LeoInsights] Erro na análise de estoque:', error);
      throw new InfrastructureError('Falha na análise de estoque', { cause: error });
    }
  }

  /**
   * Analisa dados de clientes e gera insights
   */
  private async analisarClientes(): Promise<Insight[]> {
    try {
      const raw = await leoErpObserver.collectErpContext();
      const contexto = raw as ErpContextShape;
      const insights: Insight[] = [];
      const clientes = contexto?.clientes ?? {};

      const inativos = clientes.inativos ?? 0;
      const totalClientes = clientes.total ?? 0;
      if (inativos > 0) {
        insights.push({
          id: `clientes_inativos_${Date.now()}`,
          tipo: 'risco',
          titulo: 'Clientes inativos detectados',
          descricao: `${inativos} clientes estão inativos há mais de 30 dias`,
          impacto: this.calcularImpacto(inativos),
          urgencia: 'media',
          dados: {
            clientesInativos: inativos,
            totalClientes,
          },
          timestamp: new Date(),
          status: 'ativo',
          probabilidade: 0.8,
          validade: 85,
          acaoSugerida: 'Criar campanha de reengajamento para clientes inativos',
        });
      }

      const semCompra = clientes.semCompra ?? 0;
      if (semCompra > 0 && totalClientes > 0) {
        insights.push({
          id: `clientes_sem_compra_${Date.now()}`,
          tipo: 'risco',
          titulo: 'Clientes sem compra detectados',
          descricao: `${semCompra} clientes estão sem compra há mais de 30 dias`,
          impacto: this.calcularImpacto((semCompra / totalClientes) * 100),
          urgencia: 'media',
          dados: {
            clientesSemCompra: semCompra,
            totalClientes,
            percentual: (semCompra / totalClientes) * 100,
          },
          timestamp: new Date(),
          status: 'ativo',
          probabilidade: 0.8,
          validade: 85,
          categoria: 'clientes',
          tendencia: 'decrescente',
          acaoSugerida: 'Criar campanha de reengajamento para clientes inativos',
        });
      }

      const novos = clientes.novos ?? 0;
      if (totalClientes > 0 && inativos > novos * 2) {
        insights.push({
          id: `churn_clientes_${Date.now()}`,
          tipo: 'risco',
          titulo: 'Alta taxa de churn de clientes',
          descricao: `Taxa de perda de clientes (${inativos}) é maior que a aquisição (${novos})`,
          impacto: 'alto',
          urgencia: 'alta',
          dados: {
            clientesInativos: inativos,
            novosClientes: novos,
            taxaChurn: (inativos / totalClientes) * 100,
          },
          timestamp: new Date(),
          status: 'ativo',
          probabilidade: 0.9,
          validade: 90,
          categoria: 'clientes',
          tendencia: 'decrescente',
          acaoSugerida: 'Investigar causas do churn e implementar programa de retenção',
        });
      }

      if (novos > 0) {
        insights.push({
          id: `novos_clientes_${Date.now()}`,
          tipo: 'oportunidade',
          titulo: 'Novos clientes detectados',
          descricao: `${novos} novos clientes registrados hoje`,
          impacto: 'medio',
          urgencia: 'baixa',
          dados: {
            novosClientes: novos,
            totalClientes,
          },
          timestamp: new Date(),
          status: 'ativo',
          probabilidade: 0.7,
          validade: 90,
          acaoSugerida: 'Enviar boas-vindas e programa de onboarding',
        });
      }

      return insights;
    } catch (error) {
      console.error('[LeoInsights] Erro na análise de clientes:', error);
      throw new InfrastructureError('Falha na análise de clientes', { cause: error });
    }
  }

  /**
   * Analisa dados financeiros e gera insights
   */
  private async analisarFinanceiro(): Promise<Insight[]> {
    try {
      const raw = await leoErpObserver.collectErpContext();
      const contexto = raw as ErpContextShape;
      const insights: Insight[] = [];
      const fin = contexto?.financeiro ?? {};
      const vencendoHoje = fin.vencendoHoje ?? 0;
      const contasReceber = fin.contasReceber ?? 0;
      const contasPagar = fin.contasPagar ?? 0;
      const valorAtrasado = fin.valorAtrasado ?? 0;

      if (vencendoHoje > 0) {
        insights.push({
          id: `contas_vencer_${Date.now()}`,
          tipo: 'alerta',
          titulo: 'Contas a vencer hoje',
          descricao: `${vencendoHoje} contas vencendo hoje`,
          impacto: 'alto',
          urgencia: 'alta',
          dados: {
            contasVencendo: vencendoHoje,
            valorTotal: contasReceber,
          },
          timestamp: new Date(),
          status: 'ativo',
          probabilidade: 0.9,
          validade: 95,
          acaoSugerida: 'Entrar em contato com clientes para negociação',
        });
      }

      const saldoCaixa = contasReceber - contasPagar;
      if (saldoCaixa < 0) {
        insights.push({
          id: `fluxo_caixa_negativo_${Date.now()}`,
          tipo: 'risco',
          titulo: 'Fluxo de caixa negativo',
          descricao: `Contas a pagar (R$${contasPagar.toLocaleString('pt-BR')}) superam contas a receber (R$${contasReceber.toLocaleString('pt-BR')})`,
          impacto: 'critico',
          urgencia: 'critica',
          dados: {
            contasReceber,
            contasPagar,
            saldoCaixa,
          },
          timestamp: new Date(),
          status: 'ativo',
          probabilidade: 0.9,
          validade: 95,
          categoria: 'financeiro',
          tendencia: 'decrescente',
          acaoSugerida: 'Acelerar cobranças e renegociar pagamentos',
        });
      }

      if (contasReceber > 0 && valorAtrasado > contasReceber * 0.3) {
        insights.push({
          id: `concentracao_inadimplencia_${Date.now()}`,
          tipo: 'risco',
          titulo: 'Alta concentração de inadimplência',
          descricao: `${((valorAtrasado / contasReceber) * 100).toFixed(1)}% das contas a receber estão atrasadas`,
          impacto: 'alto',
          urgencia: 'alta',
          dados: {
            valorAtrasado,
            totalReceber: contasReceber,
            percentualAtrasado: (valorAtrasado / contasReceber) * 100,
          },
          timestamp: new Date(),
          status: 'ativo',
          probabilidade: 0.8,
          validade: 85,
          categoria: 'financeiro',
          tendencia: 'decrescente',
          acaoSugerida: 'Implementar política de cobrança mais rigorosa e oferecer descontos para pagamento antecipado',
        });
      }

      return insights;
    } catch (error) {
      console.error('[LeoInsights] Erro na análise financeira:', error);
      throw new InfrastructureError('Falha na análise financeira', { cause: error });
    }
  }

  /**
   * Analisa dados de logística e gera insights
   */
  private async analisarLogistica(): Promise<Insight[]> {
    try {
      const raw = await leoErpObserver.collectErpContext();
      const contexto = raw as ErpContextShape;
      const insights: Insight[] = [];
      const log = contexto?.logistica ?? {};
      const entregasAtrasadas = log.entregasAtrasadas ?? 0;
      const entregasHoje = log.entregasHoje ?? 0;
      const rotasPendentes = log.rotasPendentes ?? 0;

      if (entregasAtrasadas > 0) {
        const taxaAtraso = entregasHoje > 0 ? (entregasAtrasadas / entregasHoje) * 100 : 0;
        insights.push({
          id: `entregas_atrasadas_${Date.now()}`,
          tipo: 'risco',
          titulo: 'Entregas atrasadas detectadas',
          descricao: `${entregasAtrasadas} entregas estão atrasadas`,
          impacto: this.calcularImpacto(entregasAtrasadas),
          urgencia: 'alta',
          dados: {
            entregasAtrasadas,
            entregasHoje,
            taxaAtraso,
          },
          timestamp: new Date(),
          status: 'ativo',
          probabilidade: 0.8,
          validade: 90,
          categoria: 'logistica',
          tendencia: 'decrescente',
          acaoSugerida: 'Contatar transportadoras e realocar rotas',
        });
      }

      if (entregasHoje > 0) {
        const taxaEficiencia = ((entregasHoje - entregasAtrasadas) / entregasHoje) * 100;
        if (taxaEficiencia < 85) {
          insights.push({
            id: `eficiencia_entrega_baixa_${Date.now()}`,
            tipo: 'alerta',
            titulo: 'Baixa eficiência nas entregas',
            descricao: `Taxa de eficiência de entregas: ${taxaEficiencia.toFixed(1)}%`,
            impacto: 'medio',
            urgencia: 'media',
            dados: {
              taxaEficiencia,
              entregasHoje,
              entregasAtrasadas,
            },
            timestamp: new Date(),
            status: 'ativo',
            probabilidade: 0.7,
            validade: 80,
            categoria: 'logistica',
            tendencia: 'decrescente',
            acaoSugerida: 'Revisar processos logísticos e otimizar rotas',
          });
        }
      }

      if (rotasPendentes > 10) {
        insights.push({
          id: `rotas_pendentes_acumuladas_${Date.now()}`,
          tipo: 'alerta',
          titulo: 'Acúmulo de rotas pendentes',
          descricao: `${rotasPendentes} rotas estão pendentes de programação`,
          impacto: 'medio',
          urgencia: 'media',
          dados: {
            rotasPendentes,
            entregasHoje,
          },
          timestamp: new Date(),
          status: 'ativo',
          probabilidade: 0.6,
          validade: 75,
          categoria: 'logistica',
          tendencia: 'crescente',
          acaoSugerida: 'Alocar mais recursos para planejamento de rotas',
        });
      }

      return insights;
    } catch (error) {
      console.error('[LeoInsights] Erro na análise de logística:', error);
      throw new InfrastructureError('Falha na análise de logística', { cause: error });
    }
  }

  /**
   * Analisa dados de performance e gera insights
   */
  private async analisarPerformance(): Promise<Insight[]> {
    try {
      const insights: Insight[] = [];
      
      const stats = leoTaskQueue.getStats();
      const performance = process.memoryUsage();
      const totalTarefas = stats.total;
      const totalErros = stats.error ?? 0;

      if (totalErros > 0 && totalTarefas > 0) {
        const taxaErro = (totalErros / totalTarefas) * 100;
        if (taxaErro >= this.config.limiarAlertas.taxaErroSistema) {
          insights.push({
            id: `alta_taxa_erro_${Date.now()}`,
            tipo: 'risco',
            titulo: 'Alta taxa de erros detectada',
            descricao: `Taxa de erros de ${taxaErro.toFixed(1)}% excede limite aceitável`,
            impacto: 'alto',
            urgencia: 'critica',
            dados: {
              taxaErro,
              totalErros,
              totalTarefas,
            },
            timestamp: new Date(),
            status: 'ativo',
            probabilidade: 0.9,
            validade: 75,
            acaoSugerida: 'Investigar causas raiz dos erros e implementar correções',
          });
        }
      }

      // Verificar uso de memória
      const usoMemoria = (performance.heapUsed / performance.heapTotal) * 100;
      
      if (usoMemoria > 85) {
        insights.push({
          id: `alta_memoria_${Date.now()}`,
          tipo: 'alerta',
          titulo: 'Alto uso de memória detectado',
          descricao: `Uso de memória em ${usoMemoria.toFixed(1)}% da capacidade`,
          impacto: 'medio',
          urgencia: 'media',
          dados: {
            usoMemoria,
            heapUsed: performance.heapUsed,
            heapTotal: performance.heapTotal,
          },
          timestamp: new Date(),
          status: 'ativo',
          probabilidade: 0.7,
          validade: 70,
          acaoSugerida: 'Investigar gargalos de memória e otimizar processos',
        });
      }

      return insights;
    } catch (error) {
      console.error('[LeoInsights] Erro na análise de performance:', error);
      throw new InfrastructureError('Falha na análise de performance', { cause: error });
    }
  }

  /**
   * Gera previsões
   */
  private async gerarPrevisoes(): Promise<Insight[]> {
    try {
      const insights: Insight[] = [];
      
      // Simular geração de previsões
      // Em um ambiente real, isso consultaria modelos de machine learning
      
      // Previsão de vendas
      insights.push({
        id: `previsao_vendas_${Date.now()}`,
        tipo: 'previsao',
        titulo: 'Previsão de vendas para os próximos 30 dias',
        descricao: 'Análise indica aumento de 10% nas vendas',
        impacto: 'medio',
        urgencia: 'baixa',
        dados: {
          periodo: '30d',
          previsao: 'aumento',
          percentual: 10,
        },
        timestamp: new Date(),
        status: 'ativo',
        probabilidade: 0.6,
        validade: 60,
        acaoSugerida: 'Manter estratégias atuais e monitorar desvios',
      });
      
      // Previsão de estoque
      insights.push({
        id: `previsao_estoque_${Date.now()}`,
        tipo: 'previsao',
        titulo: 'Previsão de estoque para os próximos 30 dias',
        descricao: 'Análise indica redução de 5% no estoque',
        impacto: 'baixo',
        urgencia: 'baixa',
        dados: {
          periodo: '30d',
          previsao: 'reducao',
          percentual: 5,
        },
        timestamp: new Date(),
        status: 'ativo',
        probabilidade: 0.5,
        validade: 70,
        acaoSugerida: 'Continuar estratégia de reposição automática',
      });
      
      return insights;
    } catch (error) {
      console.error('[LeoInsights] Erro na geração de previsões:', error);
      throw new InfrastructureError('Falha na geração de previsões', { cause: error });
    }
  }

  /**
   * Analisa tendências de longo prazo
   */
  private async analisarTendencias(): Promise<Insight[]> {
    try {
      const insights: Insight[] = [];
      
      // Simular análise de tendências
      // Em um ambiente real, isso consultaria dados históricos
      
      // Tendência de vendas
      insights.push({
        id: `tendencia_vendas_${Date.now()}`,
        tipo: 'tendencia',
        titulo: 'Tendência de vendas estável',
        descricao: 'Análise indica padrão estável nas vendas dos últimos 30 dias',
        impacto: 'baixo',
        urgencia: 'baixa',
        dados: {
          periodo: '30d',
          tendencia: 'estavel',
        },
        timestamp: new Date(),
        status: 'ativo',
        probabilidade: 0.6,
        validade: 60,
        acaoSugerida: 'Manter estratégias atuais e monitorar desvios',
      });
      
      // Tendência de estoque
      insights.push({
        id: `tendencia_estoque_${Date.now()}`,
        tipo: 'tendencia',
        titulo: 'Rotação de estoque otimizada',
        descricao: 'Análise indica melhora na gestão de estoque',
        impacto: 'baixo',
        urgencia: 'baixa',
        dados: {
          periodo: '7d',
          tendencia: 'positiva',
        },
        timestamp: new Date(),
        status: 'ativo',
        probabilidade: 0.5,
        validade: 70,
        acaoSugerida: 'Continuar estratégia de reposição automática',
      });
      
      return insights;
    } catch (error) {
      console.error('[LeoInsights] Erro na análise de tendências:', error);
      throw new InfrastructureError('Falha na análise de tendências', { cause: error });
    }
  }

  /**
   * Calcula impacto baseado nos dados
   */
  private calcularImpacto(valor: number): 'baixo' | 'medio' | 'alto' | 'critico' {
    if (valor >= 50) return 'critico';
    if (valor >= 25) return 'alto';
    if (valor >= 10) return 'medio';
    return 'baixo';
  }

  /**
   * Calcula urgência baseada nos dados
   */
  private calcularUrgencia(valor: number): 'baixa' | 'media' | 'alta' | 'critica' {
    if (valor >= 80) return 'critica';
    if (valor >= 50) return 'alta';
    if (valor >= 20) return 'media';
    return 'baixa';
  }

  /**
   * Inicia análises periódicas
   */
  private startPeriodicAnalyses(): void {
    // Configurar análises baseado na frequência configurada
    const intervalos = {
      vendas: this.getIntervaloMs(this.config.frequenciaAnalises.vendas),
      estoque: this.getIntervaloMs(this.config.frequenciaAnalises.estoque),
      clientes: this.getIntervaloMs(this.config.frequenciaAnalises.clientes),
      logistica: this.getIntervaloMs(this.config.frequenciaAnalises.logistica),
      performance: this.getIntervaloMs(this.config.frequenciaAnalises.performance),
    };

    // Análise de vendas
    if (intervalos.vendas > 0) {
      setInterval(async () => {
        const insights = await this.analisarVendas();
        for (const insight of insights) {
          this.insightsAtivos.set(insight.id, insight);
        }
      }, intervalos.vendas);
    }

    // Análise de estoque
    if (intervalos.estoque > 0) {
      setInterval(async () => {
        const insights = await this.analisarEstoque();
        for (const insight of insights) {
          this.insightsAtivos.set(insight.id, insight);
        }
      }, intervalos.estoque);
    }

    // Análise de clientes
    if (intervalos.clientes > 0) {
      setInterval(async () => {
        const insights = await this.analisarClientes();
        for (const insight of insights) {
          this.insightsAtivos.set(insight.id, insight);
        }
      }, intervalos.clientes);
    }

    // Análise de logística
    if (intervalos.logistica > 0) {
      setInterval(async () => {
        const insights = await this.analisarLogistica();
        for (const insight of insights) {
          this.insightsAtivos.set(insight.id, insight);
        }
      }, intervalos.logistica);
    }

    // Análise de performance
    if (intervalos.performance > 0) {
      setInterval(async () => {
        const insights = await this.analisarPerformance();
        for (const insight of insights) {
          this.insightsAtivos.set(insight.id, insight);
        }
      }, intervalos.performance);
    }

    // Análise preditiva (diária)
    if (this.config.previsoes.habilitado) {
      setInterval(async () => {
        const insights = await this.gerarPrevisoes();
        for (const insight of insights) {
          this.insightsAtivos.set(insight.id, insight);
        }
      }, 24 * 60 * 60 * 1000); // Diariamente
    }

    // Análise de tendências (diário)
    setInterval(async () => {
      const insights = await this.analisarTendencias();
      for (const insight of insights) {
        this.insightsAtivos.set(insight.id, insight);
      }
    }, 24 * 60 * 60 * 1000); // Diariamente
  }

  /**
   * Resolve um insight específico
   */
  async resolverInsight(insightId: string, resolucao?: string, responsavel?: string): Promise<{ success: boolean; message: string }> {
    try {
      const insight = this.insightsAtivos.get(insightId);
      
      if (!insight) {
        return {
          success: false,
          message: 'Insight não encontrado',
        };
      }

      // Atualizar status
      insight.status = 'resolvido';
      insight.dataResolucao = new Date();
      
      if (resolucao) {
        insight.resolucao = resolucao;
      }
      
      if (responsavel) {
        insight.responsavel = responsavel;
      }

      this.insightsAtivos.set(insightId, insight);

      await insertLeoActionLog({
        usuario: 'leo-insights',
        acao: 'resolver_insight',
        entidade: 'leo_insights',
        dados: JSON.stringify({
          insightId,
          resolucao,
          responsavel,
        }),
        resultado: 'SUCESSO',
      });

      console.log(`✅ Insight resolvido: ${insight.titulo}`);

      return {
        success: true,
        message: `Insight resolvido com sucesso`,
      };
    } catch (error) {
      console.error('[LeoInsights] Erro ao resolver insight:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao resolver insight',
      };
    }
  }

  /**
   * Ignora um insight
   */
  async ignorarInsight(insightId: string): Promise<{ success: boolean; message: string }> {
    try {
      const insight = this.insightsAtivos.get(insightId);
      
      if (!insight) {
        return {
          success: false,
          message: 'Insight não encontrado',
        };
      }

      insight.status = 'ignorado';
      this.insightsAtivos.set(insightId, insight);

      await insertLeoActionLog({
        usuario: 'leo-insights',
        acao: 'ignorar_insight',
        entidade: 'leo_insights',
        dados: JSON.stringify({
          insightId,
        }),
        resultado: 'SUCESSO',
      });

      console.log(`🚫 Insight ignorado: ${insight.titulo}`);

      return {
        success: true,
        message: 'Insight ignorado com sucesso',
      };
    } catch (error) {
      console.error('[LeoInsights] Erro ao ignorar insight:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao ignorar insight',
      };
    }
  }

  /**
   * Obtém estatísticas dos insights
   */
  async getEstatisticas(): Promise<{
    total: number;
    ativos: number;
    resolvidos: number;
    ignorados: number;
    porTipo: Record<string, number>;
    porImpacto: Record<string, number>;
    porUrgencia: Record<string, number>;
  }> {
    const insights = Array.from(this.insightsAtivos.values());
    
    const porTipo = {
      oportunidade: insights.filter((i: Insight) => i.tipo === 'oportunidade').length,
      risco: insights.filter((i: Insight) => i.tipo === 'risco').length,
      tendencia: insights.filter((i: Insight) => i.tipo === 'tendencia').length,
      recomendacao: insights.filter((i: Insight) => i.tipo === 'recomendacao').length,
      alerta: insights.filter((i: Insight) => i.tipo === 'alerta').length,
    };

    const porImpacto = {
      critico: insights.filter((i: Insight) => i.impacto === 'critico').length,
      alto: insights.filter((i: Insight) => i.impacto === 'alto').length,
      medio: insights.filter((i: Insight) => i.impacto === 'medio').length,
      baixo: insights.filter((i: Insight) => i.impacto === 'baixo').length,
    };

    const porUrgencia = {
      critica: insights.filter((i: Insight) => i.urgencia === 'critica').length,
      alto: insights.filter((i: Insight) => i.urgencia === 'alta').length,
      media: insights.filter((i: Insight) => i.urgencia === 'media').length,
      baixa: insights.filter((i: Insight) => i.urgencia === 'baixa').length,
    };

    return {
      total: insights.length,
      ativos: insights.filter((i: Insight) => i.status === 'ativo').length,
      resolvidos: insights.filter((i: Insight) => i.status === 'resolvido').length,
      ignorados: insights.filter((i: Insight) => i.status === 'ignorado').length,
      porTipo,
      porImpacto,
      porUrgencia,
    };
  }

  /**
   * Obtém configuração atual
   */
  getConfig(): InsightConfig {
    return { ...this.config };
  }

  /**
   * Atualiza configuração
   */
  async atualizarConfig(novaConfig: Partial<InsightConfig>): Promise<{ success: boolean; message: string }> {
    try {
      this.config = { ...this.config, ...novaConfig };
      
      await insertLeoActionLog({
        usuario: 'leo-insights',
        acao: 'atualizar_configuracao',
        entidade: 'leo_insights',
        dados: JSON.stringify({
          novaConfig,
          configFinal: this.config,
        }),
        resultado: 'SUCESSO',
      });

      console.log('⚙️ Configuração atualizada:', this.config);
      
      return {
        success: true,
        message: 'Configuração atualizada com sucesso',
      };
    } catch (error) {
      console.error('[LeoInsights] Erro ao atualizar configuração:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao atualizar configuração',
      };
    }
  }
}

// Exportar instância singleton
export const leoInsights = LeoInsights.getInstance();
