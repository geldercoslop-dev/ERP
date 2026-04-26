/**
 * BOOTSTRAP CENTRAL ÚNICO
 * 
 * Este é o ÚNICO ponto de inicialização do sistema.
 * TODA inicialização deve passar por bootstrapServer().
 * 
 * PRINCÍPIOS:
 * - ZERO dependência de ordem de import
 * - ZERO acesso a ENV antes de bootstrap validado
 * - ZERO execução de código crítico no import-time
 * - FAIL-FAST se ordem for violada
 */

import { initEnv } from "./env/bootstrapEnv.js";
import { getEnv } from "./env.js";
import { systemLogger } from "./logger.js";
import { waitForDatabaseReady } from "./db-bootstrap.js";
import { waitForRedis } from "../infra/redis.js";
import { validateRequiredEnv } from "../services/env.service.js";
import { runRuntimeHealthCheck, attemptMigrationRepair, type SystemHealthReport, getSystemState, updateSystemState } from "./runtime-health.js";

/**
 * Estado global do bootstrap
 * Única fonte de verdade para o estado de inicialização
 */
declare global {
  var __BOOTSTRAPPED__: boolean;
  var __BOOTSTRAP_ERROR__: Error | null;
}

// Inicializar estado global
if (typeof globalThis.__BOOTSTRAPPED__ === 'undefined') {
  globalThis.__BOOTSTRAPPED__ = false;
  globalThis.__BOOTSTRAP_ERROR__ = null;
}

/**
 * Sleep function for backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Erro lançado quando sistema é acessado antes do bootstrap
 */
export class BootstrapNotInitializedError extends Error {
  constructor(module: string) {
    super(
      `BOOTSTRAP_NOT_INITIALIZED: Module '${module}' accessed before bootstrapServer() completed. ` +
      `All critical modules must be accessed AFTER bootstrapServer() is called. ` +
      `This is a FAIL-HARD protection to prevent inconsistent state.`
    );
    this.name = 'BootstrapNotInitializedError';
  }
}

/**
 * Verifica se bootstrap foi concluído
 * Lança erro se não foi
 */
export function requireBootstrap(module: string): void {
  if (!globalThis.__BOOTSTRAPPED__) {
    const error = new BootstrapNotInitializedError(module);
    globalThis.__BOOTSTRAP_ERROR__ = error;
    throw error;
  }
}

/**
 * Verifica se bootstrap foi concluído (não lança erro)
 */
export function isBootstrapped(): boolean {
  return globalThis.__BOOTSTRAPPED__ === true;
}

/**
 * BOOTSTRAP CENTRAL ÚNICO com Auto-Healing
 * 
 * Esta função deve ser chamada EXATAMENTE UMA VEZ no entrypoint.
 * TODA inicialização crítica deve acontecer aqui.
 * 
 * Ordem de inicialização:
 * 1. ENV (carregado explicitamente)
 * 2. Validação de ENV crítico
 * 3. Database (espera e valida conexão)
 * 4. Redis (espera e valida conexão - opcional para modo DEGRADED)
 * 5. Runtime health check
 * 6. Auto-heal loop se necessário
 * 7. Marca bootstrap como completo
 */
export async function bootstrapServer(): Promise<void> {
  // Fail-fast se já foi inicializado
  if (globalThis.__BOOTSTRAPPED__) {
    systemLogger.warn('[BOOTSTRAP] Já inicializado, ignorando chamada duplicada');
    return;
  }

  const startTime = Date.now();
  systemLogger.info('[BOOTSTRAP] Iniciando bootstrap central com auto-healing...');

  try {
    // 1. Carregar ENV (ZERO import-time side effects)
    systemLogger.info('[BOOTSTRAP] Carregando ENV...');
    initEnv();
    systemLogger.info('[BOOTSTRAP] ENV carregado');

    // 2. Validar ENV crítico
    systemLogger.info('[BOOTSTRAP] Validando ENV...');
    validateRequiredEnv();
    const env = getEnv();
    systemLogger.info('[BOOTSTRAP] ENV validado com sucesso');

    // 3. Database - esperar e validar (CRÍTICO - sem isso não inicia)
    systemLogger.info('[BOOTSTRAP] Aguardando Database...');
    await waitForDatabaseReady();
    systemLogger.info('[BOOTSTRAP] Database pronto');

    // 4. Redis - esperar e validar (NÃO-crítico - pode rodar em modo DEGRADED)
    systemLogger.info('[BOOTSTRAP] Aguardando Redis...');
    const redisTimeout = Math.max(5_000, Number(process.env.REDIS_BOOT_TIMEOUT_MS || 30_000));
    const redisOk = await waitForRedis(redisTimeout);
    if (!redisOk) {
      systemLogger.warn('[BOOTSTRAP] Redis não ficou pronto a tempo - sistema pode rodar em modo DEGRADED');
    } else {
      systemLogger.info('[BOOTSTRAP] Redis pronto');
    }

    // 5. Runtime health check com auto-heal loop
    systemLogger.info('[BOOTSTRAP] Executando runtime health check...');
    const maxRetries = 3;
    let healthReport: SystemHealthReport | undefined;
    let recovered = false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      systemLogger.info({ attempt, maxRetries }, '[BOOTSTRAP] Health check attempt');
      
      healthReport = await runRuntimeHealthCheck();
      
      // Se HEALTHY ou DEGRADED, podemos continuar
      if (healthReport.status === 'HEALTHY' || healthReport.status === 'DEGRADED') {
        systemLogger.info({ status: healthReport.status }, '[BOOTSTRAP] Sistema saudável, continuando...');
        recovered = true;
        break;
      }
      
      // Se FAILED, tentar auto-recover
      if (healthReport.status === 'FAILED') {
        if (healthReport.canRecover && healthReport.recoveryAction === 'auto-repair-migrations') {
          systemLogger.info('[BOOTSTRAP] Tentando auto-repair de migrations...');
          const repairSuccess = await attemptMigrationRepair();
          
          if (repairSuccess) {
            systemLogger.info('[BOOTSTRAP] Auto-repair bem-sucedido, revalidando...');
            continue; // Tentar health check novamente
          }
        }
        
        // Se não pode recuperar ou recovery falhou, tentar retry com backoff
        if (attempt < maxRetries) {
          const backoffMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
          systemLogger.warn({ attempt, backoffMs }, '[BOOTSTRAP] Health check FAILED, aguardando backoff...');
          await sleep(backoffMs);
        }
      }
    }

    // Se após todas as tentativas ainda falhou, crash controlado
    if (!recovered || !healthReport || healthReport.status === 'FAILED') {
      const error = new Error(
        `SYSTEM_HEALTH_CHECK_FAILED: Após ${maxRetries} tentativas, sistema ainda em estado FAILED. ` +
        `Components com erro: ${healthReport?.components.filter(c => c.status === 'error').map(c => c.name).join(', ')}`
      );
      globalThis.__BOOTSTRAP_ERROR__ = error;
      systemLogger.error({ error: error.message, components: healthReport?.components }, '[BOOTSTRAP] FALHA CRÍTICA - sistema não pode iniciar');
      throw error;
    }

    // 6. Marcar bootstrap como completo
    globalThis.__BOOTSTRAPPED__ = true;
    globalThis.__BOOTSTRAP_ERROR__ = null;
    updateSystemState({ booted: true });

    const duration = Date.now() - startTime;
    const finalStatus = healthReport?.status || 'UNKNOWN';
    systemLogger.info({ duration, status: finalStatus }, '[BOOTSTRAP] Bootstrap concluído com sucesso');

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    globalThis.__BOOTSTRAP_ERROR__ = err;
    systemLogger.error({ error: err.message }, '[BOOTSTRAP] FALHA CRÍTICA no bootstrap');
    throw err;
  }
}

/**
 * Reset do estado do bootstrap (apenas para testes)
 * NÃO usar em produção
 */
export function resetBootstrapForTesting(): void {
  if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development') {
    throw new Error('resetBootstrapForTesting só pode ser chamado em testes/desenvolvimento');
  }
  globalThis.__BOOTSTRAPPED__ = false;
  globalThis.__BOOTSTRAP_ERROR__ = null;
}
