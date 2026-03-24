/**
 * Configuração do sistema de monitoramento
 * 
 * Este arquivo configura o sistema de monitoramento, métricas e logs
 */

import { Express, Request, Response, NextFunction } from 'express';
import { nanoid } from 'nanoid';
import { createLogger } from '../infra/structured-logger';
import { timeoutGuardMiddleware } from '../middleware/timeout-guard';
import { wrapDatabaseConnection } from '../middleware/slow-query-logger';
import { errorAlerter } from '../monitoring/error-alerter';
import { metrics, recordSystemMetrics } from '../infra/metrics';

const logger = createLogger('monitoring-setup');

/**
 * Configura o sistema de monitoramento para o Express
 */
export function setupMonitoring(app: Express): void {
  logger.info('Configurando sistema de monitoramento...');
  
  // Middleware para gerar ID único para cada requisição
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // Usar ID fornecido pelo cliente ou gerar um novo
    req.requestId = req.get('X-Request-ID') || nanoid(10);
    req.startTime = Date.now();
    next();
  });
  
  // Middleware para prevenir travamentos
  app.use(timeoutGuardMiddleware());
  
  // Middleware para capturar erros não tratados
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      return next(err);
    }
    
    logger.error(`Erro não tratado: ${err.message}`, {
      requestId: req.requestId,
      error: err.message,
      metadata: {
        stack: err.stack,
        path: req.path,
        method: req.method
      }
    });
    
    // Registrar no sistema de alertas
    errorAlerter.trackError(err.message, {
      requestId: req.requestId,
      path: req.path,
      method: req.method,
      stack: err.stack
    });
    
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: process.env.NODE_ENV === 'production' ? 'Ocorreu um erro inesperado' : err.message
    });
  });
  
  // Iniciar coleta periódica de métricas do sistema
  startMetricsCollection();
  
  logger.info('Sistema de monitoramento configurado com sucesso');
}

/**
 * Configura o monitoramento de banco de dados
 */
export function setupDatabaseMonitoring(connection: any): any {
  logger.info('Configurando monitoramento de banco de dados...');
  
  // Aplicar wrapper para monitorar consultas lentas
  const wrappedConnection = wrapDatabaseConnection(connection);
  
  logger.info('Monitoramento de banco de dados configurado com sucesso');
  
  return wrappedConnection;
}

/**
 * Inicia coleta periódica de métricas do sistema
 */
function startMetricsCollection(): void {
  logger.info('Iniciando coleta periódica de métricas do sistema...');
  
  // Registrar métricas do sistema a cada 30 segundos
  const intervalId = setInterval(() => {
    recordSystemMetrics();
  }, 30000);
  
  // Limpar métricas antigas a cada hora
  const cleanupIntervalId = setInterval(() => {
    metrics.clearOldMetrics(60); // Limpar métricas com mais de 60 minutos
  }, 60 * 60 * 1000);
  
  // Garantir que os intervalos sejam limpos quando o processo terminar (apenas em produção)
  if (process.env.NODE_ENV === 'production') {
    process.on('SIGINT', () => {
      clearInterval(intervalId);
      clearInterval(cleanupIntervalId);
    });
    
    process.on('SIGTERM', () => {
      clearInterval(intervalId);
      clearInterval(cleanupIntervalId);
    });
  }
  
  logger.info('Coleta periódica de métricas iniciada com sucesso');
}

export default {
  setupMonitoring,
  setupDatabaseMonitoring
};