/**
 * Migration Guard - Valida consistência de migrations no bootstrap
 * Impede que o sistema suba com migrations inconsistentes
 */
import fs from "fs";
import path from "path";
import { getConnectionPool } from "../config/database.js";
import { InfrastructureError } from "./errors/typed-errors.js";

/**
 * Erro específico para migration drift - não deve ser retryado
 */
export class MigrationDriftError extends InfrastructureError {
  constructor(message: string) {
    super(message);
    this.name = "MigrationDriftError";
  }
}

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}

interface Journal {
  entries: JournalEntry[];
}

/**
 * Valida que todos os arquivos SQL referenciados no journal existem fisicamente
 * e que as migrations no banco estão consistentes com o journal
 */
export async function validateMigrationConsistency(): Promise<void> {
  const drizzleFolder = path.resolve(process.cwd(), "drizzle");
  const journalPath = path.join(drizzleFolder, "meta", "_journal.json");

  // 1. Verificar se journal existe
  if (!fs.existsSync(journalPath)) {
    throw new InfrastructureError(
      `Migration journal não encontrado: ${journalPath}. Sistema não pode iniciar sem migrations.`
    );
  }

  // 2. Ler journal
  let journal: Journal;
  try {
    const journalContent = fs.readFileSync(journalPath, "utf-8");
    journal = JSON.parse(journalContent);
  } catch (error) {
    throw new InfrastructureError(
      `Erro ao ler migration journal: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // 3. Verificar que cada entry tem arquivo SQL correspondente
  const missingFiles: string[] = [];
  for (const entry of journal.entries) {
    const sqlFilePath = path.join(drizzleFolder, `${entry.tag}.sql`);
    if (!fs.existsSync(sqlFilePath)) {
      missingFiles.push(entry.tag);
    }
  }

  if (missingFiles.length > 0) {
    throw new MigrationDriftError(
      `DRIFT CRÍTICO DE MIGRATIONS: Arquivos SQL faltando para as tags: ${missingFiles.join(", ")}. ` +
      `O journal referencia ${missingFiles.length} migrations que não existem fisicamente. ` +
      `Sistema NÃO pode iniciar. Corrija o journal ou gere as migrations faltantes.`
    );
  }

  // 4. Verificar consistência com banco de dados
  try {
    const pool = await getConnectionPool();
    
    // Verificar se tabela __drizzle_migrations existe
    const tableCheck = await pool.execute(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '__drizzle_migrations'"
    );
    const tableExists = (tableCheck[0] as Array<{ count: number }>)[0]?.count > 0;

    if (!tableExists) {
      // Banco vazio - OK se não há migrations aplicadas
      if (journal.entries.length === 0) {
        return; // Estado consistente: banco vazio, journal vazio
      }
      // Banco vazio mas journal tem migrations - precisa rodar migrate
      console.warn("[MigrationGuard] Banco vazio mas journal tem migrations. Execute 'pnpm db:migrate'.");
      return;
    }

    // Tabela existe - verificar se migrations aplicadas batem com journal
    const dbMigrations = await pool.execute(
      "SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY id"
    );
    const dbRows = dbMigrations[0] as Array<{ id: number; hash: string; created_at: number }>;

    if (dbRows.length !== journal.entries.length) {
      throw new InfrastructureError(
        `DRIFT CRÍTICO DE MIGRATIONS: Banco tem ${dbRows.length} migrations aplicadas, ` +
        `mas journal referencia ${journal.entries.length} migrations. ` +
        `Sistema NÃO pode iniciar. Estado inconsistente.`
      );
    }

    // Verificar que timestamps batem (ordem e conteúdo)
    for (let i = 0; i < journal.entries.length; i++) {
      const journalEntry = journal.entries[i];
      const dbRow = dbRows[i];

      if (journalEntry.when !== dbRow.created_at) {
        throw new InfrastructureError(
          `DRIFT CRÍTICO DE MIGRATIONS: Migration idx ${i} tem timestamp inconsistente. ` +
          `Journal: ${journalEntry.when}, Banco: ${dbRow.created_at}. ` +
          `Sistema NÃO pode iniciar.`
        );
      }
    }

    console.log(`[MigrationGuard] ✅ Validação de consistência OK: ${journal.entries.length} migrations`);
  } catch (error) {
    if (error instanceof InfrastructureError) {
      throw error; // Re-lançar nossos erros customizados
    }
    // Erro de conexão com banco - não é drift, mas impede validação
    console.warn("[MigrationGuard] Não foi possível validar migrations no banco:", error);
    // Não lançar erro aqui - pode ser que o banco ainda não esteja pronto no bootstrap
  }
}
