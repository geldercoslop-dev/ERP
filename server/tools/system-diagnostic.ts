/**
 * Ferramenta de Diagnóstico Automático do Sistema ERP
 * 
 * Arquitetura: LEO → TOOLS → SERVICES → DATABASE
 * LEO nunca acessa DB direto.
 */

import { logger, systemLogger } from '../_core/logger.js';
import { ValidationError } from '../_core/errors/typed-errors.js';
import {
  checkDiagnosticDatabaseHealth,
  registerDiagnosticAudit,
} from '../services/system-diagnostic.service.js';



export interface DiagnosticResult {
  timestamp: Date;
  systemHealth: {
    status: 'healthy' | 'warning' | 'critical';
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
  };
  databaseHealth: {
    status: 'connected' | 'disconnected' | 'slow';
    connectionTime?: number;
    avgQueryTime?: number;
    slowQueries: Array<{
      query: string;
      duration: number;
      timestamp: Date;
    }>;
  };
  routeHealth: {
    totalRoutes: number;
    errorRate: number;
    avgResponseTime: number;
    errors: Array<{
      route: string;
      error: string;
      timestamp: Date;
    }>;
  };
  queueHealth: {
    status: 'active' | 'stalled' | 'empty';
    pendingJobs: number;
    processingJobs: number;
    failedJobs: number;
  };
  serviceHealth: {
    [serviceName: string]: {
      status: 'healthy' | 'error';
      lastError?: string;
      errorCount: number;
    };
  };
}

class SystemDiagnostic {
  private static instance: SystemDiagnostic;
  private slowQueries: Array<{ query: string; duration: number; timestamp: Date }> = [];
  private routeErrors: Array<{ route: string; error: string; timestamp: Date }> = [];
  private serviceErrors: Map<string, number> = new Map();
  private diagnosticHistory: DiagnosticResult[] = [];

  private constructor() {}

  public static getInstance(): SystemDiagnostic {
    if (!SystemDiagnostic.instance) {
      SystemDiagnostic.instance = new SystemDiagnostic();
    }
    return SystemDiagnostic.instance;
  }

  /**
   * Executa diagnóstico completo do sistema
   */
  public async runFullDiagnostic(tenantId: number): Promise<DiagnosticResult> {
    if (!tenantId || !Number.isFinite(tenantId) || tenantId <= 0) {
      throw new ValidationError('tenantId obrigatório para diagnóstico');
    }
    console.log('Iniciando diagnóstico completo do sistema ERP');

    const result: DiagnosticResult = {
      timestamp: new Date(),
      systemHealth: await this.checkSystemHealth(),
      databaseHealth: await this.checkDatabaseHealth(),
      routeHealth: await this.checkRouteHealth(),
      queueHealth: await this.checkQueueHealth(),
      serviceHealth: await this.checkServiceHealth()
    };

    // Avaliar saúde geral
    this.evaluateOverallHealth(result);

    // Registrar no audit_log
    await this.registerDiagnosticResult(result, tenantId);

    // Armazenar histórico
    this.diagnosticHistory.push(result);
    if (this.diagnosticHistory.length > 100) {
      this.diagnosticHistory = this.diagnosticHistory.slice(-50);
    }

    return result;
  }

  /**
   * Verifica saúde do sistema (memória, CPU, uptime)
   */
  private async checkSystemHealth(): Promise<DiagnosticResult['systemHealth']> {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const uptime = process.uptime();

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    // Verificar uso de memória
    const memoryUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    if (memoryUsagePercent > 90) {
      status = 'critical';
    } else if (memoryUsagePercent > 75) {
      status = 'warning';
    }

    // Verificar uptime
    if (uptime < 60) { // menos de 1 minuto
      status = status === 'critical' ? 'critical' : 'warning';
    }

    return {
      status,
      uptime,
      memoryUsage: memUsage,
      cpuUsage
    };
  }

  /**
   * Verifica saúde do banco de dados
   */
  private async checkDatabaseHealth(): Promise<DiagnosticResult['databaseHealth']> {
    try {
      const result = await checkDiagnosticDatabaseHealth(this.slowQueries);
      if (!result.success) {
        console.error('Erro no diagnóstico do banco', result.error);
        return {
          status: 'disconnected',
          slowQueries: this.slowQueries
        };
      }
      return result.data as DiagnosticResult['databaseHealth'];
    } catch (error) {
      console.error('Erro no diagnóstico do banco', (error as Error).message);
      return {
        status: 'disconnected',
        slowQueries: this.slowQueries
      };
    }
  }

  /**
   * Verifica saúde das rotas
   */
  private async checkRouteHealth(): Promise<DiagnosticResult['routeHealth']> {
    const recentErrors = this.routeErrors.filter(
      e => Date.now() - e.timestamp.getTime() < 300000 // últimos 5 minutos
    );

    const totalRequests = 100; // Simulado - deveria vir de metrics
    const errorRate = totalRequests > 0 ? (recentErrors.length / totalRequests) * 100 : 0;

    let avgResponseTime = 0; // Simulado - deveria vir de metrics

    return {
      totalRoutes: totalRequests,
      errorRate,
      avgResponseTime,
      errors: recentErrors
    };
  }

  /**
   * Verifica saúde das filas
   */
  private async checkQueueHealth(): Promise<DiagnosticResult['queueHealth']> {
    try {
      // Simulação - deveria verificar filas reais
      const pendingJobs = 0;
      const processingJobs = 0;
      const failedJobs = this.serviceErrors.get('queue') || 0;

      let status: 'active' | 'stalled' | 'empty' = 'active';
      
      if (pendingJobs === 0 && processingJobs === 0) {
        status = 'empty';
      } else if (failedJobs > 10) {
        status = 'stalled';
      }

      return {
        status,
        pendingJobs,
        processingJobs,
        failedJobs
      };

    } catch (error) {
      console.error('Erro ao verificar saúde das filas', (error as Error).message);
      return {
        status: 'stalled',
        pendingJobs: 0,
        processingJobs: 0,
        failedJobs: 999
      };
    }
  }

  /**
   * Verifica saúde dos serviços
   */
  private async checkServiceHealth(): Promise<DiagnosticResult['serviceHealth']> {
    const services = ['auth-service', 'payment-service', 'stock-service', 'notification-service'];
    const serviceHealth: DiagnosticResult['serviceHealth'] = {};

    for (const service of services) {
      const errorCount = this.serviceErrors.get(service) || 0;
      serviceHealth[service] = {
        status: errorCount > 5 ? 'error' : 'healthy',
        errorCount
      };
    }

    return serviceHealth;
  }

  /**
   * Avalia saúde geral baseado em todos os fatores
   */
  private evaluateOverallHealth(result: DiagnosticResult): void {
    const criticalIssues: string[] = [];

    if (result.databaseHealth.status === 'disconnected') {
      criticalIssues.push('Database disconnected');
    }

    if (result.systemHealth.status === 'critical') {
      criticalIssues.push('Critical memory usage');
    }

    if (result.queueHealth.status === 'stalled') {
      criticalIssues.push('Queue stalled');
    }

    if (criticalIssues.length > 0) {
      console.error('SISTEMA EM ESTADO CRÍTICO', { criticalIssues });
    }
  }

  /**
   * Registra resultado do diagnóstico no audit_log
   */
  /**
   * Agora é responsabilidade do chamador fornecer tenantId
   */
  public async registerDiagnosticResult(result: DiagnosticResult, tenantId: number): Promise<void> {
    if (!tenantId || !Number.isFinite(tenantId) || tenantId <= 0) {
      throw new ValidationError('tenantId obrigatório para registrar diagnóstico');
    }
    try {
      await registerDiagnosticAudit(tenantId, result);
    } catch (error) {
      console.error(`Erro ao registrar diagnóstico no audit_log: ${(error as Error).message}`);
    }
  }

  /**
   * Registra query lenta para monitoramento
   */
  public registerSlowQuery(query: string, duration: number): void {
    this.slowQueries.push({
      query,
      duration,
      timestamp: new Date()
    });

    // Manter apenas últimas 100 queries lentas
    if (this.slowQueries.length > 100) {
      this.slowQueries = this.slowQueries.slice(-50);
    }

    // Alertar se muitas queries lentas
    if (this.slowQueries.length > 10) {
      console.warn('Múltiplas queries lentas detectadas', {
        count: this.slowQueries.length,
        recentQuery: query,
        duration
      });
    }
  }

  /**
   * Registra erro de rota para monitoramento
   */
  public registerRouteError(route: string, error: string): void {
    this.routeErrors.push({
      route,
      error,
      timestamp: new Date()
    });

    // Manter apenas últimos 100 erros
    if (this.routeErrors.length > 100) {
      this.routeErrors = this.routeErrors.slice(-50);
    }
  }

  /**
   * Registra erro de serviço para monitoramento
   */
  public registerServiceError(serviceName: string): void {
    const currentCount = this.serviceErrors.get(serviceName) || 0;
    this.serviceErrors.set(serviceName, currentCount + 1);

    console.warn(`Erro registrado no serviço ${serviceName}`, {
      errorCount: currentCount + 1
    });
  }

  /**
   * Obtém relatório simplificado do diagnóstico
   */
  public getDiagnosticSummary(): string {
    if (this.diagnosticHistory.length === 0) {
      return 'Nenhum diagnóstico disponível';
    }

    const latest = this.diagnosticHistory[this.diagnosticHistory.length - 1];
    
    return `
=== DIAGNÓSTICO ERP ===
Timestamp: ${latest.timestamp.toISOString()}
Sistema: ${latest.systemHealth.status} (Uptime: ${Math.floor(latest.systemHealth.uptime / 60)}min)
Banco: ${latest.databaseHealth.status} (${latest.databaseHealth.slowQueries.length} queries lentas)
Filas: ${latest.queueHealth.status} (${latest.queueHealth.failedJobs} falhas)
Serviços: ${Object.values(latest.serviceHealth).filter(s => s.status === 'healthy').length}/${Object.keys(latest.serviceHealth).length} saudáveis
    `.trim();
  }
}

// Exportar singleton
export const systemDiagnostic = SystemDiagnostic.getInstance();

// Exportar funções convenientes
// Para rodar diagnóstico, agora é obrigatório informar tenantId
export const runSystemDiagnostic = async (tenantId: number) => {
  return systemDiagnostic.runFullDiagnostic(tenantId);
};
export const registerSlowQuery = (query: string, duration: number) => 
  systemDiagnostic.registerSlowQuery(query, duration);
export const registerRouteError = (route: string, error: string) => 
  systemDiagnostic.registerRouteError(route, error);
export const registerServiceError = (serviceName: string) => 
  systemDiagnostic.registerServiceError(serviceName);
