/**
 * Type Guards e Validadores Seguros
 * 
 * Fornece funções de validação type-safe para inputs externos
 * Evita uso de 'any' e garante validação robusta
 */

/**
 * Type guard para strings
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard para números
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

/**
 * Type guard para booleanos
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Type guard para objetos (não null)
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard para arrays
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Type guard para arrays tipados
 */
export function isArrayOf<T>(
  value: unknown,
  guard: (item: unknown) => item is T
): value is T[] {
  return Array.isArray(value) && value.every(guard);
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
  if (!isObject(payload)) {
    throw new Error('Payload deve ser um objeto');
  }

  const missing = requiredKeys.filter(key => !(key in payload));
  if (missing.length > 0) {
    throw new Error(`Campos obrigatórios faltando: ${missing.join(', ')}`);
  }

  return payload as T;
}

/**
 * Validador de motivo (string não vazia)
 */
export function validateMotivo(motivo: unknown): string {
  if (!isNonEmptyString(motivo)) {
    throw new Error('Motivo inválido: deve ser uma string não vazia');
  }
  return motivo.trim();
}

/**
 * Validador de metadata (objeto seguro)
 */
export function validateMetadata(metadata: unknown): Record<string, unknown> {
  if (!isObject(metadata)) {
    throw new Error('Metadata inválido: deve ser um objeto');
  }
  return metadata;
}

/**
 * Validador de ID numérico
 */
export function validateId(id: unknown): number {
  if (!isPositiveInteger(id)) {
    throw new Error('ID inválido: deve ser um número inteiro positivo');
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
 * Validador de tenant ID
 */
export function validateTenantId(tenantId: unknown): number {
  const id = validateId(tenantId);
  if (id > 999999) {
    throw new Error('Tenant ID inválido: valor muito alto');
  }
  return id;
}

/**
 * Validador de paginação
 */
export function validatePagination(params: unknown): {
  page: number;
  limit: number;
  offset: number;
} {
  if (!isObject(params)) {
    throw new Error('Parâmetros de paginação inválidos');
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
  if (!isObject(options)) {
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
    throw new Error('Nome de arquivo inválido');
  }

  const sanitized = sanitizeString(fileName);
  const invalidChars = /[<>:"/\\|?*]/;
  
  if (invalidChars.test(sanitized)) {
    throw new Error('Nome de arquivo contém caracteres inválidos');
  }

  if (sanitized.length > 255) {
    throw new Error('Nome de arquivo muito longo (máximo 255 caracteres)');
  }

  return sanitized;
}
