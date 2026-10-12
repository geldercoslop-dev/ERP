/**
 * Bootstrap oficial de banco totalmente vazio (local/dev/descartável).
 * Implementa o procedimento documentado em docs/operations/FRESH_DB_BOOTSTRAP.md (achado P25).
 *
 * Pipeline: drizzle-kit push (schema.ts) -> marcar __drizzle_migrations com o journal
 * atual -> seed tenant/admin/vendedor id=1 -> npm run db:migrate -> validações.
 *
 * Uso:
 *   $env:DATABASE_URL='mysql://user:pass@localhost:3306/erp_pXX_fresh_xxx'
 *   npm run db:bootstrap:fresh
 *
 * Flags:
 *   --allow-local-empty-db   permite banco cujo nome não contenha _test/_dev/_replay/_fresh
 *                            nem prefixo erp_p (uso dev consciente; ainda exige host local e banco vazio)
 */
import "dotenv/config";
import { spawnSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";

const DRIZZLE_DIR = path.resolve(process.cwd(), "drizzle");
const JOURNAL_FILE = path.join(DRIZZLE_DIR, "meta", "_journal.json");
const ALLOW_EMPTY_DB_FLAG = "--allow-local-empty-db";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const SAFE_DB_PATTERNS = [/_test/i, /_dev/i, /_replay/i, /_fresh/i, /^erp_p/i];

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}

interface Journal {
  entries: JournalEntry[];
}

function fail(message: string): never {
  console.error(`\n❌ FRESH_DB_BOOTSTRAP_ABORT: ${message}`);
  process.exit(1);
}

function ok(message: string): void {
  console.log(`   ✅ ${message}`);
}

function step(message: string): void {
  console.log(`\n▶ ${message}`);
}

function maskUser(user: string): string {
  if (!user) return "***";
  return `${user[0]}***`;
}

function parseDatabaseUrl(url: string): {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    fail("DATABASE_URL inválida (não parseável como URL)");
  }
  if (!/^mysql/.test(parsed!.protocol)) {
    fail(`DATABASE_URL com protocolo não suportado: ${parsed!.protocol} (esperado mysql://)`);
  }
  const database = parsed!.pathname.replace(/^\//, "");
  if (!database) {
    fail("DATABASE_URL sem nome de database no path");
  }
  return {
    host: parsed!.hostname,
    port: parsed!.port || "3306",
    user: decodeURIComponent(parsed!.username),
    password: decodeURIComponent(parsed!.password),
    database,
  };
}

/** Hash compatível com drizzle-orm mysql migrator e server/_core/migration-guard.ts */
function calculateMigrationHash(sqlContent: string): string {
  return crypto.createHash("sha256").update(sqlContent).digest("hex");
}

async function main(): Promise<void> {
  console.log("=".repeat(64));
  console.log("🔧 FRESH DB BOOTSTRAP — ERP GRS (somente banco vazio local/dev)");
  console.log("=".repeat(64));

  // ============ A) Validar ambiente ============
  step("A) Validando ambiente");

  const nodeEnv = String(process.env.NODE_ENV || "").trim();
  if (nodeEnv === "production") {
    fail("NODE_ENV=production detectado. Este script nunca roda em produção.");
  }
  ok(`NODE_ENV=${nodeEnv || "(não definido)"} — não é produção`);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    fail("DATABASE_URL não definida na sessão/.env");
  }

  const cfg = parseDatabaseUrl(databaseUrl);

  if (!LOCAL_HOSTS.has(cfg.host)) {
    fail(`Host não local recusado: ${cfg.host} (aceitos: localhost, 127.0.0.1, ::1)`);
  }
  ok(`Host local: ${cfg.host}`);

  const allowFlag = process.argv.includes(ALLOW_EMPTY_DB_FLAG);
  const nameSafe = SAFE_DB_PATTERNS.some((p) => p.test(cfg.database));
  if (!nameSafe && !allowFlag) {
    fail(
      `Nome de database '${cfg.database}' não é claramente dev/test/temp ` +
        `(esperado: contém _test/_dev/_replay/_fresh ou começa com erp_p). ` +
        `Se for intencional, use ${ALLOW_EMPTY_DB_FLAG}`
    );
  }
  ok(`Database '${cfg.database}' ${nameSafe ? "(padrão dev/test/temp)" : `(autorizado via ${ALLOW_EMPTY_DB_FLAG})`}`);

  console.log("\n   ── Alvo ─────────────────────────────");
  console.log(`   host:      ${cfg.host}:${cfg.port}`);
  console.log(`   database:  ${cfg.database}`);
  console.log(`   user:      ${maskUser(cfg.user)}`);
  console.log(`   produção:  NÃO (host local + NODE_ENV!=production)`);

  const conn = await mysql.createConnection(databaseUrl).catch((e: Error) => {
    fail(`Não foi possível conectar: ${e.message}. O banco deve existir (vazio) — este script NÃO cria nem dropa database.`);
  });

  try {
    // ============ B) Verificar banco vazio ============
    step("B) Verificando que o banco está vazio");

    const [tableRows] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME"
    );
    const tables = tableRows.map((r) => r.TABLE_NAME as string);
    console.log(`   tabelas existentes: ${tables.length}`);

    if (tables.length > 0) {
      const onlyEmptyJournal =
        tables.length === 1 && tables[0] === "__drizzle_migrations";
      if (onlyEmptyJournal) {
        const [cnt] = await conn.query<mysql.RowDataPacket[]>(
          "SELECT COUNT(*) AS n FROM `__drizzle_migrations`"
        );
        if (Number(cnt[0]?.n ?? 0) > 0) {
          fail("Banco contém apenas __drizzle_migrations mas com registros — estado inconsistente, abortando.");
        }
        ok("Única tabela é __drizzle_migrations vazia — estado inicial válido");
      } else {
        fail(
          `Banco NÃO está vazio (${tables.length} tabelas: ${tables.slice(0, 8).join(", ")}${tables.length > 8 ? "..." : ""}). ` +
            `db:bootstrap:fresh exige banco vazio. Para baselinear banco existente use npm run db:migrate.`
        );
      }
    } else {
      ok("Banco vazio confirmado");
    }

    // ============ C) drizzle-kit push ============
    step("C) Aplicando schema.ts via drizzle-kit push");

    const pushArgs = [
      "drizzle-kit",
      "push",
      "--dialect=mysql",
      `--url=${databaseUrl}`,
      "--schema=drizzle/schema.ts",
    ];
    const push = spawnSync("npx", pushArgs, {
      stdio: "inherit",
      shell: true,
      env: process.env,
    });
    if (push.status !== 0) {
      fail(`drizzle-kit push falhou (exit ${push.status})`);
    }
    ok("Schema aplicado (tabelas + FKs do contrato schema.ts)");

    // ============ D) Garantir __drizzle_migrations ============
    step("D) Garantindo tabela __drizzle_migrations");

    await conn.query(
      "CREATE TABLE IF NOT EXISTS `__drizzle_migrations` (id serial primary key, hash text not null, created_at bigint)"
    );
    ok("Tabela de controle presente");

    // ============ E+F) Marcar journal como baseline aplicado ============
    step("E+F) Marcando journal atual como baseline aplicado");

    if (!fs.existsSync(JOURNAL_FILE)) {
      fail(`Journal não encontrado: ${JOURNAL_FILE}`);
    }
    const journal = JSON.parse(fs.readFileSync(JOURNAL_FILE, "utf-8")) as Journal;
    if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
      fail("Journal sem entries — nada para marcar");
    }

    let inserted = 0;
    let skipped = 0;
    for (const entry of journal.entries) {
      const sqlPath = path.join(DRIZZLE_DIR, `${entry.tag}.sql`);
      if (!fs.existsSync(sqlPath)) {
        fail(`Arquivo SQL do journal ausente: ${sqlPath}`);
      }
      const sqlContent = fs.readFileSync(sqlPath, "utf-8");
      const hash = calculateMigrationHash(sqlContent);

      const [existing] = await conn.query<mysql.RowDataPacket[]>(
        "SELECT COUNT(*) AS n FROM `__drizzle_migrations` WHERE created_at = ?",
        [entry.when]
      );
      if (Number(existing[0]?.n ?? 0) > 0) {
        skipped++;
        continue;
      }
      await conn.query("INSERT INTO `__drizzle_migrations` (hash, created_at) VALUES (?, ?)", [
        hash,
        entry.when,
      ]);
      inserted++;
    }
    ok(`${journal.entries.length} entries no journal — ${inserted} marcados, ${skipped} já existentes`);

    // ============ G) Seed tenant id=1 ============
    step("G) Seed tenant id=1");

    await conn.query(
      "INSERT INTO tenants (id, nome_empresa, plano, status) VALUES (1, 'GRS Móveis', 'default', 'ACTIVE') ON DUPLICATE KEY UPDATE id = id"
    );
    ok("tenants.id=1 garantido");

    // ============ H) Seed admin/user id=1 ============
    step("H) Seed admin/user id=1");

    await conn.query(
      "INSERT INTO users (id, tenant_id, open_id, name, email, role, created_at, updated_at, last_signed_in) VALUES (1, 1, 'admin', 'Administrador', 'admin@local.com', 'admin', NOW(), NOW(), NOW()) ON DUPLICATE KEY UPDATE id = id"
    );
    ok("users.id=1 garantido (role=admin)");

    // ============ I) Seed vendedor id=1 ============
    step("I) Seed vendedor id=1");

    await conn.query(
      "INSERT INTO vendedores (id, tenant_id, user_id, nome, `admin`, ativo, created_at, updated_at) VALUES (1, 1, 1, 'Administrador', 1, 1, NOW(), NOW()) ON DUPLICATE KEY UPDATE id = id"
    );
    ok("vendedores.id=1 garantido");

    // ============ J) npm run db:migrate ============
    step("J) Rodando npm run db:migrate");

    const migrate = spawnSync("npm", ["run", "db:migrate"], {
      stdio: "inherit",
      shell: true,
      env: process.env,
    });
    if (migrate.status !== 0) {
      fail(`npm run db:migrate falhou (exit ${migrate.status})`);
    }
    ok("db:migrate exit 0 — journal consistente, nada pendente");

    // ============ K) Validar FKs tenants ============
    step("K) Validando FKs físicas → tenants");

    const [fkRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = 'tenants'
         AND TABLE_NAME IN ('users', 'vendedores') AND COLUMN_NAME = 'tenant_id'`
    );
    const fks = new Set(fkRows.map((r) => `${r.TABLE_NAME}.${r.COLUMN_NAME}`));
    for (const expected of ["users.tenant_id", "vendedores.tenant_id"]) {
      if (!fks.has(expected)) {
        fail(`FK ausente: ${expected} → tenants.id`);
      }
    }
    ok("users.tenant_id → tenants.id");
    ok("vendedores.tenant_id → tenants.id");

    // ============ L) Validar regras FK ============
    step("L) Validando regras FK (RESTRICT|NO ACTION)");

    const [ruleRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT CONSTRAINT_NAME, DELETE_RULE, UPDATE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = 'tenants'
         AND TABLE_NAME IN ('users', 'vendedores')`
    );
    const RULES_OK = new Set(["RESTRICT", "NO ACTION"]);
    for (const r of ruleRows) {
      if (!RULES_OK.has(r.DELETE_RULE) || !RULES_OK.has(r.UPDATE_RULE)) {
        fail(`Regra inesperada em ${r.CONSTRAINT_NAME}: DELETE=${r.DELETE_RULE} UPDATE=${r.UPDATE_RULE}`);
      }
    }
    ok(`${ruleRows.length} constraint(s) com DELETE/UPDATE em RESTRICT|NO ACTION`);

    // ============ M) Validar órfãos ============
    step("M) Validando órfãos");

    const [orphanRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE tenant_id NOT IN (SELECT id FROM tenants)) AS users_orfaos,
         (SELECT COUNT(*) FROM vendedores WHERE tenant_id NOT IN (SELECT id FROM tenants)) AS vendedores_orfaos`
    );
    const usersOrfaos = Number(orphanRows[0]?.users_orfaos ?? -1);
    const vendedoresOrfaos = Number(orphanRows[0]?.vendedores_orfaos ?? -1);
    if (usersOrfaos !== 0 || vendedoresOrfaos !== 0) {
      fail(`Órfãos detectados: users=${usersOrfaos} vendedores=${vendedoresOrfaos}`);
    }
    ok("users_orfaos=0, vendedores_orfaos=0");

    // ============ N) Validar seeds ============
    step("N) Validando tenant/admin/vendedor id=1");

    const [seedRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM tenants WHERE id = 1) AS tenant_ok,
         (SELECT COUNT(*) FROM users WHERE id = 1) AS user_ok,
         (SELECT COUNT(*) FROM vendedores WHERE id = 1) AS vendedor_ok`
    );
    for (const [label, key] of [
      ["tenants.id=1", "tenant_ok"],
      ["users.id=1", "user_ok"],
      ["vendedores.id=1", "vendedor_ok"],
    ] as const) {
      if (Number(seedRows[0]?.[key] ?? 0) !== 1) {
        fail(`Seed ausente: ${label}`);
      }
      ok(`${label} existe`);
    }

    // ============ O) Sucesso ============
    console.log("\n" + "=".repeat(64));
    console.log("FRESH_DB_BOOTSTRAP_OK");
    console.log("=".repeat(64));
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(`\n❌ FRESH_DB_BOOTSTRAP_ABORT: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
