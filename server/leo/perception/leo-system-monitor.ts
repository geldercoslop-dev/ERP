/**
 * Monitoramento do Sistema do LEO
 * 
 * Leo vira monitor do sistema, verificando:
 * - servidor
 * - banco de dados
 * - uso de CPU
 * - uso de memória
 * - logs
 */

import { databaseHealthTool } from '../../tools/database-health.tool.js';
import { insertLeoActionLog } from '../../services/ai/leo-action-logger.js';
import { leoEvents } from '../memory/leo-events.js';
import { performance } from 'perf_hooks';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface SystemStatus {
  servidor: {
    online: boolean;
    uptime: number;
    memoria: NodeJS.MemoryUsage;
    cpu: {
      uso: number;
      loadAverage: number[];
    };
    disco: {
      total: number;
      livre: number;
      usado: number;
    };
  };
  banco: {
    conectado: boolean;
    tempoResposta: number;
    totalConexoes?: number;
  };
  aplicacao: {
    errosRecentes: number;
    alertasAtivos: number;
    ultimaAtividade: Date;
  };
  timestamp: Date;
}

export interface LogEntry {
  timestamp: Date;
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  source?: string;
}

export interface AlertLevel {
  tipo: 'performance' | 'disponibilidade' | 'erro' | 'recurso';
  mensagem: string;
  severidade: 'baixa' | 'media' | 'alta' | 'critica';
  dados?: Record<string, unknown>;
}

/**
 * Classe para monitoramento do sistema pelo Leo
 */
export class LeoSystemMonitor {
  private static instance: LeoSystemMonitor;
  private isMonitoring: boolean = false;
  private monitoringInterval?: NodeJS.Timeout;
  private lastStatus: SystemStatus | null = null;

  private constructor() {}

  public static getInstance(): LeoSystemMonitor {
    if (!LeoSystemMonitor.instance) {
      LeoSystemMonitor.instance = new LeoSystemMonitor();
    }
    return LeoSystemMonitor.instance;
  }

  /**
   * Inicia monitoramento contínuo
   */
  async iniciarMonitoramento(intervaloMs: number = 10000): Promise<{ success: boolean; message: string }> {
    if (this.isMonitoring) {
      return {
        success: false,
        message: 'Monitoramento já está ativo',
      };
    }

    try {
      console.log(`[LeoSystemMonitor] Iniciando monitoramento a cada ${intervaloMs}ms`);
      
      this.isMonitoring = true;
      
      // Executar primeira verificação
      await this.verificarSistema();
      
      // Configurar verificação periódica
      this.monitoringInterval = setInterval(async () => {
        try {
          await this.verificarSistema();
        } catch (error) {
          console.error('[LeoSystemMonitor] Erro na verificação periódica:', error);
        }
      }, intervaloMs);

      return {
        success: true,
        message: `Monitoramento iniciado (intervalo: ${intervaloMs}ms)`,
      };
    } catch (error) {
      console.error('[LeoSystemMonitor] Erro ao iniciar monitoramento:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao iniciar monitoramento',
      };
    }
  }

  /**
   * Para monitoramento contínuo
   */
  pararMonitoramento(): { success: boolean; message: string } {
    if (!this.isMonitoring) {
      return {
        success: false,
        message: 'Monitoramento não está ativo',
      };
    }

    try {
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = undefined;
      }

      this.isMonitoring = false;
      console.log('[LeoSystemMonitor] Monitoramento parado');

      return {
        success: true,
        message: 'Monitoramento parado com sucesso',
      };
    } catch (error) {
      console.error('[LeoSystemMonitor] Erro ao parar monitoramento:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao parar monitoramento',
      };
    }
  }

  /**
   * Verificação completa do sistema
   */
  async verificarSistema(): Promise<SystemStatus> {
    const startTime = performance.now();

    try {
      console.log('[LeoSystemMonitor] Executando verificação do sistema');

      // Verificar status do servidor
      const servidor = await this.verificarServidor();
      
      // Verificar banco de dados
      const banco = await this.verificarBanco();
      
      // Verificar aplicação
      const aplicacao = await this.verificarAplicacao();
      
      const status: SystemStatus = {
        servidor,
        banco,
        aplicacao,
        timestamp: new Date(),
      };

      // Analisar mudanças e gerar alertas
      await this.analisarMudancas(status);
      
      // Verificar limites críticos
      await this.verificarLimitesCriticos(status);

      this.lastStatus = status;
      
      const tempoExecucao = performance.now() - startTime;
      console.log(`[LeoSystemMonitor] Verificação concluída em ${tempoExecucao.toFixed(2)}ms`);

      return status;
    } catch (error) {
      console.error('[LeoSystemMonitor] Erro na verificação do sistema:', error);
      
      // Status de fallback
      return {
        servidor: {
          online: false,
          uptime: 0,
          memoria: process.memoryUsage(),
          cpu: { uso: 0, loadAverage: [0, 0, 0] },
          disco: { total: 0, livre: 0, usado: 0 },
        },
        banco: {
          conectado: false,
          tempoResposta: -1,
        },
        aplicacao: {
          errosRecentes: 0,
          alertasAtivos: 0,
          ultimaAtividade: new Date(),
        },
        timestamp: new Date(),
      };
    }
  }

  /**
   * Verifica status do servidor
   */
  private async verificarServidor(): Promise<SystemStatus['servidor']> {
    try {
      // Uso de memória
      const memoria = process.memoryUsage();
      
      // Uso de CPU (aproximado)
      const cpuUsage = process.cpuUsage();
      const cpuUso = this.calcularUsoCpu(cpuUsage);
      
      // Load average
      const loadAverage = require('os').loadavg();
      
      // Espaço em disco
      const disco = await this.verificarEspacoDisco();

      return {
        online: true,
        uptime: process.uptime(),
        memoria,
        cpu: {
          uso: cpuUso,
          loadAverage,
        },
        disco,
      };
    } catch (error) {
      console.error('[LeoSystemMonitor] Erro ao verificar servidor:', error);
      return {
        online: false,
        uptime: 0,
        memoria: process.memoryUsage(),
        cpu: { uso: 0, loadAverage: [0, 0, 0] },
        disco: { total: 0, livre: 0, usado: 0 },
      };
    }
  }

  /**
   * Verifica status do banco de dados
   */
  private async verificarBanco(): Promise<SystemStatus['banco']> {
    const startTime = performance.now();

    try {
      const ping = await databaseHealthTool.pingSystem();

      if (!ping.ok) {
        return {
          conectado: false,
          tempoResposta: ping.latencyMs,
        };
      }

      const tempoResposta = ping.latencyMs;

      return {
        conectado: true,
        tempoResposta,
        totalConexoes: ping.threadsConnected,
      };
    } catch (error) {
      console.error('[LeoSystemMonitor] Erro ao verificar banco:', error);
      return {
        conectado: false,
        tempoResposta: performance.now() - startTime,
      };
    }
  }

  /**
   * Verifica status da aplicação
   */
  private async verificarAplicacao(): Promise<SystemStatus['aplicacao']> {
    try {
      // Contar erros recentes (última hora)
      const errosRecentes = await this.contarErrosRecentes();
      
      // Contar alertas ativos
      const alertasAtivos = await this.contarAlertasAtivos();
      
      // Última atividade (baseado em logs)
      const ultimaAtividade = await this.obterUltimaAtividade();

      return {
        errosRecentes,
        alertasAtivos,
        ultimaAtividade,
      };
    } catch (error) {
      console.error('[LeoSystemMonitor] Erro ao verificar aplicação:', error);
      return {
        errosRecentes: 0,
        alertasAtivos: 0,
        ultimaAtividade: new Date(),
      };
    }
  }

  /**
   * Analisa mudanças em relação ao status anterior
   */
  private async analisarMudancas(statusAtual: SystemStatus): Promise<void> {
    if (!this.lastStatus) return;

    const mudancas: AlertLevel[] = [];

    // Verificar se o servidor ficou offline
    if (this.lastStatus.servidor.online && !statusAtual.servidor.online) {
      mudancas.push({
        tipo: 'disponibilidade',
        mensagem: 'Servidor ficou offline',
        severidade: 'critica',
      });
    }

    // Verificar se o banco desconectou
    if (this.lastStatus.banco.conectado && !statusAtual.banco.conectado) {
      mudancas.push({
        tipo: 'disponibilidade',
        mensagem: 'Banco de dados desconectado',
        severidade: 'critica',
      });
    }

    // Verificar aumento drástico de erros
    if (statusAtual.aplicacao.errosRecentes > this.lastStatus.aplicacao.errosRecentes * 2) {
      mudancas.push({
        tipo: 'erro',
        mensagem: `Aumento de erros: ${this.lastStatus.aplicacao.errosRecentes} → ${statusAtual.aplicacao.errosRecentes}`,
        severidade: 'alta',
      });
    }

    // Gerar eventos para mudanças críticas
    for (const mudanca of mudancas) {
      await leoEvents.registerEvent({
        tipo: 'erro_sistema',
        descricao: mudanca.mensagem,
        prioridade: mudanca.severidade === 'critica' ? 'critica' : 'alta',
        dados: mudanca.dados,
        usuarioCriador: 'leo',
      });
    }
  }

  /**
   * Verifica limites críticos e gera alertas
   */
  private async verificarLimitesCriticos(status: SystemStatus): Promise<void> {
    const alertas: AlertLevel[] = [];
    let shouldReduceFrequency = false;

    // Verificar uso de memória (> 80% para alerta, > 90% para crítico)
    const memTotal = require('os').totalmem();
    const memPercent = (status.servidor.memoria.heapUsed / memTotal) * 100;
    if (memPercent > 90) {
      alertas.push({
        tipo: 'recurso',
        mensagem: `Uso de memória crítico: ${memPercent.toFixed(1)}%`,
        severidade: 'critica',
        dados: { memoria: status.servidor.memoria, percentual: memPercent },
      });
      shouldReduceFrequency = true;
    } else if (memPercent > 80) {
      alertas.push({
        tipo: 'recurso',
        mensagem: `Uso de memória alto: ${memPercent.toFixed(1)}%`,
        severidade: 'alta',
        dados: { memoria: status.servidor.memoria, percentual: memPercent },
      });
      shouldReduceFrequency = true;
    }

    // Verificar CPU (> 80%)
    if (status.servidor.cpu.uso > 80) {
      alertas.push({
        tipo: 'performance',
        mensagem: `Uso de CPU alto: ${status.servidor.cpu.uso.toFixed(1)}%`,
        severidade: 'alta',
        dados: { cpu: status.servidor.cpu },
      });
      shouldReduceFrequency = true;
    }

    // Se recursos críticos, reduzir frequência do loop
    if (shouldReduceFrequency) {
      await this.reduceLoopFrequency();
    }

    // Verificar disco (> 90%)
    const discoPercent = (status.servidor.disco.usado / status.servidor.disco.total) * 100;
    if (discoPercent > 90) {
      alertas.push({
        tipo: 'recurso',
        mensagem: `Espaço em disco crítico: ${discoPercent.toFixed(1)}%`,
        severidade: 'critica',
        dados: { disco: status.servidor.disco, percentual: discoPercent },
      });
    }

    // Verificar tempo de resposta do banco (> 5s)
    if (status.banco.tempoResposta > 5000) {
      alertas.push({
        tipo: 'performance',
        mensagem: `Banco lento: ${status.banco.tempoResposta.toFixed(0)}ms`,
        severidade: 'alta',
        dados: { tempoResposta: status.banco.tempoResposta },
      });
    }

    // Gerar eventos para alertas
    for (const alerta of alertas) {
      await leoEvents.registerEvent({
        tipo: 'erro_sistema',
        descricao: alerta.mensagem,
        prioridade: alerta.severidade,
        dados: alerta.dados,
        usuarioCriador: 'leo',
      });
    }
  }

  /**
   * Reduz frequência do loop cognitivo quando recursos estão altos
   */
  private async reduceLoopFrequency(): Promise<void> {
    try {
      // Pausar novas tasks por 30 segundos
      const { leoSupervisor } = await import('../engine/leo-supervisor.js');
      await leoSupervisor.pauseExecution('Recursos do sistema elevados - reduzindo frequência', 0.5); // 30 segundos

      // Notificar sobre a redução de frequência
      await leoEvents.registerEvent({
        tipo: 'erro_sistema',
        descricao: 'Frequência do loop reduzida devido ao alto uso de recursos',
        prioridade: 'media',
        dados: {
          action: 'frequency_reduction',
          pauseDuration: 30,
          reason: 'High resource usage',
        },
        usuarioCriador: 'leo-system-monitor',
      });

      console.warn('[LeoSystemMonitor] ⚡ Frequência do loop reduzida por 30 segundos devido ao alto uso de recursos');
    } catch (error) {
      console.error('[LeoSystemMonitor] Erro ao reduzir frequência do loop:', error);
    }
  }

  /**
   * Calcula uso de CPU (aproximado)
   */
  private calcularUsoCpu(cpuUsage: NodeJS.CpuUsage): number {
    // Simplificação - em produção usar biblioteca específica
    const total = cpuUsage.user + cpuUsage.system;
    return Math.min(total / 1000000, 100); // Convertir para porcentagem
  }

  /**
   * Verifica espaço em disco
   */
  private async verificarEspacoDisco(): Promise<{ total: number; livre: number; usado: number }> {
    try {
      const fs = require('fs');
      const stats = fs.statSync(process.cwd());
      
      // Simplificação - em produção usar biblioteca específica
      return {
        total: 1000000000000, // 1TB (placeholder)
        livre: 500000000000,  // 500GB (placeholder)
        usado: 500000000000,  // 500GB (placeholder)
      };
    } catch (error) {
      return { total: 0, livre: 0, usado: 0 };
    }
  }

  /**
   * Conta erros recentes dos logs
   */
  private async contarErrosRecentes(): Promise<number> {
    try {
      // Simulação - em produção analisar arquivos de log
      return Math.floor(Math.random() * 10);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Conta alertas ativos
   */
  private async contarAlertasAtivos(): Promise<number> {
    try {
      const resultado = await leoEvents.listarEventos({ status: 'aberto', limit: 1000 });
      return resultado.eventos?.length || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Obtém última atividade registrada
   */
  private async obterUltimaAtividade(): Promise<Date> {
    try {
      return new Date();
    } catch (error) {
      return new Date();
    }
  }

  /**
   * Obtém logs recentes
   */
  async getLogsRecentes(limite: number = 100): Promise<LogEntry[]> {
    try {
      // Simulação - em produção ler arquivos de log reais
      const logs: LogEntry[] = [];
      
      for (let i = 0; i < Math.min(limite, 20); i++) {
        const timestamp = new Date(Date.now() - i * 60000);
        const levels: Array<'error' | 'warn' | 'info' | 'debug'> = ['error', 'warn', 'info', 'debug'];
        const level = levels[Math.floor(Math.random() * levels.length)];
        
        logs.push({
          timestamp,
          level,
          message: `Log de exemplo ${level} #${i}`,
          source: 'leo-system-monitor',
        });
      }

      return logs.reverse(); // Mais recentes primeiro
    } catch (error) {
      console.error('[LeoSystemMonitor] Erro ao obter logs:', error);
      return [];
    }
  }

  /**
   * Verifica se o monitoramento está ativo
   */
  isMonitoramentoAtivo(): boolean {
    return this.isMonitoring;
  }

  /**
   * Obtém último status conhecido
   */
  getUltimoStatus(): SystemStatus | null {
    return this.lastStatus;
  }

  /**
   * Gera relatório de saúde do sistema
   */
  async gerarRelatorioSaude(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    score: number;
    detalhes: SystemStatus;
    recomendacoes: string[];
  }> {
    const status = await this.verificarSistema();
    
    let score = 100;
    const recomendacoes: string[] = [];

    // Avaliar servidor
    if (!status.servidor.online) {
      score -= 50;
      recomendacoes.push('Servidor está offline - verificar imediatamente');
    }

    // Avaliar banco
    if (!status.banco.conectado) {
      score -= 40;
      recomendacoes.push('Banco de dados desconectado - verificar conexão');
    } else if (status.banco.tempoResposta > 1000) {
      score -= 20;
      recomendacoes.push('Banco de dados lento - otimizar queries ou aumentar recursos');
    }

    // Avaliar memória
    const memTotal = require('os').totalmem();
    const memPercent = (status.servidor.memoria.heapUsed / memTotal) * 100;
    if (memPercent > 90) {
      score -= 30;
      recomendacoes.push('Uso de memória crítico - reiniciar serviço ou aumentar RAM');
    } else if (memPercent > 80) {
      score -= 15;
      recomendacoes.push('Uso de memória alto - monitorar e otimizar');
    }

    // Avaliar erros
    if (status.aplicacao.errosRecentes > 10) {
      score -= 25;
      recomendacoes.push('Muitos erros recentes - investigar causas');
    }

    // Avaliar alertas
    if (status.aplicacao.alertasAtivos > 20) {
      score -= 10;
      recomendacoes.push('Muitos alertas ativos - priorizar resolução');
    }

    // Determinar status geral
    let statusGeral: 'healthy' | 'warning' | 'critical';
    if (score >= 80) {
      statusGeral = 'healthy';
    } else if (score >= 50) {
      statusGeral = 'warning';
    } else {
      statusGeral = 'critical';
    }

    return {
      status: statusGeral,
      score: Math.max(0, score),
      detalhes: status,
      recomendacoes,
    };
  }
}

// Exportar instância singleton
export const leoSystemMonitor = LeoSystemMonitor.getInstance();
