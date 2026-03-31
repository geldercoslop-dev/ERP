/**
 * System Observer para o LEO
 * 
 * Monitora o estado geral do sistema (saúde, performance, erros)
 * permitindo que o LEO responda perguntas sobre o status do ERP.
 */

import { SystemMonitorService, SystemHealth } from '../system-monitor.js';
import { logger } from '../../utils/logger.js';

export type SystemSummary = {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: string;
  load: string;
  errorsLastHour: number;
  slowQueries: number;
  healthScore: number;
};

export class SystemObserver {
  private static monitor = SystemMonitorService.getInstance();

  /**
   * Obtém um resumo de saúde do sistema formatado para o LEO.
   */
  public static async getSummary(): Promise<SystemSummary> {
    try {
      const health: SystemHealth = await this.monitor.getSystemHealth();
      
      // Cálculo simplificado de score (0 a 100)
      let score = 100;
      if (health.status === 'degraded') score -= 20;
      if (health.status === 'unhealthy') score -= 50;
      
      // Penalizar por erros e performance
      const performance = health.performance;
      const errorRate = performance.errors?.rate || 0;
      score -= Math.min(30, errorRate * 100);
      
      return {
        status: health.status,
        uptime: this.formatUptime(health.uptime),
        load: `${(health.system.node.cpu.usage * 100).toFixed(1)}%`,
        errorsLastHour: performance.errors?.total || 0,
        slowQueries: 0, // Placeholder se não houver no monitor
        healthScore: Math.max(0, Math.round(score))
      };
    } catch (error) {
      console.error('Erro ao obter resumo do sistema para o LEO:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Responde perguntas do LEO sobre o sistema.
   */
  public static async answerHealthQuery(): Promise<string> {
    const summary = await this.getSummary();
    
    const statusMap = {
      healthy: '✅ Tudo certo com o sistema!',
      degraded: '⚠️ O sistema está operando, mas com alguma degradação de performance.',
      unhealthy: '❌ O sistema está com problemas críticos agora.'
    };

    let msg = `${statusMap[summary.status]}\n`;
    msg += `Health Score: ${summary.healthScore}/100\n`;
    msg += `Uptime: ${summary.uptime}\n`;
    msg += `Carga: ${summary.load}\n`;
    
    if (summary.errorsLastHour > 0) {
      msg += `Tivemos ${summary.errorsLastHour} erro(s) na última hora. `;
    }
    
    if (summary.slowQueries > 0) {
      msg += `Existem ${summary.slowQueries} consulta(s) lenta(s).`;
    }

    return msg;
  }

  private static formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }
}
