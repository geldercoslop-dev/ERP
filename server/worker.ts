import "./_core/loadEnv.js";

import { queueService } from "./_core/queue-service.js";
import { ValidationError } from './_core/errors/typed-errors.js';
import { systemLogger } from "./_core/logger.js";
import { waitForRedis } from "./infra/redis.js";

async function startWorker(): Promise<void> {
  try {
    const timeoutMs = Math.max(5_000, Number(process.env.REDIS_BOOT_TIMEOUT_MS || 30_000));
    systemLogger.info({ timeoutMs }, "[WORKER] aguardando Redis");

    const redisReady = await waitForRedis(timeoutMs);
    if (!redisReady) {
      throw new ValidationError("Redis não ficou pronto a tempo para o worker");
    }

    await queueService.initialize();
    await queueService.startWorkers();

    systemLogger.info({ pid: process.pid }, "[WORKER] BullMQ worker iniciado (consumer isolado)");
  } catch (error) {
    systemLogger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[WORKER] falha ao iniciar"
    );
    process.exit(1);
  }
}

async function shutdownWorker(signal: string): Promise<void> {
  systemLogger.info({ signal, pid: process.pid }, "[WORKER] encerrando");

  try {
    await queueService.close();
    process.exit(0);
  } catch (error) {
    systemLogger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[WORKER] falha ao encerrar"
    );
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  void shutdownWorker("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdownWorker("SIGTERM");
});

void startWorker();
