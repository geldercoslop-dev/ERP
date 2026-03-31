import { ServiceList, ServiceSingle, ServiceCreateResponse } from '../types/service-safety.js';

/**
 * CAMADA SERVICES: CLIENT
 * Arquitetura: LEO → TOOLS → SERVICES → DATABASE
 * 
 * Regras:
 * - Nunca acessa DB direto
 * - Recebe dados via TOOLS
 * - Retorna dados tratados
 */

export class ClientService {
  /**
   * Criar novo cliente
   * @param payload Dados do cliente (validado via type guard)
   */
  async create(payload: Record<string, unknown>): Promise<ServiceCreateResponse> {
    // Type guard simples para validação
    if (!payload || typeof payload !== 'object') {
      throw new Error('Payload inválido: esperado objeto');
    }

    // Validação mínima de campos obrigatórios
    const requiredFields = ['nome', 'email'];
    for (const field of requiredFields) {
      if (!(field in payload) || !payload[field]) {
        throw new Error(`Campo obrigatório ausente: ${field}`);
      }
    }

    // TODO: Integrar com TOOLS layer para persistência
    // Exemplo: await clientTools.create(payload);
    
    // Mock retorno para seguir contrato
    return { id: Math.floor(Math.random() * 1000) };
  }

  /**
   * Listar clientes
   * @param payload Filtros e paginação
   */
  async list(payload: Record<string, unknown>): Promise<ServiceList<Record<string, unknown>>> {
    // Type guard para payload
    if (!payload || typeof payload !== 'object') {
      throw new Error('Payload inválido: esperado objeto');
    }

    // Validação de filtros opcionais
    const { page = 1, limit = 50, search } = payload;
    
    if (typeof page !== 'number' || page < 1) {
      throw new Error('Page deve ser número >= 1');
    }
    
    if (typeof limit !== 'number' || limit < 1 || limit > 100) {
      throw new Error('Limit deve ser número entre 1 e 100');
    }

    // TODO: Integrar com TOOLS layer para busca
    // Exemplo: return await clientTools.list({ page, limit, search });
    
    // Mock retorno para seguir contrato
    return [];
  }

  /**
   * Atualizar cliente
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

    // TODO: Integrar com TOOLS layer para atualização
    // Exemplo: await clientTools.update(payload.id, updateFields);
    
    // Mock retorno para seguir contrato
    return { id: payload.id as number };
  }
}
