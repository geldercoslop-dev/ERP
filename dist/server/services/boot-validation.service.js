import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { getConnectionPool } from "../config/database.js";
import { buildBootstrapInvocation, runWithServiceInvocationAsync } from "../runtime/service-invocation.js";
export async function validateBootDatabaseConnection() {
    const pool = await getConnectionPool();
    const conn = await pool.getConnection();
    try {
        await conn.query("SELECT 1 AS pool_test");
    }
    finally {
        conn.release();
    }
    const warnings = [];
    const missingTables = [];
    const db = await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => {
        return getDb();
    });
    await db.execute(sql `SELECT 1 AS test`);
    try {
        await db.execute(sql `SELECT version FROM schema_version LIMIT 1`);
    }
    catch {
        warnings.push("schema_version table not found - may need migration");
    }
    try {
        await db.execute(sql `SELECT 1 FROM users LIMIT 1`);
    }
    catch {
        missingTables.push("users");
    }
    try {
        await db.execute(sql `SELECT 1 FROM tenants LIMIT 1`);
    }
    catch {
        missingTables.push("tenants");
    }
    return { missingTables, warnings };
}
