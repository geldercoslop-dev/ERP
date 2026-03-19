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

import { Request, Response, NextFunction } from 'express';
import { nanoid } from 'nanoid';
import { createLogger } from '../infra/structured-logger';
import { recordRequest } from '../infra/metrics';

const logger = createLogger('request-logger');

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
    req.requestId = requestId;
    
    // Registrar tempo de início
    req.startTime = Date.now();
    
    // Extrair tenantId dos parâmetros ou do corpo
    const tenantId = 
      Number(req.query.tenantId) || 
      Number(req.body?.tenantId) || 
      undefined;
    
    // Log inicial da requisição
    logger.info(`${req.method} ${req.path} started`, {
      requestId,
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
    const originalEnd = res.end;
    const originalJson = res.json;
    let responseBody: any;
    
    // Interceptar res.json para capturar o corpo da resposta
    res.json = function(body: any) {
      responseBody = body;
      return originalJson.call(this, body);
    };
    
    // Interceptar res.end para registrar o log final
    res.end = function(chunk?: any, ...args: any[]) {
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
        userId: req.user?.id,
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
      
      return originalEnd.call(this, chunk, ...args);
    };
    
    next();
  };
}

/**
 * Sanitiza o corpo da requisição para evitar logs de dados sensíveis
 */
function sanitizeBody(body: any): any {
  if (!body) return undefined;
  
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
function sanitizeResponse(response: any): any {
  if (!response) return undefined;
  
  // Se for um array grande, mostrar apenas o tamanho
  if (Array.isArray(response) && response.length > 5) {
    return `[Array(${response.length})]`;
  }
  
  // Se for um objeto, verificar se tem propriedades específicas
  if (typeof response === 'object') {
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

export default requestLoggerMiddleware;