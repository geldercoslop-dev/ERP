import * as ordersService from '../services/orders.service.js';
import { ValidationError, InfrastructureError } from '../_core/errors/typed-errors.js';

export const salesAnalyticsTool = {
  aggregateTicketPedidos: async function(input: { tenantId: number; vendedorId?: number; since?: Date }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    return ordersService.aggregateTicketPedidos(input.tenantId, {
      vendedorId: input.vendedorId,
      since: input.since,
    });
  },

  sumPedidosTotalBetween: async function(input: { tenantId: number; startDate: Date; endDate: Date }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    return ordersService.sumPedidosTotalBetween(input.tenantId, input.startDate, input.endDate);
  },

  getReportVendasPeriodo: async function(input: { tenantId: number; dataInicio: Date; dataFim: Date }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    return ordersService.getReportVendasPeriodo(input.tenantId, {
      dataInicio: input.dataInicio,
      dataFim: input.dataFim,
    });
  },

  countPedidosParadosGeradoConferido: async function(input: { tenantId: number; updatedBefore: Date }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    return ordersService.countPedidosParadosGeradoConferido(input.tenantId, input.updatedBefore);
  },

  findPedidoGrandeRecente: async function(input: { tenantId: number; minValor: number; since: Date }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    return ordersService.findPedidoGrandeRecente(input.tenantId, input.minValor, input.since);
  },

  listNumerosPedidosEmRotaAtrasados: async function(input: { tenantId: number; diasAtraso: number; limite: number }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    return ordersService.listNumerosPedidosEmRotaAtrasados(input.tenantId, input.diasAtraso, input.limite);
  },

  getTopProducts: async function(input: { tenantId: number; limit?: number }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    const limit = input.limit;
    return ordersService.getTopProducts(input.tenantId, limit);
  },

  analyzeSalesByCategory: async function(input: { tenantId: number }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    const result = await ordersService.analyzeSalesByCategory(input.tenantId);
    if (!result.success) {
      throw new InfrastructureError(result.error || 'Falha ao analisar vendas por categoria');
    }
    return result.data || [];
  }
};
