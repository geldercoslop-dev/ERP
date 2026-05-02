import * as clientesService from '../services/clientes.service.js';
import { ValidationError, InfrastructureError } from '../_core/errors/typed-errors.js';
import type { ServiceActor } from '../_core/service-actor.js';
import type { SecureToolContext } from '../_core/secure-context.js';

export const learningClientsTool = {
  getMetrics: async function(input: { tenantId: number; limit?: number; actor?: ServiceActor }, context?: SecureToolContext) {
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
  },

  getInactiveClients: async function(input: { tenantId: number; daysThreshold?: number }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    const days = input.daysThreshold;
    return clientesService.getClientesInativos(input.tenantId, days);
  },

  analyzePurchaseFrequency: async function(input: { tenantId: number; clientId?: number }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    const result = await clientesService.analyzePurchaseFrequency(input.tenantId, input.clientId);
    if (!result.success) {
      throw new InfrastructureError(result.error || 'Falha ao analisar frequência de compra');
    }
    return result.data || [];
  },

  getClientSegmentation: async function(input: { tenantId: number }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    const result = await clientesService.getClientSegmentation(input.tenantId);
    if (!result.success) {
      throw new InfrastructureError(result.error || 'Falha ao obter segmentação de clientes');
    }
    return result.data || [];
  },

  predictChurnRisk: async function(input: { tenantId: number }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    const result = await clientesService.predictChurnRisk(input.tenantId);
    if (!result.success) {
      throw new InfrastructureError(result.error || 'Falha ao prever risco de churn');
    }
    return result.data || [];
  }
};
