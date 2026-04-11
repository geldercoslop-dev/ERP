import * as inventoryService from '../services/inventory.service.js';
import { ValidationError } from '../_core/errors/typed-errors.js';

export const learningInventoryTool = {
  async getProductSummary(input: { tenantId: number }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }

    return inventoryService.listProdutosResumoLeoLearning(input.tenantId);
  },

  async getSalesStats(input: { tenantId: number }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }

    return inventoryService.listProdutoVendasStatsLeoLearning(input.tenantId);
  }
};
