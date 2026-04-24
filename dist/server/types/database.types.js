/**
 * Database Query Result Types - Type-safe database operations
 *
 * Fornece tipos explícitos para resultados de queries MySQL
 * Elimina necessidade de 'any' em operações de banco
 */
import { ValidationError } from '../_core/errors/typed-errors.js';
/**
 * Type guard for CountRow results
 * @example
 * ```typescript
 * if (isCountRow(rows[0])) {
 *   console.log(`Total: ${rows[0].count}`);
 * }
 * ```
 */
export function isCountRow(row) {
    return (typeof row === 'object' &&
        row !== null &&
        'count' in row &&
        typeof row.count === 'number');
}
/**
 * Type guard for InformationSchemaColumn results
 */
export function isInformationSchemaColumn(row) {
    return (typeof row === 'object' &&
        row !== null &&
        'COLUMN_NAME' in row &&
        'COLUMN_TYPE' in row &&
        'IS_NULLABLE' in row);
}
/**
 * Safe query result extractor - eliminates need for `as any` casts
 * @example
 * ```typescript
 * const [rows] = await connection.query(sql);
 * const count = safeGet<CountRow>(rows, 0)?.count ?? 0;
 * ```
 */
export function safeGet(rows, index = 0) {
    if (!Array.isArray(rows) || index < 0 || index >= rows.length) {
        return undefined;
    }
    return rows[index];
}
/**
 * Safe nested property accessor
 * @example
 * ```typescript
 * const count = safeGetProperty<number>(rows[0], 'count', 0);
 * ```
 */
export function safeGetProperty(obj, key, defaultValue) {
    if (typeof obj !== 'object' || obj === null) {
        return defaultValue;
    }
    const value = obj[key];
    return value !== undefined ? value : defaultValue;
}
/**
 * Assertion function for database rows
 * Throws if row is invalid
 * @example
 * ```typescript
 * const row = assertRow<MigrationRow>(rows[0], ['hash', 'name']);
 * ```
 */
export function assertRow(row, requiredKeys) {
    if (typeof row !== 'object' || row === null) {
        throw new ValidationError(`Expected row object, got ${typeof row}`);
    }
    if (requiredKeys && requiredKeys.length > 0) {
        for (const key of requiredKeys) {
            if (!(key in row)) {
                throw new ValidationError(`Missing required key: ${key}`);
            }
        }
    }
    return row;
}
/**
 * Extract insert ID from query result
 * @example
 * ```typescript
 * const [result] = await connection.query('INSERT INTO table ...');
 * const id = getInsertId(result);
 * ```
 */
export function getInsertId(result) {
    if (typeof result === 'object' && result !== null && 'insertId' in result) {
        const id = result.insertId;
        if (typeof id === 'number')
            return id;
        if (typeof id === 'bigint')
            return Number(id);
    }
    throw new ValidationError('Could not extract insert ID from query result');
}
/**
 * Extract affected rows count from query result
 * @example
 * ```typescript
 * const [result] = await connection.query('UPDATE table ...');
 * const count = getAffectedRows(result);
 * ```
 */
export function getAffectedRows(result) {
    if (typeof result === 'object' && result !== null && 'affectedRows' in result) {
        const count = result.affectedRows;
        if (typeof count === 'number')
            return count;
    }
    return 0;
}
