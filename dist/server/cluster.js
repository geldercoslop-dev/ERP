import { startServer } from './_core/index.js';
import { systemLogger } from './_core/logger.js';
systemLogger.info('[BOOT] inicializando servidor em modo single-process');
void startServer().catch((error) => {
    systemLogger.error({ error: error instanceof Error ? error.message : String(error) }, '[BOOT] falha ao iniciar servidor');
    process.exit(1);
});
