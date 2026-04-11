/**
 * Safe Defaults Middleware
 * 
 * Garante que todos os endpoints retornem dados seguros
 */

import { Request, Response, NextFunction } from 'express';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function notNull<T>(value: T | null | undefined): value is T {
  return value != null;
}

/**
 * Fallback seguro para endpoints que podem retornar undefined
 */
export function safeDefaults(req: Request, res: Response, next: NextFunction) {
  // Override do método json para garantir defaults seguros
  const originalJson = res.json;
  
  res.json = function(data: unknown) {
    // Se data for undefined ou null, aplicar fallback
    if (data === undefined || data === null) {
      data = {
        insights: [],
        alerts: [],
        recommendations: [],
        metrics: {},
        success: false,
        error: 'No data available',
        timestamp: new Date().toISOString()
      };
    }
    
    // Se for objeto, garantir campos seguros
    if (isRecord(data)) {
      // Garantir arrays vazios em vez de undefined
      if (!Array.isArray(data.insights)) data.insights = [];
      if (!Array.isArray(data.alerts)) data.alerts = [];
      if (!Array.isArray(data.recommendations)) data.recommendations = [];
      if (!Array.isArray(data.suggestions)) data.suggestions = [];
      if (!isRecord(data.metrics)) data.metrics = {};
      if (!isRecord(data.data)) data.data = {};
      
      // Garantir valores padrão
      if (typeof data.success !== "boolean") data.success = true;
      if (typeof data.timestamp !== "string" || !data.timestamp) data.timestamp = new Date().toISOString();
      
      // Sanitizar arrays para garantir que não sejam undefined
      data.insights = (data.insights as unknown[]).filter(notNull);
      data.alerts = (data.alerts as unknown[]).filter(notNull);
      data.recommendations = (data.recommendations as unknown[]).filter(notNull);
      data.suggestions = (data.suggestions as unknown[]).filter(notNull);
    }
    
    return originalJson.call(this, data as never);
  };
  
  next();
}

/**
 * Wrapper para handlers assíncronos com tratamento de erro seguro
 */
export function safeHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res, next);
    } catch (error: unknown) {
      console.error('[SafeHandler] Erro capturado:', error);
      
      // Retornar resposta segura em caso de erro
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        insights: [],
        alerts: [],
        recommendations: [],
        metrics: {},
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * Middleware para garantir que respostas de analytics sejam seguras
 */
export function safeAnalyticsResponse(req: Request, res: Response, next: NextFunction) {
  const originalSend = res.send;
  const originalJson = res.json;
  
  res.json = function(data: unknown) {
    if (isRecord(data)) {
      // Garantir estrutura segura para respostas de analytics
      const safeData = {
        insights: Array.isArray(data.insights) ? (data.insights as unknown[]).filter(notNull) : [],
        alerts: Array.isArray(data.alerts) ? (data.alerts as unknown[]).filter(notNull) : [],
        suggestions: Array.isArray(data.suggestions) ? (data.suggestions as unknown[]).filter(notNull) : [],
        recommendations: Array.isArray(data.recommendations) ? (data.recommendations as unknown[]).filter(notNull) : [],
        metrics: isRecord(data.metrics) ? data.metrics : {},
        health: data.health ?? {
          score: 0,
          status: 'unknown',
          fatores: { vendas: 0, estoque: 0, financeiro: 0, operacional: 0 }
        },
        success: data.success !== false,
        error: data.error ?? null,
        timestamp: typeof data.timestamp === "string" && data.timestamp ? data.timestamp : new Date().toISOString()
      };
      
      return originalJson.call(this, safeData as never);
    }
    
    return originalJson.call(this, data as never);
  };
  
  next();
}

/**
 * Middleware para validar e sanitizar parâmetros
 */
export function sanitizeParams(req: Request, res: Response, next: NextFunction) {
  // Sanitizar query params
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      const value = req.query[key];
      if (typeof value === 'string') {
        // Remover caracteres perigosos
        req.query[key] = value
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .trim();
      }
    });
  }
  
  // Sanitizar body params
  if (req.body && typeof req.body === 'object') {
    const sanitizeObject = (obj: unknown): unknown => {
      if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
      }
      
      if (obj && typeof obj === 'object') {
        const sanitized: Record<string, unknown> = {};
        const source = obj as Record<string, unknown>;
        Object.keys(source).forEach(key => {
          const value = source[key];
          if (typeof value === 'string') {
            sanitized[key] = value
              .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
              .replace(/javascript:/gi, '')
              .trim();
          } else {
            sanitized[key] = sanitizeObject(value);
          }
        });
        return sanitized;
      }
      
      return obj;
    };
    
    req.body = sanitizeObject(req.body);
  }
  
  next();
}

/**
 * Middleware de rate limiting seguro
 */
export function safeRateLimit(options: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  const requests = new Map<string, { count: number; resetTime: number }>();
  
  return (req: Request, res: Response, next: NextFunction) => {
    const clientId = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    
    // Limpar entradas expiradas
    for (const [id, data] of Array.from(requests.entries())) {
      if (now > data.resetTime) {
        requests.delete(id);
      }
    }
    
    const clientData = requests.get(clientId);
    
    if (!clientData) {
      // Primeira requisição da janela
      requests.set(clientId, {
        count: 1,
        resetTime: now + options.windowMs
      });
      return next();
    }
    
    if (clientData.count >= options.max) {
      return res.status(429).json({
        success: false,
        error: options.message || 'Too many requests',
        retryAfter: Math.ceil((clientData.resetTime - now) / 1000),
        insights: [],
        alerts: [],
        recommendations: [],
        metrics: {},
        timestamp: new Date().toISOString()
      });
    }
    
    // Incrementar contador
    clientData.count++;
    next();
  };
}

/**
 * Middleware para headers de segurança
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Headers de segurança básicos
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Headers de cache
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // Headers customizados
  res.setHeader('X-API-Version', '1.0.0');
  res.setHeader('X-Server-Time', new Date().toISOString());
  
  next();
}
