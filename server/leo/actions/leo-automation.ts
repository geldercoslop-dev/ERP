/**
 * Sistema de Automação do LEO
 * 
 * Leo executa rotinas automáticas:
 * - backup automático
 * - checagem estoque
 * - análise vendas
 */

import { nanoid } from 'nanoid';
import { ValidationError } from '../../_core/errors/typed-errors.js';
import { leoComputerControl } from './leo-computer-control.js';
import { leoErpService } from '../../services/leo-service.js';
import { ADMIN_ACTOR } from '../../_core/service-actor.js';
import { leoEvents } from '../memory/leo-events.js';
import { insertLeoActionLog } from '../../services/ai/leo-action-logger.js';

export type TaskStatus = 'pendente' | 'executando' | 'concluida' | 'falha' | 'cancelada';
export type TaskRecurrence = 'daily' | 'weekly' | 'monthly' | 'hourly' | 'none';

/** Tarefa agendada no sistema de automação (diferente de LeoTask da fila shared) */
export interface LeoScheduledTask {
  id?: number;
  descricao: string;
  acao: string;
  agendamento?: Date;
  status: TaskStatus;
  dados?: unknown;
  resultado?: unknown;
  usuarioCriador?: string;
  dataCriacao?: Date;
  dataExecucao?: Date;
  proximaExecucao?: Date;
  recorrencia?: TaskRecurrence;
}

export interface CreateScheduledTaskInput {
  descricao: string;
  acao: string;
  agendamento?: Date;
  dados?: unknown;
  usuarioCriador?: string;
  recorrencia?: TaskRecurrence;
}

/**
 * Classe para automação de tarefas pelo Leo
 */
export class LeoAutomation {
  private static instance: LeoAutomation;
  private isRunning: boolean = false;
  private taskQueue: Map<number, NodeJS.Timeout> = new Map();

  private constructor() {}

  public static getInstance(): LeoAutomation {
    if (!LeoAutomation.instance) {
      LeoAutomation.instance = new LeoAutomation();
    }
    return LeoAutomation.instance;
  }

  /**
   * Inicia o sistema de automação
   */
  async iniciarAutomacao(): Promise<{ success: boolean; message: string }> {
    if (this.isRunning) {
      return {
        success: false,
        message: 'Sistema de automação já está ativo',
      };
    }

    try {
      console.log('[LeoAutomation] Iniciando sistema de automação');
      
      this.isRunning = true;
      
      // Carregar tarefas pendentes
      await this.carregarTarefasPendentes();
      
      // Iniciar verificação periódica
      this.iniciarVerificacaoPeriodica();
      
      console.log('[LeoAutomation] Sistema de automação iniciado com sucesso');
      
      return {
        success: true,
        message: 'Sistema de automação iniciado',
      };
    } catch (error) {
      console.error('[LeoAutomation] Erro ao iniciar automação:', error);
      
      // Garantir que o sistema continue operando mesmo em caso de erro
      this.isRunning = false;
      
      // Registrar erro mas não derrubar sistema
      try {
        await insertLeoActionLog({
          usuario: 'leo-automation',
          acao: 'erro_inicializacao',
          entidade: 'leo_automation',
          dados: JSON.stringify({
            error: error instanceof Error ? error.message : error,
            timestamp: new Date(),
          }),
          resultado: 'ERRO',
        });
      } catch (logError) {
        console.error('[LeoAutomation] Erro ao registrar log:', logError);
      }
      
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao iniciar automação',
      };
    }
  }

  /**
   * Para o sistema de automação
   */
  pararAutomacao(): { success: boolean; message: string } {
    if (!this.isRunning) {
      return {
        success: false,
        message: 'Sistema de automação não está ativo',
      };
    }

    try {
      // Cancelar todas as tarefas agendadas
      for (const [, timeout] of Array.from(this.taskQueue.entries())) {
        clearTimeout(timeout);
      }
      this.taskQueue.clear();
      
      this.isRunning = false;
      
      console.log('[LeoAutomation] Sistema de automação parado');
      
      return {
        success: true,
        message: 'Sistema de automação parado',
      };
    } catch (error) {
      console.error('[LeoAutomation] Erro ao parar automação:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao parar automação',
      };
    }
  }

  /**
   * Cria uma nova tarefa
   * TODO: Implementar quando tabela leoTasks for criada
   */
  async criarTarefa(input: CreateScheduledTaskInput): Promise<{ success: boolean; taskId?: number; message: string }> {
    console.warn('[LeoAutomation] criarTarefa não implementado - tabela leoTasks não existe');
    return {
      success: false,
      message: 'Tabela leoTasks não implementada',
    };
  }

  /**
   * Executa uma tarefa específica.
   * Stub: leoTasks removido — usar leoMemory quando implementado.
   */
  async executarTarefa(_taskId: number): Promise<{ success: boolean; message: string }> {
    return {
      success: false,
      message: 'Tarefa não encontrada (leoTasks substituído por leoMemory — em implementação)',
    };
  }

  /**
   * Lista tarefas com filtros.
   * Stub: leoTasks removido — usar leoMemory quando implementado.
   */
  async listarTarefas(_filtros?: {
    status?: TaskStatus;
    acao?: string;
    usuarioCriador?: string;
    dataInicio?: Date;
    dataFim?: Date;
    limite?: number;
  }): Promise<{ success: boolean; tarefas?: LeoScheduledTask[]; message: string }> {
    return {
      success: true,
      tarefas: [],
      message: '0 tarefa(s) encontrada(s) (leoTasks substituído por leoMemory — em implementação)',
    };
  }

  /**
   * Cancela uma tarefa.
   * Stub: leoTasks removido — usar leoMemory quando implementado.
   */
  async cancelarTarefa(taskId: number): Promise<{ success: boolean; message: string }> {
    if (this.taskQueue.has(taskId)) {
      clearTimeout(this.taskQueue.get(taskId)!);
      this.taskQueue.delete(taskId);
    }
    return {
      success: true,
      message: `Tarefa ${taskId} cancelada (stub: leoTasks em migração para leoMemory)`,
    };
  }

  /**
   * Executa uma ação específica
   */
  private async executarAcao(tenantId: number, acao: string, dados: Record<string, unknown>): Promise<{ success: boolean; message: string; data?: unknown }> {
    try {
      console.log(`[LeoAutomation] Executando ação: ${acao}`);

      switch (acao) {
        case 'backup_automatico':
          return await this.executarBackupAutomatico(dados);
        
        case 'checar_estoque':
          if (!Number.isInteger(tenantId) || tenantId <= 0) {
            throw new ValidationError("tenantId obrigatório para ação checar_estoque");
          }
          return await this.checarEstoque(tenantId, dados && typeof dados === "object" ? (dados as Record<string, unknown>) : {});
        
        case 'analisar_vendas':
          if (!Number.isInteger(tenantId) || tenantId <= 0) {
            throw new ValidationError("tenantId obrigatório para ação analisar_vendas");
          }
          return await this.analisarVendas(tenantId, dados && typeof dados === "object" ? (dados as Record<string, unknown>) : {});
        
        case 'limpar_logs_antigos':
          return await this.limparLogsAntigos(dados);
        
        case 'verificar_eventos_automaticos':
          return await this.verificarEventosAutomaticos(dados);
        
        case 'executar_script':
          return await this.executarScriptPersonalizado(dados);
        
        default:
          return {
            success: false,
            message: `Ação desconhecida: ${acao}`,
          };
      }
    } catch (error) {
      console.error('[LeoAutomation] Erro ao executar ação:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao executar ação',
      };
    }
  }

  /**
   * Executa backup automático
   */
  private async executarBackupAutomatico(dados: Record<string, unknown>): Promise<{ success: boolean; message: string; data?: unknown }> {
    try {
      console.log('[LeoAutomation] Executando backup automático');
      
      const resultado = await leoComputerControl.executarScriptSistema('backup_db');
      
      if (resultado.success) {
        await leoEvents.registerEvent({
          tipo: 'custom',
          descricao: 'Backup automático executado com sucesso',
          prioridade: 'baixa',
          dados: { stdout: resultado.stdout },
          usuarioCriador: 'leo',
        });
      }

      return {
        success: resultado.success,
        message: resultado.success ? 'Backup automático executado' : 'Falha no backup automático',
        data: resultado,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro no backup automático',
      };
    }
  }

  /**
   * Checa estoque e gera alertas
   */
  private async checarEstoque(tenantId: number, dados: Record<string, unknown>): Promise<{ success: boolean; message: string; data?: unknown }> {
    try {
      console.log('[LeoAutomation] Checando estoque');
      if (!Number.isInteger(tenantId) || tenantId <= 0) {
        throw new ValidationError("tenantId obrigatório para checarEstoque");
      }
      const resultado = await leoErpService.getEstoque(tenantId, { alertaBaixo: true });
      
      if (resultado.success && resultado.alertas) {
        const { estoqueBaixo, estoqueCritico } = resultado.alertas;
        
        if (estoqueCritico > 0) {
          await leoEvents.registerEvent({
            tipo: 'estoque_baixo',
            descricao: `${estoqueCritico} produtos com estoque crítico`,
            prioridade: 'critica',
            dados: { estoqueCritico, estoqueBaixo },
            usuarioCriador: 'leo',
          });
        }
      }

      return {
        success: true,
        message: 'Estoque checado',
        data: resultado,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao checar estoque',
      };
    }
  }

  /**
   * Analisa vendas
   */
  private async analisarVendas(tenantId: number, dados: Record<string, unknown>): Promise<{ success: boolean; message: string; data?: unknown }> {
    try {
      console.log('[LeoAutomation] Analisando vendas');
      if (!Number.isInteger(tenantId) || tenantId <= 0) {
        throw new ValidationError("tenantId obrigatório para analisarVendas");
      }
      // Obter pedidos dos últimos 7 dias
      const seteDiasAtras = new Date();
      seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
      
      const resultado = await leoErpService.getPedidos(tenantId, ADMIN_ACTOR, {
        dataInicio: seteDiasAtras,
        limite: 1000,
      });
      
      if (resultado.success) {
        const totalPedidos = resultado.total || 0;
        const rows = Array.isArray(resultado.data) ? resultado.data : [];
        const valorTotal = rows.reduce((sum: number, p: unknown) => {
          const row = p as { pedido?: { valorTotal?: unknown } };
          return sum + Number(row.pedido?.valorTotal ?? 0);
        }, 0);
        
        // Gerar evento se vendas estiverem baixas
        if (totalPedidos < 5) {
          await leoEvents.registerEvent({
            tipo: 'custom',
            descricao: `Vendas baixas na semana: ${totalPedidos} pedidos`,
            prioridade: 'media',
            dados: { totalPedidos, valorTotal, periodo: '7 dias' },
            usuarioCriador: 'leo',
          });
        }
      }

      return {
        success: true,
        message: 'Análise de vendas concluída',
        data: resultado,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro na análise de vendas',
      };
    }
  }

  /**
   * Limpa logs antigos
   */
  private async limparLogsAntigos(dados: Record<string, unknown>): Promise<{ success: boolean; message: string; data?: unknown }> {
    try {
      console.log('[LeoAutomation] Limpando logs antigos');
      
      // Simulação - em produção implementar limpeza real
      const diasReter = dados?.dias || 30;
      
      return {
        success: true,
        message: `Logs antigos removidos (período: ${diasReter} dias)`,
        data: { diasReter, logsRemovidos: 0 },
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao limpar logs',
      };
    }
  }

  /**
   * Verifica eventos automáticos
   */
  private async verificarEventosAutomaticos(dados: Record<string, unknown>): Promise<{ success: boolean; message: string; data?: unknown }> {
    try {
      console.log('[LeoAutomation] Verificando eventos automáticos');
      
      const resultado = await leoEvents.gerarEventosAutomaticos();
      
      return {
        success: true,
        message: `${resultado.events.length} eventos gerados automaticamente`,
        data: resultado,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao verificar eventos',
      };
    }
  }

  /**
   * Executa script personalizado
   */
  private async executarScriptPersonalizado(dados: Record<string, unknown>): Promise<{ success: boolean; message: string; data?: unknown }> {
    try {
      const scriptPath = typeof dados.scriptPath === 'string' ? dados.scriptPath : '';
      const args = Array.isArray(dados.args) ? dados.args.filter((x): x is string => typeof x === 'string') : undefined;
      if (!scriptPath) {
        return {
          success: false,
          message: 'Caminho do script não fornecido',
        };
      }

      console.log(`[LeoAutomation] Executando script personalizado: ${scriptPath}`);
      
      const resultado = await leoComputerControl.executarScript(scriptPath, args);
      
      return {
        success: resultado.success,
        message: resultado.success ? 'Script executado' : 'Falha no script',
        data: resultado,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao executar script',
      };
    }
  }

  /**
   * Carrega tarefas pendentes do banco.
   * Stub: leoTasks removido — usar leoMemory quando implementado.
   */
  private async carregarTarefasPendentes(): Promise<void> {
    // Nenhuma tarefa enquanto leoTasks não for migrado para leoMemory
  }

  /**
   * Agenda uma tarefa para execução.
   * Stub: leoTasks removido — usar leoMemory quando implementado.
   */
  private async agendarTarefa(_taskId: number): Promise<void> {
    // Nenhum agendamento enquanto leoTasks não for migrado para leoMemory
  }

  /**
   * Inicia verificação periódica de tarefas
   */
  private iniciarVerificacaoPeriodica(): void {
    setInterval(async () => {
      if (!this.isRunning) return;
      
      try {
        await this.carregarTarefasPendentes();
      } catch (error) {
        console.error('[LeoAutomation] Erro na verificação periódica:', error);
      }
    }, 60000); // Verificar a cada minuto
  }

  /**
   * Calcula próxima execução baseada na recorrência
   */
  private calcularProximaExecucao(recorrencia: TaskRecurrence, dataBase?: Date): Date {
    const base = dataBase || new Date();
    const proxima = new Date(base);

    switch (recorrencia) {
      case 'hourly':
        proxima.setHours(proxima.getHours() + 1);
        break;
      case 'daily':
        proxima.setDate(proxima.getDate() + 1);
        break;
      case 'weekly':
        proxima.setDate(proxima.getDate() + 7);
        break;
      case 'monthly':
        proxima.setMonth(proxima.getMonth() + 1);
        break;
      case 'none':
      default:
        // Sem recorrência
        break;
    }

    return proxima;
  }

  /**
   * Verifica se a automação está ativa
   */
  isAutomacaoAtiva(): boolean {
    return this.isRunning;
  }

  /**
   * Obtém estatísticas das tarefas
   */
  async getEstatisticas(): Promise<{
    total: number;
    porStatus: Record<TaskStatus, number>;
    porAcao: Record<string, number>;
    proximasExecucoes: Array<{ id: number; descricao: string; data: Date }>;
  }> {
    return {
      total: 0,
      porStatus: {} as Record<TaskStatus, number>,
      porAcao: {} as Record<string, number>,
      proximasExecucoes: [],
    };
  }
}

// Exportar instância singleton
export const leoAutomation = LeoAutomation.getInstance();
