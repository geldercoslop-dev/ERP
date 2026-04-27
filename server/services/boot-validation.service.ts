import { sql } from "drizzle-orm";
import { getConnectionPool } from "../config/database.js";
import { buildBootstrapInvocation, runWithServiceInvocationAsync } from "../_core/service-entry-guard.js";

export interface BootDatabaseValidationDetails {
  missingTables: string[];
  warnings: string[];
}

export async function validateBootDatabaseConnection(): Promise<BootDatabaseValidationDetails> {
  const pool = await getConnectionPool();
  const conn = await pool.getConnection();
  try {
    await conn.query("SELECT 1 AS pool_test");
  } finally {
    conn.release();
  }

  const warnings: string[] = [];
  const missingTables: string[] = [];

  const db = await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => {
    const { getDb } = await import("../db/core.js");
    return getDb();
  });

  await db.execute(sql`SELECT 1 AS test`);

  try {
    await db.execute(sql`SELECT version FROM schema_version LIMIT 1`);
  } catch {
    warnings.push("schema_version table not found - may need migration");
  }

  try {
    await db.execute(sql`SELECT 1 FROM users LIMIT 1`);
  } catch {
    missingTables.push("users");
  }

  try {
    await db.execute(sql`SELECT 1 FROM tenants LIMIT 1`);
  } catch {
    missingTables.push("tenants");
  }

  return { missingTables, warnings };
}