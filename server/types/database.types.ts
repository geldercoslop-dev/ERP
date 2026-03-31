/**
 * Database Query Result Types - Type-safe database operations
 * 
 * Fornece tipos explícitos para resultados de queries MySQL
 * Elimina necessidade de 'any' em operações de banco
 */

import type * as mysql from 'mysql2/promise';

/**
 * Generic result type for any query returning rows
 * @example
 * ```typescript
 * const [rows] = await connection.query<{ id: number; name: string }>(sql);
 * const firstRow = rows[0]; // Type safe!
 * ```
 */
export interface QueryRow<T = Record<string, unknown>> {
  [key: string]: unknown;
}

/**
 * Result type for COUNT queries
 * @example
 * ```typescript
 * const [rows] = await connection.query<{ count: number }>(
 *   'SELECT COUNT(*) as count FROM table'
 * );
 * const count = rows[0]?.count ?? 0; // Type safe!
 * ```
 */
export interface CountRow extends QueryRow<{ count: number }> {
  count: number;
}

/**
 * Result type for INFORMATION_SCHEMA column queries
 * @example
 * ```typescript
 * const [rows] = await connection.query<InformationSchemaColumn>(
 *   'SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM information_schema.columns'
 * );
 * const columnType = rows[0]?.COLUMN_TYPE; // Type safe!
 * ```
 */
export interface InformationSchemaColumn {
  COLUMN_NAME: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: 'YES' | 'NO';
  COLUMN_KEY?: string;
  EXTRA?: string;
  COLUMN_DEFAULT?: string | null;
}

/**
 * Result type for INFORMATION_SCHEMA table queries
 */
export interface InformationSchemaTable {
  TABLE_NAME: string;
  TABLE_SCHEMA: string;
  TABLE_TYPE: string;
  ENGINE?: string;
}

/**
 * Result type for migrations check
 */
export interface MigrationRow {
  hash: string;
  name: string;
  applied_at?: Date;
}

/**
 * Type guard for CountRow results
 * @example
 * ```typescript
 * if (isCountRow(rows[0])) {
 *   console.log(`Total: ${rows[0].count}`);
 * }
 * ```
 */
export function isCountRow(row: unknown): row is CountRow {
  return (
    typeof row === 'object' &&
    row !== null &&
    'count' in row &&
    typeof (row as Record<string, unknown>).count === 'number'
  );
}

/**
 * Type guard for InformationSchemaColumn results
 */
export function isInformationSchemaColumn(row: unknown): row is InformationSchemaColumn {
  return (
    typeof row === 'object' &&
    row !== null &&
    'COLUMN_NAME' in row &&
    'COLUMN_TYPE' in row &&
    'IS_NULLABLE' in row
  );
}

/**
 * Safe query result extractor - eliminates need for `as any` casts
 * @example
 * ```typescript
 * const [rows] = await connection.query(sql);
 * const count = safeGet<CountRow>(rows, 0)?.count ?? 0;
 * ```
 */
export function safeGet<T extends QueryRow = QueryRow>(
  rows: unknown[] | undefined,
  index: number = 0
): T | undefined {
  if (!Array.isArray(rows) || index < 0 || index >= rows.length) {
    return undefined;
  }
  return rows[index] as T;
}

/**
 * Safe nested property accessor
 * @example
 * ```typescript
 * const count = safeGetProperty<number>(rows[0], 'count', 0);
 * ```
 */
export function safeGetProperty<T = unknown>(
  obj: unknown,
  key: string,
  defaultValue?: T
): T | undefined {
  if (typeof obj !== 'object' || obj === null) {
    return defaultValue;
  }
  const value = (obj as Record<string, unknown>)[key];
  return value !== undefined ? (value as T) : defaultValue;
}

/**
 * Assertion function for database rows
 * Throws if row is invalid
 * @example
 * ```typescript
 * const row = assertRow<MigrationRow>(rows[0], ['hash', 'name']);
 * ```
 */
export function assertRow<T extends QueryRow = QueryRow>(
  row: unknown,
  requiredKeys?: string[]
): T {
  if (typeof row !== 'object' || row === null) {
    throw new Error(`Expected row object, got ${typeof row}`);
  }

  if (requiredKeys && requiredKeys.length > 0) {
    for (const key of requiredKeys) {
      if (!(key in row)) {
        throw new Error(`Missing required key: ${key}`);
      }
    }
  }

  return row as T;
}

/**
 * Extract insert ID from query result
 * @example
 * ```typescript
 * const [result] = await connection.query('INSERT INTO table ...');
 * const id = getInsertId(result);
 * ```
 */
export function getInsertId(result: unknown): number {
  if (typeof result === 'object' && result !== null && 'insertId' in result) {
    const id = (result as Record<string, unknown>).insertId;
    if (typeof id === 'number') return id;
    if (typeof id === 'bigint') return Number(id);
  }
  throw new Error('Could not extract insert ID from query result');
}

/**
 * Extract affected rows count from query result
 * @example
 * ```typescript
 * const [result] = await connection.query('UPDATE table ...');
 * const count = getAffectedRows(result);
 * ```
 */
export function getAffectedRows(result: unknown): number {
  if (typeof result === 'object' && result !== null && 'affectedRows' in result) {
    const count = (result as Record<string, unknown>).affectedRows;
    if (typeof count === 'number') return count;
  }
  return 0;
}
