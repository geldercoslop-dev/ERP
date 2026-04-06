import { ServiceList, ServiceSingle, ServiceCreateResponse } from '../types/service-safety.js';

/**
 * CAMADA SERVICES: PRODUCT
 * Arquitetura: LEO → TOOLS → SERVICES → DATABASE
 * 
 * Regras:
 * - Nunca acessa DB direto
 * - Recebe dados via TOOLS
 * - Retorna dados tratados
 */

export class ProductService {
  /**
   * Criar novo produto
   * @param payload Dados do produto (validado via type guard)
   */
  async create(payload: Record<string, unknown>): Promise<{ success: boolean; data?: ServiceCreateResponse; error?: string }> {
    // Type guard simples para validação
    if (!payload || typeof payload !== 'object') {
      return { success: false, error: 'Payload inválido: esperado objeto' };
    }

    // Validação mínima de campos obrigatórios
    const requiredFields = ['nome', 'preco', 'estoque'];
    for (const field of requiredFields) {
      if (!(field in payload) || payload[field] === null || payload[field] === undefined) {
        return { success: false, error: `Campo obrigatório ausente: ${field}` };
      }
    }

    // Validação de tipos específicos
    if (typeof payload.preco !== 'number' || payload.preco < 0) {
      return { success: false, error: 'Preço deve ser número >= 0' };
    }

    if (payload.estoque === undefined || payload.estoque === null) {
      return { success: false, error: 'Dado crítico ausente: estoque' };
    }
    
    if (typeof payload.estoque !== 'number' || payload.estoque < 0) {
      return { success: false, error: 'Estoque deve ser número >= 0' };
    }

    // TODO: Integrar com TOOLS layer para persistência
    // Exemplo: await productTools.create(payload);
    
    // Mock retorno para seguir contrato
    return { success: true, data: { id: Math.floor(Math.random() * 1000) } };
  }

  /**
   * Listar produtos
   * @param payload Filtros e paginação
   */
  async list(payload: Record<string, unknown>): Promise<{ success: boolean; data?: ServiceList<Record<string, unknown>>; error?: string }> {
    // Type guard para payload
    if (!payload || typeof payload !== 'object') {
      return { success: false, error: 'Payload inválido: esperado objeto' };
    }

    // Validação de filtros opcionais
    const { page = 1, limit = 50, search, categoria, minPreco, maxPreco } = payload;
    
    if (typeof page !== 'number' || page < 1) {
      return { success: false, error: 'Page deve ser número >= 1' };
    }
    
    if (limit === undefined || limit === null) {
      return { success: false, error: 'Dado crítico ausente: limit' };
    }
    
    if (typeof limit !== 'number' || limit < 1 || limit > 100) {
      return { success: false, error: 'Limit deve ser número entre 1 e 100' };
    }

    // Validação de filtros de preço se fornecidos
    if (minPreco !== undefined) {
      if (typeof minPreco !== 'number' || minPreco < 0) {
        return { success: false, error: 'minPreco deve ser número >= 0' };
      }
    }

    if (maxPreco !== undefined) {
      if (typeof maxPreco !== 'number' || maxPreco < 0) {
        return { success: false, error: 'maxPreco deve ser número >= 0' };
      }
    }

    if (minPreco !== undefined && maxPreco !== undefined && minPreco > maxPreco) {
      return { success: false, error: 'minPreco não pode ser maior que maxPreco' };
    }

    // TODO: Integrar com TOOLS layer para busca
    // Exemplo: return await productTools.list({ page, limit, search, categoria, minPreco, maxPreco });
    
    // Mock retorno para seguir contrato
    return { success: true, data: [] };
  }

  /**
   * Atualizar produto
   * @param payload Dados para atualização incluindo ID
   */
  async update(payload: Record<string, unknown>): Promise<{ success: boolean; data?: ServiceCreateResponse; error?: string }> {
    // Type guard para payload
    if (!payload || typeof payload !== 'object') {
      return { success: false, error: 'Payload inválido: esperado objeto' };
    }

    // Validação de ID obrigatório
    if (!('id' in payload) || typeof payload.id !== 'number' || payload.id <= 0) {
      return { success: false, error: 'ID inválido: esperado número > 0' };
    }

    // Validação de pelo menos um campo para atualizar
    const updateFields = { ...payload };
    delete updateFields.id;
    
    if (Object.keys(updateFields).length === 0) {
      return { success: false, error: 'Nenhum campo fornecido para atualização' };
    }

    // Validações específicas dos campos de atualização
    if ('preco' in updateFields) {
      if (updateFields.preco === undefined || updateFields.preco === null) {
        return { success: false, error: 'Dado crítico ausente: preco' };
      }
      
      if (typeof updateFields.preco !== 'number' || updateFields.preco < 0) {
        return { success: false, error: 'Preço deve ser número >= 0' };
      }
    }

    if ('estoque' in updateFields) {
      if (updateFields.estoque === undefined || updateFields.estoque === null) {
        return { success: false, error: 'Dado crítico ausente: estoque' };
      }
      
      if (typeof updateFields.estoque !== 'number' || updateFields.estoque < 0) {
        return { success: false, error: 'Estoque deve ser número >= 0' };
      }
    }

    // TODO: Integrar com TOOLS layer para atualização
    // Exemplo: await productTools.update(payload.id, updateFields);
    
    // Mock retorno para seguir contrato
    return { success: true, data: { id: payload.id as number } };
  }
}
