/**
 * LEO Actions Logger
 * 
 * Sistema de logging para auditoria de ações do agente
 */

import { leoLogManager } from './leo-log-manager.js';

export interface ActionLogEntry {
  id?: number;
  toolName: string;
  executionTime: number;
  result: 'success' | 'error' | 'partial';
  errorMessage?: string;
  tenantId: number;
  userId?: number;
  vendedorId?: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export class LeoActionsLog {
  /**
   * Registra execução de ferramenta
   */
  static async logAction(entry: Omit<ActionLogEntry, 'id'>): Promise<void> {
    await leoLogManager.writeLog({
      level: entry.result === 'error' ? 'ERROR' : 'INFO',
      module: 'LEO_AGENT_ACTIONS',
      message: `Tool execution: ${entry.toolName} - ${entry.result}`,
      data: {
        toolName: entry.toolName,
        executionTime: entry.executionTime,
        result: entry.result,
        errorMessage: entry.errorMessage,
        tenantId: entry.tenantId,
        userId: entry.userId,
        vendedorId: entry.vendedorId,
        input: this.sanitizeInput(entry.input),
        output: this.sanitizeOutput(entry.output),
        metadata: entry.metadata
      },
      timestamp: entry.timestamp
    });
  }

  /**
   * Registra múltiplas ações em batch
   */
  static async logBatchActions(entries: Omit<ActionLogEntry, 'id'>[]): Promise<void> {
    for (const entry of entries) {
      await this.logAction(entry);
    }
  }

  /**
   * Busca ações por filtros
   */
  static async searchActions(filters: {
    tenantId?: number;
    userId?: number;
    toolName?: string;
    result?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<ActionLogEntry[]> {
    // Implementação futura com banco de dados
    // Por enquanto, retorna array vazio
    return [];
  }

  /**
   * Obtém estatísticas de uso
   */
  static async getUsageStats(tenantId: number, period: 'today' | 'week' | 'month' = 'today'): Promise<{
    totalActions: number;
    successRate: number;
    mostUsedTools: Array<{ toolName: string; count: number }>;
    averageExecutionTime: number;
  }> {
    // Implementação futura com banco de dados
    return {
      totalActions: 0,
      successRate: 0,
      mostUsedTools: [],
      averageExecutionTime: 0
    };
  }

  /**
   * Limpa dados sensíveis do input para logging
   */
  private static sanitizeInput(input: any): any {
    if (!input) return {};
    
    if (typeof input === 'string') {
      // Remove senhas e dados sensíveis
      return input.replace(/password["\s*:=]["\s*][^\\s]*/gi, 'password:***');
    }
    
    if (typeof input === 'object' && input !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(input)) {
        if (key.toLowerCase().includes('password') || 
            key.toLowerCase().includes('senha') ||
            key.toLowerCase().includes('token') ||
            key.toLowerCase().includes('secret')) {
          sanitized[key] = '***';
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    }
    
    return input;
  }

  /**
   * Limpa dados sensíveis do output para logging
   */
  private static sanitizeOutput(output: any): any {
    if (!output) return {};
    
    if (typeof output === 'string') {
      // Remove informações pessoais
      return output.replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, 'XXX.XXX.XXX-XX');
    }
    
    if (typeof output === 'object' && output !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(output)) {
        if (key.toLowerCase().includes('cpf') ||
            key.toLowerCase().includes('cnpj') ||
            key.toLowerCase().includes('telefone')) {
          if (typeof value === 'string') {
            sanitized[key] = this.maskSensitiveData(value);
          } else {
            sanitized[key] = '***';
          }
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    }
    
    return output;
  }

  /**
   * Mascara dados sensíveis
   */
  private static maskSensitiveData(data: string): string {
    if (data.length <= 4) return '***';
    return data.substring(0, 2) + '***' + data.substring(data.length - 2);
  }

  /**
   * Gera relatório de auditoria
   */
  static async generateAuditReport(tenantId: number, filters: {
    startDate?: Date;
    endDate?: Date;
    userId?: number;
  }): Promise<{
    totalActions: number;
    errorRate: number;
    topTools: Array<{ toolName: string; count: number; avgTime: number }>;
    securityAlerts: Array<{
      timestamp: Date;
      toolName: string;
      alert: string;
    }>;
  }> {
    // Implementação futura
    return {
      totalActions: 0,
      errorRate: 0,
      topTools: [],
      securityAlerts: []
    };
  }
}
