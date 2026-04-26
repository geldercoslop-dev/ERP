/**
 * Limpeza de idempotency_keys:
 * - TTL 7 dias: remove registros com createdAt > 7 dias.
 * - "Em processamento" travado: remove registros com resultJson NULL e createdAt > 15 min.
 * Uso: tsx scripts/maintenance/cleanup-idempotency.ts
 */
import { initEnv } from "../../server/_core/env/bootstrapEnv";

initEnv();
import * as db from "../../server/db";
import { sql } from "drizzle-orm";

const TTL_DAYS = 7;
const STALE_IN_PROGRESS_MINUTES = 15;

async function main() {
  const conn = await db.getDb();
  if (!conn) {
    console.error("Banco indisponível.");
    process.exit(1);
  }

  try {
    const deletedStale = await (conn as any).execute(sql`
      DELETE FROM idempotency_keys
      WHERE resultJson IS NULL
        AND createdAt < DATE_SUB(NOW(), INTERVAL ${STALE_IN_PROGRESS_MINUTES} MINUTE)
    `);
    const staleCount = (deletedStale as any)[0]?.affectedRows ?? 0;

    const deletedTTL = await (conn as any).execute(sql`
      DELETE FROM idempotency_keys
      WHERE createdAt < DATE_SUB(NOW(), INTERVAL ${TTL_DAYS} DAY)
    `);
    const ttlCount = (deletedTTL as any)[0]?.affectedRows ?? 0;

    console.log(`[cleanup-idempotency] Removidos ${staleCount} registro(s) "em processamento" travados (> ${STALE_IN_PROGRESS_MINUTES} min).`);
    console.log(`[cleanup-idempotency] Removidos ${ttlCount} registro(s) antigos (> ${TTL_DAYS} dias).`);
  } catch (e) {
    console.error("Erro na limpeza:", e);
    process.exit(1);
  }
  process.exit(0);
}

main();
