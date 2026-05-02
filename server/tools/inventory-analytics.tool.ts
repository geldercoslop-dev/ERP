import * as inventoryService from '../services/inventory.service.js';
import { ValidationError, InfrastructureError } from '../_core/errors/typed-errors.js';

export const inventoryAnalyticsTool = {
  async countProdutosAtivosEstoqueZero(input: { tenantId: number }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }

    return inventoryService.countProdutosAtivosEstoqueZero(input.tenantId);
  },

  async detectInventoryAnomalies(input: { tenantId: number }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }

    try {
      return await inventoryService.detectInventoryAnomalies(input.tenantId);
    } catch (error) {
      throw new InfrastructureError(
        error instanceof Error ? error.message : 'Falha ao detectar anomalias de estoque'
      );
    }
  }
};