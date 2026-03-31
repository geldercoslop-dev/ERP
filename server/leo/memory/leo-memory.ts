/**
 * Memória do Agente LEO
 * 
 * Sistema de memória persistente para aprendizado e contexto
 * Armazena histórico de ações, decisões, erros e padrões
 */

import { LeoMemoryType, LeoEventStatus, LeoEventPriority } from '../../../shared/types/index.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { insertLeoActionLog } from '../../services/ai/leo-action-logger.js';
import { leoMemoryPersistence } from './leo-memory-persistence.js';

export interface MemoryDecision {
  timestamp: Date;
  action: string;
  success: boolean;
  reasoning: string;
  executionTime: number;
  context: {
    tasksCount: number;
    eventsCount: number;
    healthStatus: string;
  };
  result?: Record<string, unknown>;
  error?: string;
}

export interface MemoryTask {
  timestamp: Date;
  taskId: string;
  type: string;
  status: string;
  executionTime?: number;
  result?: Record<string, unknown>;
  error?: string;
}

export interface MemoryError {
  timestamp: Date;
  type: string;
  action?: string;
  error: string;
  context?: Record<string, unknown>;
  resolved: boolean;
  resolutionTime?: number;
}

export interface MemoryPattern {
  type: string;
  frequency: number;
  lastOccurrence: Date;
  avgExecutionTime: number;
  successRate: number;
  context: Record<string, unknown>;
}

export interface LearningExperience {
  taskType: string;
  complexity: number;
  subTasksGenerated: number;
  timestamp: Date;
  success: boolean;
  executionTime: number;
  outcome: 'success' | 'failure' | 'partial';
  lessons: string[];
}

export interface ActionPerformance {
  actionType: string;
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  avgExecutionTime: number;
  successRate: number;
  lastExecution: Date;
  optimalConditions: {
    timeOfDay: string;
    dayOfWeek: string;
    systemLoad: string;
  };
  recommendations: string[];
}

export interface MemoryStats {
  totalDecisions: number;
  totalTasks: number;
  totalErrors: number;
  successRate: number;
  avgExecutionTime: number;
  mostCommonActions: Array<{ action: string; count: number }>;
  errorPatterns: Array<{ type: string; count: number }>;
  recentActivity: {
    lastHour: number;
    lastDay: number;
    lastWeek: number;
  };
}

/**
 * Sistema de memória do Leo
 */
class LeoMemory {
  private static instance: LeoMemory;
  private filePath: string;
  private maxMemorySize: number = 1000; // Limite de histórico conforme solicitado
  private isDirty: boolean = false;
  private saveInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;

  // Memória principal
  private history: MemoryDecision[] = [];
  private tasks: MemoryTask[] = [];
  private errors: MemoryError[] = [];
  private patterns: Map<string, MemoryPattern> = new Map();
  private learningExperiences: LearningExperience[] = [];
  private actionPerformance: Map<string, ActionPerformance> = new Map();

  private constructor() {
    this.filePath = join(process.cwd(), 'data', 'leo-memory.json');
    this.loadMemory();
    this.startAutoSave();
    this.startMemoryCleanup(); // Iniciar limpeza automática
  }

  public static getInstance(): LeoMemory {
    if (!LeoMemory.instance) {
      LeoMemory.instance = new LeoMemory();
    }
    return LeoMemory.instance;
  }

  /**
   * Adiciona uma decisão à memória (com persistência no banco)
   */
  async addDecision(decision: Omit<MemoryDecision, 'timestamp'>): Promise<void> {
    const now = new Date();
    const memoryDecision: MemoryDecision = {
      ...decision,
      timestamp: now,
    };

    // Salvar no banco de dados
    try {
      const ctx = decision.context as { tasksCount?: number; eventsCount?: number; healthStatus?: string };
      await leoMemoryPersistence.saveMemory({
        id: `decision_${String((decision as MemoryDecision & { id?: string }).id ?? '')}_${now.getTime()}`,
        type: LeoMemoryType.PROCEDURAL,
        content: decision.action,
        context: JSON.stringify({
          tasksCount: ctx.tasksCount,
          eventsCount: ctx.eventsCount,
          healthStatus: ctx.healthStatus
        }),
        importance: decision.success ? 5 : 3,
        tags: ['decision', decision.action],
      });
    } catch (error) {
      console.error('[LeoMemory] Erro ao salvar decisão no banco:', error);
    }

    // Manter compatibilidade com sistema em memória
    this.history.unshift(memoryDecision);
    
    // Manter apenas os mais recentes
    if (this.history.length > this.maxMemorySize) {
      this.history = this.history.slice(0, this.maxMemorySize);
    }

    // Atualizar padrões
    this.updatePatterns(memoryDecision);
    this.isDirty = true;

    console.log(`🧠 Decisão memorizada: ${decision.action} (${decision.success ? '✅' : '❌'})`);
  }

  /**
   * Adiciona uma tarefa à memória
   */
  async addTask(task: Omit<MemoryTask, 'timestamp'>): Promise<void> {
    const memoryTask: MemoryTask = {
      ...task,
      timestamp: new Date(),
    };

    this.tasks.unshift(memoryTask);
    
    if (this.tasks.length > this.maxMemorySize) {
      this.tasks = this.tasks.slice(0, this.maxMemorySize);
    }

    this.isDirty = true;
  }

  /**
   * Adiciona um erro à memória
   */
  async addError(error: Omit<MemoryError, 'timestamp'>): Promise<void> {
    const memoryError: MemoryError = {
      ...error,
      timestamp: new Date(),
    };

    this.errors.unshift(memoryError);
    
    if (this.errors.length > this.maxMemorySize) {
      this.errors = this.errors.slice(0, this.maxMemorySize);
    }

    this.isDirty = true;

    console.log(`🚨 Erro memorizado: ${error.type}`);
  }

  /**
   * Marca um erro como resolvido
   */
  async resolveError(errorType: string, resolution: string): Promise<void> {
    const error = this.errors.find(e => e.type === errorType && !e.resolved);
    if (error) {
      error.resolved = true;
      error.resolutionTime = Date.now();
      this.isDirty = true;

      console.log(`✅ Erro resolvido: ${errorType} - ${resolution}`);
    }
  }

  /**
   * Obtém histórico recente
   */
  async getRecentHistory(limit: number = 50): Promise<MemoryDecision[]> {
    return this.history.slice(0, limit);
  }

  /**
   * Obtém tarefas recentes
   */
  async getRecentTasks(limit: number = 50): Promise<MemoryTask[]> {
    return this.tasks.slice(0, limit);
  }

  /**
   * Obtém erros recentes
   */
  async getRecentErrors(limit: number = 50): Promise<MemoryError[]> {
    return this.errors.slice(0, limit);
  }

  /**
   * Obtém padrões aprendidos
   */
  async getPatterns(): Promise<MemoryPattern[]> {
    return Array.from(this.patterns.values())
      .sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Obtém estatísticas completas da memória
   */
  async getStats(): Promise<MemoryStats> {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * 24 * 60 * 60 * 1000;

    // Contar atividades recentes
    const toMs = (d: MemoryDecision) => (d.timestamp instanceof Date ? d.timestamp.getTime() : d.timestamp);
    const recentActivity = {
      lastHour: this.history.filter((d) => (now - toMs(d)) < oneHour).length,
      lastDay: this.history.filter((d) => (now - toMs(d)) < oneDay).length,
      lastWeek: this.history.filter((d) => (now - toMs(d)) < oneWeek).length,
    };

    // Calcular taxa de sucesso
    const successRate = this.history.length > 0 
      ? (this.history.filter((d) => d.success).length / this.history.length) * 100 
      : 0;

    // Calcular tempo médio de execução
    const validExecutionTimes = this.history
      .filter((d) => d.executionTime > 0)
      .map((d) => d.executionTime);
    const avgExecutionTime = validExecutionTimes.length > 0
      ? validExecutionTimes.reduce((sum, time) => sum + time, 0) / validExecutionTimes.length
      : 0;

    // Ações mais comuns
    const actionCounts = new Map<string, number>();
    this.history.forEach(d => {
      actionCounts.set(d.action, (actionCounts.get(d.action) || 0) + 1);
    });
    const mostCommonActions = Array.from(actionCounts.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Padrões de erro
    const errorCounts = new Map<string, number>();
    this.errors.forEach(e => {
      errorCounts.set(e.type, (errorCounts.get(e.type) || 0) + 1);
    });
    const errorPatterns = Array.from(errorCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalDecisions: this.history.length,
      totalTasks: this.tasks.length,
      totalErrors: this.errors.length,
      successRate,
      avgExecutionTime,
      mostCommonActions,
      errorPatterns,
      recentActivity,
    };
  }

  /**
   * Adiciona experiência de aprendizado
   */
  async addLearningExperience(experience: LearningExperience): Promise<void> {
    try {
      this.learningExperiences.push(experience);
      
      // Manter apenas últimas 1000 experiências
      if (this.learningExperiences.length > 1000) {
        this.learningExperiences = this.learningExperiences.slice(-1000);
      }

      // Atualizar performance da ação
      this.updateActionPerformance(experience);
      
      this.isDirty = true;
      
      console.log(`🧠 Experiência de aprendizado adicionada: ${experience.taskType} - ${experience.outcome}`);
      
      await insertLeoActionLog({
        usuario: 'leo-memory',
        acao: 'adicionar_experiencia_aprendizado',
        entidade: 'leo_memory',
        dados: JSON.stringify(experience),
        resultado: 'SUCESSO',
      });
    } catch (error) {
      console.error('[LeoMemory] Erro ao adicionar experiência de aprendizado:', error);
    }
  }

  /**
   * Atualiza performance de uma ação baseada na experiência
   */
  private updateActionPerformance(experience: LearningExperience): void {
    const existing = this.actionPerformance.get(experience.taskType);
    
    if (existing) {
      existing.totalExecutions++;
      if (experience.success) {
        existing.successCount++;
      } else {
        existing.failureCount++;
      }
      
      // Recalcular taxa de sucesso
      existing.successRate = (existing.successCount / existing.totalExecutions) * 100;
      
      // Atualizar tempo médio
      const totalTime = existing.avgExecutionTime * (existing.totalExecutions - 1) + experience.executionTime;
      existing.avgExecutionTime = totalTime / existing.totalExecutions;
      
      existing.lastExecution = experience.timestamp;
      
      // Atualizar condições ótimas
      this.updateOptimalConditions(existing, experience);
      
      // Gerar recomendações
      existing.recommendations = this.generateRecommendations(existing);
      
    } else {
      // Primeira execução desta ação
      const performance: ActionPerformance = {
        actionType: experience.taskType,
        totalExecutions: 1,
        successCount: experience.success ? 1 : 0,
        failureCount: experience.success ? 0 : 1,
        avgExecutionTime: experience.executionTime,
        successRate: experience.success ? 100 : 0,
        lastExecution: experience.timestamp,
        optimalConditions: {
          timeOfDay: this.getTimeOfDay(experience.timestamp),
          dayOfWeek: this.getDayOfWeek(experience.timestamp),
          systemLoad: 'unknown',
        },
        recommendations: [],
      };
      
      this.actionPerformance.set(experience.taskType, performance);
    }
  }

  /**
   * Atualiza condições ótimas para execução
   */
  private updateOptimalConditions(performance: ActionPerformance, experience: LearningExperience): void {
    const currentHour = this.getTimeOfDay(experience.timestamp);
    const currentDay = this.getDayOfWeek(experience.timestamp);
    
    // Se sucesso, marcar como condição ótima
    if (experience.success && experience.executionTime < performance.avgExecutionTime) {
      performance.optimalConditions.timeOfDay = currentHour;
      performance.optimalConditions.dayOfWeek = currentDay;
    }
  }

  /**
   * Gera recomendações baseadas no desempenho
   */
  private generateRecommendations(performance: ActionPerformance): string[] {
    const recommendations: string[] = [];
    
    if (performance.successRate < 70) {
      recommendations.push('Considerar revisar lógica desta ação - baixa taxa de sucesso');
    }
    
    if (performance.avgExecutionTime > 30000) {
      recommendations.push('Otimizar performance - tempo médio de execução muito alto');
    }
    
    if (performance.totalExecutions > 100 && performance.successRate > 90) {
      recommendations.push('Ação está madura - considerar automação completa');
    }
    
    if (performance.failureCount > 10) {
      recommendations.push('Investigar causas recorrentes de falha nesta ação');
    }
    
    return recommendations;
  }

  /**
   * Obtém performance de uma ação específica
   */
  getActionPerformance(actionType: string): ActionPerformance | undefined {
    return this.actionPerformance.get(actionType);
  }

  /**
   * Obtém as melhores ações para uma situação
   */
  getBestActions(context: Record<string, unknown>, limit: number = 5): Array<{ action: string; confidence: number; reasoning: string }> {
    const actions = Array.from(this.actionPerformance.entries())
      .map(([actionType, performance]) => ({
        action: actionType,
        successRate: performance.successRate,
        avgExecutionTime: performance.avgExecutionTime,
        totalExecutions: performance.totalExecutions,
        confidence: this.calculateConfidence(performance),
        performance,
      }))
      .filter((action) => action.totalExecutions >= 5) // Apenas ações com histórico suficiente
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);

    return actions.map((action) => ({
      action: action.action,
      confidence: action.confidence,
      reasoning: `Taxa de sucesso: ${action.successRate}%, Tempo médio: ${action.avgExecutionTime}ms, Execuções: ${action.totalExecutions}`,
    }));
  }

  /**
   * Calcula confiança na performance de uma ação
   */
  private calculateConfidence(performance: ActionPerformance): number {
    const successWeight = 0.4;
    const speedWeight = 0.3;
    const experienceWeight = 0.3;
    
    const successScore = Math.min(performance.successRate / 100, 1) * successWeight;
    const speedScore = Math.max(0, 1 - (performance.avgExecutionTime / 60000)) * speedWeight; // Penalizar ações lentas
    const experienceScore = Math.min(performance.totalExecutions / 100, 1) * experienceWeight;
    
    return (successScore + speedScore + experienceScore) * 100;
  }

  /**
   * Aprende com base no histórico completo
   */
  async learnFromHistory(): Promise<void> {
    try {
      console.log('🧠 Iniciando análise de aprendizado do histórico...');
      
      const insights: Array<{
        type: string;
        action: string;
        pattern: string;
        recommendation: string;
      }> = [];
      
      // Analisar padrões de sucesso
      for (const [actionType, performance] of Array.from(this.actionPerformance.entries())) {
        if (performance.totalExecutions >= 10) {
          // Identificar padrões de sucesso
          if (performance.successRate > 85) {
            insights.push({
              type: 'success_pattern',
              action: actionType,
              pattern: `Ação ${actionType} tem alta taxa de sucesso (${performance.successRate.toFixed(1)}%)`,
              recommendation: `Manter estratégia atual - executar preferencialmente em ${performance.optimalConditions.timeOfDay}`,
            });
          }
          
          // Identificar problemas de performance
          if (performance.avgExecutionTime > 30000) {
            insights.push({
              type: 'performance_issue',
              action: actionType,
              pattern: `Ação ${actionType} lenta (${performance.avgExecutionTime}ms média)`,
              recommendation: 'Investigar gargalos de performance ou otimizar algoritmo',
            });
          }
          
          // Identificar falhas recorrentes
          if (performance.failureCount > performance.successCount) {
            insights.push({
              type: 'failure_pattern',
              action: actionType,
              pattern: `Ação ${actionType} falha mais que sucede (${performance.failureCount} vs ${performance.successCount})`,
              recommendation: 'Revisar lógica e adicionar tratamento de erros',
            });
          }
        }
      }
      
      // Analisar experiências de planejamento
      const recentExperiences = this.learningExperiences.slice(-50);
      const complexityAnalysis = this.analyzeComplexityPatterns(recentExperiences);
      
      if (complexityAnalysis.underestimated > 3) {
        insights.push({
          type: 'planning_issue',
          action: 'task_planning',
          pattern: `Complexidade frequentemente subestimada (${complexityAnalysis.underestimated} vezes)`,
          recommendation: 'Ajustar algoritmo de estimativa de complexidade',
        });
      }
      
      // Salvar insights aprendidos
      for (const insight of insights) {
        await this.saveLearningInsight(insight);
      }
      
      console.log(`🧠 Análise concluída: ${insights.length} insights gerados`);
      
      await insertLeoActionLog({
        usuario: 'leo-memory',
        acao: 'aprendizado_historico',
        entidade: 'leo_memory',
        dados: JSON.stringify({
          insightsCount: insights.length,
          actionsAnalyzed: this.actionPerformance.size,
          experiencesAnalyzed: recentExperiences.length,
        }),
        resultado: 'SUCESSO',
      });
      
    } catch (error) {
      console.error('[LeoMemory] Erro no aprendizado do histórico:', error);
    }
  }

  /**
   * Analisa padrões de complexidade
   */
  private analyzeComplexityPatterns(experiences: LearningExperience[]): { underestimated: number; overestimated: number; avgAccuracy: number } {
    let underestimated = 0;
    let overestimated = 0;
    let totalError = 0;
    let count = 0;
    
    for (const exp of experiences) {
      if (exp.subTasksGenerated > 0) {
        // Estimar complexidade esperada baseada no número de subtarefas
        const expectedComplexity = Math.min(Math.ceil(exp.subTasksGenerated / 2), 10);
        const error = Math.abs(exp.complexity - expectedComplexity);
        
        if (exp.complexity < expectedComplexity) {
          underestimated++;
        } else if (exp.complexity > expectedComplexity) {
          overestimated++;
        }
        
        totalError += error;
        count++;
      }
    }
    
    return {
      underestimated,
      overestimated,
      avgAccuracy: count > 0 ? Math.max(0, 100 - (totalError / count / 10 * 100)) : 100,
    };
  }

  /**
   * Salva insight de aprendizado
   */
  private async saveLearningInsight(insight: {
    type: string;
    action: string;
    pattern: string;
    recommendation: string;
  }): Promise<void> {
    try {
      // Persistir insight como memória (saveLearning opcional na persistência)
      const persistence = leoMemoryPersistence as { saveLearning?: (p: unknown) => Promise<void> };
      if (typeof persistence.saveLearning === 'function') {
        await persistence.saveLearning({
          learningType: 'insight',
          content: insight.pattern,
          context: { action: insight.action, type: insight.type },
          performance: { successRate: 85, avgTime: 1000 },
          recommendations: [insight.recommendation],
          confidence: 75,
          applicableTo: [insight.action],
          status: 'active'
        });
      }
      
      console.log(`💡 Insight gerado e salvo: ${insight.type} - ${insight.pattern}`);
    } catch (error) {
      console.error('[LeoMemory] Erro ao salvar insight:', error);
    }
  }

  /**
   * Obtém hora do dia
   */
  private getTimeOfDay(timestamp: number | Date): string {
    const ms = timestamp instanceof Date ? timestamp.getTime() : timestamp;
    const hour = new Date(ms).getHours();
    
    if (hour >= 6 && hour < 12) return 'manhã';
    if (hour >= 12 && hour < 18) return 'tarde';
    if (hour >= 18 && hour < 22) return 'noite';
    return 'madrugada';
  }

  /**
   * Obtém dia da semana
   */
  private getDayOfWeek(timestamp: number | Date): string {
    const days = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    const ms = timestamp instanceof Date ? timestamp.getTime() : timestamp;
    return days[new Date(ms).getDay()];
  }

  /**
   * Busca decisões similares
   */
  async findSimilarDecisions(action: string, context?: any, limit: number = 5): Promise<MemoryDecision[]> {
    return this.history
      .filter((d: any) => d.action === action)
      .filter((d: any) => {
        if (!context) return true;
        // Implementar lógica de similaridade de contexto
        return true;
      })
      .slice(0, limit);
  }

  /**
   * Prevê sucesso de uma ação baseado no histórico
   */
  async predictSuccess(action: string, context?: any): Promise<number> {
    const similarDecisions = await this.findSimilarDecisions(action, context, 20);
    
    if (similarDecisions.length === 0) {
      return 0.5; // 50% se não há histórico
    }

    const successCount = similarDecisions.filter((d: any) => d.success).length;
    return successCount / similarDecisions.length;
  }

  /**
   * Obtém insights aprendidos
   */
  async getInsights(): Promise<{
    recommendations: string[];
    warnings: string[];
    optimizations: string[];
  }> {
    const stats = await this.getStats();
    const insights = {
      recommendations: [] as string[],
      warnings: [] as string[],
      optimizations: [] as string[],
    };

    // Análise de taxa de sucesso
    if (stats.successRate < 70) {
      insights.warnings.push('Taxa de sucesso baixa (< 70%). Revisar estratégias.');
    }

    // Análise de tempo de execução
    if (stats.avgExecutionTime > 5000) {
      insights.optimizations.push('Tempo médio de execução alto. Otimizar ações.');
    }

    // Análise de erros frequentes
    const topError = stats.errorPatterns[0];
    if (topError && topError.count > 10) {
      insights.warnings.push(`Erro frequente: ${topError.type} (${topError.count} ocorrências)`);
    }

    // Análise de ações mais comuns
    const topAction = stats.mostCommonActions[0];
    if (topAction && topAction.count > 50) {
      insights.recommendations.push(`Ação mais executada: ${topAction.action}. Considerar automação.`);
    }

    // Análise de atividade recente
    if (stats.recentActivity.lastHour === 0) {
      insights.warnings.push('Sem atividade na última hora. Verificar sistema.');
    }

    if (stats.recentActivity.lastDay < 10) {
      insights.warnings.push('Baixa atividade nas últimas 24 horas.');
    }

    return insights;
  }

  /**
   * Atualiza padrões baseado em nova decisão
   */
  private updatePatterns(decision: MemoryDecision): void {
    const key = decision.action;
    const existing = this.patterns.get(key);

    if (existing) {
      // Atualizar padrão existente
      existing.frequency++;
      existing.lastOccurrence = decision.timestamp;
      
      // Recalcular média de tempo de execução
      const allDecisions = this.history.filter((d) => d.action === key);
      const validTimes = allDecisions.filter((d) => d.executionTime > 0).map((d) => d.executionTime);
      existing.avgExecutionTime = validTimes.length > 0
        ? validTimes.reduce((sum, time) => sum + time, 0) / validTimes.length
        : existing.avgExecutionTime;
      
      // Recalcular taxa de sucesso
      existing.successRate = (allDecisions.filter((d) => d.success).length / allDecisions.length) * 100;
    } else {
      // Criar novo padrão
      this.patterns.set(key, {
        type: key,
        frequency: 1,
        lastOccurrence: decision.timestamp,
        avgExecutionTime: decision.executionTime,
        successRate: decision.success ? 100 : 0,
        context: decision.context,
      });
    }
  }

  /**
   * Carrega memória do arquivo
   */
  private loadMemory(): void {
    try {
      if (existsSync(this.filePath)) {
        const data = readFileSync(this.filePath, 'utf-8');
        const memoryData = JSON.parse(data);
        
        this.history = memoryData.history || [];
        this.tasks = memoryData.tasks || [];
        this.errors = memoryData.errors || [];
        this.patterns = new Map(memoryData.patterns || []);
        
        console.log(`📁 Memória carregada: ${this.history.length} decisões, ${this.tasks.length} tarefas, ${this.errors.length} erros`);
      }
    } catch (error) {
      console.error('[LeoMemory] Erro ao carregar memória:', error);
    }
  }

  /**
   * Salva memória no arquivo
   */
  private saveMemory(): void {
    try {
      const dataDir = join(process.cwd(), 'data');
      
      // Criar diretório se não existir
      if (!existsSync(dataDir)) {
        require('fs').mkdirSync(dataDir, { recursive: true });
      }
      
      const memoryData = {
        history: this.history,
        tasks: this.tasks,
        errors: this.errors,
        patterns: Array.from(this.patterns.entries()),
        lastSaved: Date.now(),
      };
      
      writeFileSync(this.filePath, JSON.stringify(memoryData, null, 2));
      this.isDirty = false;
    } catch (error) {
      console.error('[LeoMemory] Erro ao salvar memória:', error);
    }
  }

  /**
   * Inicia salvamento automático
   */
  private startAutoSave(): void {
    this.saveInterval = setInterval(() => {
      if (this.isDirty) {
        this.saveMemory();
      }
    }, 30000); // Salvar a cada 30 segundos
  }

  /**
   * Para salvamento automático
   */
  stopAutoSave(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = undefined;
    }
    
    // Salvar final
    if (this.isDirty) {
      this.saveMemory();
    }
  }

  /**
   * Limpa memória antiga
   */
  async cleanOldMemory(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    const ts = (x: { timestamp: Date }) => x.timestamp.getTime();
    // Limpar decisões antigas
    const originalHistoryLength = this.history.length;
    this.history = this.history.filter((d) => (now - ts(d)) < maxAge);
    cleaned += originalHistoryLength - this.history.length;

    // Limpar tarefas antigas
    const originalTasksLength = this.tasks.length;
    this.tasks = this.tasks.filter((t) => (now - ts(t)) < maxAge);
    cleaned += originalTasksLength - this.tasks.length;

    // Limpar erros antigos (manter erros não resolvidos)
    const originalErrorsLength = this.errors.length;
    this.errors = this.errors.filter((e) => 
      !e.resolved || (now - ts(e)) < maxAge
    );
    cleaned += originalErrorsLength - this.errors.length;

    if (cleaned > 0) {
      this.isDirty = true;
      console.log(`🧹 Memória limpa: ${cleaned} registros antigos removidos`);
    }

    return cleaned;
  }

  /**
   * Exporta memória para análise
   */
  async exportMemory(): Promise<{
    decisions: MemoryDecision[];
    tasks: MemoryTask[];
    errors: MemoryError[];
    patterns: MemoryPattern[];
    stats: MemoryStats;
  }> {
    return {
      decisions: this.history,
      tasks: this.tasks,
      errors: this.errors,
      patterns: Array.from(this.patterns.values()),
      stats: await this.getStats(),
    };
  }

  /**
   * Importa memória de backup
   */
  async importMemory(data: Record<string, unknown>): Promise<void> {
    try {
      if (Array.isArray(data.decisions)) this.history = data.decisions as MemoryDecision[];
      if (Array.isArray(data.tasks)) this.tasks = data.tasks as MemoryTask[];
      if (Array.isArray(data.errors)) this.errors = data.errors as MemoryError[];
      if (Array.isArray(data.patterns)) this.patterns = new Map(data.patterns as [string, MemoryPattern][]);

      this.isDirty = true;
      console.log('📥 Memória importada com sucesso');
    } catch (error) {
      console.error('[LeoMemory] Erro ao importar memória:', error);
    }
  }

  /**
   * Inicia limpeza automática de memória
   */
  private startMemoryCleanup(): void {
    // Executar limpeza a cada 30 minutos
    this.cleanupInterval = setInterval(() => {
      this.cleanupMemory();
    }, 30 * 60 * 1000); // 30 minutos em milissegundos
    
    console.log('🧹 Limpeza automática de memória iniciada (executa a cada 30 minutos)');
  }

  /**
   * Limpa memória para evitar acúmulo
   */
  private cleanupMemory(): void {
    try {
      const initialTotal = this.history.length + this.tasks.length + this.errors.length + this.learningExperiences.length;
      
      // Limitar cada array ao tamanho máximo
      if (this.history.length > this.maxMemorySize) {
        this.history = this.history.slice(0, this.maxMemorySize);
      }
      
      if (this.tasks.length > this.maxMemorySize) {
        this.tasks = this.tasks.slice(0, this.maxMemorySize);
      }
      
      if (this.errors.length > this.maxMemorySize) {
        this.errors = this.errors.slice(0, this.maxMemorySize);
      }
      
      if (this.learningExperiences.length > this.maxMemorySize) {
        this.learningExperiences = this.learningExperiences.slice(0, this.maxMemorySize);
      }
      
      // Limpar padrões antigos (manter apenas 100 mais recentes)
      if (this.patterns.size > 100) {
        const patternsArray = Array.from(this.patterns.entries())
          .sort((a, b) => b[1].lastOccurrence.getTime() - a[1].lastOccurrence.getTime())
          .slice(0, 100);
        this.patterns = new Map(patternsArray);
      }
      
      // Limpar performance de ações antigas (manter apenas 50 mais recentes)
      if (this.actionPerformance.size > 50) {
        const performanceArray = Array.from(this.actionPerformance.entries())
          .sort((a, b) => b[1].lastExecution.getTime() - a[1].lastExecution.getTime())
          .slice(0, 50);
        this.actionPerformance = new Map(performanceArray);
      }
      
      const finalTotal = this.history.length + this.tasks.length + this.errors.length + this.learningExperiences.length;
      const cleanedCount = initialTotal - finalTotal;
      
      if (cleanedCount > 0) {
        this.isDirty = true;
        console.log(`🧹 Memória limpa: ${cleanedCount} registros removidos`);
      }
    } catch (error) {
      console.error('[LeoMemory] Erro na limpeza de memória:', error);
    }
  }

  /**
   * Para limpeza automática (chamado no desligamento)
   */
  private stopMemoryCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * Método de compatibilidade: getRecentDecisions
   */
  async getRecentDecisions(limit: number = 50): Promise<MemoryDecision[]> {
    return this.getRecentHistory(limit);
  }

  /**
   * Método de compatibilidade: saveDecision
   */
  async saveDecision(decision: Omit<MemoryDecision, 'timestamp'>): Promise<void> {
    return this.addDecision(decision);
  }
}

// Exportar instância singleton
export const leoMemory = LeoMemory.getInstance();
