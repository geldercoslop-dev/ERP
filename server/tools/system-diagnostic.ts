/**
 * Ferramenta de Diagnóstico Automático do Sistema ERP
 * 
 * Arquitetura: LEO → TOOLS → SERVICES → DATABASE
 * LEO nunca acessa DB direto.
 */

import { getDb, insertAuditLog } from '../db/index';
import { logger, systemLogger } from '../_core/logger';

function getDiagnosticTenantId(): number | null {
  const raw = process.env.DEFAULT_TENANT_ID || process.env.TENANT_ID;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

interface DiagnosticResult {
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
  public async runFullDiagnostic(): Promise<DiagnosticResult> {
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
    await this.registerDiagnosticResult(result);

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
    const startTime = Date.now();
    let status: 'connected' | 'disconnected' | 'slow' = 'connected';
    let connectionTime: number | undefined;

    try {
      const db = await getDb();
      if (!db) {
        status = 'disconnected';
        throw new Error('Database connection failed');
      }

      connectionTime = Date.now() - startTime;

      // Testar query simples
      const queryStart = Date.now();
      await db.execute('SELECT 1 as test');
      const queryTime = Date.now() - queryStart;

      // Verificar queries lentas recentes
      const recentSlowQueries = this.slowQueries.filter(
        q => Date.now() - q.timestamp.getTime() < 300000 // últimos 5 minutos
      );

      if (queryTime > 1000) {
        status = 'slow';
      }

      return {
        status,
        connectionTime,
        avgQueryTime: queryTime,
        slowQueries: recentSlowQueries
      };

    } catch (error) {
      console.error('Erro no diagnóstico do banco', (error as Error).message);
      
      // Registrar no audit_log
      try {
        const tenantId = getDiagnosticTenantId();
        if (!tenantId) {
          return {
            status: 'disconnected',
            connectionTime,
            slowQueries: this.slowQueries
          };
        }
        await insertAuditLog({
          tenantId,
          action: 'update_status',
          entity: 'system_diagnostic',
          payloadJson: JSON.stringify({
            error: (error as Error).message,
            timestamp: new Date().toISOString()
          })
        });
      } catch (auditError) {
        console.error(`Erro ao registrar diagnóstico no audit_log: ${(auditError as Error).message}`);
      }

      return {
        status: 'disconnected',
        connectionTime,
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
  private async registerDiagnosticResult(result: DiagnosticResult): Promise<void> {
    try {
      const tenantId = getDiagnosticTenantId();
      if (!tenantId) {
        return;
      }
      await insertAuditLog({
        tenantId,
        action: 'update_status',
        entity: 'system_diagnostic',
        payloadJson: JSON.stringify({
          timestamp: result.timestamp.toISOString(),
          systemHealth: result.systemHealth,
          databaseHealth: {
            status: result.databaseHealth.status,
            connectionTime: result.databaseHealth.connectionTime,
            slowQueriesCount: result.databaseHealth.slowQueries.length
          },
          routeHealth: {
            errorRate: result.routeHealth.errorRate,
            errorsCount: result.routeHealth.errors.length
          },
          queueHealth: result.queueHealth,
          serviceHealth: Object.keys(result.serviceHealth).reduce((acc, key) => {
            acc[key] = result.serviceHealth[key].status;
            return acc;
          }, {} as Record<string, string>)
        })
      });
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
export const runSystemDiagnostic = () => systemDiagnostic.runFullDiagnostic();
export const registerSlowQuery = (query: string, duration: number) => 
  systemDiagnostic.registerSlowQuery(query, duration);
export const registerRouteError = (route: string, error: string) => 
  systemDiagnostic.registerRouteError(route, error);
export const registerServiceError = (serviceName: string) => 
  systemDiagnostic.registerServiceError(serviceName);
