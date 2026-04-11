import * as clientesService from '../services/clientes.service.js';
import { ADMIN_ACTOR } from '../_core/service-actor.js';
import { ValidationError } from '../_core/errors/typed-errors.js';

export const learningClientsTool = {
  async getMetrics(input: { tenantId: number; limit?: number }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }

    return clientesService.listClientesComMetricasPedidos(input.tenantId, ADMIN_ACTOR, input.limit ?? 500);
  }
};
