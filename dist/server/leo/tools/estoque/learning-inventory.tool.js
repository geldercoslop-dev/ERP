import * as inventoryService from '../../../services/inventory.service.js';
import { ValidationError } from '../../../_core/errors/typed-errors.js';
export const learningInventoryTool = {
    async getProductSummary(input) {
        if (!input.tenantId) {
            throw new ValidationError('tenantId required');
        }
        return inventoryService.listProdutosResumoLeoLearning(input.tenantId);
    },
    async getSalesStats(input) {
        if (!input.tenantId) {
            throw new ValidationError('tenantId required');
        }
        return inventoryService.listProdutoVendasStatsLeoLearning(input.tenantId);
    }
};
