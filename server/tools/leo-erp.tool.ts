import { leoErpService } from '../services/leo-service.js';
import { ValidationError } from '../_core/errors/typed-errors.js';
import type { ServiceActor } from '../_core/service-actor.js';
import type { PedidoInput, EstoqueInput, ClienteInput } from '../services/leo-service.js';

export const leoErpTool = {
  async getPedidos(input: { tenantId: number; actor: ServiceActor; filtros?: { status?: string; clienteId?: number; dataInicio?: Date; dataFim?: Date; limite?: number } }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    if (!input.actor) {
      throw new ValidationError('actor required');
    }
    return leoErpService.getPedidos(input.tenantId, input.actor, input.filtros);
  },

  async criarPedido(input: { tenantId: number; pedido: PedidoInput; actor: ServiceActor }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    if (!input.actor) {
      throw new ValidationError('actor required');
    }
    return leoErpService.criarPedido(input.tenantId, input.pedido, input.actor);
  },

  async editarPedido(input: { pedidoId: number; dados: Partial<PedidoInput>; usuarioId?: number }) {
    return leoErpService.editarPedido(input.pedidoId, input.dados, input.usuarioId);
  },

  async cancelarPedido(input: { pedidoId: number; motivo?: string; usuarioId?: number }) {
    return leoErpService.cancelarPedido(input.pedidoId, input.motivo, input.usuarioId);
  },

  async atualizarStatusPedido(input: { tenantId: number; pedidoId: number; novoStatus: string }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    return leoErpService.atualizarStatusPedido(input.tenantId, input.pedidoId, input.novoStatus);
  },

  async ajustarEstoque(input: { estoque: EstoqueInput; usuarioId?: number }) {
    return leoErpService.ajustarEstoque(input.estoque, input.usuarioId);
  },

  async atualizarEstoque(input: { tenantId: number; estoque: EstoqueInput }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    return leoErpService.atualizarEstoque(input.tenantId, input.estoque);
  },

  async getEstoque(input: { tenantId: number; filtros?: { categoria?: string; marca?: string; alertaBaixo?: boolean; limite?: number } }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    return leoErpService.getEstoque(input.tenantId, input.filtros);
  },

  async getClientes(input: { tenantId: number; actor: ServiceActor; filtros?: { nome?: string; telefone?: string; limite?: number } }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    if (!input.actor) {
      throw new ValidationError('actor required');
    }
    return leoErpService.getClientes(input.tenantId, input.actor, input.filtros);
  },

  async createCliente(input: { tenantId: number; cliente: ClienteInput; actor: ServiceActor }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    if (!input.actor) {
      throw new ValidationError('actor required');
    }
    return leoErpService.createCliente(input.tenantId, input.cliente, input.actor);
  },

  async getFinanceiro(input: { tenantId: number; actor: ServiceActor; filtros?: { tipo?: "RECEBER" | "PAGAR"; status?: string; limite?: number } }) {
    if (!input.tenantId) {
      throw new ValidationError('tenantId required');
    }
    if (!input.actor) {
      throw new ValidationError('actor required');
    }
    return leoErpService.getFinanceiro(input.tenantId, input.actor, input.filtros);
  }
};
