/**
 * Gera dump MySQL (mysqldump) e salva em backups/ com timestamp.
 * Não sobrescreve arquivo existente. Aplica retenção (últimos 30 backups).
 * Credenciais exclusivamente de env (DATABASE_URL ou DB_HOST, DB_USER, DB_PASSWORD, DB_NAME). Sem fallback.
 * Uso: npm run backup:db ou tsx server/scripts/backup-db.ts
 */
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";
import { runBackup } from "../infra/backup/backupDb.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const BACKUPS_DIR = path.join(root, "backups");
async function main() {
    await import("../_core/loadEnv.js");
    const traceId = nanoid(10);
    await runBackup({ backupsDir: BACKUPS_DIR, traceId });
}
main().then(() => process.exit(0), () => process.exit(1));
