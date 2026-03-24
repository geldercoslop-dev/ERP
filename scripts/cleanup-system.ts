import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Configurações
const LOGS_DIR = path.join(root, "logs");
const BACKUPS_DIR = path.join(root, "backups");
const MAX_LOG_AGE_DAYS = 30;
const MAX_BACKUPS_COUNT = 30;

// Mock logger para o script
const systemLogger = {
  info: (obj: any, msg?: string) => console.log(JSON.stringify({ level: 'info', ...obj, msg })),
  warn: (obj: any, msg?: string) => console.warn(JSON.stringify({ level: 'warn', ...obj, msg })),
  error: (obj: any, msg?: string) => console.error(JSON.stringify({ level: 'error', ...obj, msg }))
};

/**
 * Script de limpeza automática do sistema.
 * Remove logs antigos (> 30 dias) e mantém apenas os últimos 30 backups.
 */
export async function runCleanup() {
  console.log("🧹 Iniciando limpeza do sistema...");
  const startTime = Date.now();
  const stats = {
    logsRemoved: 0,
    backupsRemoved: 0,
    spaceFreedBytes: 0
  };

  try {
    // 1. Limpar Logs Antigos (> 30 dias)
    if (fs.existsSync(LOGS_DIR)) {
      const logFiles = fs.readdirSync(LOGS_DIR);
      const now = Date.now();
      const maxAgeMs = MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000;

      for (const file of logFiles) {
        const filePath = path.join(LOGS_DIR, file);
        const fileStats = fs.statSync(filePath);
        
        if (now - fileStats.mtimeMs > maxAgeMs) {
          stats.spaceFreedBytes += fileStats.size;
          fs.unlinkSync(filePath);
          stats.logsRemoved++;
        }
      }
    }

    // 2. Limpar Backups Antigos (Manter apenas os últimos 30)
    if (fs.existsSync(BACKUPS_DIR)) {
      const backupFiles = fs.readdirSync(BACKUPS_DIR)
        .filter(f => f.endsWith(".sql"))
        .map(f => ({
          name: f,
          path: path.join(BACKUPS_DIR, f),
          time: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs,
          size: fs.statSync(path.join(BACKUPS_DIR, f)).size
        }))
        .sort((a, b) => b.time - a.time); // Mais novos primeiro

      if (backupFiles.length > MAX_BACKUPS_COUNT) {
        const toRemove = backupFiles.slice(MAX_BACKUPS_COUNT);
        for (const file of toRemove) {
          stats.spaceFreedBytes += file.size;
          fs.unlinkSync(file.path);
          stats.backupsRemoved++;
        }
      }
    }

    const duration = Date.now() - startTime;
    const spaceFreedMB = (stats.spaceFreedBytes / 1024 / 1024).toFixed(2);

    // 3. Registrar no Logger
    systemLogger.info({
      module: "cleanup-system",
      stats,
      spaceFreedMB,
      durationMs: duration,
      status: "success"
    }, `✅ Limpeza concluída: ${stats.logsRemoved} logs e ${stats.backupsRemoved} backups removidos. ${spaceFreedMB} MB liberados.`);

    console.log(`✅ Limpeza finalizada em ${duration}ms.`);
    console.log(`   - Logs removidos: ${stats.logsRemoved}`);
    console.log(`   - Backups removidos: ${stats.backupsRemoved}`);
    console.log(`   - Espaço liberado: ${spaceFreedMB} MB`);

    return stats;
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    systemLogger.error({
      module: "cleanup-system",
      error: errorMessage,
      status: "failed"
    }, "❌ CLEANUP FAILED");
    console.error("❌ Erro na limpeza:", errorMessage);
    throw error;
  }
}

// Executar se chamado diretamente
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCleanup().catch(() => process.exit(1));
}
