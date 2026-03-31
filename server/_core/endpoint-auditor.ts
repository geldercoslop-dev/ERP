import { systemLogger, authLogger, dbLogger, apiLogger } from './logger.js';

/**
 * Configuração de auditoria para endpoints críticos
 */
interface AuditConfig {
  endpoint: string;
  critical: boolean;
  fields: string[];
  logInput: boolean;
  logResult: boolean;
  frequency?: 'high' | 'medium' | 'low';
}

/**
 * Mapeamento de endpoints críticos para auditoria
 */
export const CRITICAL_ENDPOINTS: AuditConfig[] = [
  // Autenticação
  {
    endpoint: 'auth.login',
    critical: true,
    fields: ['username'],
    logInput: false,
    logResult: false,
    frequency: 'high'
  },
  {
    endpoint: 'auth.logout',
    critical: true,
    fields: [],
    logInput: false,
    logResult: false,
    frequency: 'high'
  },
  {
    endpoint: 'auth.me',
    critical: false,
    fields: [],
    logInput: false,
    logResult: false,
    frequency: 'high'
  },
  
  // Clientes
  {
    endpoint: 'clientes.create',
    critical: true,
    fields: ['nome', 'telefone', 'cpf'],
    logInput: false,
    logResult: false,
    frequency: 'medium'
  },
  {
    endpoint: 'clientes.update',
    critical: true,
    fields: ['id', 'nome', 'telefone'],
    logInput: false,
    logResult: false,
    frequency: 'medium'
  },
  {
    endpoint: 'clientes.delete',
    critical: true,
    fields: ['id'],
    logInput: false,
    logResult: false,
    frequency: 'low'
  },
  
  // Pedidos
  {
    endpoint: 'pedidos.create',
    critical: true,
    fields: ['clienteId', 'total', 'itens'],
    logInput: false,
    logResult: false,
    frequency: 'high'
  },
  {
    endpoint: 'pedidos.update',
    critical: true,
    fields: ['id', 'status', 'total'],
    logInput: false,
    logResult: false,
    frequency: 'high'
  },
  {
    endpoint: 'pedidos.delete',
    critical: true,
    fields: ['id'],
    logInput: false,
    logResult: false,
    frequency: 'low'
  },
  {
    endpoint: 'pedidos.approve',
    critical: true,
    fields: ['id'],
    logInput: false,
    logResult: false,
    frequency: 'high'
  },
  {
    endpoint: 'pedidos.cancel',
    critical: true,
    fields: ['id', 'motivo'],
    logInput: false,
    logResult: false,
    frequency: 'high'
  },
  
  // Financeiro
  {
    endpoint: 'financeiro.pagamentos.create',
    critical: true,
    fields: ['pedidoId', 'valor', 'tipo'],
    logInput: false,
    logResult: false,
    frequency: 'high'
  },
  {
    endpoint: 'financeiro.pagamentos.refund',
    critical: true,
    fields: ['id', 'valor'],
    logInput: false,
    logResult: false,
    frequency: 'high'
  },
  {
    endpoint: 'financeiro.relatorios.vendas',
    critical: false,
    fields: ['dataInicio', 'dataFim'],
    logInput: false,
    logResult: false,
    frequency: 'medium'
  }
];

/**
 * Classe para auditoria de endpoints
 */
export class EndpointAuditor {
  private auditConfigs: Map<string, AuditConfig> = new Map();
  
  constructor() {
    // Inicializar configurações
    CRITICAL_ENDPOINTS.forEach(config => {
      this.auditConfigs.set(config.endpoint, config);
    });
  }
  
  /**
   * Verifica se um endpoint é crítico
   */
  isCritical(endpoint: string): boolean {
    const config = this.auditConfigs.get(endpoint);
    return config?.critical || false;
  }
  
  /**
   * Obtém configuração de auditoria para um endpoint
   */
  getAuditConfig(endpoint: string): AuditConfig | undefined {
    return this.auditConfigs.get(endpoint);
  }
  
  /**
   * Registra acesso a endpoint crítico
   */
  logAccess({
    endpoint,
    type,
    input,
    ctx,
    result,
    error
  }: {
    endpoint: string;
    type: 'query' | 'mutation' | 'subscription';
    input: any;
    ctx: any;
    result?: any;
    error?: any;
  }) {
    const config = this.getAuditConfig(endpoint);
    if (!config) return;
    
    const requestId = ctx.requestId || 'unknown';
    const userId = ctx.user?.id;
    const tenantId = ctx.tenantId;
    
    // Dados base da auditoria
    const auditData: any = {
      requestId,
      endpoint,
      type,
      critical: config.critical,
      frequency: config.frequency,
      userId,
      tenantId,
      timestamp: new Date().toISOString(),
      userAgent: ctx.req?.headers?.['user-agent'],
      ip: ctx.req?.ip || ctx.req?.connection?.remoteAddress
    };
    
    // Adicionar campos críticos
    if (config.fields.length > 0 && input && typeof input === 'object') {
      auditData.criticalFields = {};
      config.fields.forEach(field => {
        if (field in input) {
          auditData.criticalFields[field] = input[field];
        }
      });
    }
    
    // Log completo do input se permitido
    if (config.logInput) {
      auditData.input = input;
    }
    
    // Log do resultado se permitido
    if (config.logResult && result) {
      auditData.result = result;
    }
    
    // Log do erro se houver
    if (error) {
      auditData.error = {
        message: error instanceof Error ? error.message : String(error),
        code: error.code || 'UNKNOWN',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      };
    }
    
    // Escolher o logger apropriado
    const logger = this.getLoggerForEndpoint(endpoint);
    
    // Log de auditoria
    if (error) {
      logger.error(auditData, `AUDIT: ${endpoint} - ERROR`);
    } else {
      logger.info(auditData, `AUDIT: ${endpoint} - ACCESS`);
    }
  }
  
  /**
   * Escolhe o logger apropriado baseado no endpoint
   */
  private getLoggerForEndpoint(endpoint: string) {
    if (endpoint.startsWith('auth.')) {
      return authLogger;
    } else if (endpoint.startsWith('financeiro.') || endpoint.includes('pagamentos')) {
      return dbLogger; // Usar dbLogger para operações financeiras
    } else {
      return apiLogger;
    }
  }
  
  /**
   * Gera relatório de auditoria
   */
  generateAuditReport(options: {
    startDate?: Date;
    endDate?: Date;
    userId?: number;
    endpoint?: string;
  } = {}) {
    // TODO: Implementar geração de relatório a partir dos logs
    // Por enquanto, retornar estrutura do relatório
    return {
      period: {
        start: options.startDate || new Date(Date.now() - 24 * 60 * 60 * 1000),
        end: options.endDate || new Date()
      },
      filters: {
        userId: options.userId,
        endpoint: options.endpoint
      },
      summary: {
        totalRequests: 0,
        criticalRequests: 0,
        errors: 0,
        topEndpoints: []
      },
      details: []
    };
  }
  
  /**
   * Verifica se todos os endpoints críticos estão cobertos
   */
  validateCriticalEndpointsCoverage(registeredEndpoints: string[]) {
    const missingEndpoints: string[] = [];
    
    CRITICAL_ENDPOINTS.forEach(config => {
      if (!registeredEndpoints.some(endpoint => endpoint.includes(config.endpoint))) {
        missingEndpoints.push(config.endpoint);
      }
    });
    
    return {
      allCovered: missingEndpoints.length === 0,
      missingEndpoints,
      totalCritical: CRITICAL_ENDPOINTS.filter(c => c.critical).length,
      coveredCritical: CRITICAL_ENDPOINTS.filter(c => 
        c.critical && registeredEndpoints.some(endpoint => endpoint.includes(c.endpoint))
      ).length
    };
  }
}

// Instância global do auditor
export const auditor = new EndpointAuditor();

/**
 * Middleware de auditoria para tRPC
 */
export function auditMiddleware() {
  return async ({ path, type, input, ctx, next }: any) => {
    const startTime = Date.now();
    
    try {
      const result = await next();
      
      // Registrar acesso bem-sucedido
      auditor.logAccess({
        endpoint: path,
        type,
        input,
        ctx,
        result
      });
      
      return result;
    } catch (error) {
      // Registrar acesso com erro
      auditor.logAccess({
        endpoint: path,
        type,
        input,
        ctx,
        error
      });
      
      throw error;
    }
  };
}

/**
 * Middleware específico para endpoints críticos
 */
export function criticalEndpointMiddleware() {
  return async ({ path, type, input, ctx, next }: any) => {
    const config = auditor.getAuditConfig(path);
    
    // Se não for crítico, apenas continuar
    if (!config?.critical) {
      return await next();
    }
    
    // Logging adicional para endpoints críticos
    const requestId = ctx.requestId || 'unknown';
    
    authLogger.warn({
      requestId,
      endpoint: path,
      type,
      userId: ctx.user?.id,
      tenantId: ctx.tenantId,
      criticalFields: config.fields,
      timestamp: new Date().toISOString()
    }, 'CRITICAL: Endpoint accessed');
    
    try {
      const result = await next();
      
      authLogger.info({
        requestId,
        endpoint: path,
        type,
        success: true,
        userId: ctx.user?.id,
        tenantId: ctx.tenantId
      }, 'CRITICAL: Endpoint completed successfully');
      
      return result;
    } catch (error) {
      authLogger.error({
        requestId,
        endpoint: path,
        type,
        error: error instanceof Error ? error.message : String(error),
        userId: ctx.user?.id,
        tenantId: ctx.tenantId
      }, 'CRITICAL: Endpoint failed');
      
      throw error;
    }
  };
}

/**
 * Função para verificar se endpoint precisa de auditoria adicional
 */
export function needsAdditionalAudit(endpoint: string): boolean {
  const config = auditor.getAuditConfig(endpoint);
  return config?.critical || false;
}

/**
 * Função para obter campos críticos de um endpoint
 */
export function getCriticalFields(endpoint: string): string[] {
  const config = auditor.getAuditConfig(endpoint);
  return config?.fields || [];
}
