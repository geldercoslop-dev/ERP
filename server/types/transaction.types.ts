/**
 * Database Transaction Types - Type-safe transaction handling
 * 
 * Fornece tipos seguros para transações de banco de dados
 * Evita uso de 'any' em callbacks de transação
 */

import type * as mysql from 'mysql2/promise';

/**
 * Tipo seguro para conexão em transação
 * Use este tipo em vez de 'any' para callbacks de transação
 */
export type TransactionConnection = mysql.PoolConnection & {
  execute: (sql: string, values?: unknown[]) => Promise<[mysql.RowDataPacket[][], mysql.FieldPacket[]]>;
  query: (sql: string, values?: unknown[]) => Promise<[mysql.RowDataPacket[][], mysql.FieldPacket[]]>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
};

/**
 * Resultado típico de execute/query
 */
export interface QueryResult<T = mysql.RowDataPacket[]> {
  rows: T[];
  fields?: mysql.FieldPacket[];
}

/**
 * Tipo para função de callback de transação
 * @example
 * ```typescript
 * const result = await runTransaction(async (tx: TransactionConnection) => {
 *   const [rows] = await tx.execute('SELECT * FROM users WHERE id = ?', [1]);
 *   return rows[0];
 * });
 * ```
 */
export type TransactionCallback<T = unknown> = (
  tx: TransactionConnection
) => Promise<T>;
