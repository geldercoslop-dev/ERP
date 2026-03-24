/**
 * Normaliza colunas camelCase -> snake_case no MySQL SEM perder dados.
 *
 * Regras atendidas:
 * - NÃO usa DROP/TRUNCATE/DELETE
 * - Usa SOMENTE: ALTER TABLE CHANGE COLUMN
 *
 * O que faz:
 * - Varre information_schema.columns no DB atual
 * - Detecta COLUMN_NAME com letras maiúsculas ([A-Z])
 * - Gera novo nome snake_case
 * - Monta a definição completa da coluna (tipo, null, default, extra, charset/collation, comment)
 * - Emite SQL e (opcionalmente) aplica
 *
 * Uso:
 *   pnpm exec tsx scripts/db-normalize-columns.ts --dry-run
 *   pnpm exec tsx scripts/db-normalize-columns.ts --apply
 *
 * Saídas:
 * - normalize-columns-plan.sql
 * - normalize-columns-mapping.json
 */
import * as fs from "fs";
import * as path from "path";
import { getConnectionPool } from "../server/config/database";

type ColumnRow = {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  COLUMN_TYPE: string; // inclui tamanho/precision
  IS_NULLABLE: "YES" | "NO";
  COLUMN_DEFAULT: string | null;
  EXTRA: string;
  DATA_TYPE: string;
  CHARACTER_SET_NAME: string | null;
  COLLATION_NAME: string | null;
  COLUMN_COMMENT: string;
};

function toSnakeCase(input: string): string {
  // tenantId -> tenant_id ; telefoneNorm -> telefone_norm ; ID -> id
  const withUnderscores = input
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z0-9]+)/g, "$1_$2");
  return withUnderscores.toLowerCase();
}

function isCamelCaseColumn(col: string): boolean {
  return /[A-Z]/.test(col);
}

function sqlQuoteIdent(name: string): string {
  return `\`${name.replace(/`/g, "``")}\``;
}

function sqlQuoteString(value: string): string {
  // MySQL string literal
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function buildColumnDefinition(row: ColumnRow): string {
  const parts: string[] = [];

  // Tipo completo (inclui length/precision) — ex.: int(11), varchar(255), decimal(10,2)
  parts.push(row.COLUMN_TYPE);

  // Charset/collation apenas para tipos textuais/char
  const textual =
    ["char", "varchar", "text", "tinytext", "mediumtext", "longtext"].includes(
      row.DATA_TYPE.toLowerCase()
    );
  if (textual && row.CHARACTER_SET_NAME) {
    parts.push(`CHARACTER SET ${row.CHARACTER_SET_NAME}`);
  }
  if (textual && row.COLLATION_NAME) {
    parts.push(`COLLATE ${row.COLLATION_NAME}`);
  }

  parts.push(row.IS_NULLABLE === "NO" ? "NOT NULL" : "NULL");

  // DEFAULT — cuidado com CURRENT_TIMESTAMP e NULL
  if (row.COLUMN_DEFAULT !== null) {
    const def = row.COLUMN_DEFAULT;
    const upper = def.toUpperCase();
    // Alguns schemas antigos guardam "NULL" como string no information_schema.
    if (upper === "NULL") {
      parts.push("DEFAULT NULL");
    } else {
    const isFunc =
      upper === "CURRENT_TIMESTAMP" ||
      upper.startsWith("CURRENT_TIMESTAMP(") ||
      upper === "NOW()" ||
      upper.startsWith("UUID()");
      if (isFunc) {
        parts.push(`DEFAULT ${def}`);
      } else {
        const numericTypes = new Set([
          "int",
          "integer",
          "bigint",
          "smallint",
          "mediumint",
          "tinyint",
          "decimal",
          "numeric",
          "float",
          "double",
          "real",
          "bit",
        ]);
        const isNumeric = numericTypes.has(row.DATA_TYPE.toLowerCase());
        const looksNumeric = /^-?\d+(\.\d+)?$/.test(def);
        if (isNumeric && looksNumeric) {
          parts.push(`DEFAULT ${def}`);
        } else {
          parts.push(`DEFAULT ${sqlQuoteString(def)}`);
        }
      }
    }
  }

  // EXTRA (auto_increment, on update CURRENT_TIMESTAMP, generated, etc.)
  if (row.EXTRA?.trim()) {
    parts.push(row.EXTRA.trim());
  }

  // COMMENT (preserva)
  if (row.COLUMN_COMMENT && row.COLUMN_COMMENT.trim().length > 0) {
    parts.push(`COMMENT ${sqlQuoteString(row.COLUMN_COMMENT)}`);
  }

  return parts.join(" ");
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has("--apply");
  const dryRun = args.has("--dry-run") || !apply;

  const pool = await getConnectionPool();
  const [dbRows] = await pool.query("SELECT DATABASE() AS db");
  const dbName = Array.isArray(dbRows) && dbRows[0]?.db ? String(dbRows[0].db) : "";
  if (!dbName) throw new Error("Não foi possível resolver DATABASE() atual.");

  // Timeouts/lock-wait para evitar travas longas
  await pool.query("SET SESSION innodb_lock_wait_timeout = 10");
  await pool.query("SET SESSION lock_wait_timeout = 10");

  const [rows] = await pool.query(
    `
    SELECT
      TABLE_NAME,
      COLUMN_NAME,
      COLUMN_TYPE,
      IS_NULLABLE,
      COLUMN_DEFAULT,
      EXTRA,
      DATA_TYPE,
      CHARACTER_SET_NAME,
      COLLATION_NAME,
      COLUMN_COMMENT
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ?
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `,
    [dbName]
  );

  const cols = (rows as ColumnRow[]).filter((r) => isCamelCaseColumn(r.COLUMN_NAME));

  // Pré-checagem: conflitos (coluna destino já existe)
  const byTable = new Map<string, ColumnRow[]>();
  for (const c of rows as ColumnRow[]) {
    const arr = byTable.get(c.TABLE_NAME) ?? [];
    arr.push(c);
    byTable.set(c.TABLE_NAME, arr);
  }

  const mapping: Record<string, Record<string, string>> = {};
  const statements: string[] = [];
  const conflicts: Array<{ table: string; from: string; to: string }> = [];
  const skippedGenerated: Array<{ table: string; column: string; reason: string }> = [];

  for (const c of cols) {
    const to = toSnakeCase(c.COLUMN_NAME);
    if (to === c.COLUMN_NAME) continue;

    // pular generated (CHANGE COLUMN exigiria expressão)
    if (c.EXTRA?.toLowerCase().includes("generated")) {
      skippedGenerated.push({ table: c.TABLE_NAME, column: c.COLUMN_NAME, reason: c.EXTRA });
      continue;
    }

    const tableCols = byTable.get(c.TABLE_NAME) ?? [];
    const existsTarget = tableCols.some((x) => x.COLUMN_NAME === to);
    if (existsTarget) {
      conflicts.push({ table: c.TABLE_NAME, from: c.COLUMN_NAME, to });
      continue;
    }

    mapping[c.TABLE_NAME] ||= {};
    mapping[c.TABLE_NAME][c.COLUMN_NAME] = to;

    const def = buildColumnDefinition(c);
    statements.push(
      `ALTER TABLE ${sqlQuoteIdent(c.TABLE_NAME)} CHANGE COLUMN ${sqlQuoteIdent(
        c.COLUMN_NAME
      )} ${sqlQuoteIdent(to)} ${def};`
    );
  }

  const outSql = path.join(process.cwd(), "normalize-columns-plan.sql");
  const outMap = path.join(process.cwd(), "normalize-columns-mapping.json");
  fs.writeFileSync(outSql, statements.join("\n") + (statements.length ? "\n" : ""), "utf8");
  fs.writeFileSync(outMap, JSON.stringify({ db: dbName, mapping, conflicts, skippedGenerated }, null, 2), "utf8");

  console.log(`[normalize] database=${dbName}`);
  console.log(`[normalize] camelCase columns found=${cols.length}`);
  console.log(`[normalize] statements generated=${statements.length}`);
  console.log(`[normalize] conflicts=${conflicts.length}`);
  console.log(`[normalize] skippedGenerated=${skippedGenerated.length}`);
  console.log(`[normalize] plan: ${outSql}`);
  console.log(`[normalize] mapping: ${outMap}`);

  if (dryRun) {
    console.log("[normalize] DRY-RUN (não aplicou alterações). Use --apply para aplicar.");
    process.exit(conflicts.length ? 2 : 0);
  }

  if (conflicts.length) {
    throw new Error(
      `Conflitos detectados (coluna destino já existe). Resolva antes de aplicar. Ex.: ${conflicts[0].table}.${conflicts[0].from} -> ${conflicts[0].to}`
    );
  }

  // Aplicar em ordem determinística
  for (const sql of statements) {
    const started = Date.now();
    try {
      await pool.query(sql);
      const ms = Date.now() - started;
      console.log(`[apply] ok (${ms}ms): ${sql}`);
    } catch (e) {
      const ms = Date.now() - started;
      console.error(`[apply] FAIL (${ms}ms): ${sql}`);
      throw e;
    }
  }

  console.log("[normalize] ✅ APPLY COMPLETE");
}

main().catch((e) => {
  console.error("[normalize] ❌ ERROR:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});

