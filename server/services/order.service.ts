import { ServiceList, ServiceSingle, ServiceCreateResponse } from '../types/service-safety.js';
import { ValidationError } from '../_core/errors/typed-errors.js';
import { getDb } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { pedidos } from '../../drizzle/schema.js';

/**
 * CAMADA SERVICES: ORDER
 * Arquitetura: LEO → TOOLS → SERVICES → DATABASE
 * 
 * Regras:
 * - Nunca acessa DB direto
 * - Recebe dados via TOOLS
 * - Retorna dados tratados
 */

export class OrderService {
  /**
   * Criar novo pedido
   * @param ctx Contexto TRPC com tenantId
   * @param payload Dados do pedido (validado via type guard)
   */
  async create(ctx: { tenantId: number | null }, payload: Record<string, unknown>): Promise<ServiceCreateResponse> {
    // SECURITY HARDENING: Validar tenant obrigatório
    if (!ctx.tenantId || ctx.tenantId <= 0) {
      throw new ValidationError('Tenant inválido ou ausente');
    }
    // Type guard simples para validação
    if (!payload || typeof payload !== 'object') {
      throw new ValidationError('Payload inválido: esperado objeto');
    }

    const clienteId =
      typeof payload.clienteId === 'number' && payload.clienteId > 0
        ? payload.clienteId
        : typeof payload.clientId === 'number' && payload.clientId > 0
          ? payload.clientId
          : undefined;

    // Validação mínima de campos obrigatórios (clienteId ou clientId)
    if (clienteId === undefined) {
      throw new ValidationError('Campo obrigatório ausente: clienteId ou clientId');
    }
    if (!('itens' in payload) || payload.itens === null || payload.itens === undefined) {
      throw new ValidationError('Campo obrigatório ausente: itens');
    }

    // Validação de itens
    if (!Array.isArray(payload.itens) || payload.itens.length === 0) {
      throw new ValidationError('itens deve ser array não vazio');
    }

    // Validação de cada item
    for (const [index, item] of (payload.itens as Array<Record<string, unknown>>).entries()) {
      if (!item || typeof item !== 'object') {
        throw new ValidationError(`Item ${index} inválido: esperado objeto`);
      }

      if (!('produtoId' in item) || typeof item.produtoId !== 'number' || item.produtoId <= 0) {
        throw new ValidationError(`Item ${index}: produtoId deve ser número > 0`);
      }

      if (!('quantidade' in item) || typeof item.quantidade !== 'number' || item.quantidade <= 0) {
        throw new ValidationError(`Item ${index}: quantidade deve ser número > 0`);
      }

      if (!('precoUnitario' in item) || typeof item.precoUnitario !== 'number' || item.precoUnitario < 0) {
        throw new ValidationError(`Item ${index}: precoUnitario deve ser número >= 0`);
      }
    }

    // TODO: Implementação real com schema correto
    // SECURITY HARDENING: OBRIGATÓRIO incluir WHERE tenant_id = ctx.tenantId
    // Por agora, mock com validação tenant para não quebrar compilação
    console.log(`[ORDER SERVICE] Criando pedido para tenant ${ctx.tenantId}`, payload);
    return { id: Math.floor(Math.random() * 1000) };
  }

  /**
   * Listar pedidos
   * @param ctx Contexto TRPC com tenantId
   * @param payload Filtros e paginação
   */
  async list(ctx: { tenantId: number | null }, payload: Record<string, unknown>): Promise<ServiceList<Record<string, unknown>>> {
    // SECURITY HARDENING: Validar tenant obrigatório
    if (!ctx.tenantId || ctx.tenantId <= 0) {
      throw new ValidationError('Tenant inválido ou ausente');
    }
    // Type guard para payload
    if (!payload || typeof payload !== 'object') {
      throw new ValidationError('Payload inválido: esperado objeto');
    }

    // Validação de filtros opcionais (clienteId ou clientId)
    const { page = 1, limit = 50, status, dataInicio, dataFim } = payload;
    const clienteId =
      payload.clienteId !== undefined
        ? payload.clienteId
        : payload.clientId !== undefined
          ? payload.clientId
          : undefined;
    
    if (typeof page !== 'number' || page < 1) {
      throw new ValidationError('Page deve ser número >= 1');
    }
    
    if (typeof limit !== 'number' || limit < 1 || limit > 100) {
      throw new ValidationError('Limit deve ser número entre 1 e 100');
    }

    if (clienteId !== undefined && (typeof clienteId !== 'number' || clienteId <= 0)) {
      throw new ValidationError('clienteId/clientId deve ser número > 0');
    }

    // Validação de status se fornecido
    if (status !== undefined && typeof status !== 'string') {
      throw new ValidationError('status deve ser string');
    }

    // Validação de datas se fornecidas
    if (dataInicio !== undefined && !(dataInicio instanceof Date) && typeof dataInicio !== 'string') {
      throw new ValidationError('dataInicio deve ser Date ou string');
    }

    if (dataFim !== undefined && !(dataFim instanceof Date) && typeof dataFim !== 'string') {
      throw new ValidationError('dataFim deve ser Date ou string');
    }

    // TODO: Implementação real com WHERE tenant_id
    // Por agora, mock com validação tenant para não quebrar compilação
    console.log(`[ORDER SERVICE] Listando pedidos para tenant ${ctx.tenantId}`, payload);
    return []; // Mock temporário
  }

  /**
   * Buscar pedido por ID
   * @param ctx Contexto TRPC com tenantId
   * @param payload Dados incluindo ID do pedido
   */
  async getById(ctx: { tenantId: number | null }, payload: Record<string, unknown>): Promise<ServiceCreateResponse> {
    // SECURITY HARDENING: Validar tenant obrigatório
    if (!ctx.tenantId || ctx.tenantId <= 0) {
      throw new ValidationError('Tenant inválido ou ausente');
    }
    
    // Type guard para payload
    if (!payload || typeof payload !== 'object') {
      throw new ValidationError('Payload inválido: esperado objeto');
    }

    // Validação de ID obrigatório
    if (!('id' in payload) || typeof payload.id !== 'number' || payload.id <= 0) {
      throw new ValidationError('ID do pedido inválido ou ausente');
    }

    const id = payload.id as number;

    // TODO: Implementação real com WHERE tenant_id AND id
    // Por agora, mock com validação tenant para não quebrar compilação
    console.log(`[ORDER SERVICE] Buscando pedido ${id} para tenant ${ctx.tenantId}`);
    
    // Simular busca no banco - se não encontrar, throw erro
    if (id > 999999) {
      throw new ValidationError('Pedido não encontrado');
    }
    
    // Mock de retorno
    return { 
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Atualizar pedido
   * @param ctx Contexto TRPC com tenantId
   * @param payload Dados para atualização incluindo ID
   */
  async update(ctx: { tenantId: number | null }, payload: Record<string, unknown>): Promise<ServiceCreateResponse> {
    // SECURITY HARDENING: Validar tenant obrigatório
    if (!ctx.tenantId || ctx.tenantId <= 0) {
      throw new ValidationError('Tenant inválido ou ausente');
    }
    // Type guard para payload
    if (!payload || typeof payload !== 'object') {
      throw new ValidationError('Payload inválido: esperado objeto');
    }

    // Validação de ID obrigatório
    if (!('id' in payload) || typeof payload.id !== 'number' || payload.id <= 0) {
      throw new ValidationError('ID inválido: esperado número > 0');
    }

    // Validação de pelo menos um campo para atualizar
    const updateFields = { ...payload };
    delete updateFields.id;
    
    if (Object.keys(updateFields).length === 0) {
      throw new ValidationError('Nenhum campo fornecido para atualização');
    }

    // Validações específicas dos campos de atualização
    if ('status' in updateFields) {
      const statusValidos = ['pendente', 'confirmado', 'em_preparacao', 'enviado', 'entregue', 'cancelado'];
      if (!statusValidos.includes(updateFields.status as string)) {
        throw new ValidationError(`status inválido. Valores permitidos: ${statusValidos.join(', ')}`);
      }
    }

    if ('clienteId' in updateFields) {
      if (typeof updateFields.clienteId !== 'number' || updateFields.clienteId <= 0) {
        throw new ValidationError('clienteId deve ser número > 0');
      }
    }

    if ('itens' in updateFields) {
      if (!Array.isArray(updateFields.itens) || updateFields.itens.length === 0) {
        throw new ValidationError('itens deve ser array não vazio');
      }

      // Validação de cada item se fornecidos
      for (const [index, item] of (updateFields.itens as Array<Record<string, unknown>>).entries()) {
        if (!item || typeof item !== 'object') {
          throw new ValidationError(`Item ${index} inválido: esperado objeto`);
        }

        if (!('produtoId' in item) || typeof item.produtoId !== 'number' || item.produtoId <= 0) {
          throw new ValidationError(`Item ${index}: produtoId deve ser número > 0`);
        }

        if (!('quantidade' in item) || typeof item.quantidade !== 'number' || item.quantidade <= 0) {
          throw new ValidationError(`Item ${index}: quantidade deve ser número > 0`);
        }
      }
    }

    // TODO: Implementação real com WHERE tenant_id AND id
    // Por agora, mock com validação tenant para não quebrar compilação
    console.log(`[ORDER SERVICE] Atualizando pedido para tenant ${ctx.tenantId}`, payload);
    return { id: payload.id as number };
  }
}
