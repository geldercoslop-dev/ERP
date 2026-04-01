import { getConnectionPool } from "../config/database.js";
import { logger } from "../utils/logger.js";

const MAX_ATTEMPTS = Math.max(1, Number(process.env.DB_BOOT_MAX_ATTEMPTS) || 20);
const INITIAL_MS = Math.max(100, Number(process.env.DB_BOOT_BACKOFF_MS) || 1000);

/**
 * Aguarda o MySQL responder a um ping simples, com backoff exponencial (teto 30s).
 * Falha após MAX_ATTEMPTS → o caller deve encerrar o processo (fail-fast).
 */
export async function waitForDatabaseReady(): Promise<void> {
  let delay = INITIAL_MS;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const pool = await getConnectionPool();
      await pool.query("SELECT 1 AS ok");
      logger.info({ msg: "db_boot_ok", attempt, maxAttempts: MAX_ATTEMPTS } as Record<string, unknown>);
      return;
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code?: unknown }).code) : undefined;
      logger.error({
        msg: "db_boot_retry",
        attempt,
        maxAttempts: MAX_ATTEMPTS,
        error: err.message,
        code,
      } as Record<string, unknown>);
      if (attempt === MAX_ATTEMPTS) {
        logger.error({ msg: "db_boot_fatal", attempts: MAX_ATTEMPTS } as Record<string, unknown>);
        throw err;
      }
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(Math.floor(delay * 1.5), 30_000);
    }
  }
}
