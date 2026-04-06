import { ServiceList, ServiceSingle, ServiceCreateResponse } from '../types/service-safety.js';

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
   * @param payload Dados do pedido (validado via type guard)
   */
  async create(payload: Record<string, unknown>): Promise<ServiceCreateResponse> {
    // Type guard simples para validação
    if (!payload || typeof payload !== 'object') {
      throw new Error('Payload inválido: esperado objeto');
    }

    const clienteId =
      typeof payload.clienteId === 'number' && payload.clienteId > 0
        ? payload.clienteId
        : typeof payload.clientId === 'number' && payload.clientId > 0
          ? payload.clientId
          : undefined;

    // Validação mínima de campos obrigatórios (clienteId ou clientId)
    if (clienteId === undefined) {
      throw new Error('Campo obrigatório ausente: clienteId ou clientId');
    }
    if (!('itens' in payload) || payload.itens === null || payload.itens === undefined) {
      throw new Error('Campo obrigatório ausente: itens');
    }

    // Validação de itens
    if (!Array.isArray(payload.itens) || payload.itens.length === 0) {
      throw new Error('itens deve ser array não vazio');
    }

    // Validação de cada item
    for (const [index, item] of (payload.itens as Array<Record<string, unknown>>).entries()) {
      if (!item || typeof item !== 'object') {
        throw new Error(`Item ${index} inválido: esperado objeto`);
      }

      if (!('produtoId' in item) || typeof item.produtoId !== 'number' || item.produtoId <= 0) {
        throw new Error(`Item ${index}: produtoId deve ser número > 0`);
      }

      if (!('quantidade' in item) || typeof item.quantidade !== 'number' || item.quantidade <= 0) {
        throw new Error(`Item ${index}: quantidade deve ser número > 0`);
      }

      if (!('precoUnitario' in item) || typeof item.precoUnitario !== 'number' || item.precoUnitario < 0) {
        throw new Error(`Item ${index}: precoUnitario deve ser número >= 0`);
      }
    }

    // TODO: Integrar com TOOLS layer para persistência
    // Exemplo: await orderTools.create(payload);
    
    // Mock retorno para seguir contrato
    return { id: Math.floor(Math.random() * 1000) };
  }

  /**
   * Listar pedidos
   * @param payload Filtros e paginação
   */
  async list(payload: Record<string, unknown>): Promise<ServiceList<Record<string, unknown>>> {
    // Type guard para payload
    if (!payload || typeof payload !== 'object') {
      throw new Error('Payload inválido: esperado objeto');
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
      throw new Error('Page deve ser número >= 1');
    }
    
    if (typeof limit !== 'number' || limit < 1 || limit > 100) {
      throw new Error('Limit deve ser número entre 1 e 100');
    }

    if (clienteId !== undefined && (typeof clienteId !== 'number' || clienteId <= 0)) {
      throw new Error('clienteId/clientId deve ser número > 0');
    }

    // Validação de status se fornecido
    if (status !== undefined && typeof status !== 'string') {
      throw new Error('status deve ser string');
    }

    // Validação de datas se fornecidas
    if (dataInicio !== undefined && !(dataInicio instanceof Date) && typeof dataInicio !== 'string') {
      throw new Error('dataInicio deve ser Date ou string');
    }

    if (dataFim !== undefined && !(dataFim instanceof Date) && typeof dataFim !== 'string') {
      throw new Error('dataFim deve ser Date ou string');
    }

    // TODO: Integrar com TOOLS layer para busca
    // Exemplo: return await orderTools.list({ page, limit, clienteId, status, dataInicio, dataFim });
    
    // Mock retorno para seguir contrato
    return [];
  }

  /**
   * Atualizar pedido
   * @param payload Dados para atualização incluindo ID
   */
  async update(payload: Record<string, unknown>): Promise<ServiceCreateResponse> {
    // Type guard para payload
    if (!payload || typeof payload !== 'object') {
      throw new Error('Payload inválido: esperado objeto');
    }

    // Validação de ID obrigatório
    if (!('id' in payload) || typeof payload.id !== 'number' || payload.id <= 0) {
      throw new Error('ID inválido: esperado número > 0');
    }

    // Validação de pelo menos um campo para atualizar
    const updateFields = { ...payload };
    delete updateFields.id;
    
    if (Object.keys(updateFields).length === 0) {
      throw new Error('Nenhum campo fornecido para atualização');
    }

    // Validações específicas dos campos de atualização
    if ('status' in updateFields) {
      const statusValidos = ['pendente', 'confirmado', 'em_preparacao', 'enviado', 'entregue', 'cancelado'];
      if (!statusValidos.includes(updateFields.status as string)) {
        throw new Error(`status inválido. Valores permitidos: ${statusValidos.join(', ')}`);
      }
    }

    if ('clienteId' in updateFields) {
      if (typeof updateFields.clienteId !== 'number' || updateFields.clienteId <= 0) {
        throw new Error('clienteId deve ser número > 0');
      }
    }

    if ('itens' in updateFields) {
      if (!Array.isArray(updateFields.itens) || updateFields.itens.length === 0) {
        throw new Error('itens deve ser array não vazio');
      }

      // Validação de cada item se fornecidos
      for (const [index, item] of (updateFields.itens as Array<Record<string, unknown>>).entries()) {
        if (!item || typeof item !== 'object') {
          throw new Error(`Item ${index} inválido: esperado objeto`);
        }

        if (!('produtoId' in item) || typeof item.produtoId !== 'number' || item.produtoId <= 0) {
          throw new Error(`Item ${index}: produtoId deve ser número > 0`);
        }

        if (!('quantidade' in item) || typeof item.quantidade !== 'number' || item.quantidade <= 0) {
          throw new Error(`Item ${index}: quantidade deve ser número > 0`);
        }
      }
    }

    // TODO: Integrar com TOOLS layer para atualização
    // Exemplo: await orderTools.update(payload.id, updateFields);
    
    // Mock retorno para seguir contrato
    return { id: payload.id as number };
  }
}
