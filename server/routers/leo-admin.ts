/**
 * Router Admin do LEO
 * 
 * Endpoints administrativos para controle do operador autônomo
 */

import { router, publicProcedure } from '../_core/trpc.js';
import { z } from 'zod';
import { leoLoop } from '../leo/engine/leo-loop.js';
import { leoTaskQueue } from '../leo/tasks/leo-task-queue.js';
import { leoMemory } from '../leo/memory/leo-memory.js';
import { leoOperatorMode } from '../leo/operator/leo-operator-controller.js';
import { leoErpObserver } from '../leo/perception/leo-erp-observer.js';
import { leoSystemMonitor } from '../leo/perception/leo-system-monitor.js';
import { leoEvents } from '../leo/memory/leo-events.js';
import { leoAutomation } from '../leo/actions/leo-automation.js';
import type { LeoTask, LeoEvent, User } from "../../shared/types/index.js";
import { LeoTaskStatus } from "../../shared/types/index.js";

/**
 * Router administrativo do Leo
 */
export const leoAdminRouter = router({
  // Status geral do Leo
  getStatus: publicProcedure.query(async () => {
    try {
      const loopStatus = await leoLoop.getLoopStatus();
      const operatorMode = leoOperatorMode.isModoOperadorAtivo();
      const taskStats = await leoTaskQueue.getStats();
      const memoryStats = await leoMemory.getStats();
      const systemHealth = await leoSystemMonitor.verificarSistema();
      const erpContext = await leoErpObserver.getLastContext();
      const automationStats = await leoAutomation.getEstatisticas();
      const eventsStats = await leoEvents.getEstatisticas();

      return {
        success: true,
        data: {
          loop: loopStatus,
          operatorMode,
          tasks: taskStats,
          memory: memoryStats,
          system: systemHealth,
          erp: erpContext,
          automation: automationStats,
          events: eventsStats,
          timestamp: new Date(),
        },
      };
    } catch (error) {
      console.error('[LeoAdmin] Erro ao obter status:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao obter status',
      };
    }
  }),

  // Iniciar Loop Cognitivo
  startLoop: publicProcedure
    .input(z.object({ intervalMs: z.number().optional().default(5000) }))
    .mutation(async ({ input }) => {
      try {
        await leoLoop.startLeoLoop(input.intervalMs);
        return {
          success: true,
          message: 'Loop iniciado com sucesso',
        };
      } catch (error) {
        console.error('[LeoAdmin] Erro ao iniciar loop:', error);
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Erro ao iniciar loop',
        };
      }
    }),

  // Parar Loop Cognitivo
  stopLoop: publicProcedure.mutation(async () => {
    try {
      await leoLoop.stopLeoLoop();
      return {
        success: true,
        message: 'Loop parado com sucesso',
      };
    } catch (error) {
      console.error('[LeoAdmin] Erro ao parar loop:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao parar loop',
      };
    }
  }),

  // Gerenciar Modo Operador
  operatorMode: {
    // Ativar modo operador
    activate: publicProcedure
      .input(z.object({
        nivelAutonomia: z.enum(['baixa', 'media', 'alta', 'total']).default('media'),
        permissoes: z.object({
          operarErp: z.boolean().default(true),
          controlarComputador: z.boolean().default(true),
          capturarTela: z.boolean().default(true),
          executarOcr: z.boolean().default(true),
          monitorarSistema: z.boolean().default(true),
          executarAutomacoes: z.boolean().default(true),
          gerenciarEventos: z.boolean().default(true),
        }).optional(),
        restricoes: z.object({
          requiresConfirmation: z.boolean().default(false),
          allowedCommands: z.array(z.string()).default([]),
          blockedActions: z.array(z.string()).default([]),
          maxExecutionTime: z.number().default(30),
        }).optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          await leoOperatorMode.ativarModoOperador();
          return {
            success: true,
            message: 'Modo operador ativado com sucesso',
          };
        } catch (error) {
          console.error('[LeoAdmin] Erro ao ativar modo operador:', error);
          return {
            success: false,
            message: error instanceof Error ? error.message : 'Erro ao ativar modo operador',
          };
        }
      }),

    // Desativar modo operador
    deactivate: publicProcedure.mutation(async () => {
      try {
        await leoOperatorMode.desativarModoOperador();
        return {
          success: true,
          message: 'Modo operador desativado com sucesso',
        };
      } catch (error) {
        console.error('[LeoAdmin] Erro ao desativar modo operador:', error);
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Erro ao desativar modo operador',
        };
      }
    }),

    // Obter configuração
    getConfig: publicProcedure.query(async () => {
      try {
        const config = leoOperatorMode.getConfig();
        return {
          success: true,
          data: config,
        };
      } catch (error) {
        console.error('[LeoAdmin] Erro ao obter config do modo operador:', error);
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Erro ao obter configuração',
        };
      }
    }),
  },

  // Gerenciar Tarefas
  tasks: {
    // Listar tarefas
    list: publicProcedure
      .input(z.object({
        status: z.enum(['pending', 'running', 'done', 'error']).optional(),
        type: z.string().optional(),
        priority: z.enum(['alta', 'media', 'baixa']).optional(),
        limit: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        try {
          const statusMap: Record<'pending' | 'running' | 'done' | 'error', LeoTaskStatus> = {
            pending: LeoTaskStatus.PENDING,
            running: LeoTaskStatus.RUNNING,
            done: LeoTaskStatus.DONE,
            error: LeoTaskStatus.ERROR,
          };
          const filters = input
            ? {
                ...input,
                status: input.status ? statusMap[input.status] : undefined,
              }
            : undefined;

          const result = await leoTaskQueue.listTasks(filters);
          return {
            success: true,
            data: result,
          };
        } catch (error) {
          console.error('[LeoAdmin] Erro ao listar tarefas:', error);
          return {
            success: false,
            message: error instanceof Error ? error.message : 'Erro ao listar tarefas',
          };
        }
      }),

    // Criar tarefa
    create: publicProcedure
      .input(z.object({
        type: z.string(),
        priority: z.enum(['alta', 'media', 'baixa']),
        payload: z.any(),
        scheduledAt: z.number().optional(),
        maxRetries: z.number().optional().default(3),
      }))
      .mutation(async ({ input }) => {
        try {
          const result = await leoTaskQueue.addTask({
            id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: input.type as any,
            priority: input.priority as any,
            payload: input.payload,
            maxAttempts: input.maxRetries,
            delay: input.scheduledAt,
            status: 'pending' as any,
          });
          return {
            success: true,
            data: result,
            message: 'Tarefa criada com sucesso',
          };
        } catch (error) {
          console.error('[LeoAdmin] Erro ao criar tarefa:', error);
          return {
            success: false,
            message: error instanceof Error ? error.message : 'Erro ao criar tarefa',
          };
        }
      }),

    // Cancelar tarefa
    cancel: publicProcedure
      .input(z.object({ taskId: z.string() }))
      .mutation(async ({ input }) => {
        try {
          const result = await leoTaskQueue.cancelTask(input.taskId);
          return {
            success: result,
            message: result ? 'Tarefa cancelada' : 'Tarefa não encontrada ou não pode ser cancelada',
          };
        } catch (error) {
          console.error('[LeoAdmin] Erro ao cancelar tarefa:', error);
          return {
            success: false,
            message: error instanceof Error ? error.message : 'Erro ao cancelar tarefa',
          };
        }
      }),

    // Limpar tarefas antigas
    clean: publicProcedure
      .input(z.object({ maxAge: z.number().optional().default(24 * 60 * 60 * 1000) }))
      .mutation(async ({ input }) => {
        try {
          const cleaned = await leoTaskQueue.cleanOldTasks(input.maxAge);
          return {
            success: true,
            message: `${cleaned} tarefas antigas removidas`,
            data: { cleaned },
          };
        } catch (error) {
          console.error('[LeoAdmin] Erro ao limpar tarefas:', error);
          return {
            success: false,
            message: error instanceof Error ? error.message : 'Erro ao limpar tarefas',
          };
        }
      }),

    // Estatísticas
    stats: publicProcedure.query(async () => {
      try {
        const stats = await leoTaskQueue.getStats();
        return {
          success: true,
          data: stats,
        };
      } catch (error) {
        console.error('[LeoAdmin] Erro ao obter estatísticas de tarefas:', error);
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Erro ao obter estatísticas',
        };
      }
    }),
  },

  // Gerenciar Memória
  memory: {
    // Histórico recente
    history: publicProcedure
      .input(z.object({ limit: z.number().optional().default(50) }))
      .query(async ({ input }) => {
        try {
          const history = await leoMemory.getRecentHistory(input.limit);
          return {
            success: true,
            data: history,
          };
        } catch (error) {
          console.error('[LeoAdmin] Erro ao obter histórico:', error);
          return {
            success: false,
            message: error instanceof Error ? error.message : 'Erro ao obter histórico',
          };
        }
      }),

    // Estatísticas da memória
    stats: publicProcedure.query(async () => {
      try {
        const stats = await leoMemory.getStats();
        return {
          success: true,
          data: stats,
        };
      } catch (error) {
        console.error('[LeoAdmin] Erro ao obter estatísticas da memória:', error);
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Erro ao obter estatísticas da memória',
        };
      }
    }),

    // Insights aprendidos
    insights: publicProcedure.query(async () => {
      try {
        const insights = await leoMemory.getInsights();
        return {
          success: true,
          data: insights,
        };
      } catch (error) {
        console.error('[LeoAdmin] Erro ao obter insights:', error);
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Erro ao obter insights',
        };
      }
    }),

    // Limpar memória antiga
    clean: publicProcedure
      .input(z.object({ maxAge: z.number().optional().default(7 * 24 * 60 * 60 * 1000) }))
      .mutation(async ({ input }) => {
        try {
          const cleaned = await leoMemory.cleanOldMemory(input.maxAge);
          return {
            success: true,
            message: `${cleaned} registros antigos removidos`,
            data: { cleaned },
          };
        } catch (error) {
          console.error('[LeoAdmin] Erro ao limpar memória:', error);
          return {
            success: false,
            message: error instanceof Error ? error.message : 'Erro ao limpar memória',
          };
        }
      }),

    // Exportar memória
    export: publicProcedure.query(async () => {
      try {
        const exportData = await leoMemory.exportMemory();
        return {
          success: true,
          data: exportData,
        };
      } catch (error) {
        console.error('[LeoAdmin] Erro ao exportar memória:', error);
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Erro ao exportar memória',
        };
      }
    }),
  },

  // Gerenciar Sistema
  system: {
    // Verificar saúde do sistema
    health: publicProcedure.query(async () => {
      try {
        const health = await leoSystemMonitor.verificarSistema();
        return {
          success: true,
          data: health,
        };
      } catch (error) {
        console.error('[LeoAdmin] Erro ao verificar saúde do sistema:', error);
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Erro ao verificar saúde do sistema',
        };
      }
    }),

    // Gerar relatório de saúde
    report: publicProcedure.query(async () => {
      try {
        const report = await leoSystemMonitor.gerarRelatorioSaude();
        return {
          success: true,
          data: report,
        };
      } catch (error) {
        console.error('[LeoAdmin] Erro ao gerar relatório de saúde:', error);
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Erro ao gerar relatório de saúde',
        };
      }
    }),

    // Logs recentes
    logs: publicProcedure
      .input(z.object({ limit: z.number().optional().default(100) }))
      .query(async ({ input }) => {
        try {
          const logs = await leoSystemMonitor.getLogsRecentes(input.limit);
          return {
            success: true,
            data: logs,
          };
        } catch (error) {
          console.error('[LeoAdmin] Erro ao obter logs:', error);
          return {
            success: false,
            message: error instanceof Error ? error.message : 'Erro ao obter logs',
          };
        }
      }),
  },

  // Gerenciar ERP Observer
  erpObserver: {
    // Forçar coleta de contexto
    collect: publicProcedure.mutation(async () => {
      try {
        const context = await leoErpObserver.collectErpContext();
        return {
          success: true,
          data: context,
          message: 'Contexto do ERP coletado com sucesso',
        };
      } catch (error) {
        console.error('[LeoAdmin] Erro ao coletar contexto ERP:', error);
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Erro ao coletar contexto ERP',
        };
      }
    }),

    // Obter último contexto
    lastContext: publicProcedure.query(async () => {
      try {
        const context = await leoErpObserver.getLastContext();
        return {
          success: true,
          data: context,
        };
      } catch (error) {
        console.error('[LeoAdmin] Erro ao obter último contexto ERP:', error);
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Erro ao obter último contexto ERP',
        };
      }
    }),
  },

  // Gerenciar Eventos
  events: {
    // Gerar eventos automáticos
    generateAuto: publicProcedure.mutation(async () => {
      try {
        const result = await leoEvents.gerarEventosAutomaticos();
        return {
          success: result.success,
          message: result.message,
          data: result,
        };
      } catch (error) {
        console.error('[LeoAdmin] Erro ao gerar eventos automáticos:', error);
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Erro ao gerar eventos automáticos',
        };
      }
    }),

    // Estatísticas de eventos
    stats: publicProcedure.query(async () => {
      try {
        const stats = await leoEvents.getEstatisticas();
        return {
          success: true,
          data: stats,
        };
      } catch (error) {
        console.error('[LeoAdmin] Erro ao obter estatísticas de eventos:', error);
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Erro ao obter estatísticas de eventos',
        };
      }
    }),
  },

  // Gerenciar Automação
  automation: {
    // Iniciar automação
    start: publicProcedure.mutation(async () => {
      try {
        const result = await leoAutomation.iniciarAutomacao();
        return {
          success: result.success,
          message: result.message,
        };
      } catch (error) {
        console.error('[LeoAdmin] Erro ao iniciar automação:', error);
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Erro ao iniciar automação',
        };
      }
    }),

    // Parar automação
    stop: publicProcedure.mutation(async () => {
      try {
        const result = await leoAutomation.pararAutomacao();
        return {
          success: result.success,
          message: result.message,
        };
      } catch (error) {
        console.error('[LeoAdmin] Erro ao parar automação:', error);
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Erro ao parar automação',
        };
      }
    }),

    // Estatísticas de automação
    stats: publicProcedure.query(async () => {
      try {
        const stats = await leoAutomation.getEstatisticas();
        return {
          success: true,
          data: stats,
        };
      } catch (error) {
        console.error('[LeoAdmin] Erro ao obter estatísticas de automação:', error);
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Erro ao obter estatísticas de automação',
        };
      }
    }),
  },

  // Ações de Emergência
  emergency: {
    // Parar tudo (modo de emergência)
    stopAll: publicProcedure.mutation(async () => {
      try {
        console.log('🚨 MODO DE EMERGÊNCIA - Parando todos os sistemas do Leo...');
        
        const results: { success: boolean; message: string; component: string }[] = [];

        // Parar loop cognitivo
        try {
          await leoLoop.stopLeoLoop();
          results.push({ success: true, message: 'Loop parado', component: 'loop' });
        } catch (error) {
          results.push({ success: false, message: error instanceof Error ? error.message : 'Erro', component: 'loop' });
        }

        // Desativar modo operador
        try {
          await leoOperatorMode.desativarModoOperador();
          results.push({ success: true, message: 'Modo operador desativado', component: 'operator' });
        } catch (error) {
          results.push({ success: false, message: error instanceof Error ? error.message : 'Erro', component: 'operator' });
        }

        // Parar automação
        try {
          const automationResult = await leoAutomation.pararAutomacao();
          results.push({ success: automationResult.success, message: automationResult.message || 'Automação parada', component: 'automation' });
        } catch (error) {
          results.push({ success: false, message: error instanceof Error ? error.message : 'Erro', component: 'automation' });
        }

        // Parar monitoramento
        try {
          const monitorResult = await leoSystemMonitor.pararMonitoramento();
          results.push({ success: monitorResult.success, message: monitorResult.message || 'Monitoramento parado', component: 'monitor' });
        } catch (error) {
          results.push({ success: false, message: error instanceof Error ? error.message : 'Erro', component: 'monitor' });
        }

        const success = results.every(r => Object.values(r)[0] === true);
        
        return {
          success,
          message: success 
            ? 'Todos os sistemas do Leo foram parados com sucesso' 
            : 'Alguns sistemas não puderam ser parados',
          data: { results },
        };
      } catch (error) {
        console.error('[LeoAdmin] Erro crítico no modo de emergência:', error);
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Erro crítico no modo de emergência',
        };
      }
    }),

    // Reiniciar tudo
    restartAll: publicProcedure.mutation(async () => {
      try {
        console.log('🔄 Reiniciando todos os sistemas do Leo...');
        
        // Primeiro parar tudo
        await leoLoop.stopLeoLoop();
        
        // Esperar um pouco
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Reiniciar loop
        await leoLoop.startLeoLoop(5000);
        
        return {
          success: true,
          message: 'Sistema reiniciado com sucesso',
        };
      } catch (error) {
        console.error('[LeoAdmin] Erro ao reiniciar sistemas:', error);
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Erro ao reiniciar sistemas',
        };
      }
    }),
  },
});
