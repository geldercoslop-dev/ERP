import * as clientesService from '../services/clientes.service.js';
import { ValidationError } from '../_core/errors/typed-errors.js';
import type { ServiceActor } from '../_core/service-actor.js';
import type { SecureToolContext } from '../_core/secure-context.js';

export const learningClientsTool = {
  async getMetrics(input: { tenantId: number; limit?: number; actor?: ServiceActor }, context?: SecureToolContext) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }

    // Actor must come from context or input - NEVER hardcoded
    let actor: ServiceActor;
    if (input.actor) {
      actor = input.actor;
    } else if (context) {
      // Construct ServiceActor from SecureToolContext
      actor = {
        role: context.role === 'admin' ? 'admin' : 'vendedor',
        userId: context.userId,
        vendedorId: context.vendedorId,
      };
    } else {
      throw new ValidationError('actor required - must be provided from context or input');
    }

    return clientesService.listClientesComMetricasPedidos(input.tenantId, actor, input.limit ?? 500);
  }
};
