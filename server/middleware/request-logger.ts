/**
 * Middleware para logging estruturado de requisições
 * 
 * Registra logs padronizados para cada requisição com:
 * - requestId (único para cada requisição)
 * - tenantId (quando disponível)
 * - endpoint (método + caminho)
 * - tempo de execução
 * - status de resposta
 */

import { Request, Response, NextFunction } from "express";
import { nanoid } from 'nanoid';
import { createLogger } from '../infra/structured-logger.js';
import { recordRequest } from '../infra/metrics.js';

const logger = createLogger('request-logger');
type UserWithTenant = { tenantId?: number | string };

// Tipos para estender o objeto Request
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      startTime?: number;
    }
  }
}

/**
 * Middleware para logging estruturado de requisições
 */
export function requestLoggerMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Gerar ID único para a requisição
    const requestId = nanoid(10);
    req.requestId = req.requestId ?? requestId;
    
    // Registrar tempo de início
    req.startTime = Date.now();
    
    // SECURITY: tenantId must come from JWT only
    const tenantId = extractTenantId(req);
    const traceId = req.traceId;
    
    // Log inicial da requisição
    logger.info(`${req.method} ${req.path} started`, {
      requestId,
      traceId,
      tenantId,
      metadata: {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        query: req.query,
        body: sanitizeBody(req.body),
      }
    });
    
    // Capturar resposta para logging
    const originalEnd = res.end.bind(res);
    const originalJson = res.json.bind(res);
    let responseBody: unknown;
    
    // Interceptar res.json para capturar o corpo da resposta
    res.json = function(body: unknown) {
      responseBody = body;
      return originalJson(body);
    };
    
    // Interceptar res.end para registrar o log final
    res.end = function(chunk?: unknown, ...args: unknown[]) {
      const endTime = Date.now();
      const responseTime = endTime - (req.startTime || endTime);
      
      // Verificar se a resposta demorou mais de 10 segundos
      const isSlowResponse = responseTime > 10000;
      
      // Log final da requisição
      const logLevel = res.statusCode >= 500 ? 'error' : 
                      res.statusCode >= 400 || isSlowResponse ? 'warn' : 'info';
      
      const logMessage = `${req.method} ${req.path} ${res.statusCode} ${responseTime}ms`;
      
      logger[logLevel](logMessage, {
        requestId,
        traceId,
        tenantId,
        duration: responseTime,
        metadata: {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          responseTime,
          slow: isSlowResponse,
          response: sanitizeResponse(responseBody),
        }
      });
      
      // Registrar métrica
      recordRequest({
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: responseTime,
        timestamp: new Date(),
        userId: getUserId(req),
        tenantId,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      
      // Se a resposta for lenta, emitir alerta
      if (isSlowResponse) {
        logger.warn(`Slow response detected: ${responseTime}ms`, {
          requestId,
          tenantId,
          duration: responseTime,
          metadata: {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            threshold: 10000,
          }
        });
      }
      
      return originalEnd(
        ...(chunk === undefined
          ? (args as Parameters<Response["end"]>)
          : ([chunk, ...args] as Parameters<Response["end"]>))
      );
    };
    
    next();
  };
}

/**
 * Sanitiza o corpo da requisição para evitar logs de dados sensíveis
 */
function sanitizeBody(body: unknown): unknown {
  if (!body) return undefined;
  if (!isRecord(body)) return body;
  
  const sanitized = { ...body };
  
  // Remover campos sensíveis
  const sensitiveFields = ['password', 'senha', 'token', 'apiKey', 'secret', 'authorization'];
  sensitiveFields.forEach(field => {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  return sanitized;
}

/**
 * Sanitiza a resposta para evitar logs muito grandes
 */
function sanitizeResponse(response: unknown): unknown {
  if (!response) return undefined;
  
  // Se for um array grande, mostrar apenas o tamanho
  if (Array.isArray(response) && response.length > 5) {
    return `[Array(${response.length})]`;
  }
  
  // Se for um objeto, verificar se tem propriedades específicas
  if (isRecord(response)) {
    // Se tiver muitas propriedades, mostrar apenas um resumo
    const keys = Object.keys(response);
    if (keys.length > 10) {
      return `[Object with ${keys.length} properties]`;
    }
    
    // Se tiver dados específicos, mostrar apenas o necessário
    if ('items' in response && Array.isArray(response.items) && response.items.length > 5) {
      return {
        ...response,
        items: `[Array(${response.items.length})]`
      };
    }
  }
  
  return response;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getUserId(req: Request): number | undefined {
  const candidate = (req as Request & { user?: { id?: unknown } }).user?.id;
  return typeof candidate === "number" ? candidate : undefined;
}

function extractTenantId(req: Request): number | undefined {
  const reqWithTenant = req as Request & { tenantId?: unknown; user?: unknown };

  const requestTenantId = Number(reqWithTenant.tenantId);
  if (Number.isFinite(requestTenantId) && requestTenantId > 0) {
    return requestTenantId;
  }

  const user = reqWithTenant.user;
  if (typeof user === 'object' && user !== null) {
    const userTenantId = Number((user as UserWithTenant).tenantId);
    if (Number.isFinite(userTenantId) && userTenantId > 0) {
      return userTenantId;
    }
  }

  return undefined;
}

export default requestLoggerMiddleware;