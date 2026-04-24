import * as ordersService from '../../../services/orders.service.js';
import { ValidationError } from '../../../_core/errors/typed-errors.js';
function requireTenantId(tenantId) {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
        throw new ValidationError('tenantId obrigatório');
    }
    return tenantId;
}
export const orderAnalyticsTool = {
    async reportVendasPeriodo(input) {
        const tenantId = requireTenantId(input.tenantId);
        return ordersService.getReportVendasPeriodo(tenantId, {
            dataInicio: input.dataInicio,
            dataFim: input.dataFim,
        });
    },
    async aggregateTicket(input) {
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
    async sumTotalBetween(input) {
        const tenantId = requireTenantId(input.tenantId);
        const total = await ordersService.sumPedidosTotalBetween(tenantId, input.startInclusive, input.endExclusive);
        return { total };
    },
    async findPedidoGrandeRecente(input) {
        const tenantId = requireTenantId(input.tenantId);
        return ordersService.findPedidoGrandeRecente(tenantId, input.minTotal, input.since);
    },
    async listPedidosEmRotaAtrasados(input) {
        const tenantId = requireTenantId(input.tenantId);
        return ordersService.listNumerosPedidosEmRotaAtrasados(tenantId, input.diasMinimos, input.limit);
    },
    async countPedidosParados(input) {
        const tenantId = requireTenantId(input.tenantId);
        const total = await ordersService.countPedidosParadosGeradoConferido(tenantId, input.updatedBefore);
        return { total };
    },
    async learningAggregateByDayAndVendedor(input) {
        const tenantId = requireTenantId(input.tenantId);
        return ordersService.leoAggregatePedidosByDayAndVendedor(tenantId, input.since);
    },
};
