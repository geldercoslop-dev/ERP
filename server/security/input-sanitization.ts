import { Request, Response, NextFunction } from 'express';
import { body, validationResult, query, param } from 'express-validator';

/**
 * Sanitização global de inputs
 * Remove scripts, HTML malicioso e normaliza dados
 */
export class InputSanitizer {
  /**
   * Remove scripts e HTML malicioso - APENAS PARA XSS
   * NÃO USAR PARA SQL INJECTION - USAR PREPARED STATEMENTS
   */
  static removeScripts(input: string): string {
    if (typeof input !== 'string') return input;
    
    return input
      // Remove <script> tags
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // Remove event handlers
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
      // Remove javascript: protocol
      .replace(/javascript:/gi, '')
      // Remove HTML tags
      .replace(/<[^>]*>/g, '')
      .trim();
  }

  /**
   * Sanitiza string básica
   */
  static sanitizeString(input: string): string {
    if (typeof input !== 'string') return input;
    
    return this.removeScripts(input)
      .replace(/[<>]/g, '') // Remove brackets
      .replace(/["']/g, '') // Remove quotes
      .trim();
  }

  /**
   * Sanitiza email
   */
  static sanitizeEmail(input: string): string {
    if (typeof input !== 'string') return input;
    
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9@._-]/g, ''); // Apenas caracteres válidos de email
  }

  /**
   * Sanitiza telefone
   */
  static sanitizePhone(input: string): string {
    if (typeof input !== 'string') return input;
    
    return input
      .replace(/\D/g, '') // Apenas números
      .replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3'); // Formato brasileiro
  }

  /**
   * Sanitiza CPF/CNPJ
   */
  static sanitizeDocument(input: string): string {
    if (typeof input !== 'string') return input;
    
    return input.replace(/\D/g, ''); // Apenas números
  }

  /**
   * Sanitiza objeto inteiro recursivamente
   */
  static sanitizeObject(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }
    
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
}

/**
 * Middleware de sanitização global
 */
export function sanitizationMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Sanitiza query parameters
      if (req.query) {
        req.query = InputSanitizer.sanitizeObject(req.query);
      }
      
      // Sanitiza body
      if (req.body) {
        req.body = InputSanitizer.sanitizeObject(req.body);
      }
      
      // Sanitiza params
      if (req.params) {
        req.params = InputSanitizer.sanitizeObject(req.params);
      }
      
      next();
    } catch (error) {
      console.error('[Sanitization] Error:', error);
      res.status(400).json({
        error: 'Invalid input data',
        message: 'Request contains invalid characters',
      });
    }
  };
}

/**
 * Middleware de validação com sanitização
 */
export function validationMiddleware(validations: any[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Run validations
      await Promise.all(validations.map(validation => validation.run(req)));
      
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.warn('[Validation] Errors:', {
          errors: errors.array(),
          path: req.path,
          method: req.method,
          ip: req.ip,
          timestamp: new Date().toISOString(),
        });
        
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array(),
        });
      }
      
      next();
    } catch (error) {
      console.error('[Validation] Error:', error);
      res.status(500).json({
        error: 'Validation error',
        message: 'Internal server error during validation',
      });
    }
  };
}

/**
 * Validações comuns reutilizáveis
 */
export const commonValidations = {
  email: body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email inválido'),
  
  password: body('password')
    .isLength({ min: 8 })
    .withMessage('Senha deve ter pelo menos 8 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Senha deve conter letras maiúsculas, minúsculas e números'),
  
  nome: body('nome')
    .isLength({ min: 2, max: 255 })
    .withMessage('Nome deve ter entre 2 e 255 caracteres')
    .escape(),
  
  telefone: body('telefone')
    .isMobilePhone('pt-BR')
    .withMessage('Telefone inválido'),
  
  id: param('id')
    .isInt({ min: 1 })
    .withMessage('ID inválido'),
  
  tenantId: body('tenantId')
    .isInt({ min: 1 })
    .withMessage('Tenant ID inválido'),
  
  pagina: query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Página deve ser um número inteiro positivo'),
  
  pageSize: query('pageSize')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Tamanho da página deve ser entre 1 e 100'),
};

/**
 * Middleware específico para endpoints críticos
 */
export function criticalValidationMiddleware() {
  return [
    // Validações básicas para todos os endpoints críticos
    body().custom((value, { req }) => {
      // Verifica se há scripts no body
      const bodyStr = JSON.stringify(value);
      if (/<script|javascript:|on\w+=/i.test(bodyStr)) {
        throw new Error('Conteúdo não permitido');
      }
      return true;
    }),
    
    // Sanitização adicional
    (req: Request, res: Response, next: NextFunction) => {
      const originalSend = res.send;
      res.send = function(data: any) {
        // Log de tentativas suspeitas
        if (req.body && typeof req.body === 'object') {
          const bodyStr = JSON.stringify(req.body);
          if (/<script|javascript:|on\w+=/i.test(bodyStr)) {
            console.error('[Security] Suspicious content detected:', {
              ip: req.ip,
              userAgent: req.get('User-Agent'),
              path: req.path,
              method: req.method,
              body: req.body,
              timestamp: new Date().toISOString(),
            });
          }
        }
        
        return originalSend.call(this, data);
      };
      
      next();
    },
  ];
}
