import * as ordersService from '../services/orders.service.js';
import { ValidationError } from '../_core/errors/typed-errors.js';

function requireTenantId(tenantId: number): number {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new ValidationError('tenantId obrigatório');
  }
  return tenantId;
}

export type OrderAnalyticsDateRangeInput = {
  tenantId: number;
  dataInicio: Date;
  dataFim: Date;
};

export type OrderAnalyticsAggregateTicketInput = {
  tenantId: number;
  vendedorId?: number;
  since?: Date;
};

export type OrderAnalyticsSumBetweenInput = {
  tenantId: number;
  startInclusive: Date;
  endExclusive: Date;
};

export type OrderAnalyticsBigOrderInput = {
  tenantId: number;
  minTotal: number;
  since: Date;
};

export type OrderAnalyticsDelayedRouteInput = {
  tenantId: number;
  diasMinimos: number;
  limit: number;
};

export type OrderAnalyticsStalledOrdersInput = {
  tenantId: number;
  updatedBefore: Date;
};

export type OrderAnalyticsLearningInput = {
  tenantId: number;
  since: Date;
};

export const orderAnalyticsTool = {
  async reportVendasPeriodo(input: OrderAnalyticsDateRangeInput) {
    const tenantId = requireTenantId(input.tenantId);
    return ordersService.getReportVendasPeriodo(tenantId, {
      dataInicio: input.dataInicio,
      dataFim: input.dataFim,
    });
  },

  async aggregateTicket(input: OrderAnalyticsAggregateTicketInput) {
    const tenantId = requireTenantId(input.tenantId);
    const result = await ordersService.aggregateTicketPedidos(tenantId, {
      vendedorId: input.vendedorId,
      since: input.since,
    });

    return {
      ...result,
      avgTicket: result.count > 0 ? result.sumTotal / result.count : 0,
    };
  },

  async sumTotalBetween(input: OrderAnalyticsSumBetweenInput) {
    const tenantId = requireTenantId(input.tenantId);
    const total = await ordersService.sumPedidosTotalBetween(
      tenantId,
      input.startInclusive,
      input.endExclusive,
    );

    return { total };
  },

  async findPedidoGrandeRecente(input: OrderAnalyticsBigOrderInput) {
    const tenantId = requireTenantId(input.tenantId);
    return ordersService.findPedidoGrandeRecente(tenantId, input.minTotal, input.since);
  },

  async listPedidosEmRotaAtrasados(input: OrderAnalyticsDelayedRouteInput) {
    const tenantId = requireTenantId(input.tenantId);
    return ordersService.listNumerosPedidosEmRotaAtrasados(tenantId, input.diasMinimos, input.limit);
  },

  async countPedidosParados(input: OrderAnalyticsStalledOrdersInput) {
    const tenantId = requireTenantId(input.tenantId);
    const total = await ordersService.countPedidosParadosGeradoConferido(tenantId, input.updatedBefore);
    return { total };
  },

  async learningAggregateByDayAndVendedor(input: OrderAnalyticsLearningInput) {
    const tenantId = requireTenantId(input.tenantId);
    return ordersService.leoAggregatePedidosByDayAndVendedor(tenantId, input.since);
  },
};