import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../infra/structured-logger.js';

const logger = createLogger('backpressure-middleware');

/**
 * Controle de backpressure - limita requests simultâneas
 */
export class BackpressureController {
  private activeRequests: number = 0;
  private queuedRequests: Array<{
    req: Request;
    res: Response;
    next: NextFunction;
    timestamp: number;
  }> = [];
  
  constructor(
    private maxConcurrent: number = 100,
    private maxQueueSize: number = 500,
    private requestTimeout: number = 30000
  ) {}
  
  /**
   * Middleware de backpressure
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Verificar se pode processar imediatamente
      if (this.activeRequests < this.maxConcurrent) {
        this.processRequest(req, res, next);
      } else if (this.queuedRequests.length < this.maxQueueSize) {
        this.queueRequest(req, res, next);
      } else {
        // Sistema sobrecarregado
        this.rejectRequest(req, res);
      }
    };
  }
  
  /**
   * Processa request imediatamente
   */
  private processRequest(req: Request, res: Response, next: NextFunction): void {
    this.activeRequests++;
    
    // Setup cleanup quando request terminar
    const cleanup = () => {
      this.activeRequests--;
      this.processQueue();
    };
    
    res.on('finish', cleanup);
    res.on('error', cleanup);
    res.on('close', cleanup);
    
    // Timeout para requests muito lentas
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({
          error: 'Request Timeout',
          message: 'Request processing timeout',
        });
        cleanup();
      }
    }, this.requestTimeout);
    
    res.on('finish', () => clearTimeout(timeout));
    res.on('error', () => clearTimeout(timeout));
    res.on('close', () => clearTimeout(timeout));
    
    next();
  }
  
  /**
   * Adiciona request na fila
   */
  private queueRequest(req: Request, res: Response, next: NextFunction): void {
    const queuedRequest = {
      req,
      res,
      next,
      timestamp: Date.now(),
    };
    
    this.queuedRequests.push(queuedRequest);
    
    // Timeout para requests na fila
    const timeout = setTimeout(() => {
      const index = this.queuedRequests.indexOf(queuedRequest);
      if (index !== -1) {
        this.queuedRequests.splice(index, 1);
        
        if (!res.headersSent) {
          res.status(503).json({
            error: 'Service Unavailable',
            message: 'Request timed out in queue',
          });
        }
      }
    }, this.requestTimeout);
    
    // Limpar timeout quando processado
    const originalNext = next;
    next = () => {
      clearTimeout(timeout);
      originalNext();
    };
    
    queuedRequest.next = next;
    
    logger.warn('Request queued due to backpressure', {
      metadata: {
        activeRequests: this.activeRequests,
        maxConcurrent: this.maxConcurrent,
        queueSize: this.queuedRequests.length,
        maxQueueSize: this.maxQueueSize,
        url: req.url,
        method: req.method,
      },
    });
  }
  
  /**
   * Processa fila de requests
   */
  private processQueue(): void {
    while (
      this.activeRequests < this.maxConcurrent &&
      this.queuedRequests.length > 0
    ) {
      const queued = this.queuedRequests.shift()!;
      
      // Verificar se request ainda é válida
      const age = Date.now() - queued.timestamp;
      if (age > this.requestTimeout) {
        continue; // Skip requests muito antigas
      }
      
      this.processRequest(queued.req, queued.res, queued.next);
    }
  }
  
  /**
   * Rejeita request quando sistema sobrecarregado
   */
  private rejectRequest(req: Request, res: Response): void {
    logger.error('Request rejected - system overloaded', {
      activeRequests: this.activeRequests,
      maxConcurrent: this.maxConcurrent,
      queueSize: this.queuedRequests.length,
      maxQueueSize: this.maxQueueSize,
      url: req.url,
      method: req.method,
      ip: req.ip,
    });
    
    if (!res.headersSent) {
      res.status(503).json({
        error: 'Service Unavailable',
        message: 'System overloaded, please try again later',
        retryAfter: 30,
      });
    }
  }
  
  /**
   * Obtém status atual
   */
  getStatus(): {
    activeRequests: number;
    maxConcurrent: number;
    queueSize: number;
    maxQueueSize: number;
    utilization: number;
  } {
    return {
      activeRequests: this.activeRequests,
      maxConcurrent: this.maxConcurrent,
      queueSize: this.queuedRequests.length,
      maxQueueSize: this.maxQueueSize,
      utilization: (this.activeRequests / this.maxConcurrent) * 100,
    };
  }
  
  /**
   * Configura novos limites
   */
  setLimits(maxConcurrent: number, maxQueueSize: number): void {
    this.maxConcurrent = maxConcurrent;
    this.maxQueueSize = maxQueueSize;
    
    logger.info('Backpressure limits updated', {
      metadata: {
        maxConcurrent,
        maxQueueSize,
        activeRequests: this.activeRequests,
        queueSize: this.queuedRequests.length,
      },
    });
  }
}

/**
 * Configurações de backpressure por tipo de endpoint
 */
export const BACKPRESSURE_CONFIG = {
  // API endpoints
  API: {
    maxConcurrent: 100,
    maxQueueSize: 500,
    requestTimeout: 30000,
  },
  
  // Database operations
  DATABASE: {
    maxConcurrent: 50,
    maxQueueSize: 200,
    requestTimeout: 10000,
  },
  
  // File operations
  FILE_UPLOAD: {
    maxConcurrent: 10,
    maxQueueSize: 50,
    requestTimeout: 60000,
  },
  
  // External APIs
  EXTERNAL_API: {
    maxConcurrent: 20,
    maxQueueSize: 100,
    requestTimeout: 15000,
  },
  
  // Heavy operations
  HEAVY_OPERATIONS: {
    maxConcurrent: 5,
    maxQueueSize: 25,
    requestTimeout: 120000,
  },
} as const;

/**
 * Controllers globais
 */
export const backpressureControllers = {
  api: new BackpressureController(
    BACKPRESSURE_CONFIG.API.maxConcurrent,
    BACKPRESSURE_CONFIG.API.maxQueueSize,
    BACKPRESSURE_CONFIG.API.requestTimeout
  ),
  
  database: new BackpressureController(
    BACKPRESSURE_CONFIG.DATABASE.maxConcurrent,
    BACKPRESSURE_CONFIG.DATABASE.maxQueueSize,
    BACKPRESSURE_CONFIG.DATABASE.requestTimeout
  ),
  
  fileUpload: new BackpressureController(
    BACKPRESSURE_CONFIG.FILE_UPLOAD.maxConcurrent,
    BACKPRESSURE_CONFIG.FILE_UPLOAD.maxQueueSize,
    BACKPRESSURE_CONFIG.FILE_UPLOAD.requestTimeout
  ),
  
  externalApi: new BackpressureController(
    BACKPRESSURE_CONFIG.EXTERNAL_API.maxConcurrent,
    BACKPRESSURE_CONFIG.EXTERNAL_API.maxQueueSize,
    BACKPRESSURE_CONFIG.EXTERNAL_API.requestTimeout
  ),
  
  heavyOperations: new BackpressureController(
    BACKPRESSURE_CONFIG.HEAVY_OPERATIONS.maxConcurrent,
    BACKPRESSURE_CONFIG.HEAVY_OPERATIONS.maxQueueSize,
    BACKPRESSURE_CONFIG.HEAVY_OPERATIONS.requestTimeout
  ),
};

/**
 * Middleware para API geral
 */
export function apiBackpressure() {
  return backpressureControllers.api.middleware();
}

/**
 * Middleware para operações pesadas
 */
export function heavyBackpressure() {
  return backpressureControllers.heavyOperations.middleware();
}

/**
 * Middleware para uploads
 */
export function uploadBackpressure() {
  return backpressureControllers.fileUpload.middleware();
}

/**
 * Obtém status de todos os controllers
 */
export function getAllBackpressureStatus(): Record<string, any> {
  return {
    api: backpressureControllers.api.getStatus(),
    database: backpressureControllers.database.getStatus(),
    fileUpload: backpressureControllers.fileUpload.getStatus(),
    externalApi: backpressureControllers.externalApi.getStatus(),
    heavyOperations: backpressureControllers.heavyOperations.getStatus(),
  };
}

/**
 * Ajusta limites dinamicamente baseado na carga
 */
export function adjustBackpressureLimits(cpuUsage: number, memoryUsage: number): void {
  // Reduz limites se sistema sobrecarregado
  if (cpuUsage > 80 || memoryUsage > 80) {
    const reductionFactor = 0.7; // Reduz 30%
    
    Object.values(backpressureControllers).forEach(controller => {
      const current = controller.getStatus();
      controller.setLimits(
        Math.floor(current.maxConcurrent * reductionFactor),
        Math.floor(current.maxQueueSize * reductionFactor)
      );
    });
    
    logger.warn('Backpressure limits reduced due to system load', {
      metadata: {
        cpuUsage,
        memoryUsage,
        reductionFactor,
      },
    });
  } else if (cpuUsage < 50 && memoryUsage < 50) {
    // Aumenta limites se sistema ocioso
    const increaseFactor = 1.2; // Aumenta 20%
    
    Object.values(backpressureControllers).forEach(controller => {
      const current = controller.getStatus();
      controller.setLimits(
        Math.floor(current.maxConcurrent * increaseFactor),
        Math.floor(current.maxQueueSize * increaseFactor)
      );
    });
    
    logger.info('Backpressure limits increased due to low load', {
      metadata: {
        cpuUsage,
        memoryUsage,
        increaseFactor,
      },
    });
  }
}
