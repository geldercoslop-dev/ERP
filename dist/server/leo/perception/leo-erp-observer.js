/**
 * Serviço de Observação do ERP
 * Implementação simplificada usando interfaces oficiais
 */
import { LeoEventType, LeoEventPriority, LeoEventStatus } from "../../../shared/types/index.js";
import { logInfo, logError } from '../../_core/logger-rotation.js';
// Implementação mínima da interface ILeoErpObserver
export class LeoErpObserver {
    static instance;
    lastContext = null;
    eventListeners = [];
    constructor() { }
    static getInstance() {
        if (!LeoErpObserver.instance) {
            LeoErpObserver.instance = new LeoErpObserver();
        }
        return LeoErpObserver.instance;
    }
    /**
     * Método principal de observação (interface ILeoErpObserver)
     */
    async observe() {
        try {
            const context = await this.collectErpContext();
            const events = await this.generateEventsFromContext(context);
            this.lastContext = context;
            // Notificar listeners sobre novos eventos
            events.forEach(event => {
                this.notifyListeners(event);
            });
            logInfo('Observação do ERP realizada', {
                eventsCount: events.length,
                contextKeys: Object.keys(context)
            });
            return {
                success: true,
                events,
                context
            };
        }
        catch (error) {
            logError('Erro na observação do ERP', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    /**
     * Coleta contexto do ERP (interface ILeoErpObserver)
     */
    async collectErpContext() {
        try {
            // Simulação de coleta de contexto do ERP
            // Em implementação real, buscaria dados do banco de dados
            const context = {
                timestamp: Date.now(),
                pedidos: {
                    recentes: 0,
                    pendentes: 0,
                    concluidos: 0
                },
                clientes: {
                    novos: 0,
                    ativos: 0,
                    inativos: 0
                },
                produtos: {
                    estoqueBaixo: 0,
                    semEstoque: 0,
                    total: 0
                },
                financeiro: {
                    receitas: 0,
                    despesas: 0,
                    pendentes: 0
                },
                sistema: {
                    uptime: 0,
                    memoriaUso: 0,
                    cpuUso: 0
                }
            };
            logInfo('Contexto do ERP coletado', {
                timestamp: context.timestamp
            });
            return context;
        }
        catch (error) {
            logError('Erro ao coletar contexto do ERP', error);
            return {
                timestamp: Date.now(),
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    /**
     * Obtém último contexto (interface ILeoErpObserver)
     */
    getLastContext() {
        return this.lastContext;
    }
    /**
     * Gera eventos LEO a partir do contexto do ERP
     */
    async generateEventsFromContext(context) {
        const events = [];
        const produtos = context?.produtos;
        const pedidos = context?.pedidos;
        const clientes = context?.clientes;
        const sistema = context?.sistema;
        try {
            // Evento de estoque baixo
            if ((produtos?.estoqueBaixo ?? 0) > 0) {
                const estoqueBaixo = produtos?.estoqueBaixo ?? 0;
                events.push(this.createEvent({
                    tipo: LeoEventType.PERCEPCAO,
                    titulo: 'Estoque Baixo Detectado',
                    descricao: `${estoqueBaixo} produtos com estoque baixo`,
                    dados: { produtosEstoqueBaixo: estoqueBaixo },
                    prioridade: LeoEventPriority.ALTA,
                    entidade: 'produto',
                    contexto: 'estoque'
                }));
            }
            // Evento de pedidos pendentes
            if ((pedidos?.pendentes ?? 0) > 10) {
                const pendentes = pedidos?.pendentes ?? 0;
                events.push(this.createEvent({
                    tipo: LeoEventType.PERCEPCAO,
                    titulo: 'Muitos Pedidos Pendentes',
                    descricao: `${pendentes} pedidos aguardando processamento`,
                    dados: { pedidosPendentes: pendentes },
                    prioridade: LeoEventPriority.MEDIA,
                    entidade: 'pedido',
                    contexto: 'vendas'
                }));
            }
            // Evento de novos clientes
            if ((clientes?.novos ?? 0) > 0) {
                const novos = clientes?.novos ?? 0;
                events.push(this.createEvent({
                    tipo: LeoEventType.PERCEPCAO,
                    titulo: 'Novos Clientes Registrados',
                    descricao: `${novos} novos clientes no período`,
                    dados: { novosClientes: novos },
                    prioridade: LeoEventPriority.BAIXA,
                    entidade: 'cliente',
                    contexto: 'cadastros'
                }));
            }
            // Evento de sistema
            if ((sistema?.memoriaUso ?? 0) > 80) {
                const memoriaUso = sistema?.memoriaUso ?? 0;
                events.push(this.createEvent({
                    tipo: LeoEventType.ERRO,
                    titulo: 'Alto Uso de Memória',
                    descricao: `Uso de memória em ${memoriaUso}%`,
                    dados: { memoriaUso },
                    prioridade: LeoEventPriority.CRITICA,
                    entidade: 'sistema',
                    contexto: 'performance'
                }));
            }
            return events;
        }
        catch (error) {
            logError('Erro ao gerar eventos do contexto', error);
            return [];
        }
    }
    /**
     * Cria um evento LEO
     */
    createEvent(params) {
        const now = new Date();
        const entityId = this.extractEntityId(params.dados);
        return {
            id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            tipo: params.tipo,
            titulo: params.titulo,
            descricao: params.descricao,
            dados: params.dados,
            contexto: params.contexto,
            entidade: params.entidade,
            entidadeId: entityId,
            prioridade: params.prioridade,
            status: LeoEventStatus.ATIVO,
            dataCriacao: now,
            dataUltimaAtualizacao: now
        };
    }
    extractEntityId(dados) {
        if (!dados || typeof dados !== 'object') {
            return undefined;
        }
        const rawId = dados.id;
        return typeof rawId === 'string' ? rawId : undefined;
    }
    /**
     * Adiciona listener de eventos
     */
    addEventListener(listener) {
        this.eventListeners.push(listener);
    }
    /**
     * Remove listener de eventos
     */
    removeEventListener(listener) {
        const index = this.eventListeners.indexOf(listener);
        if (index > -1) {
            this.eventListeners.splice(index, 1);
        }
    }
    /**
     * Notifica todos os listeners
     */
    notifyListeners(event) {
        this.eventListeners.forEach(listener => {
            try {
                listener(event);
            }
            catch (error) {
                logError('Erro em event listener', error);
            }
        });
    }
    /**
     * Inicia observação periódica
     */
    async startPeriodicObservation(intervalMs = 60000) {
        logInfo('Iniciando observação periódica do ERP', {
            intervalMs
        });
        const observe = async () => {
            try {
                await this.observe();
            }
            catch (error) {
                logError('Erro na observação periódica', error);
            }
        };
        // Executar imediatamente
        await observe();
        // Configurar intervalo
        setInterval(observe, intervalMs);
    }
    /**
     * Para observação periódica
     */
    stopPeriodicObservation() {
        // Em implementação real, limparia o intervalo
        logInfo('Observação periódica do ERP parada');
    }
}
// Exportar instância singleton
export const leoErpObserver = LeoErpObserver.getInstance();
