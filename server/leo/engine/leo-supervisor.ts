/**
 * Supervisor de Segurança do LEO
 * 
 * Responsável por controlar limites do agente e garantir operação segura
 * Monitora recursos, execuções e impede sobrecarga do sistema
 */

import { insertLeoActionLog } from '../../services/ai/leo-action-logger.js';
import { leoEvents } from '../memory/leo-events.js';

export interface SupervisorLimits {
  maxActionsPerMinute: number;
  maxRetries: number;
  maxCpuUsage: number; // percentual (0-100)
  maxMemoryUsage: number; // percentual (0-100)
  maxConcurrentTasks: number;
  maxExecutionTime: number; // milissegundos
}

export interface SupervisorStatus {
  isPaused: boolean;
  currentActionsPerMinute: number;
  currentCpuUsage: number;
  currentMemoryUsage: number;
  currentConcurrentTasks: number;
  blockedUntil?: Date;
  lastViolation?: {
    type: string;
    timestamp: Date;
    value: number;
    limit: number;
  };
  violations: Array<{
    type: string;
    timestamp: Date;
    value: number;
    limit: number;
  }>;
}

export interface SupervisorMetrics {
  actionsCount: number;
  actionsLastMinute: number;
  startTime: number;
  averageExecutionTime: number;
  totalViolations: number;
  uptime: number;
}

/**
 * Supervisor de segurança do Leo
 */
class LeoSupervisor {
  private static instance: LeoSupervisor;
  
  private limits: SupervisorLimits = {
    maxActionsPerMinute: 30,
    maxRetries: 3,
    maxCpuUsage: 80,
    maxMemoryUsage: 85,
    maxConcurrentTasks: 5,
    maxExecutionTime: 30000, // 30 segundos
  };

  private status: SupervisorStatus = {
    isPaused: false,
    currentActionsPerMinute: 0,
    currentCpuUsage: 0,
    currentMemoryUsage: 0,
    currentConcurrentTasks: 0,
    violations: [],
  };

  private metrics: SupervisorMetrics = {
    actionsCount: 0,
    actionsLastMinute: 0,
    startTime: Date.now(),
    averageExecutionTime: 0,
    totalViolations: 0,
    uptime: 0,
  };

  private actionTimestamps: number[] = [];
  private currentTasks = new Set<string>();
  private executionTimes: number[] = [];
  private isPausedUntil?: number; // Novo: timestamp de fim da pausa
  private pauseCount = 0; // Contador de pausas

  private constructor() {
    // Iniciar monitoramento contínuo
    this.startMonitoring();
  }

  public static getInstance(): LeoSupervisor {
    if (!LeoSupervisor.instance) {
      LeoSupervisor.instance = new LeoSupervisor();
    }
    return LeoSupervisor.instance;
  }

  /**
   * Verifica se uma ação pode ser executada
   */
  async canExecuteAction(taskId?: string): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const now = Date.now();
      
      // Verificar se está em pausa automática (NOVO)
      if (this.isPausedUntil && now < this.isPausedUntil) {
        const remainingTime = Math.ceil((this.isPausedUntil - now) / 1000);
        return { 
          allowed: false, 
          reason: `Agente pausado automaticamente - aguarde ${remainingTime} segundos` 
        };
      }
      
      // Limpar pausa automática se expirou
      if (this.isPausedUntil && now >= this.isPausedUntil) {
        this.isPausedUntil = undefined;
        this.status.isPaused = false;
        console.log('[LeoSupervisor] Pausa automática finalizada - agente liberado');
      }

      // Verificar se está pausado manualmente
      if (this.status.isPaused && !this.isPausedUntil) {
        const reason = this.status.blockedUntil 
          ? `Agente pausado até ${this.status.blockedUntil.toLocaleString()}`
          : 'Agente pausado pelo supervisor';
        return { allowed: false, reason };
      }

      // Verificar limite de ações por minuto e acionar pausa automática se excedido
      if (this.status.currentActionsPerMinute >= this.limits.maxActionsPerMinute) {
        // Se excedeu o limite, pausar automaticamente por 60 segundos (NOVO)
        this.isPausedUntil = now + (60 * 1000);
        this.pauseCount++;
        
        console.warn(`[LeoSupervisor] Limite de ações excedido - pausando por 60s (${this.status.currentActionsPerMinute}/${this.limits.maxActionsPerMinute})`);
        
        // Registrar violação e pausa
        await this.handleViolation('actions_per_minute', this.status.currentActionsPerMinute, this.limits.maxActionsPerMinute);
        
        return { 
          allowed: false, 
          reason: `Limite de ações por minuto excedido - agente pausado por 60 segundos (${this.status.currentActionsPerMinute}/${this.limits.maxActionsPerMinute})` 
        };
      }

      // Verificar uso de CPU
      if (this.status.currentCpuUsage >= this.limits.maxCpuUsage) {
        return { 
          allowed: false, 
          reason: `Uso de CPU acima do limite (${this.status.currentCpuUsage}%/${this.limits.maxCpuUsage}%)` 
        };
      }

      // Verificar uso de memória
      if (this.status.currentMemoryUsage >= this.limits.maxMemoryUsage) {
        return { 
          allowed: false, 
          reason: `Uso de memória acima do limite (${this.status.currentMemoryUsage}%/${this.limits.maxMemoryUsage}%)` 
        };
      }

      // Verificar tarefas concorrentes
      if (this.status.currentConcurrentTasks >= this.limits.maxConcurrentTasks) {
        return { 
          allowed: false, 
          reason: `Limite de tarefas concorrentes excedido (${this.status.currentConcurrentTasks}/${this.limits.maxConcurrentTasks})` 
        };
      }

      // Se passou todas as verificações, registrar início da ação
      if (taskId) {
        this.currentTasks.add(taskId);
        this.status.currentConcurrentTasks = this.currentTasks.size;
      }

      this.recordAction();
      return { allowed: true };

    } catch (error) {
      console.error('[LeoSupervisor] Erro ao verificar permissão:', error);
      return { allowed: false, reason: 'Erro no supervisor de segurança' };
    }
  }

  /**
   * Registra conclusão de uma ação
   */
  async completeAction(taskId: string, executionTime: number, success: boolean): Promise<void> {
    try {
      // Remover tarefa concorrente
      this.currentTasks.delete(taskId);
      this.status.currentConcurrentTasks = this.currentTasks.size;

      // Registrar tempo de execução
      this.executionTimes.push(executionTime);
      if (this.executionTimes.length > 100) {
        this.executionTimes = this.executionTimes.slice(-100);
      }

      // Calcular tempo médio de execução
      this.metrics.averageExecutionTime = this.executionTimes.reduce((a: any, b: any) => a + b, 0) / this.executionTimes.length;

      // Verificar se excedeu tempo máximo de execução
      if (executionTime > this.limits.maxExecutionTime) {
        await this.handleViolation('execution_time', executionTime, this.limits.maxExecutionTime);
      }

      // Se falhou, verificar retry
      if (!success) {
        await this.handleFailure(taskId, executionTime);
      }

    } catch (error) {
      console.error('[LeoSupervisor] Erro ao completar ação:', error);
    }
  }

  /**
   * Atualiza limites do supervisor
   */
  updateLimits(newLimits: Partial<SupervisorLimits>): void {
    this.limits = { ...this.limits, ...newLimits };
    console.log('[LeoSupervisor] Limites atualizados:', this.limits);
  }

  /**
   * Pausa execução do agente
   */
  async pauseExecution(reason: string, durationMinutes?: number): Promise<void> {
    try {
      this.status.isPaused = true;
      
      if (durationMinutes) {
        this.status.blockedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
        
        // Auto-resume após o tempo
        setTimeout(() => {
          this.resumeExecution();
        }, durationMinutes * 60 * 1000);
      }

      // Registrar evento
      await leoEvents.registerEvent({
        tipo: 'supervisor_pausa',
        descricao: `Execução pausada pelo supervisor: ${reason}`,
        prioridade: 'alta',
        dados: {
          reason,
          durationMinutes,
          blockedUntil: this.status.blockedUntil,
        },
        usuarioCriador: 'leo-supervisor',
      });

      await insertLeoActionLog({
        usuario: 'leo-supervisor',
        acao: 'pausar_execucao',
        entidade: 'leo_supervisor',
        dados: JSON.stringify({
          reason,
          durationMinutes,
          status: this.status,
        }),
        resultado: 'SUCESSO',
      });

      console.log(`🛑 [LeoSupervisor] Execução pausada: ${reason}`);

    } catch (error) {
      console.error('[LeoSupervisor] Erro ao pausar execução:', error);
    }
  }

  /**
   * Retoma execução do agente
   */
  async resumeExecution(): Promise<void> {
    try {
      this.status.isPaused = false;
      this.status.blockedUntil = undefined;

      await insertLeoActionLog({
        usuario: 'leo-supervisor',
        acao: 'retomar_execucao',
        entidade: 'leo_supervisor',
        dados: JSON.stringify({
          timestamp: new Date(),
        }),
        resultado: 'SUCESSO',
      });

      console.log('▶️ [LeoSupervisor] Execução retomada');

    } catch (error) {
      console.error('[LeoSupervisor] Erro ao retomar execução:', error);
    }
  }

  /**
   * Obtém status atual do supervisor
   */
  getStatus(): SupervisorStatus & { limits: SupervisorLimits; metrics: SupervisorMetrics } {
    return {
      ...this.status,
      limits: this.limits,
      metrics: {
        ...this.metrics,
        uptime: Date.now() - this.metrics.startTime,
      },
    };
  }

  /**
   * Registra uma violação de limites
   */
  private async handleViolation(type: string, value: number, limit: number): Promise<void> {
    try {
      const violation = {
        type,
        timestamp: new Date(),
        value,
        limit,
      };

      this.status.lastViolation = violation;
      this.status.violations.push(violation);
      
      // Manter apenas últimas 50 violações
      if (this.status.violations.length > 50) {
        this.status.violations = this.status.violations.slice(-50);
      }

      this.metrics.totalViolations++;

      // Pausar execução se violação for crítica
      const criticalViolations = ['cpu_usage', 'memory_usage', 'actions_per_minute'];
      if (criticalViolations.includes(type)) {
        await this.pauseExecution(`Violação crítica: ${type} (${value}/${limit})`, 5); // 5 minutos
      }

      // Registrar evento
      await leoEvents.registerEvent({
        tipo: 'supervisor_violacao',
        descricao: `Violação de limite: ${type} (${value} > ${limit})`,
        prioridade: 'alta',
        dados: violation,
        usuarioCriador: 'leo-supervisor',
      });

      console.warn(`⚠️ [LeoSupervisor] Violação detectada: ${type} = ${value} (limite: ${limit})`);

    } catch (error) {
      console.error('[LeoSupervisor] Erro ao registrar violação:', error);
    }
  }

  /**
   * Lida com falhas de execução
   */
  private async handleFailure(taskId: string, executionTime: number): Promise<void> {
    try {
      // Contar falhas para esta tarefa
      // Implementar lógica de retry baseada no taskId
      
      console.warn(`❌ [LeoSupervisor] Falha na tarefa ${taskId} após ${executionTime}ms`);

    } catch (error) {
      console.error('[LeoSupervisor] Erro ao lidar com falha:', error);
    }
  }

  /**
   * Registra uma ação executada
   */
  private recordAction(): void {
    const now = Date.now();
    this.actionTimestamps.push(now);
    this.metrics.actionsCount++;

    // Limpar timestamps antigos (manter apenas último minuto)
    const oneMinuteAgo = now - 60000;
    this.actionTimestamps = this.actionTimestamps.filter((timestamp: any) => timestamp > oneMinuteAgo);
    
    this.status.currentActionsPerMinute = this.actionTimestamps.length;
    this.metrics.actionsLastMinute = this.status.currentActionsPerMinute;
  }

  /**
   * Inicia monitoramento contínuo de recursos
   */
  private startMonitoring(): void {
    setInterval(async () => {
      try {
        // Atualizar métricas de sistema
        const memUsage = process.memoryUsage();
        const memPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
        
        this.status.currentMemoryUsage = Math.round(memPercent);

        // Verificar violações de recursos
        if (this.status.currentMemoryUsage > this.limits.maxMemoryUsage) {
          await this.handleViolation('memory_usage', this.status.currentMemoryUsage, this.limits.maxMemoryUsage);
        }

        // CPU usage (simulado - implementação real dependeria de biblioteca específica)
        this.status.currentCpuUsage = Math.random() * 20 + 10; // Simulação 10-30%
        
        if (this.status.currentCpuUsage > this.limits.maxCpuUsage) {
          await this.handleViolation('cpu_usage', this.status.currentCpuUsage, this.limits.maxCpuUsage);
        }

      } catch (error) {
        console.error('[LeoSupervisor] Erro no monitoramento:', error);
      }
    }, 5000); // Verificar a cada 5 segundos
  }

  /**
   * Reseta estatísticas do supervisor
   */
  reset(): void {
    this.status.violations = [];
    this.status.lastViolation = undefined;
    this.metrics.totalViolations = 0;
    this.metrics.actionsCount = 0;
    this.metrics.startTime = Date.now();
    this.executionTimes = [];
    this.actionTimestamps = [];
    
    console.log('🔄 [LeoSupervisor] Estatísticas resetadas');
  }

  /**
   * Gera relatório de segurança
   */
  generateReport(): {
    summary: string;
    status: SupervisorStatus;
    metrics: SupervisorMetrics;
    limits: SupervisorLimits;
    recommendations: string[];
  } {
    const recommendations: string[] = [];

    if (this.metrics.totalViolations > 10) {
      recommendations.push('Considere ajustar limites para evitar violações frequentes');
    }

    if (this.status.currentMemoryUsage > 70) {
      recommendations.push('Uso de memória elevado - considere otimizar processos');
    }

    if (this.metrics.averageExecutionTime > this.limits.maxExecutionTime * 0.8) {
      recommendations.push('Tempo médio de execução próximo do limite - otimize ações');
    }

    const summary = `Agente operando por ${Math.round((Date.now() - this.metrics.startTime) / 60000)} minutos. ` +
                   `${this.metrics.actionsCount} ações executadas, ${this.metrics.totalViolations} violações detectadas.`;

    return {
      summary,
      status: this.status,
      metrics: this.metrics,
      limits: this.limits,
      recommendations,
    };
  }
}

// Exportar instância singleton
export const leoSupervisor = LeoSupervisor.getInstance();
