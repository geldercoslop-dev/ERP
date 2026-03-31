import express, { Request, Response, NextFunction } from 'express';
import { createLogger } from '../infra/structured-logger.js';

const logger = createLogger('payload-security');

/**
 * Configuração de limites de payload
 * Protege contra ataques de payload grande
 */
export function payloadLimitMiddleware(options: {
  jsonLimit?: string;
  urlencodedLimit?: string;
  textLimit?: string;
  rawLimit?: string;
} = {}) {
  const {
    jsonLimit = '1mb',
    urlencodedLimit = '1mb',
    textLimit = '1mb',
    rawLimit = '1mb',
  } = options;

  return [
    // JSON body parser com limite
    express.json({
      limit: jsonLimit,
      strict: true,
      type: 'application/json',
    }),
    
    // URL-encoded body parser com limite
    express.urlencoded({
      extended: true,
      limit: urlencodedLimit,
      parameterLimit: 1000, // Limite de parâmetros
    }),
    
    // Text body parser com limite
    express.text({
      limit: textLimit,
      type: 'text/plain',
    }),
    
    // Raw body parser com limite
    express.raw({
      limit: rawLimit,
      type: 'application/octet-stream',
    }),
  ];
}

/**
 * Middleware para validar tamanho específico por endpoint
 */
export function endpointPayloadLimit(options: {
  maxBodySize?: number; // bytes
  maxParamCount?: number;
  sensitivePaths?: string[];
}) {
  const {
    maxBodySize = 1024 * 1024, // 1MB padrão
    maxParamCount = 100,
    sensitivePaths = ['/auth', '/login', '/leo/'],
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const contentLength = parseInt(req.get('Content-Length') || '0', 10);
      
      // Verifica se o caminho é sensível
      const isSensitivePath = sensitivePaths.some(path => req.path.includes(path));
      const limitForPath = isSensitivePath ? maxBodySize / 2 : maxBodySize; // Metade do tamanho para paths sensíveis
      
      // Verifica tamanho do payload
      if (contentLength > limitForPath) {
        logger.warn('Payload too large', {
        metadata: {
          path: req.path,
          method: req.method,
          contentLength,
          limit: limitForPath,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        },
        timestamp: new Date().toISOString(),
      });
        
        return res.status(413).json({
          error: 'Payload Too Large',
          message: `Request entity too large. Maximum size is ${limitForPath} bytes.`,
          received: contentLength,
          limit: limitForPath,
        });
      }
      
      // Verifica número de parâmetros
      if (req.body && typeof req.body === 'object') {
        const paramCount = Object.keys(req.body).length;
        if (paramCount > maxParamCount) {
          logger.warn('Too many parameters', {
          metadata: {
            path: req.path,
            method: req.method,
            paramCount,
            limit: maxParamCount,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
          },
          timestamp: new Date().toISOString(),
        });
          
          return res.status(400).json({
            error: 'Too Many Parameters',
            message: `Request contains too many parameters. Maximum is ${maxParamCount}.`,
            received: paramCount,
            limit: maxParamCount,
          });
        }
      }
      
      // Verifica conteúdo suspeito
      const contentType = req.get('Content-Type') || '';
      if (contentType.includes('application/json') && req.body) {
        const bodyStr = JSON.stringify(req.body);
        
        // Verifica patterns suspeitos
        const suspiciousPatterns = [
          /<script/i,
          /javascript:/i,
          /on\w+\s*=/i,
          /eval\s*\(/i,
          /exec\s*\(/i,
          /system\s*\(/i,
          /shell_exec/i,
          /passthru/i,
        ];
        
        for (const pattern of suspiciousPatterns) {
          if (pattern.test(bodyStr)) {
            logger.error('Suspicious content detected', 'Suspicious content detected', {
              metadata: {
                path: req.path,
                method: req.method,
                pattern: pattern.source,
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                body: req.body,
                severity: 'HIGH',
              },
              timestamp: new Date().toISOString(),
            });
            
            return res.status(400).json({
              error: 'Invalid Content',
              message: 'Request contains suspicious content',
            });
          }
        }
      }
      
      next();
    } catch (error) {
      logger.error('Payload validation error', error as Error, {
        metadata: {
          path: req.path,
          method: req.method,
          ip: req.ip,
        },
      });
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Error processing request payload',
      });
    }
  };
}

/**
 * Middleware para streaming de arquivos
 */
export function fileUploadMiddleware(options: {
  maxFileSize?: number; // bytes
  maxFiles?: number;
  allowedTypes?: string[];
}) {
  const {
    maxFileSize = 5 * 1024 * 1024, // 5MB
    maxFiles = 5,
    allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.includes('/upload')) {
      return next();
    }
    
    const contentLength = parseInt(req.get('Content-Length') || '0', 10);
    const contentType = req.get('Content-Type') || '';
    
    // Verifica tamanho total
    if (contentLength > maxFileSize * maxFiles) {
      logger.warn('File upload too large', {
        metadata: {
          path: req.path,
          contentLength,
          maxSize: maxFileSize * maxFiles,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        },
        timestamp: new Date().toISOString(),
      });
      
      return res.status(413).json({
        error: 'File Too Large',
        message: `Total upload size exceeds limit of ${maxFileSize * maxFiles} bytes`,
      });
    }
    
    // Verifica tipo de conteúdo
    if (!allowedTypes.includes(contentType)) {
      logger.warn('Invalid file type', {
        metadata: {
          path: req.path,
          contentType,
          allowedTypes,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        },
        timestamp: new Date().toISOString(),
      });
      
      return res.status(400).json({
        error: 'Invalid File Type',
        message: `File type ${contentType} is not allowed`,
        allowedTypes,
      });
    }
    
    next();
  };
}

/**
 * Middleware completo de proteção de payload
 */
export function completePayloadProtection(options: {
  jsonLimit?: string;
  maxBodySize?: number;
  maxParamCount?: number;
  maxFileSize?: number;
} = {}) {
  return [
    ...payloadLimitMiddleware({
      jsonLimit: options.jsonLimit,
    }),
    endpointPayloadLimit({
      maxBodySize: options.maxBodySize,
      maxParamCount: options.maxParamCount,
    }),
    fileUploadMiddleware({
      maxFileSize: options.maxFileSize,
    }),
  ];
}
