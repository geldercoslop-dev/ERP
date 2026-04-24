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
import { ValidationError, InfrastructureError } from '../../_core/errors/typed-errors.js';
import * as ordersService from '../../services/orders.service.js';
import * as clientesService from '../../services/clientes.service.js';
import * as inventoryService from '../../services/inventory.service.js';
import { ADMIN_ACTOR } from '../../_core/service-actor.js';
import { leoLongMemory } from '../memory/leo-long-memory.js';
const DEFAULT_LEO_TENANT_ID = 1;
/**
 * Classe principal do motor de aprendizado
 */
export class LeoLearningEngine {
    static instance;
    isLearning = false;
    learningInterval = null;
    constructor() { }
    static getInstance() {
        if (!LeoLearningEngine.instance) {
            LeoLearningEngine.instance = new LeoLearningEngine();
        }
        return LeoLearningEngine.instance;
    }
    /**
     * Inicia o processo de aprendizado contínuo
     */
    startLearning(tenantId, intervalMs = 3600000) {
        if (this.isLearning) {
            console.log('🧠 Leo Learning Engine já está rodando');
            return;
        }
        console.log('🚀 Iniciando Motor de Aprendizado do Leo...');
        this.isLearning = true;
        // Executa primeira vez imediatamente
        this.executeLearningCycle(tenantId);
        // Configura execução periódica
        this.learningInterval = setInterval(() => {
            this.executeLearningCycle(tenantId);
        }, intervalMs);
        console.log(`✅ Learning iniciado com intervalo de ${intervalMs}ms`);
    }
    /**
     * Para o processo de aprendizado
     */
    stopLearning() {
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
    async executeLearningCycle(tenantId) {
        try {
            console.log('🔄 Executando ciclo de aprendizado...');
            const startTime = Date.now();
            if (!Number.isFinite(tenantId))
                throw new ValidationError("tenantId obrigatório");
            await this.generateCrossSellInsights(tenantId);
            await this.learnFromCustomers(tenantId);
            await this.generateDemandForecast(tenantId);
            await this.learnFromPricing(tenantId);
            await this.generateStrategicRecommendations(tenantId);
            const duration = Date.now() - startTime;
            console.log(`✅ Ciclo de aprendizado concluído em ${duration}ms`);
        }
        catch (error) {
            console.error('❌ Erro no ciclo de aprendizado:', error);
        }
    }
    /**
     * Aprende com o histórico de vendas
     */
    async learnFromSales(tenantId) {
        try {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const rows = await ordersService.leoAggregatePedidosByDayAndVendedor(tenantId, thirtyDaysAgo);
            const salesData = rows.map((r) => ({
                date: r.day,
                count: r.count,
                total: r.total,
                avgTicket: r.avgTicket,
                vendedorId: r.vendedorId,
            }));
            await this.detectSalesPatterns(salesData);
            await this.analyzeSalesPerformance(salesData);
        }
        catch (error) {
            console.error('Erro ao aprender com vendas:', error);
        }
    }
    /**
     * Aprende com o histórico de clientes
     */
    async learnFromCustomers(tenantId) {
        try {
            const rows = await clientesService.listClientesComMetricasPedidos(tenantId, ADMIN_ACTOR, 500);
            if (!rows.success || !rows.data) {
                throw new InfrastructureError(rows.error ?? 'Falha ao carregar métricas de clientes');
            }
            const customerData = rows.data.map((c) => ({
                id: c.id,
                nome: c.nome,
                dataCriacao: c.createdAt,
                totalPedidos: c.totalPedidos,
                totalGasto: c.totalGasto,
                avgTicket: c.avgTicket,
            }));
            await this.detectCustomerPatterns(customerData);
            await this.identifyAtRiskCustomers(customerData);
        }
        catch (error) {
            console.error('Erro ao aprender com clientes:', error);
        }
    }
    /**
     * Aprende com o histórico de estoque
     */
    async learnFromInventory(tenantId) {
        try {
            const rows = await inventoryService.listProdutosResumoLeoLearning(tenantId);
            const inventoryData = rows.map((p) => ({
                id: p.id,
                descricao: p.descricao,
                estoqueAtual: p.estoque,
                estoqueMinimo: 0,
                categoria: p.categoria,
                preco: p.valorVenda,
            }));
            await this.detectInventoryPatterns(inventoryData);
            await this.identifySlowMovingProducts(inventoryData);
        }
        catch (error) {
            console.error('Erro ao aprender com estoque:', error);
        }
    }
    /**
     * Aprende com estratégias de preços
     */
    async learnFromPricing(tenantId) {
        try {
            const rows = await inventoryService.listProdutoVendasStatsLeoLearning(tenantId);
            const pricingData = [];
            for (const p of rows) {
                pricingData.push({
                    produtoId: p.produtoId,
                    descricao: p.descricao,
                    preco: Number(p.preco),
                    categoria: p.categoria,
                    vendas: p.vendasCount,
                    receita: p.receita
                });
            }
            await this.detectPricingPatterns(pricingData);
        }
        catch (error) {
            console.error('Erro ao aprender com preços:', error);
        }
    }
    /**
     * Detecta padrões de vendas
     */
    async detectSalesPatterns(salesData) {
        try {
            // Padrão 1: Dias de pico de vendas
            const dailyAverages = this.calculateDailyAverages(salesData);
            const peakDays = dailyAverages.filter((day) => day.sales > day.average * 1.5);
            if (peakDays.length > 0) {
                await leoLongMemory.savePattern(DEFAULT_LEO_TENANT_ID, `Dias de pico de vendas identificados: ${peakDays.map((d) => d.day).join(', ')}`, `Análise de ${salesData.length} registros de vendas`, 'high');
            }
            const trend = this.calculateSalesTrend(salesData);
            if (trend.trend !== 'stable') {
                await leoLongMemory.savePattern(DEFAULT_LEO_TENANT_ID, `Tendência de vendas: ${trend.trend} (${trend.percentage.toFixed(1)}%)`, `Análise de tendência dos últimos 30 dias`, trend.trend === 'increasing' ? 'high' : 'critical');
            }
            const avgTicketPattern = this.analyzeAverageTicket(salesData);
            if (avgTicketPattern.insight) {
                await leoLongMemory.saveInsight(DEFAULT_LEO_TENANT_ID, avgTicketPattern.insight, 'Análise de ticket médio', 'medium');
            }
        }
        catch (error) {
            console.error('Erro ao detectar padrões de vendas:', error);
        }
    }
    /**
     * Detecta padrões de comportamento de clientes
     */
    async detectCustomerPatterns(customerData) {
        try {
            // Padrão 1: Sazonalidade de compras
            const inactiveThreshold = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
            const inactiveCustomers = customerData.filter((c) => (c.totalPedidos ?? 0) === 0 && c.dataCriacao && new Date(c.dataCriacao) < inactiveThreshold);
            if (inactiveCustomers.length > 0) {
                await leoLongMemory.saveAlert(DEFAULT_LEO_TENANT_ID, `${inactiveCustomers.length} clientes estão inativos há mais de 60 dias`, `Análise de ${customerData.length} clientes`, 'high');
            }
            const highValueCustomers = customerData.filter((c) => (c.totalGasto ?? 0) > 10000);
            if (highValueCustomers.length > 0) {
                await leoLongMemory.saveStrategy(DEFAULT_LEO_TENANT_ID, `Identificados ${highValueCustomers.length} clientes de alto valor (acima de R$ 10.000)`, 'Estratégia de retenção de clientes', 'high');
            }
        }
        catch (error) {
            console.error('Erro ao detectar padrões de clientes:', error);
        }
    }
    /**
     * Detecta padrões de estoque
     */
    async detectInventoryPatterns(inventoryData) {
        try {
            // Padrão 1: Estoque crítico
            const criticalStock = inventoryData.filter((p) => Number(p.estoqueAtual ?? 0) < Number(p.estoqueMinimo ?? 0));
            const defaultTenantId = 1;
            if (criticalStock.length > 0) {
                await leoLongMemory.saveAlert(defaultTenantId, `${criticalStock.length} produtos com estoque crítico`, `Análise de ${inventoryData.length} produtos`, 'critical');
            }
            // Padrão 2: Categorias com problemas
            const categoryIssues = this.analyzeCategoryStock(inventoryData);
            for (const issue of categoryIssues) {
                await leoLongMemory.saveInsight(defaultTenantId, `Categoria ${issue.category}: ${issue.issue}`, 'Análise por categoria de produtos', 'medium');
            }
        }
        catch (error) {
            console.error('Erro ao detectar padrões de estoque:', error);
        }
    }
    /**
     * Detecta padrões de precificação
     */
    async detectPricingPatterns(pricingData) {
        try {
            // Padrão 1: Produtos sem vendas
            const noSalesProducts = pricingData.filter((p) => Number(p.vendas ?? 0) === 0);
            if (noSalesProducts.length > 0) {
                await leoLongMemory.saveAlert(DEFAULT_LEO_TENANT_ID, `${noSalesProducts.length} produtos não tiveram vendas registradas`, 'Análise de performance de produtos', 'medium');
            }
            const priceDemandInsights = this.analyzePriceDemandCorrelation(pricingData);
            for (const insight of priceDemandInsights) {
                await leoLongMemory.saveInsight(DEFAULT_LEO_TENANT_ID, insight.insight, 'Análise de precificação', 'high');
            }
        }
        catch (error) {
            console.error('Erro ao detectar padrões de precificação:', error);
        }
    }
    /**
     * Gera insights combinados
     */
    async generateCombinedInsights(tenantId) {
        try {
            // Insight 1: Oportunidades de cross-selling
            await this.generateCrossSellInsights(tenantId);
            // Insight 2: Previsão de demanda
            await this.generateDemandForecast(tenantId);
            // Insight 3: Recomendações estratégicas
            await this.generateStrategicRecommendations(tenantId);
        }
        catch (error) {
            console.error('Erro ao gerar insights combinados:', error);
        }
    }
    /**
     * Calcula tendência de vendas
     */
    calculateSalesTrend(salesData) {
        if (!salesData || salesData.length < 2) {
            return { trend: 'stable', percentage: 0 };
        }
        const half = Math.floor(salesData.length / 2);
        const recent = salesData.slice(0, half);
        const older = salesData.slice(half);
        const recentTotal = recent.reduce((sum, day) => sum + Number(day.total ?? 0), 0);
        const olderTotal = older.reduce((sum, day) => sum + Number(day.total ?? 0), 0);
        if (olderTotal === 0) {
            return { trend: 'stable', percentage: 0 };
        }
        const change = ((recentTotal - olderTotal) / olderTotal) * 100;
        if (change > 5) {
            return { trend: 'increasing', percentage: change };
        }
        else if (change < -5) {
            return { trend: 'decreasing', percentage: Math.abs(change) };
        }
        else {
            return { trend: 'stable', percentage: 0 };
        }
    }
    /**
     * Calcula médias diárias de vendas
     */
    calculateDailyAverages(salesData) {
        const dailySales = {};
        // Agrupa vendas por dia da semana
        salesData.forEach(sale => {
            const dateRaw = sale.date;
            const countRaw = sale.count;
            const date = new Date(typeof dateRaw === 'string' || typeof dateRaw === 'number' || dateRaw instanceof Date ? dateRaw : Date.now());
            const count = Number(countRaw ?? 0);
            const dayOfWeek = date.toLocaleDateString('pt-BR', { weekday: 'long' });
            if (!dailySales[dayOfWeek]) {
                dailySales[dayOfWeek] = [];
            }
            dailySales[dayOfWeek].push(count);
        });
        // Calcula médias
        const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        return days.map((day) => {
            const values = dailySales[day] || [0];
            const average = values.reduce((a, b) => a + b, 0) / values.length;
            return {
                day,
                sales: values.reduce((a, b) => a + b, 0),
                average,
                ratio: values.length > 0 ? values[0] / average : 0
            };
        });
    }
    /**
     * Analisa ticket médio
     */
    analyzeAverageTicket(salesData) {
        const avgTickets = salesData
            .map((d) => Number(d.avgTicket ?? 0))
            .filter((t) => t > 0);
        if (avgTickets.length < 2) {
            return { insight: undefined };
        }
        const overallAvg = avgTickets.reduce((a, b) => a + b, 0) / avgTickets.length;
        const recentAvg = avgTickets.slice(0, 7).reduce((a, b) => a + b, 0) / Math.min(7, avgTickets.length);
        const change = ((recentAvg - overallAvg) / overallAvg) * 100;
        if (Math.abs(change) > 10) {
            return {
                insight: `Ticket médio ${change > 0 ? 'aumentou' : 'diminuiu'} ${Math.abs(change).toFixed(1)}% recentemente`
            };
        }
        return { insight: undefined };
    }
    /**
     * Analisa estoque por categoria
     */
    analyzeCategoryStock(inventoryData) {
        const categoryStats = {};
        inventoryData.forEach(product => {
            const category = product.categoria || 'Sem Categoria';
            if (!categoryStats[category]) {
                categoryStats[category] = { total: 0, critical: 0, outOfStock: 0 };
            }
            categoryStats[category].total++;
            const estoqueAtual = Number(product.estoqueAtual ?? 0);
            const estoqueMinimo = Number(product.estoqueMinimo ?? 0);
            if (estoqueAtual === 0) {
                categoryStats[category].outOfStock++;
            }
            else if (estoqueAtual < estoqueMinimo) {
                categoryStats[category].critical++;
            }
        });
        const issues = [];
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
    analyzePriceDemandCorrelation(pricingData) {
        const insights = [];
        // Agrupa por categoria
        const categories = {};
        pricingData.forEach(product => {
            const category = product.categoria || 'Sem Categoria';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(product);
        });
        // Analisa cada categoria
        Object.entries(categories).forEach(([category, products]) => {
            if (products.length < 2)
                return;
            // Ordena por preço
            products.sort((a, b) => Number(a.preco ?? 0) - Number(b.preco ?? 0));
            // Verifica se produtos mais caros vendem menos
            const expensiveProducts = products.slice(-Math.floor(products.length / 2));
            const cheapProducts = products.slice(0, Math.floor(products.length / 2));
            const expensiveAvgSales = expensiveProducts.reduce((sum, p) => sum + Number(p.vendas ?? 0), 0) / expensiveProducts.length;
            const cheapAvgSales = cheapProducts.reduce((sum, p) => sum + Number(p.vendas ?? 0), 0) / cheapProducts.length;
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
    async generateCrossSellInsights(tenantId) {
        await leoLongMemory.saveStrategy(tenantId, 'Cross-selling: Analisar padrões de compra conjunta para recomendar produtos', 'Estratégia de vendas', 'medium');
    }
    /**
     * Gera previsão de demanda
     */
    async generateDemandForecast(tenantId) {
        // Implementação futura com algoritmos de séries temporais
        await leoLongMemory.saveInsight(tenantId, 'Previsão de demanda: Implementar modelo preditivo baseado em histórico', 'Previsão de negócios', 'high');
    }
    /**
     * Gera recomendações estratégicas
     */
    async generateStrategicRecommendations(tenantId) {
        await leoLongMemory.saveStrategy(tenantId, 'Estratégia: Focar em clientes inativos e produtos com baixo giro', 'Recomendações estratégicas', 'high');
    }
    /**
     * Analisa performance de vendas por vendedor
     */
    async analyzeSalesPerformance(salesData) {
        // Implementação futura para análise por vendedor
    }
    /**
     * Identifica clientes em risco
     */
    async identifyAtRiskCustomers(customerData) {
        // Implementação futura para identificação de churn
    }
    /**
     * Identifica produtos parados
     */
    async identifySlowMovingProducts(inventoryData) {
        // Implementação futura para análise de giro de estoque
    }
    /**
     * Obtém status do motor de aprendizado
     */
    getLearningStatus() {
        return {
            isLearning: this.isLearning,
            uptime: this.isLearning ? process.uptime() : 0
        };
    }
}
// Exportar instância singleton
export const leoLearningEngine = LeoLearningEngine.getInstance();
