/**
 * Type Guards e Validadores Seguros
 *
 * Fornece funções de validação type-safe para inputs externos
 * Evita uso de 'any' e garante validação robusta
 */
import { ValidationError } from './errors/typed-errors.js';
/**
 * Type guard para strings
 */
export function isString(value) {
    return typeof value === 'string';
}
/**
 * Type guard para números
 */
export function isNumber(value) {
    return typeof value === 'number' && !Number.isNaN(value);
}
/**
 * Type guard para booleanos
 */
export function isBoolean(value) {
    return typeof value === 'boolean';
}
/**
 * Type guard para objetos (não null)
 */
export function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/**
 * Type guard para arrays
 */
export function isArray(value) {
    return Array.isArray(value);
}
/**
 * Type guard para arrays tipados
 */
export function isArrayOf(value, guard) {
    return Array.isArray(value) && value.every(guard);
}
/**
 * Type guard para strings não vazias
 */
export function isNonEmptyString(value) {
    return isString(value) && value.trim().length > 0;
}
/**
 * Type guard para números positivos
 */
export function isPositiveNumber(value) {
    return isNumber(value) && value > 0;
}
/**
 * Type guard para números inteiros
 */
export function isInteger(value) {
    return isNumber(value) && Number.isInteger(value);
}
/**
 * Type guard para emails (validação básica)
 */
export function isEmail(value) {
    if (!isString(value))
        return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
}
/**
 * Type guard para URLs
 */
export function isUrl(value) {
    if (!isString(value))
        return false;
    try {
        new URL(value);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Type guard para datas válidas
 */
export function isDate(value) {
    return value instanceof Date && !Number.isNaN(value.getTime());
}
/**
 * Type guard para strings de data (ISO)
 */
export function isDateString(value) {
    if (!isString(value))
        return false;
    const date = new Date(value);
    return !Number.isNaN(date.getTime());
}
/**
 * Validador de payload com estrutura obrigatória
 */
export function validatePayload(payload, requiredKeys) {
    if (!isObject(payload)) {
        throw new ValidationError('Payload deve ser um objeto');
    }
    const missing = requiredKeys.filter(key => !(key in payload));
    if (missing.length > 0) {
        throw new ValidationError(`Campos obrigatórios faltando: ${missing.join(', ')}`);
    }
    return payload;
}
/**
 * Validador de motivo (string não vazia)
 */
export function validateMotivo(motivo) {
    if (!isNonEmptyString(motivo)) {
        throw new ValidationError('Motivo inválido: deve ser uma string não vazia');
    }
    return motivo.trim();
}
/**
 * Validador de metadata (objeto seguro)
 */
export function validateMetadata(metadata) {
    if (!isObject(metadata)) {
        throw new ValidationError('Metadata inválido: deve ser um objeto');
    }
    return metadata;
}
/**
 * Validador de ID numérico
 */
export function validateId(id) {
    if (!isPositiveInteger(id)) {
        throw new ValidationError('ID inválido: deve ser um número inteiro positivo');
    }
    return id;
}
/**
 * Type guard para números inteiros positivos
 */
export function isPositiveInteger(value) {
    return isInteger(value) && value > 0;
}
/**
 * Validador de tenant ID
 */
export function validateTenantId(tenantId) {
    const id = validateId(tenantId);
    if (id > 999999) {
        throw new ValidationError('Tenant ID inválido: valor muito alto');
    }
    return id;
}
/**
 * Validador de paginação
 */
export function validatePagination(params) {
    if (!isObject(params)) {
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
export function validateCacheOptions(options) {
    if (!isObject(options)) {
        return {};
    }
    const result = {};
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
export function sanitizeString(value) {
    if (!isString(value))
        return '';
    return value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .trim();
}
/**
 * Validador de nome de arquivo
 */
export function validateFileName(fileName) {
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
