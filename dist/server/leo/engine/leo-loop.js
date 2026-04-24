/**
 * Loop Cognitivo do LEO - Versão Corrigida
 *
 * Sistema de decisão contínua que opera 24/7
 * Monitora, decide, executa e aprende automaticamente
 */
import { buildLeoContext } from '../utils/leo-context.js';
import { leoMemory } from '../memory/leo-memory.js';
import { leoSystemMonitor } from '../perception/leo-system-monitor.js';
import { leoEvents } from '../memory/leo-events.js';
import { leoErpObserver } from '../perception/leo-erp-observer.js';
import { LeoEventType, LeoEventPriority } from '../../../shared/types/index.js';
/**
 * Classe principal do Loop Cognitivo do Leo
 */
export class LeoLoop {
    static instance;
    isRunning = false;
    interval = null;
    startTime = null;
    lastRun = null;
    runCount = 0;
    errors = 0;
    constructor() { }
    static getInstance() {
        if (!LeoLoop.instance) {
            LeoLoop.instance = new LeoLoop();
        }
        return LeoLoop.instance;
    }
    /**
     * Inicia o loop cognitivo
     */
    async start(intervalMs = 30000) {
        if (this.isRunning) {
            console.log('🔄 Leo Loop já está rodando');
            return;
        }
        // Proteção: máximo 1 execução por segundo
        if (intervalMs < 1000) {
            console.warn('⚠️ Intervalo mínimo de 1s imposto para proteção');
            intervalMs = 1000;
        }
        // Proteção: máximo 5 minutos por execução
        const maxExecutionTime = 5 * 60 * 1000;
        console.log('🚀 Iniciando Loop Cognitivo do Leo...');
        this.isRunning = true;
        this.startTime = new Date();
        // Executa primeira vez imediatamente
        await this.executeLoopWithTimeout(maxExecutionTime);
        // Configura execução periódica com proteção
        this.interval = setInterval(async () => {
            if (this.isRunning) {
                await this.executeLoopWithTimeout(maxExecutionTime);
            }
        }, intervalMs);
        console.log(`✅ Loop iniciado com intervalo de ${intervalMs}ms e timeout de ${maxExecutionTime}ms`);
    }
    /**
     * Para o loop cognitivo
     */
    async stop() {
        if (!this.isRunning) {
            console.log('⏸️ Leo Loop já está parado');
            return;
        }
        console.log('🛑 Parando Loop Cognitivo do Leo...');
        this.isRunning = false;
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        console.log('✅ Loop parado com sucesso');
    }
    /**
     * Executa uma iteração completa do loop com timeout
     */
    async executeLoopWithTimeout(timeoutMs) {
        const startTime = Date.now();
        this.lastRun = new Date();
        this.runCount++;
        // Criar timeout para proteção
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Loop timeout após ${timeoutMs}ms`)), timeoutMs);
        });
        try {
            console.log(`🔄 Executando loop #${this.runCount}...`);
            // Executar com timeout
            await Promise.race([
                this.executeLoopInternal(),
                timeoutPromise
            ]);
            const duration = Date.now() - startTime;
            console.log(`✅ Loop #${this.runCount} concluído em ${duration}ms`);
        }
        catch (error) {
            this.errors++;
            console.error(`❌ Erro no loop #${this.runCount}:`, error);
            // Se for timeout, adicionar pausa
            if (error instanceof Error && error.message.includes('timeout')) {
                console.warn('⏱️ Loop atingiu timeout, adicionando pausa de segurança...');
                await new Promise(resolve => setTimeout(resolve, 5000)); // Pausa de 5s
            }
            // Registrar evento de erro
            try {
                await leoEvents.criarEvento({
                    tipo: LeoEventType.ERRO,
                    descricao: `Erro no loop: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
                    prioridade: LeoEventPriority.ALTA,
                    dados: { error: error instanceof Error ? error.message : error },
                    usuarioCriador: 'leo-loop'
                });
            }
            catch (eventError) {
                console.error('Falha ao registrar evento de erro:', eventError);
            }
        }
    }
    /**
     * Executa lógica interna do loop
     */
    async executeLoopInternal() {
        // 1. Coletar contexto do sistema
        const context = await this.collectLoopContext();
        // 2. Analisar e tomar decisões
        const decisions = await this.analyzeAndDecide(context);
        // 3. Executar ações
        await this.executeActions(decisions, context);
        // 4. Aprender e adaptar
        await this.learnAndAdapt(context, decisions);
    }
    async collectLoopContext() {
        const timestamp = Date.now();
        try {
            // Coletar contexto do sistema
            // TODO: Definir tenantId correto para contexto do loop (exemplo: 1)
            const systemContext = await buildLeoContext('leo', 1);
            // Verificar saúde do sistema
            const systemHealth = await leoSystemMonitor.verificarSistema();
            // Observar ERP
            const erpData = await leoErpObserver.observe();
            // Listar eventos abertos
            const eventsResult = await leoEvents.listarEventos({ status: 'aberto' });
            const eventsList = eventsResult.eventos || [];
            // Obter memória recente
            const recentMemory = await leoMemory.getRecentDecisions(10);
            return {
                timestamp,
                system: systemContext,
                erp: erpData,
                tasks: { pending: 0, total: 0 }, // Simplificado
                events: { open: eventsList.length, total: eventsList.length },
                health: systemHealth,
                memory: recentMemory
            };
        }
        catch (error) {
            console.error('Erro ao coletar contexto:', error);
            // Retornar contexto mínimo
            return {
                timestamp,
                system: { error: (error instanceof Error ? error.message : String(error)) },
                erp: { error: (error instanceof Error ? error.message : String(error)) },
                tasks: { pending: 0, total: 0 },
                events: { open: 0, total: 0 },
                health: { status: 'error' },
                memory: []
            };
        }
    }
    /**
     * Analisa o contexto e toma decisões
     */
    async analyzeAndDecide(context) {
        const decisions = [];
        try {
            // Analisar eventos críticos
            const eventsOpen = context.events.open;
            if (eventsOpen > 0) {
                decisions.push({
                    id: `decision_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    action: 'process_events',
                    description: 'Processar eventos abertos',
                    priority: 'high',
                    context: { eventsCount: eventsOpen }
                });
            }
            // Analisar saúde do sistema
            const healthStatus = context.health.status;
            if (healthStatus !== 'healthy') {
                decisions.push({
                    id: `decision_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    action: 'health_check',
                    description: 'Verificar saúde do sistema',
                    priority: 'critical',
                    context: { healthStatus: context.health.status }
                });
            }
            // Analisar ERP
            const erpData = context.erp;
            if (erpData.alerts && erpData.alerts.length > 0) {
                decisions.push({
                    id: `decision_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    action: 'process_alerts',
                    description: 'Processar alertas do ERP',
                    priority: 'medium',
                    context: { alertsCount: erpData.alerts.length }
                });
            }
            return decisions;
        }
        catch (error) {
            console.error('Erro na análise:', error);
            return [];
        }
    }
    /**
     * Executa as ações decididas
     */
    async executeActions(decisions, context) {
        for (const decision of decisions) {
            try {
                console.log(`🎯 Executando: ${decision.description}`);
                // Executar ação baseada no tipo
                const success = await this.executeDecisionAction(decision, context);
                if (success) {
                    console.log(`✅ Ação executada: ${decision.description}`);
                }
                else {
                    console.log(`❌ Falha na ação: ${decision.description}`);
                }
            }
            catch (error) {
                console.error(`❌ Erro na ação ${decision.description}:`, error);
            }
        }
    }
    /**
     * Executa uma ação específica baseada na decisão
     */
    async executeDecisionAction(decision, context) {
        try {
            switch (decision.action) {
                case 'monitor_system':
                    // Ação de monitoramento já coletada no contexto
                    return true;
                case 'analyze_erp':
                    // Análise ERP já coletada no contexto
                    return true;
                case 'check_events':
                    // Eventos já listados no contexto
                    return true;
                default:
                    console.log(`⚠️ Ação não implementada: ${decision.action}`);
                    return false;
            }
        }
        catch (error) {
            console.error(`Erro ao executar ação ${decision.action}:`, error);
            return false;
        }
    }
    /**
     * Aprende e adapta com base nas execuções
     */
    async learnAndAdapt(context, decisions) {
        try {
            // Salvar decisão na memória
            if (decisions.length > 0) {
                // Implementação simplificada
                console.log(`🧚 Aprendendo com ${decisions.length} decisões`);
            }
        }
        catch (error) {
            console.error('Erro ao aprender e adaptar:', error);
        }
    }
    /**
     * Obtém status do loop
     */
    getLoopStatus() {
        return {
            running: this.isRunning,
            lastRun: this.lastRun || undefined,
            runCount: this.runCount,
            errors: this.errors,
            uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0
        };
    }
    /**
     * Método de compatibilidade: startLeoLoop
     */
    async startLeoLoop(intervalMs = 30000) {
        return this.start(intervalMs);
    }
    /**
     * Método de compatibilidade: stopLeoLoop
     */
    async stopLeoLoop() {
        return this.stop();
    }
}
// Exportar instância singleton
export const leoLoop = LeoLoop.getInstance();
/**
 * Função para iniciar o loop (compatibilidade)
 */
export async function startLeoLoop() {
    await leoLoop.start();
}
