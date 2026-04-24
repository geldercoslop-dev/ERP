/**
 * Request ID Middleware
 * 
 * Gera e rastreia IDs únicos por request
 * Facilita debugging e correlação de logs
 */

import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { logger } from '../_core/logger.js';

interface RequestWithID extends Request {
  id?: string;
  startTime?: number;
}

interface RequestIDConfig {
  headerName: string;
  generateIfMissing: boolean;
  includeInResponse: boolean;
  responseHeaderName: string;
}

/**
 * Configuração padrão
 */
const DEFAULT_REQUEST_ID_CONFIG: RequestIDConfig = {
  headerName: 'X-Request-ID',
  generateIfMissing: true,
  includeInResponse: true,
  responseHeaderName: 'X-Request-ID'
};

/**
 * Gera ID único
 */
function generateRequestID(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(8).toString('hex');
  return `${timestamp}-${random}`;
}

/**
 * Extrai ID de headers existentes
 */
function extractRequestID(req: Request, config: RequestIDConfig): string | null {
  // Verificar header configurado
  const headerValue = req.headers[config.headerName.toLowerCase()];
  if (typeof headerValue === 'string' && headerValue.trim().length > 0) {
    return headerValue.trim();
  }
  
  // Verificar headers comuns
  const commonHeaders = [
    'x-request-id',
    'x-correlation-id',
    'request-id',
    'correlation-id',
    'trace-id',
    'x-trace-id'
  ];
  
  for (const header of commonHeaders) {
    const value = req.headers[header];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  
  return null;
}

/**
 * Valida formato do ID
 */
function isValidRequestID(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  
  // Tamanho mínimo e máximo
  if (id.length < 8 || id.length > 128) return false;
  
  // Caracteres permitidos: alfanuméricos, hifens, underscores
  return /^[a-zA-Z0-9\-_]+$/.test(id);
}

/**
 * Logger com request ID
 */
function createRequestLogger(req: RequestWithID) {
  const requestId = req.id || 'unknown';
  
  return {
    info: (message: string, meta: Record<string, unknown> = {}) => {
      logger.info(
        {
          requestId,
          method: req.method,
          path: req.path,
          ip: req.ip || req.socket?.remoteAddress,
          userAgent: req.headers['user-agent'],
          timestamp: new Date().toISOString(),
          ...meta
        },
        message
      );
    },
    
    warn: (message: string, meta: Record<string, unknown> = {}) => {
      logger.warn(
        {
          requestId,
          method: req.method,
          path: req.path,
          ip: req.ip || req.socket?.remoteAddress,
          userAgent: req.headers['user-agent'],
          timestamp: new Date().toISOString(),
          ...meta
        },
        message
      );
    },
    
    error: (message: string, meta: Record<string, unknown> = {}) => {
      logger.error(
        {
          requestId,
          method: req.method,
          path: req.path,
          ip: req.ip || req.socket?.remoteAddress,
          userAgent: req.headers['user-agent'],
          timestamp: new Date().toISOString(),
          ...meta
        },
        message
      );
    },
    
    debug: (message: string, meta: Record<string, unknown> = {}) => {
      logger.debug(
        {
          requestId,
          method: req.method,
          path: req.path,
          ip: req.ip || req.socket?.remoteAddress,
          userAgent: req.headers['user-agent'],
          timestamp: new Date().toISOString(),
          ...meta
        },
        message
      );
    }
  };
}

/**
 * Middleware de Request ID
 */
export function createRequestIDMiddleware(config: RequestIDConfig = DEFAULT_REQUEST_ID_CONFIG) {
  return (req: RequestWithID, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    req.startTime = startTime;
    
    // Tentar extrair ID existente
    let requestId = extractRequestID(req, config);
    
    // Gerar novo ID se necessário
    if (!requestId && config.generateIfMissing) {
      requestId = generateRequestID();
    }
    
    // Validar formato do ID
    if (requestId && !isValidRequestID(requestId)) {
      logger.warn(
        {
          requestId,
          reason: 'Invalid format',
          header: config.headerName
        },
        'Invalid request ID format detected'
      );
      requestId = generateRequestID();
    }
    
    // Adicionar ID ao request
    req.id = requestId || generateRequestID();
    
    // Adicionar header de response
    if (config.includeInResponse && req.id) {
      res.setHeader(config.responseHeaderName, req.id);
    }
    
    // Criar logger específico para este request
    req.log = createRequestLogger(req);
    
    // Log de início do request
    req.log?.info('Request started', {
      requestId: req.id,
      startTime: new Date(startTime).toISOString()
    });
    
    // Listener para fim do request
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      req.log?.info('Request completed', {
        requestId: req.id,
        statusCode: res.statusCode,
        duration: Math.round(duration),
        endTime: new Date().toISOString()
      });
    });
    
    // Listener para erro
    res.on('error', (error) => {
      const duration = Date.now() - startTime;
      
      req.log?.error('Request failed', {
        requestId: req.id,
        error: error instanceof Error ? error.message : String(error),
        duration: Math.round(duration),
        endTime: new Date().toISOString()
      });
    });
    
    next();
  };
}

/**
 * Middleware de Request ID padrão (export)
 */
export const requestIDMiddleware = createRequestIDMiddleware();

/**
 * Middleware para correlação de requests assíncronos
 */
export function createCorrelationMiddleware() {
  return (req: RequestWithID, res: Response, next: NextFunction): void => {
    const correlationId = req.id || generateRequestID();
    
    // Adicionar ao contexto global se disponível
    if (typeof global !== 'undefined') {
      (global as { correlationId?: string }).correlationId = correlationId;
    }
    
    // Adicionar headers de correlação
    res.setHeader('X-Correlation-ID', correlationId);
    
    next();
  };
}

/**
 * Export do correlation middleware
 */
export const correlationMiddleware = createCorrelationMiddleware();

/**
 * Utilitários de Request ID
 */
export const requestIDUtils = {
  /**
   * Gera novo ID
   */
  generateID: generateRequestID,
  
  /**
   * Valida formato
   */
  isValidID: isValidRequestID,
  
  /**
   * Extrai ID de headers
   */
  extractFromHeaders: extractRequestID,
  
  /**
   * Obtém ID do request atual
   */
  getCurrentID: (req: RequestWithID): string | undefined => req.id,
  
  /**
   * Obtém tempo decorrido
   */
  getElapsedTime: (req: RequestWithID): number => {
    if (!req.startTime) return 0;
    return Date.now() - req.startTime;
  },
  
  /**
   * Configuração padrão
   */
  getDefaultConfig: (): RequestIDConfig => DEFAULT_REQUEST_ID_CONFIG
};

// Extensão do tipo Request para incluir ID e logger
declare module 'express' {
  interface Request {
    id?: string;
    startTime?: number;
    log?: {
      info: (message: string, meta?: Record<string, unknown>) => void;
      warn: (message: string, meta?: Record<string, unknown>) => void;
      error: (message: string, meta?: Record<string, unknown>) => void;
      debug: (message: string, meta?: Record<string, unknown>) => void;
    };
  }
}
