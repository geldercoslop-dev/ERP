import * as inventoryService from '../services/inventory.service.js';
import { ValidationError } from '../_core/errors/typed-errors.js';

export const inventoryMonitorTool = {

  async listProdutosBaixoEstoqueLeo(input: { tenantId: number; limite: number }) {

    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }

    return inventoryService.listProdutosBaixoEstoqueLeo(
      input.tenantId,
      input.limite
    );

  },

  async countProdutosAtivosEstoqueAte(input: { tenantId: number; maxInclusive: number }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    return inventoryService.countProdutosAtivosEstoqueAte(input.tenantId, input.maxInclusive);
  },

  async countProdutosAtivosEstoqueZero(input: { tenantId: number }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    return inventoryService.countProdutosAtivosEstoqueZero(input.tenantId);
  }

};
