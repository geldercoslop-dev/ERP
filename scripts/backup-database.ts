import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";
import { runBackup } from "../server/infra/backup/backupDb";

// Manual env loader
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  content.split("\n").forEach(line => {
    const [key, ...value] = line.split("=");
    if (key && value.length > 0) {
      process.env[key.trim()] = value.join("=").trim().replace(/^["']|["']$/g, "");
    }
  });
}

// Mock logger para evitar dependências ausentes no ambiente de script
const systemLogger = {
  info: (obj: any, msg?: string) => console.log(JSON.stringify({ level: 'info', ...obj, msg })),
  error: (obj: any, msg?: string) => console.error(JSON.stringify({ level: 'error', ...obj, msg }))
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const BACKUPS_DIR = path.join(root, "backups");

/**
 * Script de backup manual do banco de dados MySQL vendas_app.
 * Salva em backups/ com formato backup_YYYYMMDD_HHMMSS.sql.
 */
async function main() {
  const traceId = randomBytes(5).toString('hex');
  const startTime = Date.now();

  try {
    console.log("🚀 Iniciando backup manual do banco de dados...");
    
    // Executar backup usando a infra existente
    const result = await runBackup({
      backupsDir: BACKUPS_DIR,
      traceId,
      retentionCount: 30
    });

    const duration = Date.now() - startTime;
    const stats = fs.statSync(path.join(BACKUPS_DIR, result.file));
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

    systemLogger.info({
      traceId,
      file: result.file,
      sizeMB,
      durationMs: duration,
      status: "success"
    }, `✅ Backup concluído com sucesso: ${result.file} (${sizeMB} MB)`);

    console.log(`✅ Backup finalizado: ${result.file} (${sizeMB} MB) em ${duration}ms`);
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    systemLogger.error({
      traceId,
      durationMs: duration,
      error: errorMessage,
      status: "failed"
    }, "❌ BACKUP FAILED");

    console.error("❌ Erro ao realizar backup:", errorMessage);
    process.exit(1);
  }
}

main();
