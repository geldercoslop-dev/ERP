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
  // Verificação determinística usando COUNT(*) em information_schema
  const res = await db.execute(
    sql`SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = ${tableName}`
  );

  // Drizzle com mysql2 retorna [rows, fields] como array
  let rows: unknown;
  if (Array.isArray(res) && res.length >= 1) {
    rows = res[0];
  } else if (res && typeof res === 'object' && 'rows' in res) {
    rows = (res as { rows?: unknown }).rows;
  } else {
    console.error(`[BOOTSTRAP][DB] hasAnyTable(${tableName}): formato de retorno inesperado`);
    return false;
  }

  if (Array.isArray(rows) && rows[0] && typeof rows[0] === 'object' && 'count' in rows[0]) {
    const count = (rows[0] as { count?: number }).count;
    const exists = typeof count === 'number' && count > 0;
    console.error(`[BOOTSTRAP][DB] hasAnyTable(${tableName}): count=${count}, exists=${exists}`);
    return exists;
  }

  console.error(`[BOOTSTRAP][DB] hasAnyTable(${tableName}): rows inesperado`, JSON.stringify(rows, null, 2));
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
    
    // Drizzle com mysql2 retorna [rows, fields] como array
    let rows: unknown;
    if (Array.isArray(res) && res.length >= 1) {
      rows = res[0];
    } else if (res && typeof res === 'object' && 'rows' in res) {
      rows = (res as { rows?: unknown }).rows;
    } else {
      return 0;
    }

    if (Array.isArray(rows) && rows[0] && typeof rows[0] === 'object' && 'count' in rows[0]) {
      const count = (rows[0] as { count?: number }).count;
      return typeof count === 'number' ? count : 0;
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

    // Log temporário: qual database está conectado
    try {
      const dbRes = await db.execute(sql`SELECT DATABASE() as current_db`);
      if (dbRes && typeof dbRes === 'object' && 'rows' in dbRes) {
        const rows = (dbRes as { rows?: Array<{ current_db?: string }> }).rows;
        if (Array.isArray(rows) && rows[0]?.current_db) {
          console.error(`[BOOTSTRAP][DB] database conectado: ${rows[0].current_db}`);
        }
      }
    } catch (e) {
      console.error(`[BOOTSTRAP][DB] erro ao obter database atual: ${e}`);
    }

    try {
      const { migrate } = await import("drizzle-orm/mysql2/migrator");

      // Heurística segura: se __drizzle_migrations não existir, é um DB limpo.
      const hasJournal = await hasAnyTable(db, "__drizzle_migrations");
      console.error(`[BOOTSTRAP][DB] ANTES do migrate: hasJournal=${hasJournal}`);
      if (!hasJournal) {
        console.error("[BOOTSTRAP][DB] banco limpo detectado (sem __drizzle_migrations)");
        console.error("[BOOTSTRAP][DB] aplicando todas as migrações...");
      } else {
        const count = await getMigrationsAppliedCount(db);
        console.error(`[BOOTSTRAP][DB] ${count} migração(ões) já aplicada(s). Verificando pendentes...`);
      }

      // Executar migrator - FALHA FATAL se erro ocorrer
      console.error("[BOOTSTRAP][DB] executando migrate()...");
      await migrate(db, { migrationsFolder });
      console.error("[BOOTSTRAP][DB] migrate() concluído sem erro");

      // Validar que migrator criou a tabela
      const migrationsTableExists = await hasAnyTable(db, "__drizzle_migrations");
      console.error(`[BOOTSTRAP][DB] DEPOIS do migrate: migrationsTableExists=${migrationsTableExists}`);
      if (!migrationsTableExists) {
        throw new Error("FATAL: __drizzle_migrations não foi criada após migrate()");
      }

      const finalCount = await getMigrationsAppliedCount(db);
      const ms = Date.now() - startedAt;
      console.error(`[BOOTSTRAP][DB] ✓ migrações OK: ${finalCount} aplicadas em ${ms}ms`);
      
      // Runtime schema guard: valida consistência após migrações
      console.log('[BOOTSTRAP][DB] Executando schema validation guard...');
      const schemaValidation = await validateSchemaAtRuntime(db);
      if (!schemaValidation.valid) {
        console.error('[BOOTSTRAP][DB] FATAL: Schema validation encontrou problemas:');
        schemaValidation.errors.forEach(err => console.error(`  - ${err}`));
        throw new Error(`Schema validation failed: ${schemaValidation.errors.join(', ')}`);
      }

      return { success: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const ms = Date.now() - startedAt;
      console.error(`[BOOTSTRAP][DB] FATAL: erro de bootstrap após ${ms}ms`);
      console.error(`[BOOTSTRAP][DB] ${errorMsg}`);
      throw err; // Re-lançar erro fatal - sistema NÃO sobe
    }
  })();
  
  return bootstrapOnce;
}

let bootstrapOnce: Promise<{ success: boolean; error?: string }> | null = null;

