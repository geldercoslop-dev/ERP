// CRITICAL: Bootstrap central único com Auto-Healing - ZERO import-time side effects
import { bootstrapServer } from './_core/bootstrap.js';
import { startServer } from './_core/index.js';
import { initializeServiceProtection } from './_core/init-protection.js';
import { systemLogger } from './_core/logger.js';
import { getSystemState } from './_core/runtime-health.js';

systemLogger.info('[BOOT] inicializando servidor em modo single-process');

void bootstrapServer()
  .then(() => {
    const systemState = getSystemState();
    systemLogger.info({ health: systemState.health, degradedMode: systemState.degradedMode }, '[BOOT] Bootstrap concluído, iniciando proteção de serviços...');
    
    initializeServiceProtection();
    systemLogger.info('[BOOT] Proteção de serviços iniciada, iniciando servidor...');
    
    return startServer();
  })
  .catch((error: unknown) => {
    systemLogger.error(
      { error: error instanceof Error ? error.message : String(error) },
      '[BOOT] falha ao inicializar servidor'
    );
    process.exit(1);
  });
