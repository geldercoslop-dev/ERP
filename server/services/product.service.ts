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
  async create(payload: Record<string, unknown>): Promise<ServiceCreateResponse> {
    // Type guard simples para validação
    if (!payload || typeof payload !== 'object') {
      throw new Error('Payload inválido: esperado objeto');
    }

    // Validação mínima de campos obrigatórios
    const requiredFields = ['nome', 'preco', 'estoque'];
    for (const field of requiredFields) {
      if (!(field in payload) || payload[field] === null || payload[field] === undefined) {
        throw new Error(`Campo obrigatório ausente: ${field}`);
      }
    }

    // Validação de tipos específicos
    if (typeof payload.preco !== 'number' || payload.preco < 0) {
      throw new Error('Preço deve ser número >= 0');
    }

    if (typeof payload.estoque !== 'number' || payload.estoque < 0) {
      throw new Error('Estoque deve ser número >= 0');
    }

    // TODO: Integrar com TOOLS layer para persistência
    // Exemplo: await productTools.create(payload);
    
    // Mock retorno para seguir contrato
    return { id: Math.floor(Math.random() * 1000) };
  }

  /**
   * Listar produtos
   * @param payload Filtros e paginação
   */
  async list(payload: Record<string, unknown>): Promise<ServiceList<Record<string, unknown>>> {
    // Type guard para payload
    if (!payload || typeof payload !== 'object') {
      throw new Error('Payload inválido: esperado objeto');
    }

    // Validação de filtros opcionais
    const { page = 1, limit = 50, search, categoria, minPreco, maxPreco } = payload;
    
    if (typeof page !== 'number' || page < 1) {
      throw new Error('Page deve ser número >= 1');
    }
    
    if (typeof limit !== 'number' || limit < 1 || limit > 100) {
      throw new Error('Limit deve ser número entre 1 e 100');
    }

    // Validação de filtros de preço se fornecidos
    if (minPreco !== undefined && (typeof minPreco !== 'number' || minPreco < 0)) {
      throw new Error('minPreco deve ser número >= 0');
    }

    if (maxPreco !== undefined && (typeof maxPreco !== 'number' || maxPreco < 0)) {
      throw new Error('maxPreco deve ser número >= 0');
    }

    if (minPreco !== undefined && maxPreco !== undefined && minPreco > maxPreco) {
      throw new Error('minPreco não pode ser maior que maxPreco');
    }

    // TODO: Integrar com TOOLS layer para busca
    // Exemplo: return await productTools.list({ page, limit, search, categoria, minPreco, maxPreco });
    
    // Mock retorno para seguir contrato
    return [];
  }

  /**
   * Atualizar produto
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
    if ('preco' in updateFields) {
      if (typeof updateFields.preco !== 'number' || updateFields.preco < 0) {
        throw new Error('Preço deve ser número >= 0');
      }
    }

    if ('estoque' in updateFields) {
      if (typeof updateFields.estoque !== 'number' || updateFields.estoque < 0) {
        throw new Error('Estoque deve ser número >= 0');
      }
    }

    // TODO: Integrar com TOOLS layer para atualização
    // Exemplo: await productTools.update(payload.id, updateFields);
    
    // Mock retorno para seguir contrato
    return { id: payload.id as number };
  }
}
