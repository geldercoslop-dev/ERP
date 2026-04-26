/**
 * Verificações locais (sem subir HTTP): ENV + schema Zod + MySQL + Redis.
 * Imports dinâmicos evitam inicializar Redis/MySQL quando VERIFY_SKIP_*=1.
 */
import { initEnv } from "../_core/env/bootstrapEnv.js";
import { getEnv } from "../config/env.js";

// Load ENV explicitly (NO import-time side effects)
initEnv();

async function main(): Promise<void> {
  console.log("[VERIFY] [ENV] validando schema e variáveis…");
  getEnv();
  console.log("[VERIFY] [ENV] OK");

  if (process.env.VERIFY_SKIP_DB === "1") {
    console.log("[VERIFY] [DB] omitido (VERIFY_SKIP_DB=1)");
  } else {
    console.log("[VERIFY] [DB] testando pool MySQL…");
    const { getConnectionPool } = await import("../config/database.js");
    const pool = await getConnectionPool();
    await pool.query("SELECT 1 AS verify_ping");
    console.log("[VERIFY] [DB] OK");
  }

  if (process.env.VERIFY_SKIP_REDIS === "1") {
    console.log("[VERIFY] [REDIS] omitido (VERIFY_SKIP_REDIS=1)");
  } else {
    console.log("[VERIFY] [REDIS] aguardando conexão…");
    const { waitForRedis } = await import("../infra/redis.js");
    const redisOk = await waitForRedis(20_000);
    if (!redisOk) {
      console.error("[VERIFY] [REDIS] FALHA — Redis não respondeu a tempo");
      process.exit(1);
    }
    console.log("[VERIFY] [REDIS] OK");
  }
}

main().catch((e) => {
  console.error("[VERIFY] [ERROR]", e);
  process.exit(1);
});
