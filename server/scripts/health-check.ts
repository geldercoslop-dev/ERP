/**
 * Health-check do sistema: conexão com banco, consultas básicas (pedidos, produtos) e tabela de sessões.
 * Uso: tsx server/scripts/health-check.ts (ou npm run health-check se configurado).
 * Retorna exit 0 se tudo ok, exit 1 em falha.
 */
import "../_core/loadEnv";
import * as db from "../db/index";

function hasDbConfig(): boolean {
  if (process.env.DATABASE_URL?.trim()) return true;
  const host = process.env.DB_HOST?.trim();
  const user = process.env.DB_USER?.trim();
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME?.trim();
  return !!(host && user && password !== undefined && database);
}

async function main(): Promise<void> {
  if (!hasDbConfig()) {
    console.error("[health-check] Falha: banco não configurado (DATABASE_URL ou DB_*).");
    process.exit(1);
  }

  const conn = await db.getDb();
  if (!conn) {
    console.error("[health-check] Falha: conexão com banco indisponível.");
    process.exit(1);
  }

  try {
    await conn.select({ id: db.pedidos.id }).from(db.pedidos).limit(1);
  } catch (e) {
    console.error("[health-check] Falha: consulta pedidos:", (e as Error)?.message ?? e);
    process.exit(1);
  }

  try {
    await conn.select({ id: db.produtos.id }).from(db.produtos).limit(1);
  } catch (e) {
    console.error("[health-check] Falha: consulta produtos:", (e as Error)?.message ?? e);
    process.exit(1);
  }

  try {
    await conn.execute('SELECT token FROM sessions LIMIT 1');
  } catch (e) {
    console.error("[health-check] Falha: tabela sessões inacessível:", (e as Error)?.message ?? e);
    process.exit(1);
  }

  console.log("[health-check] OK: banco, pedidos, produtos e sessões.");
  process.exit(0);
}

main().catch((e) => {
  console.error("[health-check] Erro fatal:", e);
  process.exit(1);
});
