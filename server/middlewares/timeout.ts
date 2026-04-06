/**
 * Request Timeout Middleware
 * 
 * Implementa timeout para requests longos
 * Previna DoS e recursos presos
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../_core/logger.js';

interface TimeoutConfig {
  timeoutMs: number;
  enableTimeoutResponse: boolean;
  onTimeout?: (req: Request, res: Response) => void;
}

interface TimeoutRequest extends Request {
  _timeoutStarted?: number;
  _timeoutTimer?: NodeJS.Timeout;
  _timedOut?: boolean;
}

/**
 * Configuração padrão
 */
const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  timeoutMs: 10 * 1000, // 10 segundos
  enableTimeoutResponse: true
};

/**
 * Gera response de timeout
 */
function sendTimeoutResponse(res: Response, config: TimeoutConfig): void {
  if (!res.headersSent) {
    res.status(408).json({
      error: 'Request Timeout',
      message: 'Request took too long to process',
      timeout: config.timeoutMs / 1000
    });
  }
}

/**
 * Limpa recursos do timeout
 */
function clearTimeoutResources(req: TimeoutRequest): void {
  if (req._timeoutTimer) {
    clearTimeout(req._timeoutTimer);
    req._timeoutTimer = undefined;
  }
}

/**
 * Log de timeout
 */
function logTimeout(req: Request, duration: number): void {
  logger.warn(
    {
      method: req.method,
      path: req.path,
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'],
      duration: Math.round(duration),
      timeout: DEFAULT_TIMEOUT_CONFIG.timeoutMs / 1000,
      timestamp: new Date().toISOString()
    },
    'Request timeout detected'
  );
}

/**
 * Middleware de timeout
 */
export function createTimeoutMiddleware(config: TimeoutConfig = DEFAULT_TIMEOUT_CONFIG) {
  return (req: TimeoutRequest, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    req._timeoutStarted = startTime;
    
    // Configurar timer de timeout
    req._timeoutTimer = setTimeout(() => {
      req._timedOut = true;
      
      // Log do timeout
      const duration = Date.now() - startTime;
      logTimeout(req, duration);
      
      // Tentar terminar response
      if (config.enableTimeoutResponse && !res.headersSent) {
        if (config.onTimeout) {
          config.onTimeout(req, res);
        } else {
          sendTimeoutResponse(res, config);
        }
      }
      
      // Tentar destruir request se possível
      try {
        if (req.socket && !req.socket.destroyed) {
          req.socket.destroy();
        }
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Failed to destroy socket on timeout'
        );
      }
    }, config.timeoutMs);
    
    // Override do res.end para limpar timer
    const originalEnd = res.end;
    res.end = function(this: Response, ...args: any[]): Response {
      clearTimeoutResources(req);
      return (originalEnd as any).apply(this, args);
    } as any;
    
    // Override do res.json para limpar timer
    const originalJson = res.json;
    res.json = function(this: Response, body?: any): Response {
      clearTimeoutResources(req);
      return originalJson.call(this, body);
    };
    
    // Listener para quando o request terminar
    res.on('finish', () => {
      clearTimeoutResources(req);
    });
    
    // Listener para erro
    res.on('error', () => {
      clearTimeoutResources(req);
    });
    
    // Verificar se já está em timeout antes de continuar
    if (req._timedOut) {
      return;
    }
    
    next();
  };
}

/**
 * Middleware de timeout padrão (export)
 */
export const timeoutMiddleware = createTimeoutMiddleware();

/**
 * Middleware para medir tempo de processamento
 */
export function createTimingMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    
    // Adicionar header de timing
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      res.setHeader('X-Response-Time', `${duration}ms`);
      
      // Log de requests lentos (>5s)
      if (duration > 5000) {
        logger.warn(
          {
            method: req.method,
            path: req.path,
            duration,
            status: res.statusCode,
            ip: req.ip || req.socket?.remoteAddress,
            timestamp: new Date().toISOString()
          },
          'Slow request detected'
        );
      }
    });
    
    next();
  };
}

/**
 * Export do timing middleware
 */
export const timingMiddleware = createTimingMiddleware();

/**
 * Utilitários de timeout
 */
export const timeoutUtils = {
  /**
   * Verifica se request está em timeout
   */
  isTimedOut: (req: TimeoutRequest): boolean => !!req._timedOut,
  
  /**
   * Obtém tempo decorrido
   */
  getElapsedTime: (req: TimeoutRequest): number => {
    const started = req._timeoutStarted;
    return started ? Date.now() - started : 0;
  },
  
  /**
   * Obtém tempo restante
   */
  getRemainingTime: (req: TimeoutRequest, config: TimeoutConfig = DEFAULT_TIMEOUT_CONFIG): number => {
    const elapsed = timeoutUtils.getElapsedTime(req);
    return Math.max(0, config.timeoutMs - elapsed);
  },
  
  /**
   * Configuração padrão
   */
  getDefaultConfig: (): TimeoutConfig => DEFAULT_TIMEOUT_CONFIG
};
