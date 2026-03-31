import { Request, Response, NextFunction } from 'express';

type Payload = Record<string, unknown>;

/**
 * VALIDATION MIDDLEWARE
 * 
 * Validates request payloads based on entity type
 * Ensures required fields and proper formatting
 */

interface ValidationRule {
  required?: string[];
  optional?: string[];
  validators?: Record<string, (value: unknown) => boolean | string>;
}

const validationRules: Record<string, ValidationRule> = {
  client: {
    required: ['nome', 'email'],
    optional: ['telefone', 'endereco', 'cidade', 'estado', 'cep'],
    validators: {
      email: (value: unknown) => {
        if (typeof value !== 'string') return 'Email must be a string';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(value) || true;
      },
      nome: (value: unknown) => {
        if (typeof value !== 'string') return 'Name must be a string';
        return (value as string).trim().length >= 2 || 'Name must be at least 2 characters';
      }
    }
  },
  
  order: {
    required: ['clienteNome', 'formaPagamento', 'itens'],
    optional: ['clienteId', 'clientId', 'entradaForma', 'entradaValor', 'observacoes'],
    validators: {
      clienteNome: (value: unknown) => {
        if (typeof value !== 'string') return 'Client name must be a string';
        return (value as string).trim().length >= 2 || 'Client name must be at least 2 characters';
      },
      formaPagamento: (value: unknown) => {
        if (typeof value !== 'string') return 'Payment method must be a string';
        const validMethods = ['dinheiro', 'cartao', 'boleto', 'pix', 'transferencia'];
        return validMethods.includes(value) || `Invalid payment method. Valid: ${validMethods.join(', ')}`;
      },
      itens: (value: unknown) => {
        if (!Array.isArray(value)) return 'Items must be an array';
        return value.length > 0 || 'Order must have at least one item';
      }
    }
  },
  
  payment: {
    required: ['tipo', 'valor'],
    optional: ['pedidoId', 'dataVencimento', 'descricao', 'formaPagamento'],
    validators: {
      tipo: (value: unknown) => {
        if (typeof value !== 'string') return 'Type must be a string';
        const validTypes = ['receita', 'despesa', 'entrada', 'saida'];
        return validTypes.includes(value) || `Invalid type. Valid: ${validTypes.join(', ')}`;
      },
      valor: (value: unknown) => {
        if (typeof value !== 'number') return 'Value must be a number';
        return value > 0 || 'Value must be greater than 0';
      }
    }
  },
  
  status: {
    required: ['status'],
    validators: {
      status: (value: unknown) => {
        if (typeof value !== 'string') return 'Status must be a string';
        const validStatuses = ['pendente', 'confirmado', 'em_preparacao', 'enviado', 'entregue', 'cancelado'];
        return validStatuses.includes(value) || `Invalid status. Valid: ${validStatuses.join(', ')}`;
      }
    }
  },
  
  reconciliation: {
    optional: ['valorConciliado', 'dataConciliacao', 'observacoes'],
    validators: {
      valorConciliado: (value: unknown) => {
        if (value !== undefined && typeof value !== 'number') return 'Reconciled value must be a number';
        return value === undefined || value >= 0 || 'Reconciled value must be greater than or equal to 0';
      }
    }
  }
};

/**
 * Creates validation middleware for specific entity type
 */
export function validatePayload(entityType: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const payload: Payload = req.body;
      const rules = validationRules[entityType];
      
      if (!rules) {
        // No validation rules for this entity type
        return next();
      }

      const errors: string[] = [];

      // Check required fields
      if (rules.required) {
        for (const field of rules.required) {
          if (!(field in payload) || payload[field] === null || payload[field] === undefined) {
            errors.push(`${field} is required`);
          }
        }
      }

      // Run field validators
      if (rules.validators) {
        for (const [field, validator] of Object.entries(rules.validators)) {
          if (field in payload) {
            const result = validator(payload[field]);
            if (result !== true) {
              errors.push(`${field}: ${result}`);
            }
          }
        }
      }

      // Check for unexpected fields in optional
      if (rules.optional) {
        for (const field of Object.keys(payload)) {
          if (!rules.required?.includes(field) && !rules.optional?.includes(field) && field !== 'tenantId') {
            // Allow additional fields but warn about them
            console.warn(`[Validation] Unexpected field in ${entityType}: ${field}`);
          }
        }
      }

      if (errors.length > 0) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          message: 'Invalid request payload',
          details: errors
        });
        return;
      }

      // Validation passed
      next();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Validation error';
      
      res.status(500).json({
        success: false,
        error: 'Validation middleware error',
        message: 'Failed to validate request'
      });
    }
  };
}

/**
 * Generic validation middleware for any payload
 */
export function validateGenericPayload(req: Request, res: Response, next: NextFunction): void {
  try {
    const payload: Payload = req.body;
    
    // Basic validation - ensure it's an object
    if (!payload || typeof payload !== 'object') {
      res.status(400).json({
        success: false,
        error: 'Invalid payload',
        message: 'Request body must be a valid object'
      });
      return;
    }

    next();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Generic validation error';
    
    res.status(500).json({
      success: false,
      error: 'Validation middleware error',
      message: 'Failed to validate request'
    });
  }
}
