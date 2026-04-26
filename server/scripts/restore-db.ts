/**
 * Restaura dump MySQL a partir de um arquivo .sql.
 * Valida existência, extensão .sql e que o caminho é arquivo antes de executar. Não faz overwrite de arquivo (apenas restaura no DB).
 * Credenciais exclusivamente de env (DATABASE_URL). Sem fallback.
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

function parseDatabaseUrl(): { host: string; port: number; user: string; password: string; database: string } {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL é obrigatório");
  }

  try {
    const url = new URL(databaseUrl);
    const database = url.pathname.replace(/^\//, "").trim();
    if (!url.hostname || !url.username || url.password === undefined || !database) {
      throw new Error("DATABASE_URL incompleta.");
    }
    return {
      host: url.hostname,
      port: parseInt(url.port || "3306", 10),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[restore-db] DATABASE_URL inválida: ${msg}`);
  }
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
  // Load ENV explicitly (NO import-time side effects)
  const { initEnv } = await import("../_core/env/bootstrapEnv.js");
  initEnv();
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

  const config = parseDatabaseUrl();
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
