import * as ordersService from "../services/orders.service.js";
import { ValidationError, InfrastructureError } from "../_core/errors/typed-errors.js";

export const seasonalAnalyticsTool = {
  async detectSeasonalPatterns(input: { tenantId: number }) {
    if (!input.tenantId) {
      throw new ValidationError("tenantId required");
    }

    const result = await ordersService.detectSeasonalPatterns(input.tenantId);

    if (!result.success) {
      throw new InfrastructureError(result.error || "Falha ao detectar padrões sazonais");
    }

    return result.data || [];
  },
};
