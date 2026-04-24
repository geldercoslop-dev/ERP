import { LeoSalesAnalysis } from '../intelligence/leo-sales-analysis.js';
import { LeoStockMonitor } from '../intelligence/leo-stock-monitor.js';
import { LeoPatternDetection } from '../intelligence/leo-pattern-detection.js';
import { logInfo } from '../../_core/logger.js';
const salesAnalysis = new LeoSalesAnalysis(1); // TODO: Obter tenantId do contexto seguro
const stockMonitor = LeoStockMonitor.getInstance();
const patternDetection = new LeoPatternDetection();
/**
 * Interpreta comandos em linguagem natural e executa ações correspondentes
 */
export async function interpretLeoCommand(message, tenantId, context) {
    try {
        const lowerMessage = message.toLowerCase();
        logInfo(`Interpretando comando: "${message}"`, {
            extra: { context, message }
        });
        // Comandos de vendas
        if (lowerMessage.includes('venda') || lowerMessage.includes('vender')) {
            if (lowerMessage.includes('hoje') || lowerMessage.includes('dia')) {
                const avgTicket = await salesAnalysis.calculateAverageTicket(tenantId, undefined, '1d');
                return `📊 Ticket médio hoje: R$ ${avgTicket.toFixed(2)}`;
            }
            if (lowerMessage.includes('semana') || lowerMessage.includes('7 dias')) {
                const growth = await salesAnalysis.analyzeSalesGrowth(tenantId, '7d');
                return `📈 Crescimento de vendas na semana: ${growth.percentage}% (${growth.trend})`;
            }
            if (lowerMessage.includes('mês') || lowerMessage.includes('30 dias')) {
                const growth = await salesAnalysis.analyzeSalesGrowth(tenantId, '30d');
                return `📈 Crescimento de vendas no mês: ${growth.percentage}% (${growth.trend})`;
            }
        }
        // Comandos de estoque
        if (lowerMessage.includes('estoque') || lowerMessage.includes('produtos')) {
            if (lowerMessage.includes('baixo') || lowerMessage.includes('crítico')) {
                const alerts = await stockMonitor.getProductsNeedingRestock(tenantId);
                const allLow = await stockMonitor.checkLowStock(tenantId);
                if (allLow.length > 0) {
                    const criticalCount = alerts.length;
                    return `⚠️ Encontrei ${criticalCount} produtos com estoque CRÍTICO e ${allLow.length} com estoque baixo`;
                }
                return '✅ Nenhum produto com estoque crítico no momento';
            }
            if (lowerMessage.includes('resumo') || lowerMessage.includes('status')) {
                const alerts = await stockMonitor.checkLowStock(tenantId);
                const lowStock = alerts.filter((a) => a.status === 'low').length;
                const criticalStock = alerts.filter((a) => a.status === 'critical').length;
                const outOfStock = alerts.filter((a) => a.status === 'out').length;
                return `📦 Resumo do estoque:
- Estoque baixo: ${lowStock}
- Estoque crítico: ${criticalStock}
- Esgotados: ${outOfStock}
- Total com alerta: ${alerts.length}`;
            }
        }
        // Comandos de produtos mais vendidos
        if (lowerMessage.includes('mais vendido') || lowerMessage.includes('top') || lowerMessage.includes('ranking')) {
            const topProducts = await salesAnalysis.getTopProducts(5);
            if (topProducts.length > 0) {
                const list = topProducts.map((p, i) => `${i + 1}. ${p.productName} - ${p.quantity} unidades`).join('\n');
                return `🏆 Produtos mais vendidos:\n${list}`;
            }
            return '📊 Não há dados de vendas disponíveis';
        }
        // Comandos de performance
        if (lowerMessage.includes('performance') || lowerMessage.includes('desempenho')) {
            // TODO: Implementar método de performance quando disponível
            return '📊 Análise de performance de vendedores em desenvolvimento...';
        }
        // Comandos de alertas
        if (lowerMessage.includes('alerta') || lowerMessage.includes('aviso')) {
            const restock = await stockMonitor.getProductsNeedingRestock(tenantId);
            if (restock.length > 0) {
                const highPriority = restock.filter((r) => r.priority === 'high');
                return `⚠️ ${highPriority.length} produtos precisam de reposição URGENTE!`;
            }
            return '✅ Nenhum produto precisa de reposição no momento';
        }
        // Comandos de status geral
        if (lowerMessage.includes('status') || lowerMessage.includes('como vai')) {
            const growth = await salesAnalysis.analyzeSalesGrowth(tenantId, '7d');
            const alerts = await stockMonitor.checkLowStock(tenantId);
            const lowStock = alerts.filter((a) => a.status === 'low').length;
            const criticalStock = alerts.filter((a) => a.status === 'critical' || a.status === 'out').length;
            return `📊 Status Geral do ERP:
📈 Vendas semana: ${growth.percentage}% (${growth.trend})
📦 Estoque: ${lowStock} baixos, ${criticalStock} críticos
🤖 LEO: Operacional e monitorando`;
        }
        // Comandos de ajuda
        if (lowerMessage.includes('ajuda') || lowerMessage.includes('help') || lowerMessage.includes('comandos')) {
            return `🤖 Comandos disponíveis do LEO:

📊 **Vendas:**
- "vendas hoje" - Ticket médio de hoje
- "vendas semana" - Crescimento semanal
- "vendas mês" - Crescimento mensal

📦 **Estoque:**
- "estoque crítico" - Produtos com estoque baixo
- "estoque status" - Resumo completo do estoque
- "estoque alerta" - Produtos precisando reposição

🏆 **Rankings:**
- "mais vendidos" - Top 5 produtos
- "performance" - Melhor vendedor da semana

📈 **Análises:**
- "status geral" - Visão completa do negócio

💬 **Outros:**
- "ajuda" - Mostra esta mensagem

Digite qualquer comando em linguagem natural!`;
        }
        // Resposta padrão se não reconhecer o comando
        return `🤖 Não entendi o comando "${message}". 

Digite "ajuda" para ver os comandos disponíveis.

Posso ajudar com informações sobre vendas, estoque, produtos e performance!`;
    }
    catch (error) {
        console.error('Erro ao interpretar comando:', error);
        return '❌ Ocorreu um erro ao processar seu comando. Tente novamente.';
    }
}
