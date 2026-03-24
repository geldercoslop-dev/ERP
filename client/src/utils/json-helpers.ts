/**
 * Utilitários para parsing seguro de JSON
 */

import { AppError, ErrorCode } from '../types/error';

export type ParseOptions = {
  default?: unknown;
  throwOnError?: boolean;
  reviver?: (this: unknown, key: string, value: unknown) => unknown;
};

/**
 * Faz parse seguro de JSON com tratamento de erro
 * @param json - String JSON a fazer parse
 * @param options - Opções de parsing
 * @returns Objeto parseado ou valor default
 */
export function safeParseJson<T = unknown>(
  json: string | null | undefined,
  options: ParseOptions = {}
): T | undefined {
  const { default: defaultValue, throwOnError = false, reviver } = options;

  // Validar input
  if (!json || typeof json !== 'string') {
    if (throwOnError) {
      throw new AppError('JSON inválido: entrada não é uma string', ErrorCode.PARSE_ERROR);
    }
    return defaultValue as T | undefined;
  }

  try {
    return JSON.parse(json, reviver) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (throwOnError) {
      throw new AppError(`Erro ao fazer parse de JSON: ${message}`, ErrorCode.PARSE_ERROR);
    }

    return defaultValue as T | undefined;
  }
}

/**
 * Faz stringify seguro de objeto
 * @param obj - Objeto a converter
 * @param options - Opções de stringify
 * @returns String JSON ou string vazia
 */
export function safeStringifyJson(
  obj: unknown,
  options: {
    default?: string;
    replacer?: (this: unknown, key: string, value: unknown) => unknown;
    space?: number | string;
  } = {}
): string {
  const { default: defaultValue = '', replacer, space = 2 } = options;

  try {
    return JSON.stringify(obj, replacer as never, space);
  } catch {
    return defaultValue;
  }
}

/**
 * Clona um objeto de forma segura usando JSON
 * @param obj - Objeto a clonar
 * @returns Clone do objeto
 */
export function deepCloneByJson<T>(obj: T): T {
  try {
    return JSON.parse(JSON.stringify(obj)) as T;
  } catch {
    // Fallback para spread se não conseguir clonar
    return obj instanceof Object ? { ...obj } : obj;
  }
}

/**
 * Valida se uma string é JSON válido
 * @param json - String a validar
 * @returns true se é JSON válido
 */
export function isValidJson(json: string | null | undefined): boolean {
  if (!json || typeof json !== 'string') {
    return false;
  }

  try {
    JSON.parse(json);
    return true;
  } catch {
    return false;
  }
}

/**
 * Faz parse de JSON com schema validation básico
 * @param json - String JSON a fazer parse
 * @param requiredKeys - Chaves obrigatórias no objeto
 * @returns Objeto parseado ou undefined
 */
export function parseJsonWithSchema<T extends Record<string, unknown>>(
  json: string | null | undefined,
  requiredKeys?: string[]
): T | undefined {
  const parsed = safeParseJson<T>(json);

  if (!parsed) {
    return undefined;
  }

  // Validar schema básico
  if (requiredKeys && Array.isArray(requiredKeys)) {
    const missing = requiredKeys.filter((key) => !(key in parsed));

    if (missing.length > 0) {
      throw new AppError(
        `JSON inválido: chaves obrigatórias faltando: ${missing.join(', ')}`,
        ErrorCode.PARSE_ERROR
      );
    }
  }

  return parsed;
}

/**
 * Extrai valor de um caminho em objeto JSON parseado
 * @example getJsonPath({ a: { b: { c: 123 } } }, 'a.b.c') // 123
 */
export function getJsonPath<T = unknown>(
  obj: unknown,
  path: string,
  defaultValue?: T
): T | undefined {
  try {
    const keys = path.split('.');
    let current: unknown = obj;

    for (const key of keys) {
      if (typeof current !== 'object' || current === null) {
        return defaultValue;
      }

      if (!(key in current)) {
        return defaultValue;
      }

      current = (current as Record<string, unknown>)[key];
    }

    return current as T;
  } catch {
    return defaultValue;
  }
}
