import { ClientService } from '../services/client.service.js';
import { ServiceCreateResponse, ServiceList, ServicePaginated } from '../types/service-safety.js';
import { ValidationError } from '../_core/errors/typed-errors.js';

/**
 * CAMADA TOOLS: CLIENT
 * Arquitetura: LEO → TOOLS → SERVICES → DATABASE
 * 
 * Responsabilidades:
 * - Orquestração entre LEO e SERVICES
 * - Validações leves e enriquecimento
 * - Logs e auditoria
 * - NÃO acessa DB direto
 */

type Payload = Record<string, unknown>;

export class ClientTool {
  constructor(private service: ClientService) {}

  /**
   * Criar novo cliente com orquestração
   * @param input Dados do cliente
   */
  async create(input: Payload) {
    console.log(`[ClientTool] Iniciando criação de cliente:`, { timestamp: new Date().toISOString() });
    
    try {
      // Enriquecimento e validação leve
      const enrichedInput = this.enrichCreatePayload(input);
      
      // Log de auditoria
      console.log(`[ClientTool] Payload enriquecido:`, { 
        fields: Object.keys(enrichedInput),
        hasEmail: 'email' in enrichedInput,
        hasNome: 'nome' in enrichedInput
      });

      // Delegar para service
      const result = await this.service.create(enrichedInput);
      
      if (!result.success) {
        console.log(`[ClientTool] Erro na criação de cliente:`, { 
          error: result.error,
          timestamp: new Date().toISOString() 
        });
        return result;
      }
      
      const data = result.data as unknown as ServiceCreateResponse | undefined;
      console.log(`[ClientTool] Cliente criado com sucesso:`, { 
        id: typeof data === 'object' && data !== null && 'id' in data ? (data as any).id : 'unknown',
        timestamp: new Date().toISOString() 
      });

      return result;
    } catch (error) {
      console.error(`[ClientTool] Erro na criação de cliente:`, { 
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Listar clientes com orquestração
   * @param input Filtros e paginação
   */
  async list(input: Payload) {
    console.log(`[ClientTool] Iniciando listagem de clientes:`, { timestamp: new Date().toISOString() });
    
    try {
      // Validação leve e normalização
      const normalizedInput = this.normalizeListPayload(input);
      
      // Log de auditoria
      console.log(`[ClientTool] Parâmetros de busca:`, {
        page: normalizedInput.page,
        limit: normalizedInput.limit,
        hasSearch: 'search' in normalizedInput
      });

      // Delegar para service
      const result = await this.service.list(normalizedInput);
      
      if (!result.success) {
        console.log(`[ClientTool] Erro na listagem de clientes:`, { 
          error: result.error,
          timestamp: new Date().toISOString()
        });
        return result;
      }
      
      const data = result.data as unknown as ServiceCreateResponse | undefined;
      console.log(`[ClientTool] Listagem concluída:`, { 
        count: typeof data === 'object' && data !== null && 'length' in data ? (data as any).length : 0,
        timestamp: new Date().toISOString() 
      });

      return result;
    } catch (error) {
      console.error(`[ClientTool] Erro na listagem de clientes:`, { 
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Atualizar cliente com orquestração
   * @param input Dados para atualização
   */
  async update(input: Payload) {
    console.log(`[ClientTool] Iniciando atualização de cliente:`, { timestamp: new Date().toISOString() });
    
    try {
      // Validação de ID e enriquecimento
      const enrichedInput = this.enrichUpdatePayload(input);
      
      // Log de auditoria
      console.log(`[ClientTool] Atualização programada:`, {
        id: enrichedInput.id,
        fields: Object.keys(enrichedInput).filter(k => k !== 'id'),
        timestamp: new Date().toISOString()
      });

      // Delegar para service
      const result = await this.service.update(enrichedInput);
      
      if (!result.success) {
        console.log(`[ClientTool] Erro na atualização de cliente:`, { 
          error: result.error,
          timestamp: new Date().toISOString()
        });
        return result;
      }
      
      const data = result.data as unknown as ServiceCreateResponse | undefined;
      console.log(`[ClientTool] Cliente atualizado com sucesso:`, { 
        id: typeof data === 'object' && data !== null && 'id' in data ? (data as any).id : 'unknown',
        timestamp: new Date().toISOString() 
      });

      return result;
    } catch (error) {
      console.error(`[ClientTool] Erro na atualização de cliente:`, { 
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Enriquecer payload de criação
   */
  private enrichCreatePayload(input: Payload): Payload {
    const enriched = { ...input };

    // Normalizar email
    if ('email' in enriched && typeof enriched.email === 'string') {
      enriched.email = enriched.email.toLowerCase().trim();
    }

    // Adicionar timestamp de criação
    enriched.createdAt = new Date().toISOString();
    enriched.updatedAt = new Date().toISOString();

    return enriched;
  }

  /**
   * Normalizar payload de listagem
   */
  private normalizeListPayload(input: Payload): Payload {
    const normalized = { ...input };

    // Garantir valores padrão
    if (!('page' in normalized) || typeof normalized.page !== 'number') {
      normalized.page = 1;
    }

    if (!('limit' in normalized) || typeof normalized.limit !== 'number') {
      normalized.limit = 50;
    }

    // Limitar máximo
    const limit = normalized.limit as number;
    if (limit > 100) {
      normalized.limit = 100;
    }

    return normalized;
  }

  /**
   * Enriquecer payload de atualização
   */
  private enrichUpdatePayload(input: Payload): Payload {
    const enriched = { ...input };

    // Validar ID obrigatório
    if (!('id' in enriched) || typeof enriched.id !== 'number') {
      throw new ValidationError('ID é obrigatório para atualização');
    }

    // Normalizar email se presente
    if ('email' in enriched && typeof enriched.email === 'string') {
      enriched.email = enriched.email.toLowerCase().trim();
    }

    // Adicionar timestamp de atualização
    enriched.updatedAt = new Date().toISOString();

    return enriched;
  }
}
