/**
 * Validadores de Input Externo (API Boundary)
 * 
 * Fornece funções de validação type-safe para inputs externos
 * Evita uso de 'any' e garante validação robusta
 * 
 * NOTA: Type guards básicos (isString, isNumber, etc.) foram movidos para type-guards.ts
 * para evitar duplicação. Este arquivo foca em validação de negócio e boundary.
 */

import { ValidationError } from './errors/typed-errors.js';
import { 
  isString, 
  isNumber, 
  isBoolean, 
  isRecord, 
  isArray 
} from './type-guards.js';

// Re-export basic type guards for backward compatibility
export { isString, isNumber, isBoolean, isRecord as isObject, isArray };

/**
 * Type guard para arrays tipados
 */
export function isArrayOf<T>(
  value: unknown,
  guard: (item: unknown) => item is T
): value is T[] {
  return isArray(value) && value.every(guard);
}

/**
 * Type guard para strings não vazias
 */
export function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

/**
 * Type guard para números positivos
 */
export function isPositiveNumber(value: unknown): value is number {
  return isNumber(value) && value > 0;
}

/**
 * Type guard para números inteiros
 */
export function isInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value);
}

/**
 * Type guard para emails (validação básica)
 */
export function isEmail(value: unknown): value is string {
  if (!isString(value)) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

/**
 * Type guard para URLs
 */
export function isUrl(value: unknown): value is string {
  if (!isString(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Type guard para datas válidas
 */
export function isDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Type guard para strings de data (ISO)
 */
export function isDateString(value: unknown): value is string {
  if (!isString(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

/**
 * Validador de payload com estrutura obrigatória
 */
export function validatePayload<T extends Record<string, unknown>>(
  payload: unknown,
  requiredKeys: (keyof T)[]
): T {
  if (!isRecord(payload)) {
    throw new ValidationError('Payload deve ser um objeto');
  }

  const missing = requiredKeys.filter(key => !(key in payload));
  if (missing.length > 0) {
    throw new ValidationError(`Campos obrigatórios faltando: ${missing.join(', ')}`);
  }

  return payload as T;
}

/**
 * Validador de motivo (string não vazia)
 */
export function validateMotivo(motivo: unknown): string {
  if (!isNonEmptyString(motivo)) {
    throw new ValidationError('Motivo inválido: deve ser uma string não vazia');
  }
  return motivo.trim();
}

/**
 * Validador de metadata (objeto seguro)
 */
export function validateMetadata(metadata: unknown): Record<string, unknown> {
  if (!isRecord(metadata)) {
    throw new ValidationError('Metadata inválido: deve ser um objeto');
  }
  return metadata;
}

/**
 * Validador de ID numérico
 */
export function validateId(id: unknown): number {
  if (!isPositiveInteger(id)) {
    throw new ValidationError('ID inválido: deve ser um número inteiro positivo');
  }
  return id;
}

/**
 * Type guard para números inteiros positivos
 */
export function isPositiveInteger(value: unknown): value is number {
  return isInteger(value) && value > 0;
}

/**
 * Validador de paginação
 */
export function validatePagination(params: unknown): {
  page: number;
  limit: number;
  offset: number;
} {
  if (!isRecord(params)) {
    throw new ValidationError('Parâmetros de paginação inválidos');
  }

  const page = isNumber(params.page) ? Math.max(1, params.page) : 1;
  const limit = isNumber(params.limit) ? Math.min(100, Math.max(1, params.limit)) : 10;
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Validador de opções de cache
 */
export function validateCacheOptions(options: unknown): {
  ttl?: number;
  maxSize?: number;
} {
  if (!isRecord(options)) {
    return {};
  }

  const result: { ttl?: number; maxSize?: number } = {};

  if (isPositiveNumber(options.ttl)) {
    result.ttl = Math.min(3600, Math.max(1, options.ttl));
  }

  if (isPositiveInteger(options.maxSize)) {
    result.maxSize = Math.min(10000, Math.max(1, options.maxSize));
  }

  return result;
}

/**
 * Sanitizador de strings (remove caracteres perigosos)
 */
export function sanitizeString(value: unknown): string {
  if (!isString(value)) return '';
  
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

/**
 * Validador de nome de arquivo
 */
export function validateFileName(fileName: unknown): string {
  if (!isNonEmptyString(fileName)) {
    throw new ValidationError('Nome de arquivo inválido');
  }

  const sanitized = sanitizeString(fileName);
  const invalidChars = /[<>:"/\\|?*]/;
  
  if (invalidChars.test(sanitized)) {
    throw new ValidationError('Nome de arquivo contém caracteres inválidos');
  }

  if (sanitized.length > 255) {
    throw new ValidationError('Nome de arquivo muito longo (máximo 255 caracteres)');
  }

  return sanitized;
}
