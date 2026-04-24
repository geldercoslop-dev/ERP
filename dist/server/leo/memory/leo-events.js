/**
 * LEO Events - Stub Implementation
 *
 * Implementação mínima para ERP Core + LEO Básico
 * Tipos centralizados em `shared/types`.
 */
import { insertLeoActionLog } from '../../services/ai/leo-action-logger.js';
import { LeoEventType, LeoEventPriority, LeoEventStatus } from '../../../shared/types/index.js';
export class LeoEvents {
    static instance;
    events = new Map();
    constructor() {
        console.log("[LEO Events STUB] Initialized in stub mode");
    }
    static getInstance() {
        if (!LeoEvents.instance) {
            LeoEvents.instance = new LeoEvents();
        }
        return LeoEvents.instance;
    }
    /** Alias para compatibilidade: registrarEvento -> registerEvent */
    async registerEvent(input) {
        return this.createEvent(input);
    }
    /** Alias para compatibilidade: registrarEvento -> registerEvent */
    async registrarEvento(input) {
        return this.createEvent(input);
    }
    /** Alias para compatibilidade: listarEventos -> listEvents */
    async listarEventos(filters) {
        const events = await this.listEvents(filters);
        return { eventos: events };
    }
    /** Alias para compatibilidade: resolverEvento -> updateEventStatus */
    async resolverEvento(eventId, resumo) {
        return this.updateEventStatus(eventId, LeoEventStatus.RESOLVIDO, 'leo-operator');
    }
    /** Alias para compatibilidade: getEstatisticas */
    async getEstatisticas() {
        const allEvents = await this.listEvents();
        return {
            total: allEvents.length,
            abertos: allEvents.filter(e => e.status === LeoEventStatus.ATIVO).length,
            resolvidos: allEvents.filter(e => e.status === LeoEventStatus.RESOLVIDO).length,
            ignorados: allEvents.filter(e => e.status === LeoEventStatus.IGNORADO).length,
        };
    }
    /** Alias para compatibilidade: gerarEventosAutomaticos */
    async gerarEventosAutomaticos() {
        console.log('[LEO Events STUB] gerarEventosAutomaticos chamado (no-op)');
        return {
            success: true,
            events: [],
            message: 'Geração automática de eventos desabilitada no modo stub'
        };
    }
    /** Alias para compatibilidade: criarEvento -> createEvent */
    async criarEvento(input) {
        return this.createEvent(input);
    }
    async createEvent(input) {
        const now = new Date();
        const event = {
            id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            tipo: input.tipo ?? LeoEventType.PERCEPCAO,
            titulo: input.descricao ?? '',
            descricao: input.descricao,
            dados: input.dados,
            prioridade: input.prioridade ?? LeoEventPriority.MEDIA,
            status: LeoEventStatus.ATIVO,
            usuarioResponsavel: input.usuarioResponsavel,
            dataCriacao: now,
            dataUltimaAtualizacao: now,
        };
        event.usuarioCriador = input.usuarioCriador;
        event.createdAt = now;
        event.updatedAt = now;
        this.events.set(event.id, event);
        try {
            await insertLeoActionLog({
                usuario: input.usuarioCriador,
                acao: 'criar_evento',
                entidade: 'leo_events',
                dados: JSON.stringify({ eventId: event.id, tipo: input.tipo }),
                resultado: 'success'
            });
        }
        catch (error) {
            console.error('[LEO Events STUB] Error logging action:', error);
        }
        console.log(`[LEO Events STUB] Event created: ${event.id} (${event.tipo})`);
        return event;
    }
    async getEvent(eventId) {
        return this.events.get(eventId) || null;
    }
    async updateEventStatus(eventId, status, usuarioResponsavel) {
        const event = this.events.get(eventId);
        if (!event)
            return false;
        event.status = status;
        event.dataUltimaAtualizacao = new Date();
        if (usuarioResponsavel) {
            event.usuarioResponsavel = usuarioResponsavel;
        }
        if (status === LeoEventStatus.RESOLVIDO) {
            event.resolvidoEm = new Date();
        }
        console.log(`[LEO Events STUB] Event ${eventId} status updated to: ${status}`);
        return true;
    }
    async listEvents(filters) {
        let events = Array.from(this.events.values());
        if (filters) {
            if (filters.tipo) {
                events = events.filter((e) => e.tipo === filters.tipo);
            }
            if (filters.status) {
                events = events.filter((e) => e.status === filters.status);
            }
            if (filters.usuarioResponsavel) {
                events = events.filter((e) => e.usuarioResponsavel === filters.usuarioResponsavel);
            }
        }
        // Sort by dataCriacao desc
        events.sort((a, b) => b.dataCriacao.getTime() - a.dataCriacao.getTime());
        if (filters?.limit) {
            events = events.slice(0, filters.limit);
        }
        return events;
    }
    async deleteEvent(eventId) {
        const deleted = this.events.delete(eventId);
        if (deleted) {
            console.log(`[LEO Events STUB] Event ${eventId} deleted`);
        }
        return deleted;
    }
    // Eventos específicos do ERP
    async createLowStockEvent(produtoId, produtoNome, quantidadeAtual) {
        return this.createEvent({
            tipo: 'estoque_baixo',
            descricao: `Estoque baixo: ${produtoNome} (QTD: ${quantidadeAtual})`,
            prioridade: 'alta',
            dados: { produtoId, produtoNome, quantidadeAtual },
            usuarioCriador: 'leo-system'
        });
    }
    async createOverdueOrderEvent(pedidoId, clienteNome, diasAtraso) {
        return this.createEvent({
            tipo: 'pedido_atrasado',
            descricao: `Pedido atrasado: ${clienteNome} (${diasAtraso} dias)`,
            prioridade: diasAtraso > 7 ? 'critica' : 'alta',
            dados: { pedidoId, clienteNome, diasAtraso },
            usuarioCriador: 'leo-system'
        });
    }
    async createSystemErrorEvent(error, context) {
        return this.createEvent({
            tipo: 'erro_sistema',
            descricao: `Erro no sistema: ${error.message}`,
            prioridade: 'critica',
            dados: { error: error.message, stack: error.stack, context },
            usuarioCriador: 'leo-system'
        });
    }
    async createInactiveClientEvent(clienteId, clienteNome, diasInativo) {
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
