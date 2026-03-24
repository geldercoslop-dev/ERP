/**
 * Exemplo de integração do sistema de monitoramento
 * 
 * Este arquivo mostra como integrar todos os componentes de monitoramento
 * no servidor Express principal
 */

import express from 'express';
import { metricsMiddleware, databaseMetricsMiddleware } from './metrics-middleware';
import { Request, Response } from 'express';
import { systemLogger } from '../_core/logger';
import { createLogger } from './structured-logger';
import { metrics, recordSystemMetrics } from './metrics';

const logger = createLogger('monitoring-integration');

/**
 * Configura middleware de monitoramento no app Express
 */
export function setupMonitoring(app: express.Application): void {
  // 1. Middleware de métricas de database (deve vir antes dos outros)
  app.use(metricsMiddleware);
  app.use(databaseMetricsMiddleware);
  
  // 2. Endpoint de métricas
  app.get("/metrics", (_req: Request, res: Response) => {
    res.json({
      counters: metrics.getCounters(),
      requests: metrics.getRequestStats(5),
      system: metrics.getCurrentSystemMetrics(),
    });
  });
  
  // 3. Health check único (usando o sistema centralizado)
  app.get('/health', async (req: Request, res: Response) => {
    try {
      const { getSystemHealthComplete } = await import('../services/system-health.service');
      const health = await getSystemHealthComplete();
      res.status(health.status === 'ok' ? 200 : 503).json(health);
    } catch (error) {
      logger.error('Erro ao obter health check', error as Error);
      res.status(500).json({ error: 'Erro ao obter health check' });
    }
  });
  
  logger.info('Sistema de monitoramento configurado', {
    metadata: {
      endpoints: ['/health', '/health/live', '/health/ready', '/metrics'],
      middleware: ['metricsMiddleware', 'databaseMetricsMiddleware', 'errorTrackingMiddleware'],
    },
  });
}

/**
 * Inicia coleta de métricas do sistema
 */
export function startMetricsCollection(interval: number = 60000): NodeJS.Timeout {
  logger.info('Iniciando coleta de métricas do sistema', { 
    metadata: { interval }
  });
  
  return setInterval(() => {
    try {
      recordSystemMetrics();
      logger.debug('Métricas do sistema coletadas');
    } catch (error) {
      logger.error('Erro ao coletar métricas do sistema', error as Error);
    }
  }, interval);
}

/**
 * Função para limpeza de métricas antigas
 */
export function startMetricsCleanup(interval: number = 300000): NodeJS.Timeout {
  logger.info('Iniciando limpeza de métricas antigas', { 
    metadata: { interval }
  });
  
  return setInterval(() => {
    try {
      metrics.clearOldMetrics(60); // Remove métricas mais antigas que 1 hora
      logger.debug('Limpeza de métricas concluída');
    } catch (error) {
      logger.error('Erro na limpeza de métricas', error as Error);
    }
  }, interval);
}

/**
 * Exemplo de uso em um service
 */
export class ExampleService {
  private logger = createLogger('ExampleService');
  
  async doSomething(
    tenantId: number,
    data: Record<string, unknown>
  ): Promise<{ success: boolean; data: Record<string, unknown> }> {
    const startTime = Date.now();
    
    try {
      // Simula alguma operação
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const duration = Date.now() - startTime;
      
      this.logger.info('Operação concluída com sucesso', {
        tenantId,
        duration,
        payload: { dataKeys: Object.keys(data) },
      });
      
      return { success: true, data };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error('Erro na operação', error as Error, {
        tenantId,
        duration,
        payload: data,
      });
      
      throw error;
    }
  }
}

/**
 * Exemplo de uso em uma rota Express
 */
type AugmentedRequest = Request & {
  user?: { id?: number };
  tenantId?: number;
  requestId?: string;
};

export function exampleRouteHandler(req: AugmentedRequest, res: Response) {
  const startTime = Date.now();
  const logger = createLogger('example-route');
  
  try {
    // Simula processamento
    const result = { message: 'Hello World', timestamp: new Date() };
    
    const duration = Date.now() - startTime;
    
    logger.request(req.method, req.path, 200, duration, {
      userId: req.user?.id,
      tenantId: req.tenantId,
      requestId: req.requestId,
      metadata: { method: req.method },
    });
    
    res.json(result);
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Erro na rota', error as Error, {
      metadata: { method: req.method, path: req.path },
      duration,
      userId: req.user?.id,
      tenantId: req.tenantId,
    });
    
    res.status(500).json({ error: 'Internal server error' });
  }
}
