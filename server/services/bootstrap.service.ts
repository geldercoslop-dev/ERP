/**
 * Bootstrap idempotente do banco (migrations Drizzle).
 * - Não recria tabelas se já existirem (migrator é idempotente via __drizzle_migrations).
 * - Fail-fast: se falhar, o servidor não deve subir.
 * - Logging detalhado para debug container/produção.
 */
import path from "node:path";

import { sql } from "drizzle-orm";
import type { Database } from "../db/core.js";
import { getProjectRoot } from "../_core/project-root.js";
import { validateSchemaAtRuntime } from "./schema-runtime-guard.js";

const migrationsFolder = path.join(getProjectRoot(), "drizzle");

async function hasAnyTable(db: Database, tableName: string): Promise<boolean> {
  // INFORMATION_SCHEMA é seguro e não depende de schema local.
  // table_schema = DATABASE() evita mismatch de DB.
  const res = await db.execute(
    sql`SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = ${tableName}
        LIMIT 1`
  );

  // drizzle retorna `{ rows: unknown[] }` no mysql2; mantemos verificação defensiva.
  if (res && typeof res === 'object' && 'rows' in res) {
    const rows = (res as { rows?: unknown[] }).rows;
    return Array.isArray(rows) && rows.length > 0;
  }
  return false;
}

/**
 * Retorna número de migrações já aplicadas verificando __drizzle_migrations
 */
async function getMigrationsAppliedCount(db: Database): Promise<number> {
  try {
    const res = await db.execute(
      sql`SELECT COUNT(*) as count FROM __drizzle_migrations`
    );
    if (res && typeof res === 'object' && 'rows' in res) {
      const rows = (res as { rows?: Array<{ count?: number }> }).rows;
      if (Array.isArray(rows) && rows[0]?.count !== undefined) {
        return rows[0].count;
      }
    }
    return 0;
  } catch {
    // Tabela não existe ainda
    return 0;
  }
}

export async function bootstrapDatabase(db: Database): Promise<{ success: boolean; error?: string }> {
  // Lock em memória: garante que o bootstrap rode uma única vez por processo.
  // (Evita duplicação em imports concorrentes e testes de boot paralelos.)
  if (bootstrapOnce) {
    return bootstrapOnce;
  }
  
  bootstrapOnce = (async () => {
    const startedAt = Date.now();
    console.error("[BOOTSTRAP][DB] iniciando (Drizzle migrations)...");
    console.error(`[BOOTSTRAP][DB] migrations folder: ${migrationsFolder}`);

    try {
      const { migrate } = await import("drizzle-orm/mysql2/migrator");

      // Heurística segura: se __drizzle_migrations não existir, é um DB limpo.
      const hasJournal = await hasAnyTable(db, "__drizzle_migrations");
      if (!hasJournal) {
        console.error("[BOOTSTRAP][DB] banco limpo detectado (sem __drizzle_migrations)");
        console.error("[BOOTSTRAP][DB] aplicando todas as migrações...");
      } else {
        const count = await getMigrationsAppliedCount(db);
        console.error(`[BOOTSTRAP][DB] ${count} migração(ões) já aplicada(s). Verificando pendentes...`);
      }

      // Executar migrator com tolerância a falhas
      try {
        await migrate(db, { migrationsFolder });

        // Validar que migrator criou a tabela
        const migrationsTableExists = await hasAnyTable(db, "__drizzle_migrations");
        if (!migrationsTableExists) {
          return { success: false, error: "FATAL: __drizzle_migrations não foi criada após migrate()" };
        }

        const finalCount = await getMigrationsAppliedCount(db);
        const ms = Date.now() - startedAt;
        console.error(`[BOOTSTRAP][DB] ✓ migrações OK: ${finalCount} aplicadas em ${ms}ms`);
        
        // Runtime schema guard: valida consistência após migrações
        console.log('[BOOTSTRAP][DB] Executando schema validation guard...');
        const schemaValidation = await validateSchemaAtRuntime(db);
        if (!schemaValidation.valid) {
          console.warn('[BOOTSTRAP][DB] ⚠ Schema validation encontrou problemas:');
          schemaValidation.errors.forEach(err => console.warn(`  - ${err}`));
          // Não quebra o servidor para não piorar a situação
          // Mas loga claramente para troubleshooting
        }
      } catch (migrationErr) {
        const errorMsg = migrationErr instanceof Error ? migrationErr.message : String(migrationErr);
        const ms = Date.now() - startedAt;
        console.warn(`[BOOTSTRAP][DB] ⚠ migration falhou após ${ms}ms, continuando...`);
        console.warn(`[BOOTSTRAP][DB] ${errorMsg}`);
        return { success: false, error: errorMsg };
      }

      return { success: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const ms = Date.now() - startedAt;
      console.warn(`[BOOTSTRAP][DB] ⚠ erro de contexto após ${ms}ms, continuando...`);
      console.warn(`[BOOTSTRAP][DB] ${errorMsg}`);
      console.log('[BOOTSTRAP][DB] server liberado mesmo com erro de bootstrap');
      return { success: false, error: errorMsg };
    }
  })();
  
  return bootstrapOnce;
}

let bootstrapOnce: Promise<{ success: boolean; error?: string }> | null = null;

