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
