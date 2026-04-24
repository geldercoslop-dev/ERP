import * as inventoryService from '../services/inventory.service.js';
import { ValidationError } from '../_core/errors/typed-errors.js';
export const inventoryAnalyticsTool = {
    async countProdutosAtivosEstoqueZero(input) {
        if (!input.tenantId) {
            throw new ValidationError('tenantId required');
        }
        return inventoryService.countProdutosAtivosEstoqueZero(input.tenantId);
    }
};
