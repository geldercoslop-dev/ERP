/**
 * Sistema de Proteção Contra Loop Infinito do LEO
 * 
 * Detecta e previne loops infinitos em tarefas e processos
 * Monitora padrões de execução e bloqueia comportamentos anômalos
 */

import { insertLeoActionLog } from '../../services/ai/leo-action-logger.js';
import { leoEvents } from '../memory/leo-events.js';
import { leoTaskQueue } from '../tasks/leo-task-queue.js';

export interface LoopDetectionConfig {
  maxFailuresPerTask: number;
  maxExecutionTime: number; // milissegundos
  maxSimilarActionsPerMinute: number;
  cooldownPeriod: number; // milissegundos
  suspiciousPatterns: Array<{
    pattern: string;
    threshold: number;
    timeWindow: number; // milissegundos
  }>;
}

export interface TaskExecutionHistory {
  taskId: string;
  taskType: string;
  executions: Array<{
    timestamp: number;
    duration: number;
    success: boolean;
    error?: string;
  }>;
  isBlocked: boolean;
  blockedUntil?: number;
  blockReason?: string;
}

export interface LoopAlert {
  id: string;
  type: 'task_loop' | 'action_loop' | 'execution_loop' | 'pattern_loop';
  severity: 'low' | 'medium' | 'high' | 'critical';
  taskId?: string;
  taskType?: string;
  description: string;
  timestamp: number;
  action: 'blocked' | 'warning' | 'monitored';
  details: unknown;
}

interface SuspiciousPatternMatch {
  pattern: string;
  threshold: number;
  timeWindow: number;
  executions: number;
}

/**
 * Sistema de proteção contra loops infinitos
 */
class LeoLoopProtection {
  private static instance: LeoLoopProtection;
  
  private config: LoopDetectionConfig = {
    maxFailuresPerTask: 5,
    maxExecutionTime: 300000, // 5 minutos
    maxSimilarActionsPerMinute: 10,
    cooldownPeriod: 300000, // 5 minutos
    suspiciousPatterns: [
      { pattern: 'retry_same_task', threshold: 3, timeWindow: 60000 },
      { pattern: 'rapid_failures', threshold: 5, timeWindow: 300000 },
      { pattern: 'endless_processing', threshold: 10, timeWindow: 600000 },
    ],
  };

  private taskHistory = new Map<string, TaskExecutionHistory>();
  private actionHistory = new Map<string, number[]>();
  private consecutiveActions = new Map<string, number>(); // Novo: contador de ações consecutivas
  private alerts: LoopAlert[] = [];
  private monitoringInterval?: NodeJS.Timeout;

  private constructor() {
    this.startMonitoring();
  }

  public static getInstance(): LeoLoopProtection {
    if (!LeoLoopProtection.instance) {
      LeoLoopProtection.instance = new LeoLoopProtection();
    }
    return LeoLoopProtection.instance;
  }

  /**
   * Registra início de execução de tarefa
   */
  async registerTaskStart(taskId: string, taskType: string): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const history = this.getOrCreateHistory(taskId, taskType);
      
      // Verificar se tarefa está bloqueada
      if (history.isBlocked && history.blockedUntil && history.blockedUntil > Date.now()) {
        return {
          allowed: false,
          reason: `Tarefa bloqueada até ${new Date(history.blockedUntil).toLocaleString()}: ${history.blockReason}`,
        };
      }

      // Limpar bloqueio expirado
      if (history.isBlocked && history.blockedUntil && history.blockedUntil <= Date.now()) {
        history.isBlocked = false;
        history.blockedUntil = undefined;
        history.blockReason = undefined;
      }

      // Verificar padrões suspeitos
      const suspiciousPattern = this.detectSuspiciousPattern(history);
      if (suspiciousPattern) {
        await this.handleSuspiciousPattern(taskId, taskType, suspiciousPattern);
        return {
          allowed: false,
          reason: `Padrão suspeito detectado: ${suspiciousPattern.pattern}`,
        };
      }

      // Registrar início da execução
      history.executions.push({
        timestamp: Date.now(),
        duration: 0,
        success: false, // Será atualizado ao final
      });

      // Manter apenas últimas 50 execuções
      if (history.executions.length > 50) {
        history.executions = history.executions.slice(-50);
      }

      return { allowed: true };

    } catch (error) {
      console.error('[LeoLoopProtection] Erro ao registrar início da tarefa:', error);
      return { allowed: false, reason: 'Erro no sistema de proteção' };
    }
  }

  /**
   * Registra conclusão de execução de tarefa
   */
  async registerTaskEnd(taskId: string, success: boolean, duration: number, error?: string): Promise<void> {
    try {
      const history = this.taskHistory.get(taskId);
      if (!history) return;

      // Atualizar última execução
      const lastExecution = history.executions[history.executions.length - 1];
      if (lastExecution) {
        lastExecution.success = success;
        lastExecution.duration = duration;
        lastExecution.error = error;
      }

      // Verificar se precisa bloquear tarefa
      if (!success) {
        await this.handleTaskFailure(taskId, history, error);
      }

      // Verificar tempo de execução excessivo
      if (duration > this.config.maxExecutionTime) {
        await this.handleLongExecution(taskId, history, duration);
      }

    } catch (error) {
      console.error('[LeoLoopProtection] Erro ao registrar fim da tarefa:', error);
    }
  }

  /**
   * Registra ação executada para detectar repetições
   */
  async registerAction(action: string): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const now = Date.now();
      const timestamps = this.actionHistory.get(action) || [];
      
      // Verificar execuções consecutivas (NOVO)
      const consecutiveCount = this.consecutiveActions.get(action) || 0;
      const lastActionTime = this.getLastActionTime(action);
      
      // Se última ação foi há menos de 1 minuto, incrementar contador
      if (lastActionTime && (now - lastActionTime) < 60000) {
        this.consecutiveActions.set(action, consecutiveCount + 1);
        
        // Se atingiu 5 execuções consecutivas, bloquear
        if (consecutiveCount + 1 >= 5) {
          await this.handleConsecutiveActionLoop(action, consecutiveCount + 1);
          
          // Resetar contador após bloqueio
          this.consecutiveActions.set(action, 0);
          
          return {
            allowed: false,
            reason: `Ação "${action}" executada 5 vezes consecutivas - loop detectado`,
          };
        }
      } else {
        // Resetar contador se passou mais de 1 minuto
        this.consecutiveActions.set(action, 1);
      }
      
      // Adicionar timestamp atual
      timestamps.push(now);
      
      // Manter apenas últimos 5 minutos
      const fiveMinutesAgo = now - 300000;
      const recentTimestamps = timestamps.filter((t: number) => t > fiveMinutesAgo);
      
      // Verificar se excedeu limite por minuto
      if (recentTimestamps.length > this.config.maxSimilarActionsPerMinute) {
        await this.handleActionLoop(action, recentTimestamps.length);
        
        return {
          allowed: false,
          reason: `Ação "${action}" executada ${recentTimestamps.length} vezes nos últimos 5 minutos`,
        };
      }
      
      this.actionHistory.set(action, recentTimestamps);
      return { allowed: true };

    } catch (error) {
      console.error('[LeoLoopProtection] Erro ao registrar ação:', error);
      return { allowed: false, reason: 'Erro no sistema de proteção' };
    }
  }

  /**
   * Obtém histórico de uma tarefa
   */
  getTaskHistory(taskId: string): TaskExecutionHistory | undefined {
    return this.taskHistory.get(taskId);
  }

  /**
   * Lista todos os alertas de loop
   */
  getAlerts(): LoopAlert[] {
    return this.alerts.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Remove alertas antigos
   */
  cleanOldAlerts(maxAge: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAge;
    const initialCount = this.alerts.length;
    
    this.alerts = this.alerts.filter((alert) => alert.timestamp > cutoff);
    
    return initialCount - this.alerts.length;
  }

  /**
   * Bloqueia tarefa manualmente
   */
  async blockTask(taskId: string, reason: string, durationMinutes: number = 30): Promise<void> {
    const history = this.taskHistory.get(taskId);
    if (!history) return;

    history.isBlocked = true;
    history.blockedUntil = Date.now() + (durationMinutes * 60 * 1000);
    history.blockReason = reason;

    // Cancelar tarefa na fila se estiver pendente
    const cancelled = leoTaskQueue.cancelTask(taskId);
    if (cancelled) {
      console.log(`[Loop Protection] Tarefa ${taskId} cancelada com sucesso`);
    }

    await insertLeoActionLog({
      usuario: 'leo-loop-protection',
      acao: 'bloquear_tarefa',
      entidade: 'leo_loop_protection',
      dados: JSON.stringify({
        taskId,
        reason,
        durationMinutes,
        blockedUntil: history.blockedUntil,
      }),
      resultado: 'SUCESSO',
    });

    console.log(`🚫 Tarefa ${taskId} bloqueada: ${reason}`);
  }

  /**
   * Desbloqueia tarefa manualmente
   */
  async unblockTask(taskId: string): Promise<void> {
    const history = this.taskHistory.get(taskId);
    if (!history) return;

    history.isBlocked = false;
    history.blockedUntil = undefined;
    history.blockReason = undefined;

    await insertLeoActionLog({
      usuario: 'leo-loop-protection',
      acao: 'desbloquear_tarefa',
      entidade: 'leo_loop_protection',
      dados: JSON.stringify({
        taskId,
      }),
      resultado: 'SUCESSO',
    });

    console.log(`✅ Tarefa ${taskId} desbloqueada`);
  }

  /**
   * Obtém ou cria histórico de tarefa
   */
  private getOrCreateHistory(taskId: string, taskType: string): TaskExecutionHistory {
    let history = this.taskHistory.get(taskId);
    
    if (!history) {
      history = {
        taskId,
        taskType,
        executions: [],
        isBlocked: false,
      };
      this.taskHistory.set(taskId, history);
    }
    
    return history;
  }

  /**
   * Detecta padrões suspeitos de execução
   */
  private detectSuspiciousPattern(history: TaskExecutionHistory): SuspiciousPatternMatch | null {
    const now = Date.now();
    const recentExecutions = history.executions.filter((e) => now - e.timestamp < 600000); // Últimos 10 minutos

    for (const pattern of this.config.suspiciousPatterns) {
      const patternExecutions = recentExecutions.filter((e) => now - e.timestamp < pattern.timeWindow);
      
      if (patternExecutions.length >= pattern.threshold) {
        return {
          ...pattern,
          executions: patternExecutions.length,
        };
      }
    }

    return null;
  }

  /**
   * Lida com padrão suspeito detectado
   */
  private async handleSuspiciousPattern(taskId: string, taskType: string, pattern: SuspiciousPatternMatch): Promise<void> {
    const alert: LoopAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'pattern_loop',
      severity: 'high',
      taskId,
      taskType,
      description: `Padrão suspeito detectado: ${pattern.pattern} (${pattern.executions}/${pattern.threshold} execuções)`,
      timestamp: Date.now(),
      action: 'blocked',
      details: pattern,
    };

    this.alerts.push(alert);

    // Bloquear tarefa temporariamente
    await this.blockTask(taskId, `Padrão suspeito: ${pattern.pattern}`, 15);

    // Registrar evento
    await leoEvents.registerEvent({
      tipo: 'erro_sistema',
      descricao: `Loop protection: Padrão suspeito detectado na tarefa ${taskType}`,
      prioridade: 'alta',
      dados: {
        taskId,
        taskType,
        pattern,
        alert,
      },
      usuarioCriador: 'leo-loop-protection',
    });

    console.warn(`⚠️ [LeoLoopProtection] Padrão suspeito detectado: ${pattern.pattern} na tarefa ${taskId}`);
  }

  /**
   * Lida com falha de tarefa
   */
  private async handleTaskFailure(taskId: string, history: TaskExecutionHistory, error?: string): Promise<void> {
    const recentFailures = history.executions
      .filter((e) => !e.success && Date.now() - e.timestamp < 300000) // Últimos 5 minutos
      .length;

    if (recentFailures >= this.config.maxFailuresPerTask) {
      const alert: LoopAlert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'task_loop',
        severity: 'critical',
        taskId,
        taskType: history.taskType,
        description: `Múltiplas falhas detectadas: ${recentFailures} falhas em 5 minutos`,
        timestamp: Date.now(),
        action: 'blocked',
        details: { recentFailures, error },
      };

      this.alerts.push(alert);

      // Bloquear tarefa por tempo maior
      await this.blockTask(taskId, `Múltiplas falhas: ${recentFailures} em 5 minutos`, 60);

      // Registrar evento crítico
      await leoEvents.registerEvent({
        tipo: 'erro_sistema',
        descricao: `Loop protection: Múltiplas falhas na tarefa ${history.taskType}`,
        prioridade: 'critica',
        dados: {
          taskId,
          taskType: history.taskType,
          recentFailures,
          error,
          alert,
        },
        usuarioCriador: 'leo-loop-protection',
      });

      console.error(`🚨 [LeoLoopProtection] Múltiplas falhas detectadas na tarefa ${taskId}: ${recentFailures} falhas`);
    }
  }

  /**
   * Lida com execução muito longa
   */
  private async handleLongExecution(taskId: string, history: TaskExecutionHistory, duration: number): Promise<void> {
    const alert: LoopAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'execution_loop',
      severity: 'medium',
      taskId,
      taskType: history.taskType,
      description: `Tempo de execução excessivo: ${Math.round(duration / 1000)}s`,
      timestamp: Date.now(),
      action: 'monitored',
      details: { duration },
    };

    this.alerts.push(alert);

    await insertLeoActionLog({
      usuario: 'leo-loop-protection',
      acao: 'tempo_execucao_excessivo',
      entidade: 'leo_loop_protection',
      dados: JSON.stringify({
        taskId,
        taskType: history.taskType,
        duration,
      }),
      resultado: 'ALERTA',
    });

    console.warn(`⏱️ [LeoLoopProtection] Tempo de execução excessivo na tarefa ${taskId}: ${Math.round(duration / 1000)}s`);
  }

  /**
   * Lida com loop de ações
   */
  private async handleActionLoop(action: string, count: number): Promise<void> {
    const alert: LoopAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'action_loop',
      severity: 'high',
      description: `Loop de ações detectado: "${action}" executada ${count} vezes`,
      timestamp: Date.now(),
      action: 'blocked',
      details: { action, count },
    };

    this.alerts.push(alert);

    await leoEvents.registerEvent({
      tipo: 'erro_sistema',
      descricao: `Loop protection: Loop de ações detectado para "${action}"`,
      prioridade: 'alta',
      dados: {
        action,
        count,
        alert,
      },
      usuarioCriador: 'leo-loop-protection',
    });

    console.error(`🔄 [LeoLoopProtection] Loop de ações detectado: "${action}" (${count} vezes)`);
  }

  /**
   * Inicia monitoramento contínuo
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      try {
        // Limpar alertas antigos
        this.cleanOldAlerts();

        // Limpar históricos antigos
        this.cleanupOldHistories();

      } catch (error) {
        console.error('[LeoLoopProtection] Erro no monitoramento:', error);
      }
    }, 60000); // Verificar a cada minuto
  }

  /**
   * Limpa históricos antigos
   */
  private cleanupOldHistories(): void {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 horas
    
    for (const [taskId, history] of Array.from(this.taskHistory.entries())) {
      history.executions = history.executions.filter((e) => e.timestamp > cutoff);
      
      // Remover histórico se não tiver execuções recentes
      if (history.executions.length === 0 && !history.isBlocked) {
        this.taskHistory.delete(taskId);
      }
    }

    // Limpar histórico de ações
    for (const [action, timestamps] of Array.from(this.actionHistory.entries())) {
      const recentTimestamps = timestamps.filter((t) => t > cutoff);
      if (recentTimestamps.length === 0) {
        this.actionHistory.delete(action);
      } else {
        this.actionHistory.set(action, recentTimestamps);
      }
    }
  }

  /**
   * Para monitoramento
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }

  /**
   * Obtém timestamp da última ação
   */
  private getLastActionTime(action: string): number | null {
    const timestamps = this.actionHistory.get(action);
    if (!timestamps || timestamps.length === 0) return null;
    return Math.max(...timestamps);
  }

  /**
   * Trata loop de ações consecutivas
   */
  private async handleConsecutiveActionLoop(action: string, count: number): Promise<void> {
    console.warn(`[LeoLoopProtection] Loop detectado: ${action} executada ${count} vezes consecutivas`);
    
    // Criar alerta crítico
    const alert: LoopAlert = {
      id: this.generateAlertId(),
      type: 'action_loop',
      severity: 'critical',
      description: `Loop de ações consecutivas detectado: ${action}`,
      timestamp: Date.now(),
      action: 'blocked',
      details: {
        action,
        consecutiveCount: count,
        threshold: 5
      }
    };
    
    this.alerts.push(alert);
    
    // Registrar no log
    await insertLeoActionLog({
      usuario: 'leo-system',
      acao: 'consecutive_action_loop_detected',
      entidade: 'leo_loop_protection',
      dados: JSON.stringify(alert.details),
      resultado: 'ALERTA',
    });

    // TODO: Implementar notificação de eventos quando o sistema estiver disponível
    console.log(`[LeoLoopProtection] Evento de loop criado: ${alert.description}`);
  }

  /**
   * Gera ID único para alerta
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Obtém estatísticas do sistema de proteção
   */
  getStatistics(): {
    totalTasks: number;
    blockedTasks: number;
    totalAlerts: number;
    criticalAlerts: number;
    averageExecutionsPerTask: number;
  } {
    const tasks = Array.from(this.taskHistory.values());
    const blockedTasks = tasks.filter((t) => t.isBlocked).length;
    const criticalAlerts = this.alerts.filter((a) => a.severity === 'critical').length;
    const averageExecutions = tasks.length > 0 
      ? tasks.reduce((sum: number, t) => sum + t.executions.length, 0) / tasks.length 
      : 0;

    return {
      totalTasks: tasks.length,
      blockedTasks,
      totalAlerts: this.alerts.length,
      criticalAlerts,
      averageExecutionsPerTask: Math.round(averageExecutions * 100) / 100,
    };
  }
}

// Exportar instância singleton
export const leoLoopProtection = LeoLoopProtection.getInstance();
