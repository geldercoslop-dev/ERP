/**
 * Verificação rápida de DB + Redis (sem subir HTTP).
 * Usado por pnpm run verify:system
 * Alinhado a loadEnv: apenas `.env` na raiz, sem override em cadeia.
 */
import dotenv from "dotenv";
import path from "path";

const root = process.cwd();
dotenv.config({ path: path.resolve(root, ".env"), override: false });

async function main(): Promise<void> {
  console.log("[DB] testando pool MySQL…");
  const { getConnectionPool } = await import("../config/database.js");
  const pool = await getConnectionPool();
  await pool.query("SELECT 1 AS verify_ping");
  console.log("[DB] ok");

  console.log("[REDIS] testando conexão…");
  const { redisManager } = await import("../infra/redis.js");
  const r = await redisManager.testConnection();
  if (!r.success) {
    console.error("[REDIS] falha:", r.message);
    process.exit(1);
  }
  console.log("[REDIS] ok", r.latency != null ? `(${r.latency}ms)` : "");
}

main().catch((e: unknown) => {
  console.error("[ERROR]", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
