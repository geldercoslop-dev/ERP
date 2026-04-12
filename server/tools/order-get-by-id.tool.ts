import { OrderService } from '../services/order.service.js';
import { ServiceCreateResponse } from '../types/service-safety.js';
import { ValidationError } from '../_core/errors/typed-errors.js';

/**
 * TOOL ESPECÍFICA: Buscar pedido por ID
 * 
 * Implementa SELECT por ID com validação de tenant
 */
export class OrderGetByIdTool {
  private orderService: OrderService;

  constructor() {
    this.orderService = new OrderService();
  }

  /**
   * Buscar pedido específico por ID
   * Valida tenant e ID antes de buscar no banco
   */
  async getById(input: { tenantId: number | null; id: number }): Promise<ServiceCreateResponse> {
    // SECURITY: Validar tenant obrigatório
    if (!input.tenantId || input.tenantId <= 0) {
      throw new ValidationError('Tenant inválido ou ausente');
    }

    // SECURITY: Validar ID obrigatório
    if (!input.id || input.id <= 0) {
      throw new ValidationError('ID do pedido inválido ou ausente');
    }

    // Chamar service com contexto válido
    return await this.orderService.getById(
      { tenantId: input.tenantId },
      { id: input.id }
    );
  }
}

export const orderGetByIdTool = new OrderGetByIdTool();
