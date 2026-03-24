/**
 * Motor de Aprendizado Contínuo do LEO
 * 
 * Sistema que aprende com:
 * - Histórico de vendas
 * - Histórico de clientes
 * - Histórico de estoque
 * - Ações executadas
 * - Resultados obtidos
 */

import * as ordersService from '../../services/orders.service';
import * as clientesService from '../../services/clientes.service';
import * as inventoryService from '../../services/inventory.service';
import { ADMIN_ACTOR } from '../../_core/service-actor';
import { leoLongMemory } from '../memory/leo-long-memory';

const DEFAULT_LEO_TENANT_ID = 1;

export interface LearningPattern {
  type: 'sales' | 'customer' | 'inventory' | 'pricing';
  pattern: string;
  confidence: number;
  frequency: number;
  lastSeen: Date;
  impact: 'positive' | 'negative' | 'neutral';
}

export interface LearningInsight {
  category: string;
  insight: string;
  recommendation: string;
  confidence: number;
  dataPoints: Record<string, unknown>[];
}

/**
 * Classe principal do motor de aprendizado
 */
export class LeoLearningEngine {
  private static instance: LeoLearningEngine;
  private isLearning: boolean = false;
  private learningInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): LeoLearningEngine {
    if (!LeoLearningEngine.instance) {
      LeoLearningEngine.instance = new LeoLearningEngine();
    }
    return LeoLearningEngine.instance;
  }

  /**
   * Inicia o processo de aprendizado contínuo
   */
  public startLearning(intervalMs: number = 3600000): void { // 1 hora
    if (this.isLearning) {
      console.log('🧠 Leo Learning Engine já está rodando');
      return;
    }

    console.log('🚀 Iniciando Motor de Aprendizado do Leo...');
    this.isLearning = true;

    // Executa primeira vez imediatamente
    this.executeLearningCycle();

    // Configura execução periódica
    this.learningInterval = setInterval(() => {
      this.executeLearningCycle();
    }, intervalMs);

    console.log(`✅ Learning iniciado com intervalo de ${intervalMs}ms`);
  }

  /**
   * Para o processo de aprendizado
   */
  public stopLearning(): void {
    if (!this.isLearning) {
      console.log('⏸️ Leo Learning Engine já está parado');
      return;
    }

    console.log('🛑 Parando Motor de Aprendizado do Leo...');
    this.isLearning = false;

    if (this.learningInterval) {
      clearInterval(this.learningInterval);
      this.learningInterval = null;
    }

    console.log('✅ Learning parado com sucesso');
  }

  /**
   * Executa um ciclo completo de aprendizado
   */
  private async executeLearningCycle(): Promise<void> {
    try {
      console.log('🔄 Executando ciclo de aprendizado...');
      
      const startTime = Date.now();
      
      // 1. Aprender com vendas
      await this.learnFromSales();
      
      // 2. Aprender com clientes
      await this.learnFromCustomers();
      
      // 3. Aprender com estoque
      await this.learnFromInventory();
      
      // 4. Aprender com preços
      await this.learnFromPricing();
      
      // 5. Gerar insights combinados
      await this.generateCombinedInsights();
      
      const duration = Date.now() - startTime;
      console.log(`✅ Ciclo de aprendizado concluído em ${duration}ms`);
      
    } catch (error) {
      console.error('❌ Erro no ciclo de aprendizado:', error);
    }
  }

  /**
   * Aprende com o histórico de vendas
   */
  private async learnFromSales(): Promise<void> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const rows = await ordersService.leoAggregatePedidosByDayAndVendedor(DEFAULT_LEO_TENANT_ID, thirtyDaysAgo);
      const salesData: Record<string, unknown>[] = rows.map((r) => ({
        date: r.day,
        count: r.count,
        total: r.total,
        avgTicket: r.avgTicket,
        vendedorId: r.vendedorId,
      }));
      await this.detectSalesPatterns(salesData);
      await this.analyzeSalesPerformance(salesData);
    } catch (error) {
      console.error('Erro ao aprender com vendas:', error);
    }
  }

  /**
   * Aprende com o histórico de clientes
   */
  private async learnFromCustomers(): Promise<void> {
    try {
      const rows = await clientesService.listClientesComMetricasPedidos(DEFAULT_LEO_TENANT_ID, ADMIN_ACTOR, 500);
      const customerData: Record<string, unknown>[] = rows.map((c) => ({
        id: c.id,
        nome: c.nome,
        dataCriacao: c.createdAt,
        totalPedidos: c.totalPedidos,
        totalGasto: c.totalGasto,
        avgTicket: c.avgTicket,
      }));
      await this.detectCustomerPatterns(customerData);
      await this.identifyAtRiskCustomers(customerData);
    } catch (error) {
      console.error('Erro ao aprender com clientes:', error);
    }
  }

  /**
   * Aprende com o histórico de estoque
   */
  private async learnFromInventory(): Promise<void> {
    try {
      const rows = await inventoryService.listProdutosResumoLeoLearning(DEFAULT_LEO_TENANT_ID);
      const inventoryData: Record<string, unknown>[] = rows.map((p) => ({
        id: p.id,
        descricao: p.descricao,
        estoqueAtual: p.estoque,
        estoqueMinimo: 0,
        categoria: p.categoria,
        preco: p.valorVenda,
      }));
      await this.detectInventoryPatterns(inventoryData);
      await this.identifySlowMovingProducts(inventoryData);
    } catch (error) {
      console.error('Erro ao aprender com estoque:', error);
    }
  }

  /**
   * Aprende com estratégias de preços
   */
  private async learnFromPricing(): Promise<void> {
    try {
      const rows = await inventoryService.listProdutoVendasStatsLeoLearning(DEFAULT_LEO_TENANT_ID);
      const pricingData: Record<string, unknown>[] = rows.map((p) => ({
        produtoId: p.produtoId,
        descricao: p.descricao,
        preco: Number(p.preco),
        categoria: p.categoria,
        vendas: p.vendasCount,
        receita: p.receita,
      }));
      await this.detectPricingPatterns(pricingData);
    } catch (error) {
      console.error('Erro ao aprender com preços:', error);
    }
  }

  /**
   * Detecta padrões de vendas
   */
  private async detectSalesPatterns(salesData: Record<string, unknown>[]): Promise<void> {
    try {
      // Padrão 1: Dias de pico de vendas
      const dailyAverages = this.calculateDailyAverages(salesData);
      const peakDays = dailyAverages.filter((day: any) => day.sales > day.average * 1.5);
      
      if (peakDays.length > 0) {
        await leoLongMemory.savePattern(
          DEFAULT_LEO_TENANT_ID,
          `Dias de pico de vendas identificados: ${peakDays.map((d: { day?: string }) => d.day).join(', ')}`,
          `Análise de ${salesData.length} registros de vendas`,
          'high'
        );
      }

      const trend = this.calculateSalesTrend(salesData);
      if (trend.trend !== 'stable') {
        await leoLongMemory.savePattern(
          DEFAULT_LEO_TENANT_ID,
          `Tendência de vendas: ${trend.trend} (${trend.percentage.toFixed(1)}%)`,
          `Análise de tendência dos últimos 30 dias`,
          trend.trend === 'increasing' ? 'high' : 'critical'
        );
      }

      const avgTicketPattern = this.analyzeAverageTicket(salesData);
      if (avgTicketPattern.insight) {
        await leoLongMemory.saveInsight(
          DEFAULT_LEO_TENANT_ID,
          avgTicketPattern.insight,
          'Análise de ticket médio',
          'medium'
        );
      }

    } catch (error) {
      console.error('Erro ao detectar padrões de vendas:', error);
    }
  }

  /**
   * Detecta padrões de comportamento de clientes
   */
  private async detectCustomerPatterns(customerData: Record<string, unknown>[]): Promise<void> {
    try {
      // Padrão 1: Sazonalidade de compras
      const inactiveThreshold = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const inactiveCustomers = customerData.filter((c: { dataCriacao?: Date; totalPedidos?: number }) =>
        (c.totalPedidos ?? 0) === 0 && c.dataCriacao && new Date(c.dataCriacao) < inactiveThreshold
      );

      if (inactiveCustomers.length > 0) {
        await leoLongMemory.saveAlert(
          DEFAULT_LEO_TENANT_ID,
          `${inactiveCustomers.length} clientes estão inativos há mais de 60 dias`,
          `Análise de ${customerData.length} clientes`,
          'high'
        );
      }

      const highValueCustomers = customerData.filter((c: { totalGasto?: number }) => (c.totalGasto ?? 0) > 10000);
      if (highValueCustomers.length > 0) {
        await leoLongMemory.saveStrategy(
          DEFAULT_LEO_TENANT_ID,
          `Identificados ${highValueCustomers.length} clientes de alto valor (acima de R$ 10.000)`,
          'Estratégia de retenção de clientes',
          'high'
        );
      }

    } catch (error) {
      console.error('Erro ao detectar padrões de clientes:', error);
    }
  }

  /**
   * Detecta padrões de estoque
   */
  private async detectInventoryPatterns(inventoryData: any[]): Promise<void> {
    try {
      // Padrão 1: Estoque crítico
      const criticalStock = inventoryData.filter((p: any) => p.estoqueAtual < p.estoqueMinimo);
      
      const defaultTenantId = 1;
      if (criticalStock.length > 0) {
        await leoLongMemory.saveAlert(
          defaultTenantId,
          `${criticalStock.length} produtos com estoque crítico`,
          `Análise de ${inventoryData.length} produtos`,
          'critical'
        );
      }

      // Padrão 2: Categorias com problemas
      const categoryIssues = this.analyzeCategoryStock(inventoryData);
      
      for (const issue of categoryIssues) {
        await leoLongMemory.saveInsight(
          defaultTenantId,
          `Categoria ${issue.category}: ${issue.issue}`,
          'Análise por categoria de produtos',
          'medium'
        );
      }

    } catch (error) {
      console.error('Erro ao detectar padrões de estoque:', error);
    }
  }

  /**
   * Detecta padrões de precificação
   */
  private async detectPricingPatterns(pricingData: any[]): Promise<void> {
    try {
      // Padrão 1: Produtos sem vendas
      const noSalesProducts = pricingData.filter((p: any) => p.vendas === 0);
      
      if (noSalesProducts.length > 0) {
        await leoLongMemory.saveAlert(
          DEFAULT_LEO_TENANT_ID,
          `${noSalesProducts.length} produtos não tiveram vendas registradas`,
          'Análise de performance de produtos',
          'medium'
        );
      }

      const priceDemandInsights = this.analyzePriceDemandCorrelation(pricingData);
      for (const insight of priceDemandInsights) {
        await leoLongMemory.saveInsight(
          DEFAULT_LEO_TENANT_ID,
          insight.insight,
          'Análise de precificação',
          'high'
        );
      }

    } catch (error) {
      console.error('Erro ao detectar padrões de precificação:', error);
    }
  }

  /**
   * Gera insights combinados
   */
  private async generateCombinedInsights(): Promise<void> {
    try {
      // Insight 1: Oportunidades de cross-selling
      await this.generateCrossSellInsights();
      
      // Insight 2: Previsão de demanda
      await this.generateDemandForecast();
      
      // Insight 3: Recomendações estratégicas
      await this.generateStrategicRecommendations();
      
    } catch (error) {
      console.error('Erro ao gerar insights combinados:', error);
    }
  }

  /**
   * Calcula médias diárias de vendas
   */
  private calculateDailyAverages(salesData: any[]): any[] {
    const dailySales: { [key: string]: number[] } = {};
    
    // Agrupa vendas por dia da semana
    salesData.forEach(sale => {
      const date = new Date(sale.date);
      const dayOfWeek = date.toLocaleDateString('pt-BR', { weekday: 'long' });
      
      if (!dailySales[dayOfWeek]) {
        dailySales[dayOfWeek] = [];
      }
      dailySales[dayOfWeek].push(sale.count);
    });

    // Calcula médias
    const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    return days.map((day: any) => {
      const values = dailySales[day] || [0];
      const average = values.reduce((a: any, b: any) => a + b, 0) / values.length;
      
      return {
        day,
        sales: values[values.length - 1] || 0,
        average,
        ratio: average > 0 ? (values[values.length - 1] || 0) / average : 0
      };
    });
  }

  /**
   * Calcula tendência de vendas
   */
  private calculateSalesTrend(salesData: any[]): { trend: string; percentage: number } {
    if (salesData.length < 2) {
      return { trend: 'stable', percentage: 0 };
    }

    const recent = salesData.slice(0, Math.floor(salesData.length / 2));
    const older = salesData.slice(Math.floor(salesData.length / 2));

    const recentTotal = recent.reduce((sum: any, day: any) => sum + day.total, 0);
    const olderTotal = older.reduce((sum: any, day: any) => sum + day.total, 0);

    if (olderTotal === 0) {
      return { trend: 'stable', percentage: 0 };
    }

    const change = ((recentTotal - olderTotal) / olderTotal) * 100;
    
    if (change > 5) {
      return { trend: 'increasing', percentage: change };
    } else if (change < -5) {
      return { trend: 'decreasing', percentage: Math.abs(change) };
    } else {
      return { trend: 'stable', percentage: 0 };
    }
  }

  /**
   * Analisa ticket médio
   */
  private analyzeAverageTicket(salesData: any[]): { insight?: string } {
    const avgTickets = salesData.map((d: any) => d.avgTicket).filter((t: any) => t > 0);
    
    if (avgTickets.length < 2) {
      return {};
    }

    const overallAvg = avgTickets.reduce((a: any, b: any) => a + b, 0) / avgTickets.length;
    const recentAvg = avgTickets.slice(0, 7).reduce((a: any, b: any) => a + b, 0) / Math.min(7, avgTickets.length);

    const change = ((recentAvg - overallAvg) / overallAvg) * 100;

    if (Math.abs(change) > 10) {
      return {
        insight: `Ticket médio ${change > 0 ? 'aumentou' : 'diminuiu'} ${Math.abs(change).toFixed(1)}% recentemente`
      };
    }

    return {};
  }

  /**
   * Analisa estoque por categoria
   */
  private analyzeCategoryStock(inventoryData: any[]): any[] {
    const categoryStats: { [key: string]: { total: number; critical: number; outOfStock: number } } = {};
    
    inventoryData.forEach(product => {
      const category = product.categoria || 'Sem Categoria';
      
      if (!categoryStats[category]) {
        categoryStats[category] = { total: 0, critical: 0, outOfStock: 0 };
      }
      
      categoryStats[category].total++;
      
      if (product.estoqueAtual === 0) {
        categoryStats[category].outOfStock++;
      } else if (product.estoqueAtual < product.estoqueMinimo) {
        categoryStats[category].critical++;
      }
    });

    const issues: any[] = [];
    
    Object.entries(categoryStats).forEach(([category, stats]) => {
      const criticalRatio = stats.critical / stats.total;
      const outOfStockRatio = stats.outOfStock / stats.total;
      
      if (criticalRatio > 0.3) {
        issues.push({
          category,
          issue: `${(criticalRatio * 100).toFixed(1)}% dos produtos com estoque crítico`
        });
      }
      
      if (outOfStockRatio > 0.1) {
        issues.push({
          category,
          issue: `${(outOfStockRatio * 100).toFixed(1)}% dos produtos sem estoque`
        });
      }
    });

    return issues;
  }

  /**
   * Analisa correlação preço x demanda
   */
  private analyzePriceDemandCorrelation(pricingData: any[]): any[] {
    const insights: any[] = [];
    
    // Agrupa por categoria
    const categories: { [key: string]: any[] } = {};
    
    pricingData.forEach(product => {
      const category = product.categoria || 'Sem Categoria';
      
      if (!categories[category]) {
        categories[category] = [];
      }
      
      categories[category].push(product);
    });

    // Analisa cada categoria
    Object.entries(categories).forEach(([category, products]) => {
      if (products.length < 2) return;
      
      // Ordena por preço
      products.sort((a, b) => a.preco - b.preco);
      
      // Verifica se produtos mais caros vendem menos
      const expensiveProducts = products.slice(-Math.floor(products.length / 2));
      const cheapProducts = products.slice(0, Math.floor(products.length / 2));
      
      const expensiveAvgSales = expensiveProducts.reduce((sum: any, p: any) => sum + (p.vendas || 0), 0) / expensiveProducts.length;
      const cheapAvgSales = cheapProducts.reduce((sum: any, p: any) => sum + (p.vendas || 0), 0) / cheapProducts.length;
      
      if (expensiveAvgSales < cheapAvgSales * 0.5) {
        insights.push({
          insight: `Categoria ${category}: produtos mais caros vendem significativamente menos`
        });
      }
    });

    return insights;
  }

  /**
   * Gera insights de cross-selling
   */
  private async generateCrossSellInsights(): Promise<void> {
    await leoLongMemory.saveStrategy(
      DEFAULT_LEO_TENANT_ID,
      'Cross-selling: Analisar padrões de compra conjunta para recomendar produtos',
      'Estratégia de vendas',
      'medium'
    );
  }

  /**
   * Gera previsão de demanda
   */
  private async generateDemandForecast(): Promise<void> {
    // Implementação futura com algoritmos de séries temporais
    await leoLongMemory.saveInsight(
      DEFAULT_LEO_TENANT_ID,
      'Previsão de demanda: Implementar modelo preditivo baseado em histórico',
      'Previsão de negócios',
      'high'
    );
  }

  /**
   * Gera recomendações estratégicas
   */
  private async generateStrategicRecommendations(): Promise<void> {
    await leoLongMemory.saveStrategy(
      DEFAULT_LEO_TENANT_ID,
      'Estratégia: Focar em clientes inativos e produtos com baixo giro',
      'Recomendações estratégicas',
      'high'
    );
  }

  /**
   * Analisa performance de vendas por vendedor
   */
  private async analyzeSalesPerformance(salesData: any[]): Promise<void> {
    // Implementação futura para análise por vendedor
  }

  /**
   * Identifica clientes em risco
   */
  private async identifyAtRiskCustomers(customerData: any[]): Promise<void> {
    // Implementação futura para identificação de churn
  }

  /**
   * Identifica produtos parados
   */
  private async identifySlowMovingProducts(inventoryData: any[]): Promise<void> {
    // Implementação futura para análise de giro de estoque
  }

  /**
   * Obtém status do motor de aprendizado
   */
  public getLearningStatus(): any {
    return {
      isLearning: this.isLearning,
      uptime: this.isLearning ? process.uptime() : 0
    };
  }
}

// Exportar instância singleton
export const leoLearningEngine = LeoLearningEngine.getInstance();
