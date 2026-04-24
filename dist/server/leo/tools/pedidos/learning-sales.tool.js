import * as ordersService from '../../../services/orders.service.js';
import { ValidationError } from '../../../_core/errors/typed-errors.js';
export const learningSalesTool = {
    async getMetrics(input) {
        if (!input.tenantId) {
            throw new ValidationError('tenantId required');
        }
        return ordersService.leoAggregatePedidosByDayAndVendedor(input.tenantId, input.since);
    }
};
