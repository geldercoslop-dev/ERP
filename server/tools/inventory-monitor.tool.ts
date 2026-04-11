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

  }

};
