import { OrderService } from '../services/order.service.js';

import { ServiceCreateResponse } from '../types/service-safety.js';
import { ValidationError } from '../_core/errors/typed-errors.js';



/**

 * CAMADA TOOLS: ORDER

 * Arquitetura: LEO → TOOLS → SERVICES → DATABASE

 * 

 * Responsabilidades:

 * - Orquestração entre LEO e SERVICES

 * - Validações leves e enriquecimento

 * - Logs e auditoria

 * - NÃO acessa DB direto

 */



// HARDENING: safe improvement - tipo Payload padrão para substituir any

type Payload = Record<string, unknown>;



export interface OrderToolOptions {

}



export class OrderTool {

  constructor(private service: OrderService) {}



  /**

   * Criar novo pedido com orquestração

   * @param input Dados do pedido

   */

  async create(input: Payload) {

    console.log(`[OrderTool] Iniciando criação de pedido:`, { timestamp: new Date().toISOString() });

    

    try {

      // Enriquecimento e validação leve

      const enrichedInput = this.enrichCreatePayload(input);

      

      // Log de auditoria

      console.log(`[OrderTool] Payload enriquecido:`, { 

        fields: Object.keys(enrichedInput),

        hasClienteId: 'clienteId' in enrichedInput,

        itensCount: Array.isArray(enrichedInput.itens) ? enrichedInput.itens.length : 0

      });



      // Delegar para service

      const result = await this.service.create(enrichedInput);

      

      // Verificar se o resultado já segue o padrão ou é o retorno direto do service

      const hasSuccess = 'success' in result;

      const serviceResult = hasSuccess ? result as { success: boolean; data?: ServiceCreateResponse; error?: string } : { success: true, data: result as ServiceCreateResponse };

      

      if (!serviceResult.success) {

        console.log(`[OrderTool] Erro na criação de pedido:`, { 

          error: serviceResult.error,

          timestamp: new Date().toISOString() 

        });

        return serviceResult;

      }

      

      const data = serviceResult.data;

      console.log(`[OrderTool] Pedido criado com sucesso:`, { 
        id: (data && typeof data === 'object' && 'id' in data && typeof data.id === 'number') ? data.id : 'unknown',
        timestamp: new Date().toISOString() 
      });



      return serviceResult;

    } catch (error) {

      console.error(`[OrderTool] Erro na criação de pedido:`, { 

        error: error instanceof Error ? error.message : String(error),

        timestamp: new Date().toISOString()

      });

      throw error;

    }

  }



  /**

   * Listar pedidos com orquestração

   * @param input Filtros e paginação

   */

  async list(input: Payload) {

    console.log(`[OrderTool] Iniciando listagem de pedidos:`, { timestamp: new Date().toISOString() });

    

    try {

      // Validação leve e normalização

      const normalizedInput = this.normalizeListPayload(input);

      

      // Log de auditoria

      console.log(`[OrderTool] Parâmetros de busca:`, {

        page: normalizedInput.page,

        limit: normalizedInput.limit,

        hasClienteId: 'clienteId' in normalizedInput,

        hasStatus: 'status' in normalizedInput,

        hasDateRange: 'dataInicio' in normalizedInput || 'dataFim' in normalizedInput

      });



      // Delegar para service

      const result = await this.service.list(normalizedInput);

      

      console.log(`[OrderTool] Listagem concluída:`, { 

        count: result.length,

        timestamp: new Date().toISOString()

      });



      return result;

    } catch (error) {

      console.error(`[OrderTool] Erro na listagem de pedidos:`, { 

        error: error instanceof Error ? error.message : String(error),

        timestamp: new Date().toISOString()

      });

      throw error;

    }

  }



  /**

   * Atualizar pedido com orquestração

   * @param input Dados para atualização

   */

  async update(input: Payload) {

    console.log(`[OrderTool] Iniciando atualização de pedido:`, { timestamp: new Date().toISOString() });

    

    try {

      // Validação de ID e enriquecimento

      const enrichedInput = this.enrichUpdatePayload(input);

      

      // Log de auditoria

      console.log(`[OrderTool] Atualização programada:`, {

        id: enrichedInput.id,

        fields: Object.keys(enrichedInput).filter(k => k !== 'id'),

        timestamp: new Date().toISOString()

      });



      // Delegar para service

      const result = await this.service.update(enrichedInput);

      

      console.log(`[OrderTool] Pedido atualizado com sucesso:`, { 

        id: result.id,

        timestamp: new Date().toISOString()

      });



      return result;

    } catch (error) {

      console.error(`[OrderTool] Erro na atualização de pedido:`, { 

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

    if (

      enriched.clienteId === undefined &&

      typeof enriched.clientId === 'number' &&

      enriched.clientId > 0

    ) {

      enriched.clienteId = enriched.clientId;

    }



    // Enriquecer itens se existirem

    if ('itens' in enriched && Array.isArray(enriched.itens)) {

      enriched.itens = enriched.itens.map((item, index) => {

        if (item && typeof item === 'object') {

          const enrichedItem = { ...item };

          

          // Adicionar timestamp no item

          enrichedItem.addedAt = new Date().toISOString();

          enrichedItem.itemOrder = index;

          

          return enrichedItem;

        }

        return item;

      });

    }



    // Adicionar timestamps

    enriched.createdAt = new Date().toISOString();

    enriched.updatedAt = new Date().toISOString();



    // Adicionar status padrão se não existir

    if (!('status' in enriched)) {

      enriched.status = 'pendente';

    }



    // Calcular total se não existir

    if (!('total' in enriched) && Array.isArray(enriched.itens)) {

      const total = enriched.itens.reduce((sum: number, item: Payload) => {

        if (item && typeof item === 'object' && 

            typeof item.quantidade === 'number' && 

            typeof item.precoUnitario === 'number') {

          return sum + (item.quantidade * item.precoUnitario);

        }

        return sum;

      }, 0);

      enriched.total = total;

    }



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



    // Normalizar status se presente

    if ('status' in normalized && typeof normalized.status === 'string') {

      normalized.status = normalized.status.toLowerCase().trim();

    }



    // Normalizar datas se presentes

    if ('dataInicio' in normalized && typeof normalized.dataInicio === 'string') {

      normalized.dataInicio = normalized.dataInicio.trim();

    }



    if ('dataFim' in normalized && typeof normalized.dataFim === 'string') {

      normalized.dataFim = normalized.dataFim.trim();

    }



    if (

      normalized.clienteId === undefined &&

      typeof normalized.clientId === 'number' &&

      normalized.clientId > 0

    ) {

      normalized.clienteId = normalized.clientId;

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



    // Normalizar status se presente

    if ('status' in enriched && typeof enriched.status === 'string') {

      enriched.status = enriched.status.toLowerCase().trim();

    }



    // Enriquecer itens se presentes

    if ('itens' in enriched && Array.isArray(enriched.itens)) {

      enriched.itens = enriched.itens.map((item, index) => {

        if (item && typeof item === 'object') {

          const enrichedItem = { ...item };

          enrichedItem.updatedAt = new Date().toISOString();

          enrichedItem.itemOrder = index;

          return enrichedItem;

        }

        return item;

      });

    }



    // Adicionar timestamp de atualização

    enriched.updatedAt = new Date().toISOString();



    // Recalcular total se itens foram modificificados

    if ('itens' in enriched && Array.isArray(enriched.itens)) {

      const total = enriched.itens.reduce((sum: number, item: Payload) => {

        if (item && typeof item === 'object' && 

            typeof item.quantidade === 'number' && 

            typeof item.precoUnitario === 'number') {

          return sum + (item.quantidade * item.precoUnitario);

        }

        return sum;

      }, 0);

      enriched.total = total;

    }



    return enriched;

  }

}

