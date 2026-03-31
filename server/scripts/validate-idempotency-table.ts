/**
 * Valida que a tabela idempotency_keys existe com UNIQUE(commandName, key).
 * Uso: tsx server/scripts/validate-idempotency-table.ts
 */
import "../_core/loadEnv.js";
import * as db from "../db/index.js";

async function main() {
  const conn = await db.getDb();
  if (!conn) {
    console.error("Banco indisponível.");
    process.exit(1);
  }
  const { sql } = db;
  try {
    const [rows]: any = await (conn as any).execute(sql`
      SELECT TABLE_NAME, COLUMN_NAME, COLUMN_DEFAULT, COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'idempotency_keys'
      ORDER BY ORDINAL_POSITION
    `);
    const [idx]: any = await (conn as any).execute(sql`
      SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'idempotency_keys'
      ORDER BY INDEX_NAME, SEQ_IN_INDEX
    `);
    console.log("--- Colunas idempotency_keys ---");
    if (!rows || rows.length === 0) {
      console.error("Tabela idempotency_keys não existe.");
      process.exit(1);
    }
    rows.forEach((r: any) => console.log(r.COLUMN_NAME, r.COLUMN_TYPE, "DEFAULT", r.COLUMN_DEFAULT));
    console.log("\n--- Índices ---");
    (idx || []).forEach((r: any) => console.log(r.INDEX_NAME, "UNIQUE:", r.NON_UNIQUE === 0, "COL:", r.COLUMN_NAME));
    const uniqueCmdKey = (idx || []).find((r: any) => r.INDEX_NAME === "idempotency_cmd_key" && r.NON_UNIQUE === 0);
    if (!uniqueCmdKey) {
      console.error("\nFALHA: índice UNIQUE idempotency_cmd_key (commandName, key) não encontrado.");
      process.exit(1);
    }
    const createdAtIndex = (idx || []).find((r: any) => r.INDEX_NAME === "idempotency_created_at_idx" && r.COLUMN_NAME === "created_at");
    if (!createdAtIndex) {
      console.error("\nFALHA: índice idempotency_created_at_idx em created_at não encontrado.");
      process.exit(1);
    }
    const createdAtCol = (rows || []).find((r: any) => r.COLUMN_NAME === "created_at");
    if (!createdAtCol || (createdAtCol.COLUMN_DEFAULT !== "CURRENT_TIMESTAMP" && String(createdAtCol.COLUMN_DEFAULT || "").toLowerCase() !== "current_timestamp()")) {
      console.error("\nFALHA: coluna created_at sem DEFAULT CURRENT_TIMESTAMP (ou current_timestamp()).");
      process.exit(1);
    }
    console.log("\nOK: tabela idempotency_keys existe com UNIQUE(commandName, key), índice em created_at e created_at DEFAULT CURRENT_TIMESTAMP.");
    process.exit(0);
  } catch (e: any) {
    console.error("Erro:", e?.message || e);
    process.exit(1);
  }
}

main();
