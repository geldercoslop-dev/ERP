/**
 * Dashboard Admin do LEO
 * 
 * Endpoint completo para administração e monitoramento do Leo
 * Fornece informações detalhadas sobre status, tarefas, eventos e performance
 */

import { router, publicProcedure } from '../_core/trpc.js';
import { z } from 'zod';
import { leoEngine } from '../leo/engine/leo-engine.js';
import { leoLoop } from '../leo/engine/leo-loop.js';
import { leoTaskQueue } from '../leo/tasks/leo-task-queue.js';
import { leoScheduler } from '../leo/engine/leo-scheduler.js';
import { leoSupervisor } from '../leo/engine/leo-supervisor.js';
import { leoLoopProtection } from '../leo/security/leo-loop-protection.js';
import { leoErpObserver } from '../leo/perception/leo-erp-observer.js';
import { leoEvents } from '../leo/memory/leo-events.js';
import { leoPlanner } from '../leo/planning/leo-planner.js';
import { LeoTaskStatus } from "../../shared/types/index.js";
import type { LeoTask, LeoEvent } from "../../shared/types/index.js";

export const leoAdminDashboardRouter = router({
  /**
   * Dashboard principal - visão geral completa
   */
  dashboard: publicProcedure.query(async () => {
    try {
      const now = Date.now();
      
      // Status do agente
      const engineStatus = await leoEngine.getStatus();
      const loopStatus = await leoLoop.getLoopStatus();
      const supervisorStatus = leoSupervisor.getStatus();
      const loopProtectionStats = leoLoopProtection.getStatistics();
      
      // Estatísticas de tarefas
      const taskStats = await leoTaskQueue.getStats();
      const schedulerStats = leoScheduler.getStats();
      const plannerStats = leoPlanner.getStatistics();
      
      // Eventos recentes
      const recentEvents = await leoEvents.listarEventos({ 
        limit: 10,
        status: 'aberto' 
      });
      
      // Contexto do ERP
      const erpContext = await leoErpObserver.collectErpContext();
      
      // Alertas de proteção
      const loopAlerts = leoLoopProtection.getAlerts().slice(0, 5);
      
      // Tarefas recentes
      const recentTasks = await leoTaskQueue.listTasks({ limit: 10 });
      
      return {
        timestamp: now,
        status: {
          agent: {
            online: (() => {
              const s = engineStatus as unknown as { online?: boolean; running?: boolean };
              return typeof s.online === "boolean" ? s.online : Boolean(s.running);
            })(),
            uptime: engineStatus.uptime,
            capabilities: (engineStatus as { capabilities?: unknown }).capabilities ?? {},
          },
          loop: loopStatus,
          supervisor: {
            isPaused: supervisorStatus.isPaused,
            currentActionsPerMinute: supervisorStatus.currentActionsPerMinute,
            currentMemoryUsage: supervisorStatus.currentMemoryUsage,
            currentCpuUsage: supervisorStatus.currentCpuUsage,
            blockedUntil: supervisorStatus.blockedUntil,
            lastViolation: supervisorStatus.lastViolation,
            totalViolations: supervisorStatus.metrics.totalViolations,
          },
          protection: loopProtectionStats,
        },
        tasks: {
          queue: taskStats,
          scheduler: schedulerStats,
          planner: plannerStats,
          recent: recentTasks.slice(0, 5),
        },
        events: {
          recent: recentEvents.eventos || [],
          alerts: loopAlerts,
          totalEvents: recentEvents.eventos?.length || 0,
        },
        erp: erpContext,
        performance: {
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime(),
          nodeVersion: process.version,
        },
      };
    } catch (error) {
      console.error('[LeoAdmin] Erro ao carregar dashboard:', error);
      throw new Error('Erro ao carregar dashboard do Leo');
    }
  }),

  /**
   * Status detalhado do agente
   */
  agentStatus: publicProcedure.query(async () => {
    const engineStatus = await leoEngine.getStatus();
    const loopStatus = await leoLoop.getLoopStatus();
    const supervisorStatus = leoSupervisor.getStatus();
    
    return {
      engine: engineStatus,
      loop: loopStatus,
      supervisor: supervisorStatus,
      timestamp: Date.now(),
    };
  }),

  /**
   * Estatísticas detalhadas de tarefas
   */
  taskStats: publicProcedure
    .input(z.object({
      status: z.enum(['pending', 'running', 'done', 'error']).optional(),
      type: z.string().optional(),
      priority: z.enum(['alta', 'media', 'baixa']).optional(),
      limit: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const statusMap: Record<"pending" | "running" | "done" | "error", LeoTaskStatus> = {
        pending: LeoTaskStatus.PENDING,
        running: LeoTaskStatus.RUNNING,
        done: LeoTaskStatus.DONE,
        error: LeoTaskStatus.ERROR,
      };

      const tasks = await leoTaskQueue.listTasks({
        ...input,
        status: input.status ? statusMap[input.status] : undefined,
      });
      const stats = await leoTaskQueue.getStats();
      
      return {
        tasks: tasks,
        stats,
        filters: input,
      };
    }),

  /**
   * Lista eventos com filtros
   */
  events: publicProcedure
    .input(z.object({
      status: z.enum(['aberto', 'em_andamento', 'resolvido', 'ignorado']).optional(),
      type: z.string().optional(),
      priority: z.enum(['critica', 'alta', 'media', 'baixa']).optional(),
      limit: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return await leoEvents.listarEventos(input);
    }),

  /**
   * Alertas de proteção contra loops
   */
  loopAlerts: publicProcedure
    .input(z.object({
      severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      limit: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const alerts = leoLoopProtection.getAlerts();
      
      let filteredAlerts = alerts;
      
      if (input?.severity) {
        filteredAlerts = alerts.filter((alert) => alert.severity === input.severity);
      }
      
      if (input?.limit) {
        filteredAlerts = filteredAlerts.slice(0, input.limit);
      }
      
      return {
        alerts: filteredAlerts,
        total: alerts.length,
        filters: input,
      };
    }),

  /**
   * Tarefas agendadas
   */
  scheduledTasks: publicProcedure.query(async () => {
    const tasks = leoScheduler.getScheduledTasks();
    const stats = leoScheduler.getStats();
    
    return {
      tasks,
      stats,
    };
  }),

  /**
   * Planos ativos do planner
   */
  activePlans: publicProcedure.query(async () => {
    const plans = leoPlanner.getActivePlans();
    const stats = leoPlanner.getStatistics();
    
    return {
      plans,
      stats,
    };
  }),

  /**
   * Ações de controle do agente
   */
  control: publicProcedure
    .input(z.object({
      action: z.enum(['start_loop', 'stop_loop', 'pause_supervisor', 'resume_supervisor', 'clear_tasks']),
      parameters: z.record(z.string(), z.any()).optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        let result;
        
        switch (input.action) {
          case 'start_loop':
            result = await leoLoop.startLeoLoop(input.parameters?.intervalMs || 5000);
            break;
            
          case 'stop_loop':
            result = await leoLoop.stopLeoLoop();
            break;
            
          case 'pause_supervisor':
            await leoSupervisor.pauseExecution(
              input.parameters?.reason || 'Pausado manualmente',
              input.parameters?.durationMinutes
            );
            result = { success: true, message: 'Supervisor pausado' };
            break;
            
          case 'resume_supervisor':
            await leoSupervisor.resumeExecution();
            result = { success: true, message: 'Supervisor retomado' };
            break;
            
          case 'clear_tasks':
            const cleared = await leoTaskQueue.cleanOldTasks(0); // Limpar todas
            result = { success: true, message: `${cleared} tarefas limpas` };
            break;
            
          default:
            throw new Error(`Ação desconhecida: ${input.action}`);
        }
        
        // Registrar ação de controle
        await leoEvents.registerEvent({
          tipo: 'custom',
          descricao: `Ação de controle executada: ${input.action}`,
          prioridade: 'media',
          dados: {
            action: input.action,
            parameters: input.parameters,
            result,
            timestamp: new Date(),
          },
          usuarioCriador: 'leo-admin',
        });
        
        return result;
      } catch (error) {
        console.error('[LeoAdmin] Erro na ação de controle:', error);
        throw new Error(`Erro ao executar ação ${input.action}: ${error}`);
      }
    }),

  /**
   * Criar tarefa manualmente
   */
  createTask: publicProcedure
    .input(z.object({
      type: z.string(),
      priority: z.enum(['critica', 'alta', 'media', 'baixa']),
      payload: z.record(z.string(), z.any()),
      impact: z.number().min(0).max(100).optional(),
      urgency: z.number().min(0).max(100).optional(),
      risk: z.number().min(0).max(100).optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const task = await leoTaskQueue.addTask({
          id: `task-${Date.now()}`,
          type: input.type as any,
          priority: input.priority as any,
          payload: input.payload,
          status: 'pending' as any,
          maxAttempts: 3,
        });
        
        return {
          success: true,
          task,
          message: `Tarefa ${task.id} criada com sucesso`,
        };
      } catch (error) {
        console.error('[LeoAdmin] Erro ao criar tarefa:', error);
        throw new Error(`Erro ao criar tarefa: ${error}`);
      }
    }),

  /**
   * Criar tarefa agendada
   */
  createScheduledTask: publicProcedure
    .input(z.object({
      name: z.string(),
      type: z.string(),
      schedule: z.string(),
      priority: z.enum(['critica', 'alta', 'media', 'baixa']),
      payload: z.record(z.string(), z.any()),
      enabled: z.boolean().default(true),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const task = await leoScheduler.addScheduledTask({
          name: input.name,
          type: input.type,
          schedule: input.schedule,
          priority: input.priority,
          payload: input.payload,
          enabled: input.enabled,
          createdBy: 'leo-admin',
          description: input.description,
        });
        
        return {
          success: true,
          task,
          message: `Tarefa agendada ${task.id} criada com sucesso`,
        };
      } catch (error) {
        console.error('[LeoAdmin] Erro ao criar tarefa agendada:', error);
        throw new Error(`Erro ao criar tarefa agendada: ${error}`);
      }
    }),

  /**
   * Resolver evento
   */
  resolveEvent: publicProcedure
    .input(z.object({
      eventId: z.number(),
      resolution: z.string(),
    }))
    .mutation(async ({ input }) => {
      try {
        await leoEvents.registerEvent({
          tipo: 'comando' as any,
          descricao: `Evento ${input.eventId} resolvido: ${input.resolution}`,
          dados: { eventId: input.eventId, resolution: input.resolution },
          prioridade: 'media' as any,
          usuarioCriador: 'leo-admin'
        });
        
        return {
          success: true,
          message: `Evento ${input.eventId} resolvido com sucesso`,
        };
      } catch (error) {
        console.error('[LeoAdmin] Erro ao resolver evento:', error);
        throw new Error(`Erro ao resolver evento: ${error}`);
      }
    }),

  /**
   * Bloquear/desbloquear tarefa
   */
  toggleTaskBlock: publicProcedure
    .input(z.object({
      taskId: z.string(),
      block: z.boolean(),
      reason: z.string().optional(),
      durationMinutes: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        if (input.block) {
          await leoLoopProtection.blockTask(
            input.taskId,
            input.reason || 'Bloqueado manualmente',
            input.durationMinutes
          );
          return {
            success: true,
            message: `Tarefa ${input.taskId} bloqueada`,
          };
        } else {
          await leoLoopProtection.unblockTask(input.taskId);
          return {
            success: true,
            message: `Tarefa ${input.taskId} desbloqueada`,
          };
        }
      } catch (error) {
        console.error('[LeoAdmin] Erro ao alterar bloqueio de tarefa:', error);
        throw new Error(`Erro ao alterar bloqueio: ${error}`);
      }
    }),

  /**
   * Relatório de performance
   */
  performanceReport: publicProcedure
    .input(z.object({
      period: z.enum(['1h', '6h', '24h', '7d', '30d']).default('24h'),
    }))
    .query(async ({ input }) => {
      try {
        // Período em milissegundos
        const periodMs = {
          '1h': 60 * 60 * 1000,
          '6h': 6 * 60 * 60 * 1000,
          '24h': 24 * 60 * 60 * 1000,
          '7d': 7 * 24 * 60 * 60 * 1000,
          '30d': 30 * 24 * 60 * 60 * 1000,
        }[input.period];
        
        const now = Date.now();
        const from = now - periodMs;
        
        // Coletar métricas do período
        const recentTasks = await leoTaskQueue.listTasks({ limit: 1000 });
        const periodTasks = recentTasks.filter((task: LeoTask) => 
          task.createdAt.getTime() >= from && task.createdAt.getTime() <= now
        );
        
        const completedTasks = periodTasks.filter((t: LeoTask) => t.status === 'done');
        const failedTasks = periodTasks.filter((t: LeoTask) => t.status === 'error');
        
        const avgExecutionTime = completedTasks.length > 0
          ? completedTasks.reduce((sum: number, t: LeoTask) => sum + (t.executionTime || 0), 0) / completedTasks.length
          : 0;
        
        const successRate = periodTasks.length > 0
          ? (completedTasks.length / periodTasks.length) * 100
          : 0;
        
        // Eventos do período
        const periodEventsResult = await leoEvents.listarEventos({ limit: 1000 });
        const periodEvents = periodEventsResult.eventos || [];
        
        return {
          period: input.period,
          from: new Date(from),
          to: new Date(now),
          tasks: {
            total: periodTasks.length,
            completed: completedTasks.length,
            failed: failedTasks.length,
            pending: periodTasks.filter((t: LeoTask) => t.status === 'pending').length,
            running: periodTasks.filter((t: LeoTask) => t.status === 'running').length,
            successRate: Math.round(successRate * 100) / 100,
            avgExecutionTime: Math.round(avgExecutionTime),
          },
          events: {
            total: periodEvents.length,
            critical: periodEvents.filter((e: LeoEvent) => e.prioridade === 'critica').length || 0,
            high: periodEvents.filter((e: LeoEvent) => e.prioridade === 'alta').length || 0,
            medium: periodEvents.filter((e: LeoEvent) => e.prioridade === 'media').length || 0,
            low: periodEvents.filter((e: LeoEvent) => e.prioridade === 'baixa').length || 0,
          },
          system: {
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage(),
          },
        };
      } catch (error) {
        console.error('[LeoAdmin] Erro ao gerar relatório de performance:', error);
        throw new Error(`Erro ao gerar relatório: ${error}`);
      }
    }),

  /**
   * Configurações do sistema
   */
  settings: publicProcedure.query(async () => {
    try {
      const supervisorLimits = leoSupervisor.getStatus().limits;
      const schedulerTasks = leoScheduler.getScheduledTasks();
      
      return {
        supervisor: {
          limits: supervisorLimits,
        },
        scheduler: {
          taskCount: schedulerTasks.length,
          enabledTasks: schedulerTasks.filter((t: { enabled: boolean }) => t.enabled).length,
        },
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          pid: process.pid,
        },
      };
    } catch (error) {
      console.error('[LeoAdmin] Erro ao obter configurações:', error);
      throw new Error(`Erro ao obter configurações: ${error}`);
    }
  }),

  /**
   * Atualizar configurações
   */
  updateSettings: publicProcedure
    .input(z.object({
      supervisor: z.object({
        maxActionsPerMinute: z.number().min(1).max(100).optional(),
        maxRetries: z.number().min(1).max(10).optional(),
        maxCpuUsage: z.number().min(1).max(100).optional(),
        maxMemoryUsage: z.number().min(1).max(100).optional(),
        maxConcurrentTasks: z.number().min(1).max(20).optional(),
        maxExecutionTime: z.number().min(5000).max(300000).optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        if (input.supervisor) {
          leoSupervisor.updateLimits(input.supervisor);
        }
        
        return {
          success: true,
          message: 'Configurações atualizadas com sucesso',
        };
      } catch (error) {
        console.error('[LeoAdmin] Erro ao atualizar configurações:', error);
        throw new Error(`Erro ao atualizar configurações: ${error}`);
      }
    }),
});
