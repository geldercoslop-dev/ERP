/**
 * Type Guards e Helpers para TypeScript
 */

import { logger } from './logger.js';

/**
 * AssertNever - Guard para exaustividade de switch/case
 * 
 * Garante que todos os casos de um union type foram tratados
 * Se chegar aqui, há um caso não coberto
 * 
 * @param value - Valor que nunca deveria chegar
 * @param context - Contexto para debugging
 */
export function assertNever(value: never, context?: string): never {
  const error = new Error(`AssertNever: Unhandled case${context ? ` in ${context}` : ''}`);
  
  logger.error(
    {
      value: JSON.stringify(value),
      type: typeof value,
      context,
      stack: error.stack,
      timestamp: new Date().toISOString()
    },
    'TypeScript exhaustiveness check failed - missing case in switch/union'
  );
  
  // Em desenvolvimento, falha rápido
  if (process.env.NODE_ENV === 'development') {
    throw error;
  }
  
  // Em produção, loga e retorna never (força throw)
  throw error;
}

/**
 * Verifica se um valor é um Record (objeto simples)
 */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && v.constructor === Object.prototype;
}

/**
 * Verifica se um valor é string
 */
export function isString(v: unknown): v is string {
  return typeof v === 'string';
}

/**
 * Verifica se um valor é number
 */
export function isNumber(v: unknown): v is number {
  return typeof v === 'number' && !isNaN(v);
}

/**
 * Verifica se um valor é boolean
 */
export function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

/**
 * Type guard para arrays
 */
export function isArray<T>(v: unknown, guard?: (item: unknown) => item is T): v is T[] {
  if (!Array.isArray(v)) return false;
  if (guard) return v.every(guard);
  return true;
}

/**
 * Converte valor para string de forma segura
 */
export function safeString(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

/**
 * Converte valor para number de forma segura
 */
export function safeNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const num = Number(v);
  return isNaN(num) ? 0 : num;
}

/**
 * Helper para acesso seguro a propriedades de objetos desconhecidos
 */
export function safeGet<T>(
  obj: unknown,
  key: string
): T | undefined {
  if (!isRecord(obj)) return undefined;
  return obj[key] as T | undefined;
}

/**
 * Helper para retornos padronizados
 */
export function createResponse<T = unknown>(
  success: boolean,
  message: string,
  data?: T
): { success: boolean; message: string; data?: T } {
  return { success, message, data };
}

// ============================================================================
// FASE 1: LOCK DE TIPOS CRÍTICOS
// ============================================================================

/**
 * ISO String Type Guard
 * 
 * Valida se uma string está no formato ISO 8601
 * Usado para garantir que datas do DB estão no formato correto
 */
export function isISODateString(v: unknown): v is string {
  if (!isString(v)) return false;
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})?$/;
  return isoRegex.test(v);
}

/**
 * Converte Date para ISO string de forma segura
 * 
 * @param date - Date object ou valor conversível
 * @returns ISO string ou null se inválido
 */
export function toISODateString(date: Date | string | null | undefined): string | null {
  if (date === null || date === undefined) return null;
  if (isString(date)) {
    return isISODateString(date) ? date : null;
  }
  if (date instanceof Date) {
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  }
  return null;
}

/**
 * Converte ISO string para Date de forma segura
 * 
 * @param isoString - ISO string ou null
 * @returns Date object ou null se inválido
 */
export function fromISODateString(isoString: string | null | undefined): Date | null {
  if (!isString(isoString)) return null;
  if (!isISODateString(isoString)) return null;
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return null;
  return date;
}

/**
 * Tinyint Type Guard (0 ou 1)
 * 
 * Valida se um número é um tinyint válido (0 ou 1)
 * Usado para campos boolean no DB que são armazenados como tinyint
 */
export function isTinyint(v: unknown): v is 0 | 1 {
  return v === 0 || v === 1;
}

/**
 * Converte boolean para tinyint (0 ou 1)
 * 
 * @param value - boolean ou valor conversível
 * @returns 0 ou 1
 */
export function booleanToTinyint(value: boolean | number | null | undefined): 0 | 1 {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value > 0 ? 1 : 0;
  return 0;
}

/**
 * Converte tinyint para boolean
 * 
 * @param value - tinyint (0 ou 1) ou valor conversível
 * @returns boolean
 */
export function tinyintToBoolean(value: number | boolean | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return false;
}

/**
 * ID Type Guard
 * 
 * Valida se um valor é um ID válido (number positivo ou string não vazia)
 */
export function isValidId(v: unknown): v is number | string {
  if (typeof v === 'number') return v > 0 && Number.isInteger(v);
  if (typeof v === 'string') return v.length > 0;
  return false;
}

/**
 * Assert ISO Date String
 * 
 * Runtime assertion para garantir que um valor é ISO string
 * Lança erro se não for válido
 */
export function assertISODateString(v: unknown, context?: string): asserts v is string {
  if (!isISODateString(v)) {
    throw new Error(
      `Expected ISO date string${context ? ` in ${context}` : ''}, got: ${JSON.stringify(v)}`
    );
  }
}

/**
 * Assert Tinyint
 * 
 * Runtime assertion para garantir que um valor é tinyint (0 ou 1)
 * Lança erro se não for válido
 */
export function assertTinyint(v: unknown, context?: string): asserts v is 0 | 1 {
  if (!isTinyint(v)) {
    throw new Error(
      `Expected tinyint (0 or 1)${context ? ` in ${context}` : ''}, got: ${JSON.stringify(v)}`
    );
  }
}

/**
 * Assert Valid ID
 * 
 * Runtime assertion para garantir que um valor é um ID válido
 * Lança erro se não for válido
 */
export function assertValidId(v: unknown, context?: string): asserts v is number | string {
  if (!isValidId(v)) {
    throw new Error(
      `Expected valid ID (positive number or non-empty string)${context ? ` in ${context}` : ''}, got: ${JSON.stringify(v)}`
    );
  }
}
