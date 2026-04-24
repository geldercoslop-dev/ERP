import { logInfo, logError } from '../../_core/logger.js';
import * as inventoryService from '../../services/inventory.service.js';
import { LeoTaskPriority } from '../../../shared/types/index.js';
import { ValidationError } from '../../_core/errors/typed-errors.js';
/**
 * Obtém tenantId do ambiente ou lança erro se não disponível
 * CRÍTICO: Não permite fallback para tenant fixo
 */
export class LeoStockMonitor {
    static instance;
    name = 'LeoStockMonitor';
    constructor() { }
    static getInstance() {
        if (!LeoStockMonitor.instance) {
            LeoStockMonitor.instance = new LeoStockMonitor();
        }
        return LeoStockMonitor.instance;
    }
    async checkLowStock(tenantId) {
        if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
            throw new ValidationError("tenantId obrigatório");
        }
        try {
            const rows = await inventoryService.listProdutosBaixoEstoqueLeo(tenantId, 20);
            const alerts = rows.map((product) => {
                const currentStock = Number(product.estoque || 0);
                const minStock = currentStock <= 5 ? 20 : currentStock <= 10 ? 15 : currentStock <= 20 ? 25 : 30;
                let status = 'low';
                let recommendation = '';
                let priority = LeoTaskPriority.LOW;
                if (currentStock === 0) {
                    status = 'out';
                    recommendation = 'Produto sem estoque - reposição urgente';
                    priority = LeoTaskPriority.CRITICAL;
                }
                else if (currentStock <= 5) {
                    status = 'critical';
                    recommendation = 'Estoque crítico - repor imediatamente';
                    priority = LeoTaskPriority.HIGH;
                }
                else if (currentStock <= 10) {
                    status = 'low';
                    recommendation = 'Estoque baixo - recomenda-se reposição';
                    priority = LeoTaskPriority.MEDIUM;
                }
                else {
                    recommendation = 'Estoque em nível mínimo - monitorar';
                    priority = LeoTaskPriority.LOW;
                }
                return {
                    productId: Number(product.id),
                    productName: product.descricao || 'Produto sem nome',
                    currentStock,
                    minStock,
                    status,
                    recommendation,
                    priority,
                };
            });
            logInfo(`Found ${alerts.length} products with low stock`, {
                extra: { entity: this.name, acao: 'checkLowStock', alertCount: alerts.length },
            });
            return alerts;
        }
        catch (error) {
            logError('Failed to check low stock', {
                extra: { error, entity: this.name, acao: 'checkLowStock' },
            });
            throw error;
        }
    }
    async getProductsNeedingRestock(tenantId) {
        try {
            const alerts = await this.checkLowStock(tenantId);
            const result = alerts.filter((alert) => alert.status === 'critical' || alert.status === 'out');
            logInfo(`Found ${result.length} products needing immediate restock`, {
                extra: { entity: this.name, acao: 'getProductsNeedingRestock', count: result.length },
            });
            return result;
        }
        catch (error) {
            logError('Failed to get products needing restock', {
                extra: { error, entity: this.name, acao: 'getProductsNeedingRestock' },
            });
            throw error;
        }
    }
}
export const leoStockMonitor = LeoStockMonitor.getInstance();
