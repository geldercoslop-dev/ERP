/**
 * Módulo de backup MySQL (mysqldump). Usado pelo script backup-db.ts e pela rota /api/admin/backup.
 * Gera dump em backups/ com timestamp; não sobrescreve; aplica retenção (últimos 30).
 */
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { randomBytes } from "crypto";

/**
 * Gera um ID aleatório simples sem dependências externas
 */
function generateId(length: number = 10): string {
  return randomBytes(length).toString('hex').slice(0, length);
}

const BACKUP_PREFIX = "backup_";
const RETENTION_COUNT_DEFAULT = 30;

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
      throw new Error(`[backupDb] DATABASE_URL inválida: ${msg}. Defina DATABASE_URL ou DB_HOST, DB_USER, DB_PASSWORD, DB_NAME.`);
    }
  }
  const host = process.env.DB_HOST?.trim();
  const user = process.env.DB_USER?.trim();
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME?.trim();
  if (!host || !user || password === undefined || !database) {
    throw new Error(
      "[backupDb] Credenciais obrigatórias. Defina DATABASE_URL ou todas: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME."
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

function logBackup(traceId: string, level: "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) {
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

function applyRetention(backupsDir: string, retentionCount: number): void {
  if (!fs.existsSync(backupsDir)) return;
  const files = fs.readdirSync(backupsDir)
    .filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith(".sql"))
    .map((f) => ({
      name: f,
      path: path.join(backupsDir, f),
      mtime: fs.statSync(path.join(backupsDir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
  if (files.length <= retentionCount) return;
  const toRemove = files.slice(retentionCount);
  for (const f of toRemove) {
    try {
      fs.unlinkSync(f.path);
    } catch (e) {
      console.warn("[backupDb] Falha ao remover backup antigo:", f.name, e);
    }
  }
}

export type RunBackupOptions = {
  /** Pasta onde salvar os dumps; padrão: process.cwd()/backups */
  backupsDir?: string;
  /** Quantidade de backups a manter; padrão 30 */
  retentionCount?: number;
  /** traceId para log; se não informado, gera um */
  traceId?: string;
};

export type RunBackupResult = { file: string };

/**
 * Gera dump MySQL (mysqldump) e salva em backupsDir com nome backup_YYYYMMDD_HHMMSS.sql.
 * Não sobrescreve arquivo existente. Aplica retenção após sucesso.
 */
export function runBackup(options: RunBackupOptions = {}): Promise<RunBackupResult> {
  const traceId = options.traceId ?? generateId(10);
  const backupsDir = options.backupsDir ?? path.join(process.cwd(), "backups");
  const retentionCount = options.retentionCount ?? RETENTION_COUNT_DEFAULT;
  const config = getDbConfig();

  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
    logBackup(traceId, "info", "Pasta backups criada", { dir: backupsDir });
  }

  const now = new Date();
  const timestamp =
    now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    "_" +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0");
  const filename = `${BACKUP_PREFIX}${timestamp}.sql`;
  const fullPath = path.join(backupsDir, filename);

  if (fs.existsSync(fullPath)) {
    logBackup(traceId, "error", "Arquivo já existe; backup não sobrescreve", { file: filename });
    return Promise.reject(new Error("Arquivo de backup já existe; não sobrescreve"));
  }

  logBackup(traceId, "info", "Iniciando backup MySQL", {
    database: config.database,
    host: config.host,
    file: filename,
  });

  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(fullPath);
    const child = spawn(
      "mysqldump",
      [
        "--single-transaction",
        "-h", config.host,
        "-P", String(config.port),
        "-u", config.user,
        config.database,
      ],
      {
        env: { ...process.env, MYSQL_PWD: config.password },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    child.stdout.pipe(out);
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    child.on("error", (err) => {
      logBackup(traceId, "error", "Falha ao executar mysqldump", { error: err.message });
      out.destroy();
      reject(err);
    });

    child.on("close", (code) => {
      out.end(() => {
        if (code !== 0) {
          try { fs.unlinkSync(fullPath); } catch { /* ignore */ }
          logBackup(traceId, "error", "mysqldump encerrou com erro", { code, stderr: stderr.slice(0, 500) });
          reject(new Error(`mysqldump exit code ${code}`));
          return;
        }
        applyRetention(backupsDir, retentionCount);
        logBackup(traceId, "info", "Backup concluído", { file: filename, path: fullPath });
        resolve({ file: filename });
      });
    });
  });
}
