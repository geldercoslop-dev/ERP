import * as ordersService from '../services/orders.service.js';
import { ValidationError } from '../_core/errors/typed-errors.js';

export const salesAnalyticsTool = {
  async aggregateTicketPedidos(input: { tenantId: number; vendedorId?: number; since?: Date }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    return ordersService.aggregateTicketPedidos(input.tenantId, {
      vendedorId: input.vendedorId,
      since: input.since,
    });
  },

  async sumPedidosTotalBetween(input: { tenantId: number; startDate: Date; endDate: Date }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    return ordersService.sumPedidosTotalBetween(input.tenantId, input.startDate, input.endDate);
  },

  async getReportVendasPeriodo(input: { tenantId: number; dataInicio: Date; dataFim: Date }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    return ordersService.getReportVendasPeriodo(input.tenantId, {
      dataInicio: input.dataInicio,
      dataFim: input.dataFim,
    });
  },

  async countPedidosParadosGeradoConferido(input: { tenantId: number; updatedBefore: Date }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    return ordersService.countPedidosParadosGeradoConferido(input.tenantId, input.updatedBefore);
  },

  async findPedidoGrandeRecente(input: { tenantId: number; minValor: number; since: Date }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    return ordersService.findPedidoGrandeRecente(input.tenantId, input.minValor, input.since);
  },

  async listNumerosPedidosEmRotaAtrasados(input: { tenantId: number; diasAtraso: number; limite: number }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    return ordersService.listNumerosPedidosEmRotaAtrasados(input.tenantId, input.diasAtraso, input.limite);
  }
};
