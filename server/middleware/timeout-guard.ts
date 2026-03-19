/**
 * Middleware para prevenir travamentos por operações longas
 * 
 * Monitora e cancela operações que demoram mais de 10 segundos
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../infra/structured-logger';
import { AbortController } from 'node-abort-controller';

const logger = createLogger('timeout-guard');

// Tempo máximo de execução em ms (10 segundos)
const MAX_EXECUTION_TIME = 10000;

/**
 * Middleware para prevenir travamentos
 */
export function timeoutGuardMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Criar controller para abortar operação
    const abortController = new AbortController();
    const { signal } = abortController;
    
    // Adicionar signal ao request para uso nos serviços
    (req as any).abortSignal = signal;
    
    // Configurar timeout
    const timeoutId = setTimeout(() => {
      // Abortar operação
      abortController.abort();
      
      // Calcular tempo decorrido
      const startTime = req.startTime || Date.now();
      const elapsedTime = Date.now() - startTime;
      
      // Registrar log de timeout
      logger.error(`Operação abortada por timeout após ${elapsedTime}ms`, {
        requestId: req.requestId,
        tenantId: req.tenantId,
        method: req.method,
        path: req.path,
        duration: elapsedTime,
        threshold: MAX_EXECUTION_TIME,
        metadata: {
          query: req.query,
          params: req.params,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        }
      });
      
      // Se a resposta ainda não foi enviada, enviar erro 503
      if (!res.headersSent) {
        res.status(503).json({
          error: 'Operação cancelada por timeout',
          message: 'A operação demorou mais que o limite permitido',
          timeout: MAX_EXECUTION_TIME,
          path: req.path
        });
      }
    }, MAX_EXECUTION_TIME);
    
    // Limpar timeout quando a resposta for enviada
    res.on('finish', () => {
      clearTimeout(timeoutId);
    });
    
    // Continuar para o próximo middleware
    next();
  };
}

/**
 * Wrapper para funções assíncronas com timeout
 */
export function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = MAX_EXECUTION_TIME,
  operationName: string = 'operation'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    // Criar timeout
    const timeoutId = setTimeout(() => {
      const error = new Error(`Timeout: ${operationName} excedeu ${timeoutMs}ms`);
      (error as any).isTimeout = true;
      (error as any).operationName = operationName;
      (error as any).timeoutMs = timeoutMs;
      reject(error);
    }, timeoutMs);
    
    // Executar função
    fn().then(
      result => {
        clearTimeout(timeoutId);
        resolve(result);
      },
      error => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

/**
 * Verifica se um erro é de timeout
 */
export function isTimeoutError(error: any): boolean {
  return error && error.isTimeout === true;
}

export default {
  timeoutGuardMiddleware,
  withTimeout,
  isTimeoutError
};