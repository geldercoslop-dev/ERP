/**
 * Loop Cognitivo do LEO - Versão Corrigida
 * 
 * Sistema de decisão contínua que opera 24/7
 * Monitora, decide, executa e aprende automaticamente
 */

import { leoEngine } from './leo-engine.js';
import { buildLeoContext } from '../utils/leo-context.js';
import { leoMemory } from '../memory/leo-memory.js';
import { leoSystemMonitor } from '../perception/leo-system-monitor.js';
import { leoEvents } from '../memory/leo-events.js';
import { leoErpObserver } from '../perception/leo-erp-observer.js';
import { insertLeoActionLog } from '../../services/ai/leo-action-logger.js';
import { LeoEventType, LeoEventPriority } from '../../../shared/types/index.js';

/** Tipo mínimo do contexto do loop para decisões (events/health/erp com estrutura conhecida) */
interface LoopContextShaped {
  timestamp: number;
  system: unknown;
  erp: { alerts?: unknown[]; error?: string };
  tasks: { pending: number; total: number };
  events: { open: number; total: number };
  health: { status?: string };
  memory: unknown;
}
import { eventBus, SystemEvent } from '../../_core/event-bus.js';
import type { Payload } from '../../../shared/types/index.js';

export interface LoopContext {
  timestamp: number;
  system: unknown;
  erp: unknown;
  tasks: unknown;
  events: unknown;
  health: unknown;
  memory: unknown;
}

/**
 * Classe principal do Loop Cognitivo do Leo
 */
export class LeoLoop {
  private static instance: LeoLoop;
  private isRunning: boolean = false;
  private interval: NodeJS.Timeout | null = null;
  private startTime: Date | null = null;
  private lastRun: Date | null = null;
  private runCount: number = 0;
  private errors: number = 0;

  private constructor() {}

  public static getInstance(): LeoLoop {
    if (!LeoLoop.instance) {
      LeoLoop.instance = new LeoLoop();
    }
    return LeoLoop.instance;
  }

  /**
   * Inicia o loop cognitivo
   */
  public async start(intervalMs: number = 30000): Promise<void> {
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
  public async stop(): Promise<void> {
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
  private async executeLoopWithTimeout(timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    this.lastRun = new Date();
    this.runCount++;

    // Criar timeout para proteção
    const timeoutPromise = new Promise<never>((_, reject) => {
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

    } catch (error) {
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
      } catch (eventError) {
        console.error('Falha ao registrar evento de erro:', eventError);
      }
    }
  }

  /**
   * Executa lógica interna do loop
   */
  private async executeLoopInternal(): Promise<void> {
      // 1. Coletar contexto do sistema
      const context = await this.collectLoopContext();

      // 2. Analisar e tomar decisões
      const decisions = await this.analyzeAndDecide(context);

      // 3. Executar ações
      await this.executeActions(decisions, context);

      // 4. Aprender e adaptar
      await this.learnAndAdapt(context, decisions);
  }
  private async collectLoopContext(): Promise<LoopContextShaped> {
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
        health: systemHealth as { status?: string },
        memory: recentMemory
      };

    } catch (error) {
      console.error('Erro ao coletar contexto:', error);
      
      // Retornar contexto mínimo
      return {
        timestamp,
        system: { error: (error instanceof Error ? error.message : String(error)) as string },
        erp: { error: (error instanceof Error ? error.message : String(error)) as string },
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
  private async analyzeAndDecide(context: LoopContext): Promise<{
    id: string;
    action: string;
    description: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    context: unknown;
  }[]> {
    const decisions: {
      id: string;
      action: string;
      description: string;
      priority: 'low' | 'medium' | 'high' | 'critical';
      context: unknown;
    }[] = [];

    try {
      // Analisar eventos críticos
      const eventsOpen = (context.events as { open: number }).open;
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
      const healthStatus = (context.health as { status?: string }).status;
      if (healthStatus !== 'healthy') {
        decisions.push({
          id: `decision_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          action: 'health_check',
          description: 'Verificar saúde do sistema',
          priority: 'critical',
          context: { healthStatus: (context.health as { status?: string }).status }
        });
      }

      // Analisar ERP
      const erpData = context.erp as { alerts?: unknown[] };
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

    } catch (error) {
      console.error('Erro na análise:', error);
      return [];
    }
  }

  /**
   * Executa as ações decididas
   */
  private async executeActions(decisions: {
    id: string;
    action: string;
    description: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    context: unknown;
  }[], context: LoopContext): Promise<void> {
    for (const decision of decisions) {
      try {
        console.log(`🎯 Executando: ${decision.description}`);
        
        // Executar ação baseada no tipo
        const success = await this.executeDecisionAction(decision, context);
        
        if (success) {
          console.log(`✅ Ação executada: ${decision.description}`);
        } else {
          console.log(`❌ Falha na ação: ${decision.description}`);
        }
      } catch (error) {
        console.error(`❌ Erro na ação ${decision.description}:`, error);
      }
    }
  }

  /**
   * Executa uma ação específica baseada na decisão
   */
  private async executeDecisionAction(decision: {
    id: string;
    action: string;
    description: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    context: unknown;
  }, context: LoopContext): Promise<boolean> {
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
    } catch (error) {
      console.error(`Erro ao executar ação ${decision.action}:`, error);
      return false;
    }
  }

  /**
   * Aprende e adapta com base nas execuções
   */
  private async learnAndAdapt(context: LoopContext, decisions: {
    id: string;
    action: string;
    description: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    context: unknown;
  }[]): Promise<void> {
    try {
      // Salvar decisão na memória
      if (decisions.length > 0) {
        // Implementação simplificada
        console.log(`🧚 Aprendendo com ${decisions.length} decisões`);
      }
    } catch (error) {
      console.error('Erro ao aprender e adaptar:', error);
    }
  }

  /**
   * Obtém status do loop
   */
  public getLoopStatus(): {
    running: boolean;
    lastRun?: Date;
    runCount: number;
    errors: number;
    uptime?: number;
  } {
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
  public async startLeoLoop(intervalMs: number = 30000): Promise<void> {
    return this.start(intervalMs);
  }

  /**
   * Método de compatibilidade: stopLeoLoop
   */
  public async stopLeoLoop(): Promise<void> {
    return this.stop();
  }
}

// Exportar instância singleton
export const leoLoop = LeoLoop.getInstance();

/**
 * Função para iniciar o loop (compatibilidade)
 */
export async function startLeoLoop(): Promise<void> {
  await leoLoop.start();
}
