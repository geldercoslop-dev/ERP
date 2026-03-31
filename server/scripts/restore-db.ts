/**
 * Restaura dump MySQL a partir de um arquivo .sql.
 * Valida existência, extensão .sql e que o caminho é arquivo antes de executar. Não faz overwrite de arquivo (apenas restaura no DB).
 * Credenciais exclusivamente de env (DATABASE_URL ou DB_HOST, DB_USER, DB_PASSWORD, DB_NAME). Sem fallback.
 * Uso: npx tsx server/scripts/restore-db.ts <caminho-do-arquivo.sql>
 * Ex.: npx tsx server/scripts/restore-db.ts backups/backup_20260306_120000.sql
 */
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { spawn } from "child_process";
import { nanoid } from "nanoid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

function getDbConfig(): { host: string; port: number; user: string; password: string; database: string } {
  if (process.env.DATABASE_URL?.trim()) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      const database = url.pathname.replace(/^\//, "").trim();
      if (!url.hostname || !url.username || url.password === undefined || !database) {
        throw new Error("DATABASE_URL incompleta.");
      }
      return {
        host: url.hostname,
        port: parseInt(url.port || "3306", 10),
        user: url.username,
        password: url.password,
        database,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[restore-db] DATABASE_URL inválida: ${msg}. Defina DATABASE_URL ou DB_HOST, DB_USER, DB_PASSWORD, DB_NAME.`);
    }
  }
  const host = process.env.DB_HOST?.trim();
  const user = process.env.DB_USER?.trim();
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME?.trim();
  if (!host || !user || password === undefined || !database) {
    throw new Error(
      "[restore-db] Credenciais obrigatórias. Defina DATABASE_URL ou todas: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME."
    );
  }
  return {
    host,
    port: parseInt(process.env.DB_PORT ?? "3306", 10),
    user,
    password,
    database,
  };
}

function log(traceId: string, level: "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    traceId,
    level,
    message,
    ...extra,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

async function main(): Promise<void> {
  await import("../_core/loadEnv.js");
  const traceId = nanoid(10);
  const fileArg = process.argv[2];
  if (!fileArg || !fileArg.trim()) {
    log(traceId, "error", "Uso: npx tsx server/scripts/restore-db.ts <caminho-do-arquivo.sql>");
    process.exit(1);
  }

  const filePath = path.isAbsolute(fileArg) ? fileArg : path.join(process.cwd(), fileArg);
  if (!fs.existsSync(filePath)) {
    log(traceId, "error", "Arquivo não encontrado", { path: filePath });
    process.exit(1);
  }
  if (!filePath.toLowerCase().endsWith(".sql")) {
    log(traceId, "error", "Arquivo deve ter extensão .sql", { path: filePath });
    process.exit(1);
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    log(traceId, "error", "Caminho não é um arquivo", { path: filePath });
    process.exit(1);
  }

  const config = getDbConfig();
  log(traceId, "info", "Iniciando restore", {
    file: path.basename(filePath),
    database: config.database,
  });

  return new Promise((resolve, reject) => {
    const input = fs.createReadStream(filePath);
    const child = spawn(
      "mysql",
      [
        "-h", config.host,
        "-P", String(config.port),
        "-u", config.user,
        config.database,
      ],
      {
        env: { ...process.env, MYSQL_PWD: config.password },
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    input.pipe(child.stdin);
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    child.on("error", (err) => {
      log(traceId, "error", "Falha ao executar mysql", { error: err.message });
      reject(err);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        log(traceId, "error", "mysql encerrou com erro", { code, stderr: stderr.slice(0, 500) });
        reject(new Error(`mysql exit code ${code}`));
        return;
      }
      log(traceId, "info", "Restore concluído", { file: path.basename(filePath) });
      resolve();
    });
  });
}

main().then(
  () => process.exit(0),
  () => process.exit(1)
);
