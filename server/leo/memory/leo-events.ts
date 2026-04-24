/**
 * LEO Events - Stub Implementation
 * 
 * Implementação mínima para ERP Core + LEO Básico
 * Tipos centralizados em `shared/types`.
 */

import { insertLeoActionLog } from '../../services/ai/leo-action-logger.js';
import type { LeoEvent } from '../../../shared/types/index.js';
import { LeoEventType, LeoEventPriority, LeoEventStatus } from '../../../shared/types/index.js';

export type { LeoEvent };

export interface CreateEventInput {
  tipo: string;
  descricao: string;
  prioridade: 'baixa' | 'media' | 'alta' | 'critica';
  dados?: unknown;
  usuarioCriador: string;
  usuarioResponsavel?: string;
}

export class LeoEvents {
  private static instance: LeoEvents;
  private events: Map<string, LeoEvent> = new Map();

  private constructor() {
    console.log("[LEO Events STUB] Initialized in stub mode");
  }

  public static getInstance(): LeoEvents {
    if (!LeoEvents.instance) {
      LeoEvents.instance = new LeoEvents();
    }
    return LeoEvents.instance;
  }

  /** Alias para compatibilidade: registrarEvento -> registerEvent */
  async registerEvent(input: CreateEventInput): Promise<LeoEvent> {
    return this.createEvent(input);
  }

  /** Alias para compatibilidade: registrarEvento -> registerEvent */
  async registrarEvento(input: CreateEventInput): Promise<LeoEvent> {
    return this.createEvent(input);
  }

  /** Alias para compatibilidade: listarEventos -> listEvents */
  async listarEventos(filters?: {
    tipo?: string;
    status?: string;
    usuarioResponsavel?: string;
    limit?: number;
  }): Promise<{ eventos: LeoEvent[] }> {
    const events = await this.listEvents(filters);
    return { eventos: events };
  }

  /** Alias para compatibilidade: resolverEvento -> updateEventStatus */
  async resolverEvento(eventId: string, resumo: string): Promise<boolean> {
    return this.updateEventStatus(eventId, LeoEventStatus.RESOLVIDO, 'leo-operator');
  }

  /** Alias para compatibilidade: getEstatisticas */
  async getEstatisticas(): Promise<{
    total: number;
    abertos: number;
    resolvidos: number;
    ignorados: number;
  }> {
    const allEvents = await this.listEvents();
    return {
      total: allEvents.length,
      abertos: allEvents.filter(e => e.status === LeoEventStatus.ATIVO).length,
      resolvidos: allEvents.filter(e => e.status === LeoEventStatus.RESOLVIDO).length,
      ignorados: allEvents.filter(e => e.status === LeoEventStatus.IGNORADO).length,
    };
  }

  /** Alias para compatibilidade: gerarEventosAutomaticos */
  async gerarEventosAutomaticos(): Promise<{
    success: boolean;
    events: LeoEvent[];
    message: string;
  }> {
    console.log('[LEO Events STUB] gerarEventosAutomaticos chamado (no-op)');
    return {
      success: true,
      events: [],
      message: 'Geração automática de eventos desabilitada no modo stub'
    };
  }

  /** Alias para compatibilidade: criarEvento -> createEvent */
  async criarEvento(input: CreateEventInput): Promise<LeoEvent> {
    return this.createEvent(input);
  }

  async createEvent(input: CreateEventInput): Promise<LeoEvent> {
    const now = new Date();
    const event: LeoEvent = {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tipo: (input.tipo as LeoEventType) ?? LeoEventType.PERCEPCAO,
      titulo: input.descricao ?? '',
      descricao: input.descricao,
      dados: input.dados,
      prioridade: (input.prioridade as LeoEventPriority) ?? LeoEventPriority.MEDIA,
      status: LeoEventStatus.ATIVO,
      usuarioResponsavel: input.usuarioResponsavel,
      dataCriacao: now,
      dataUltimaAtualizacao: now,
    };
    Object.defineProperty(event, 'usuarioCriador', { value: input.usuarioCriador, writable: true, configurable: true });
    Object.defineProperty(event, 'createdAt', { value: now, writable: true, configurable: true });
    Object.defineProperty(event, 'updatedAt', { value: now, writable: true, configurable: true });

    this.events.set(event.id, event);

    try {
      await insertLeoActionLog({
        usuario: input.usuarioCriador,
        acao: 'criar_evento',
        entidade: 'leo_events',
        dados: JSON.stringify({ eventId: event.id, tipo: input.tipo }),
        resultado: 'success'
      });
    } catch (error) {
      console.error('[LEO Events STUB] Error logging action:', error);
    }

    console.log(`[LEO Events STUB] Event created: ${event.id} (${event.tipo})`);
    return event;
  }

  async getEvent(eventId: string): Promise<LeoEvent | null> {
    return this.events.get(eventId) || null;
  }

  async updateEventStatus(eventId: string, status: LeoEvent['status'], usuarioResponsavel?: string): Promise<boolean> {
    const event = this.events.get(eventId);
    if (!event) return false;

    event.status = status;
    event.dataUltimaAtualizacao = new Date();
    if (usuarioResponsavel) {
      event.usuarioResponsavel = usuarioResponsavel;
    }
    if (status === LeoEventStatus.RESOLVIDO) {
      Object.defineProperty(event, 'resolvidoEm', { value: new Date(), writable: true, configurable: true });
    }

    console.log(`[LEO Events STUB] Event ${eventId} status updated to: ${status}`);
    return true;
  }

  async listEvents(filters?: {
    tipo?: string;
    status?: string;
    usuarioResponsavel?: string;
    limit?: number;
  }): Promise<LeoEvent[]> {
    let events = Array.from(this.events.values());

    if (filters) {
      if (filters.tipo) {
        events = events.filter((e: LeoEvent) => e.tipo === filters.tipo);
      }
      if (filters.status) {
        events = events.filter((e: LeoEvent) => e.status === filters.status);
      }
      if (filters.usuarioResponsavel) {
        events = events.filter((e: LeoEvent) => e.usuarioResponsavel === filters.usuarioResponsavel);
      }
    }

    // Sort by dataCriacao desc
    events.sort((a, b) => b.dataCriacao.getTime() - a.dataCriacao.getTime());

    if (filters?.limit) {
      events = events.slice(0, filters.limit);
    }

    return events;
  }

  async deleteEvent(eventId: string): Promise<boolean> {
    const deleted = this.events.delete(eventId);
    if (deleted) {
      console.log(`[LEO Events STUB] Event ${eventId} deleted`);
    }
    return deleted;
  }

  // Eventos específicos do ERP
  async createLowStockEvent(produtoId: number, produtoNome: string, quantidadeAtual: number): Promise<LeoEvent> {
    return this.createEvent({
      tipo: 'estoque_baixo',
      descricao: `Estoque baixo: ${produtoNome} (QTD: ${quantidadeAtual})`,
      prioridade: 'alta',
      dados: { produtoId, produtoNome, quantidadeAtual },
      usuarioCriador: 'leo-system'
    });
  }

  async createOverdueOrderEvent(pedidoId: number, clienteNome: string, diasAtraso: number): Promise<LeoEvent> {
    return this.createEvent({
      tipo: 'pedido_atrasado',
      descricao: `Pedido atrasado: ${clienteNome} (${diasAtraso} dias)`,
      prioridade: diasAtraso > 7 ? 'critica' : 'alta',
      dados: { pedidoId, clienteNome, diasAtraso },
      usuarioCriador: 'leo-system'
    });
  }

  async createSystemErrorEvent(error: Error, context?: unknown): Promise<LeoEvent> {
    return this.createEvent({
      tipo: 'erro_sistema',
      descricao: `Erro no sistema: ${error.message}`,
      prioridade: 'critica',
      dados: { error: error.message, stack: error.stack, context },
      usuarioCriador: 'leo-system'
    });
  }

  async createInactiveClientEvent(clienteId: number, clienteNome: string, diasInativo: number): Promise<LeoEvent> {
    return this.createEvent({
      tipo: 'cliente_inativo',
      descricao: `Cliente inativo: ${clienteNome} (${diasInativo} dias)`,
      prioridade: 'media',
      dados: { clienteId, clienteNome, diasInativo },
      usuarioCriador: 'leo-system'
    });
  }
}

export const leoEvents = LeoEvents.getInstance();

export default leoEvents;
