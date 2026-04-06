/**
 * Runtime Payload Validation
 * 
 * Validação segura de payloads externos
 * Previne ataques e dados corrompidos
 */

import { logger } from './logger.js';
import { isString, isObject, isNumber, isBoolean } from './validators.js';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitized?: Record<string, unknown>;
}

interface ValidationRule {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  allowedValues?: unknown[];
  sanitize?: boolean;
}

interface ValidationSchema {
  [key: string]: ValidationRule;
}

/**
 * Valida valor individual contra regra
 */
function validateValue(
  key: string,
  value: unknown,
  rule: ValidationRule
): { isValid: boolean; error?: string; sanitized?: unknown } {
  // Required check
  if (rule.required && (value === undefined || value === null)) {
    return {
      isValid: false,
      error: `Field '${key}' is required`
    };
  }

  // Skip validation if not provided and not required
  if (value === undefined || value === null) {
    return { isValid: true };
  }

  // Type validation
  if (rule.type) {
    let typeValid = true;
    
    switch (rule.type) {
      case 'string':
        typeValid = isString(value);
        break;
      case 'number':
        typeValid = isNumber(value);
        break;
      case 'boolean':
        typeValid = isBoolean(value);
        break;
      case 'object':
        typeValid = isObject(value);
        break;
      case 'array':
        typeValid = Array.isArray(value);
        break;
    }
    
    if (!typeValid) {
      return {
        isValid: false,
        error: `Field '${key}' must be of type ${rule.type}`
      };
    }
  }

  // String validations
  if (isString(value)) {
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      return {
        isValid: false,
        error: `Field '${key}' must be at least ${rule.minLength} characters`
      };
    }
    
    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      return {
        isValid: false,
        error: `Field '${key}' must be at most ${rule.maxLength} characters`
      };
    }
    
    if (rule.pattern && !rule.pattern.test(value)) {
      return {
        isValid: false,
        error: `Field '${key}' format is invalid`
      };
    }
    
    // Sanitization
    let sanitized = value;
    if (rule.sanitize) {
      sanitized = value
        .trim()
        .replace(/[<>]/g, '') // Remove tags
        .replace(/javascript:/gi, '') // Remove JS URLs
        .replace(/on\w+\s*=/gi, ''); // Remove event handlers
    }
    
    return { isValid: true, sanitized };
  }

  // Number validations
  if (isNumber(value)) {
    if (rule.min !== undefined && value < rule.min) {
      return {
        isValid: false,
        error: `Field '${key}' must be at least ${rule.min}`
      };
    }
    
    if (rule.max !== undefined && value > rule.max) {
      return {
        isValid: false,
        error: `Field '${key}' must be at most ${rule.max}`
      };
    }
  }

  // Allowed values validation
  if (rule.allowedValues && !rule.allowedValues.includes(value)) {
    return {
      isValid: false,
      error: `Field '${key}' must be one of: ${rule.allowedValues.join(', ')}`
    };
  }

  return { isValid: true };
}

/**
 * Valida payload completo contra schema
 */
export function validatePayload(
  payload: Record<string, unknown>,
  schema: ValidationSchema
): ValidationResult {
  const errors: string[] = [];
  const sanitized: Record<string, unknown> = {};

  // Validate each field
  for (const [key, rule] of Object.entries(schema)) {
    const value = payload[key];
    const result = validateValue(key, value, rule);
    
    if (!result.isValid) {
      errors.push(result.error || `Field '${key}' validation failed`);
    } else if (result.sanitized !== undefined) {
      sanitized[key] = result.sanitized;
    } else {
      sanitized[key] = value;
    }
  }

  // Check for unexpected fields
  const allowedFields = Object.keys(schema);
  const unexpectedFields = Object.keys(payload).filter(key => !allowedFields.includes(key));
  
  if (unexpectedFields.length > 0) {
    errors.push(`Unexpected fields: ${unexpectedFields.join(', ')}`);
  }

  const isValid = errors.length === 0;
  
  if (!isValid) {
    logger.warn(
      {
        payload: JSON.stringify(payload),
        errors,
        schema: Object.keys(schema),
        timestamp: new Date().toISOString()
      },
      'Payload validation failed'
    );
  }

  return {
    isValid,
    errors,
    sanitized: isValid ? sanitized : undefined
  };
}

/**
 * Schemas de validação comuns
 */
export const commonSchemas = {
  // Login payload
  login: {
    email: {
      required: true,
      type: 'string' as const,
      minLength: 5,
      maxLength: 255,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      sanitize: true
    },
    password: {
      required: true,
      type: 'string' as const,
      minLength: 8,
      maxLength: 128
    }
  } as ValidationSchema,

  // Registration payload
  register: {
    name: {
      required: true,
      type: 'string' as const,
      minLength: 2,
      maxLength: 100,
      sanitize: true
    },
    email: {
      required: true,
      type: 'string' as const,
      minLength: 5,
      maxLength: 255,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      sanitize: true
    },
    password: {
      required: true,
      type: 'string' as const,
      minLength: 8,
      maxLength: 128
    }
  } as ValidationSchema,

  // ID validation
  id: {
    id: {
      required: true,
      type: 'number' as const,
      min: 1,
      max: 2147483647
    }
  } as ValidationSchema,

  // Tenant ID validation
  tenantId: {
    tenantId: {
      required: true,
      type: 'number' as const,
      min: 1,
      max: 2147483647
    }
  } as ValidationSchema,

  // Pagination validation
  pagination: {
    page: {
      required: false,
      type: 'number' as const,
      min: 1,
      max: 1000
    },
    limit: {
      required: false,
      type: 'number' as const,
      min: 1,
      max: 100
    }
  } as ValidationSchema,

  // Search query validation
  search: {
    query: {
      required: false,
      type: 'string' as const,
      maxLength: 500,
      sanitize: true
    },
    filters: {
      required: false,
      type: 'object' as const
    }
  } as ValidationSchema
};

/**
 * Middleware de validação de payload
 */
export function createPayloadValidator(schema: ValidationSchema) {
  return (payload: Record<string, unknown>): ValidationResult => {
    return validatePayload(payload, schema);
  };
}

/**
 * Validação rápida (boolean only)
 */
export function isValidPayload(
  payload: Record<string, unknown>,
  schema: ValidationSchema
): boolean {
  const result = validatePayload(payload, schema);
  return result.isValid;
}

/**
 * Sanitização básica de payload
 */
export function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(payload)) {
    if (isString(value)) {
      sanitized[key] = value
        .trim()
        .replace(/[<>]/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    } else if (isNumber(value) || isBoolean(value)) {
      sanitized[key] = value;
    } else if (isObject(value) && !Array.isArray(value)) {
      sanitized[key] = sanitizePayload(value as Record<string, unknown>);
    } else {
      // Skip arrays and unknown types
      continue;
    }
  }
  
  return sanitized;
}

/**
 * Detecta padrões suspeitos no payload
 */
export function detectSuspiciousPatterns(payload: Record<string, unknown>): string[] {
  const suspicious: string[] = [];
  const patterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /expression\s*\(/gi,
    /@import/gi,
    /union\s+select/gi,
    /drop\s+table/gi,
    /insert\s+into/gi,
    /delete\s+from/gi
  ];
  
  function checkValue(value: unknown, path: string = ''): void {
    if (isString(value)) {
      for (const pattern of patterns) {
        if (pattern.test(value)) {
          suspicious.push(`${path}: ${pattern.source}`);
        }
      }
    } else if (isObject(value) && !Array.isArray(value)) {
      for (const [subKey, subValue] of Object.entries(value)) {
        checkValue(subValue, path ? `${path}.${subKey}` : subKey);
      }
    }
  }
  
  checkValue(payload);
  
  if (suspicious.length > 0) {
    logger.warn(
      {
        payload: JSON.stringify(payload),
        suspicious,
        timestamp: new Date().toISOString()
      },
      'Suspicious patterns detected in payload'
    );
  }
  
  return suspicious;
}
