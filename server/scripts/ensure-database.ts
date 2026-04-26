/**
 * Garante o banco correto sem duplicar: prioriza vendas_app > grs.
 * Conecta ao MySQL sem database, lista bancos, escolhe ou cria o adequado e atualiza .env.
 *
 * Lógica:
 * 1. Se vendas_app existir → usar (nunca criar)
 * 2. Se grs existir → usar (nunca criar)
 * 3. Se nenhum existir → criar grs
 * 4. Atualiza .env com DATABASE_URL apontando para banco escolhido
 *
 * Requer: DATABASE_URL no .env.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import * as fs from "node:fs";
import * as path from "node:path";

function parseDatabaseUrl(): { host: string; port: number; user: string; password: string } {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL é obrigatório");
  }

  try {
    const url = new URL(databaseUrl);
    if (!url.hostname || !url.username || url.password === undefined) {
      throw new Error("DATABASE_URL incompleta.");
    }
    return {
      host: url.hostname,
      port: parseInt(url.port || "3306", 10),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`DATABASE_URL inválida: ${msg}`);
  }
}

function getEnvPath(): string {
  const root = process.cwd();
  return path.join(root, ".env");
}

function updateEnvDatabaseUrl(chosenDb: string): boolean {
  const envPath = getEnvPath();
  if (!fs.existsSync(envPath)) return false;
  const content = fs.readFileSync(envPath, "utf-8");
  const lines = content.split(/\r?\n/);
  const currentDatabaseUrl = process.env.DATABASE_URL;
  if (!currentDatabaseUrl) {
    throw new Error("DATABASE_URL não encontrado no .env");
  }
  const newDatabaseUrl = currentDatabaseUrl.replace(/\/[^/]*$/, `/${chosenDb}`);
  const newLine = `DATABASE_URL=${newDatabaseUrl}`;
  let found = false;
  const out = lines.map((line) => {
    if (/^\s*DATABASE_URL\s*=/.test(line)) {
      found = true;
      return newLine;
    }
    return line;
  });
  if (!found) out.push(newLine);
  fs.writeFileSync(envPath, out.join("\n"), "utf-8");
  return true;
}

async function main(): Promise<any> {
  const config = parseDatabaseUrl();
  const connection = await mysql.createConnection(config);
  let chosenDb: string;

  try {
    const [rows] = await connection.query("SHOW DATABASES");
    const raw = (rows as { Database?: string }[] | undefined) ?? [];
    const databases = raw.map((r) => (r && "Database" in r ? String(r.Database) : "")).filter(Boolean);

    const vendasAppExists = databases.includes("vendas_app");
    const grsExists = databases.includes("grs");

    if (vendasAppExists) {
      chosenDb = "vendas_app";
      console.log("[ensure-database] Banco existente 'vendas_app' detectado. Será usado (não será criado duplicado).");
    } else if (grsExists) {
      chosenDb = "grs";
      console.log("[ensure-database] Banco existente 'grs' detectado. Será usado (não será criado duplicado).");
    } else {
      chosenDb = "grs";
      await connection.query("CREATE DATABASE IF NOT EXISTS `grs`");
      console.log("[ensure-database] Nenhum banco vendas_app/grs encontrado. Banco 'grs' criado.");
    }
  } finally {
    await connection.end();
  }

  const envPath = getEnvPath();
  if (fs.existsSync(envPath)) {
    const updated = updateEnvDatabaseUrl(chosenDb);
    if (updated) {
      console.log("[ensure-database] .env atualizado: DATABASE_URL aponta para " + chosenDb);
    }
  }

  console.log("[ensure-database] Banco a ser usado:", chosenDb);
}

main().catch((err) => {
  console.error("[ensure-database] Erro:", err.message ?? err);
  process.exit(1);
});
