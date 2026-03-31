import type { RowDataPacket } from "mysql2/promise";
import { getConnectionPool } from "../config/database.js";

export async function semanticMemoryQueryRows(sqlText: string, params: unknown[]): Promise<RowDataPacket[]> {
  try {
    const pool = await getConnectionPool();
    const [rows] = await pool.query<RowDataPacket[]>(sqlText, params);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function semanticMemoryExecute(sqlText: string, params: unknown[]): Promise<void> {
  try {
    const pool = await getConnectionPool();
    await pool.query(sqlText, params);
  } catch {
    void 0;
  }
}

export async function semanticMemoryExecuteMany(
  statements: Array<{ sql: string; params: unknown[] }>
): Promise<void> {
  for (const s of statements) {
    await semanticMemoryExecute(s.sql, s.params);
  }
}
