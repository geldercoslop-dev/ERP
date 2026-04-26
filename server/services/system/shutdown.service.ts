/**

 * Único ponto de orquestração de encerramento do processo (HTTP + DB + Redis + cache).

 * Rotas, LEO e tools devem chamar apenas `requestShutdown` — não `process.exit` nem sinais sintéticos.

 */

import type { Server } from "http";

import { RUNTIME } from "../../config/runtime.js";

import { createLogger } from "../../infra/structured-logger.js";



const logger = createLogger("shutdown-service");



export type ShutdownPayload = {

  reason: string;

  code?: number;

};



let shutdownBootComplete = false;



export function markShutdownBootComplete(): void {

  shutdownBootComplete = true;

  logger.info("Shutdown handlers armados (boot completo)", {

    metadata: { pid: process.pid },

  });

}



let httpServer: Server | null = null;

let isShuttingDown = false;

let shutdownTimeoutMs = 30_000;

const activeConnections = new Set<string>();



let processHandlersRegistered = false;



let shutdownAttempts = 0;

const MAX_SHUTDOWN_ATTEMPTS = 3;



const SHUTDOWN_FORCE_EXIT_MS = Math.max(

  1000,

  Number(process.env.SHUTDOWN_FORCE_EXIT_MS || 10_000)

);



export function isShutdownInProgress(): boolean {

  return isShuttingDown;

}



export function getShutdownConnectionStats(): {

  active: number;

  isShuttingDown: boolean;

} {

  return {

    active: activeConnections.size,

    isShuttingDown,

  };

}



/** Indica se o servidor HTTP já está em `listen()` (útil para health / probes). */

export function isHttpServerListening(): boolean {

  return httpServer != null && httpServer.listening;

}



export function attachShutdownHttpServer(

  server: Server,

  options: { timeoutMs?: number } = {}

): void {

  httpServer = server;

  shutdownTimeoutMs = options.timeoutMs ?? 30_000;



  server.on("connection", (socket) => {

    const connectionId = `${Date.now()}-${Math.random()}`;

    activeConnections.add(connectionId);

    socket.on("close", () => {

      activeConnections.delete(connectionId);

    });

  });

}



async function closeHttpServer(): Promise<void> {

  const server = httpServer;

  if (!server) return;



  logger.info("[SHUTDOWN] closing HTTP", {

    metadata: {

      service: "http-server",

      timeout: "8000ms",

    },

  });



  await Promise.race([

    new Promise<void>((resolve, reject) => {

      server.close((err) => {

        if (err) {

          reject(err);

          return;

        }

        logger.info("[SHUTDOWN] HTTP server closed", {

          metadata: {

            service: "http-server",

            status: "closed",

          },

        });

        resolve();

      });

    }),

    new Promise<void>((_, reject) =>

      setTimeout(() => reject(new Error("HTTP close timeout")), 8000)

    ),

  ]).catch((err: unknown) => {

    const msg = err instanceof Error ? err.message : String(err);

    logger.warn("[SHUTDOWN] HTTP close failed", {

      metadata: {

        service: "http-server",

        error: msg,

      },

    });

  });

}



async function closeDatabase(): Promise<void> {

  const pool = globalThis.db;

  const end = pool?.end;

  if (typeof end !== "function") {

    logger.warn("[SHUTDOWN] DB not found or no .end() method", {

      metadata: {

        service: "database",

        status: "not-configured",

      },

    });

    return;

  }



  logger.info("[SHUTDOWN] closing DB", {

    metadata: {

      service: "database",

      timeout: "8000ms",

    },

  });



  try {

    await Promise.race([

      Promise.resolve(end.call(pool)),

      new Promise<never>((_, reject) =>

        setTimeout(() => reject(new Error("DB close timeout")), 8000)

      ),

    ]);

    const { clearPoolAfterGracefulShutdown } = await import("../../config/database.js");

    clearPoolAfterGracefulShutdown();

    logger.info("[SHUTDOWN] DB closed", {

      metadata: {

        service: "database",

        status: "closed",

      },

    });

  } catch (err: unknown) {

    const msg = err instanceof Error ? err.message : String(err);

    logger.warn("[SHUTDOWN] DB close failed", {

      metadata: {

        service: "database",

        error: msg,

      },

    });

  }

}



async function closeRedisConnection(): Promise<void> {

  const client = globalThis.redis;

  const quit = client?.quit;

  if (typeof quit !== "function") {

    logger.warn("[SHUTDOWN] Redis not found or no .quit() method", {

      metadata: {

        service: "redis",

        status: "not-configured",

      },

    });

    return;

  }



  logger.info("[SHUTDOWN] closing Redis", {

    metadata: {

      service: "redis",

      timeout: "8000ms",

    },

  });



  try {

    await Promise.race([

      Promise.resolve(quit.call(client)),

      new Promise<never>((_, reject) =>

        setTimeout(() => reject(new Error("Redis close timeout")), 8000)

      ),

    ]);

    globalThis.redis = undefined;

    const { getRedis } = await import("../../infra/redis.js");

    getRedis().clearClientAfterGracefulShutdown();

    logger.info("[SHUTDOWN] Redis closed", {

      metadata: {

        service: "redis",

        status: "closed",

      },

    });

  } catch (err: unknown) {

    const msg = err instanceof Error ? err.message : String(err);

    logger.warn("[SHUTDOWN] Redis close failed", {

      metadata: {

        service: "redis",

        error: msg,

      },

    });

    globalThis.redis = undefined;

  }

}



async function drainResources(signal: string): Promise<void> {

  const startWait = Date.now();

  while (activeConnections.size > 0) {

    if (Date.now() - startWait > shutdownTimeoutMs) {

      activeConnections.clear();

      logger.warn("[SHUTDOWN] Timeout waiting for active connections", {

        metadata: {

          signal,

          clientsWhen: activeConnections.size,

          timeoutMs: shutdownTimeoutMs,

        },

      });

      break;

    }

    await new Promise((r) => setTimeout(r, 500));

  }



  logger.info("[SHUTDOWN] Draining resources", {

    metadata: {

      signal,

      activeConnections: activeConnections.size,

    },

  });



  const results = await Promise.allSettled([

    closeHttpServer(),

    closeDatabase(),

    closeRedisConnection(),

  ]);

  for (const r of results) {

    if (r.status === "rejected") {

      logger.error("[SHUTDOWN] Resource close rejected", {

        metadata: {

          error: String(r.reason),

        },

      });

    }

  }



  try {

    const cacheModule = await import("../../_core/cache-manager.js");

    if ("closeCacheConnections" in cacheModule) {

      const fn = cacheModule.closeCacheConnections;

      if (typeof fn === "function") {

        logger.info("[SHUTDOWN] closing Cache", {

          metadata: {

            service: "cache",

          },

        });

        await Promise.resolve(fn());

        logger.info("[SHUTDOWN] Cache closed", {

          metadata: {

            service: "cache",

            status: "closed",

          },

        });

      }

    }

  } catch {

    /* ignore */

  }

}



/**

 * FUNÇÃO CENTRAL GARANTIDORA DE SHUTDOWN

 * Garante que o processo SEMPRE finalize mesmo que tudo falhe

 * Timeout ABSOLUTO de 10s que não pode ser contornado

 */

async function gracefulShutdown(

  signal: string,

  exitCode: 0 | 1 = 0

): Promise<never> {

  // Rejeita múltiplas execuções

  if (isShuttingDown) {

    logger.info("[SHUTDOWN] Already in progress, ignoring duplicate signal", {

      metadata: {

        signal,

        currentExitCode: exitCode,

      },

    });

    // Continua aguardando o primeiro shutdown completar

    await new Promise(() => {}); // Never resolves - wait for process.exit

  }



  isShuttingDown = true;



  // Contador de segurança

  shutdownAttempts++;

  if (shutdownAttempts > MAX_SHUTDOWN_ATTEMPTS) {

    logger.error("[SHUTDOWN_FORCE_EXIT] Too many attempts", {

      metadata: {

        signal,

        attempts: shutdownAttempts,

        max: MAX_SHUTDOWN_ATTEMPTS,

      },

    });

    process.exit(1);

  }



  logger.info("[SHUTDOWN_START] Iniciando encerramento", {

    metadata: {

      signal,

      reason: signal,

      exitCode,

      attempt: `${shutdownAttempts}/${MAX_SHUTDOWN_ATTEMPTS}`,

      pid: process.pid,

    },

  });



  // TIMEOUT ABSOLUTO - garante que mata o processo se tudo ficar travado

  const absoluteTimeout = setTimeout(() => {

    logger.error("[SHUTDOWN_FORCE_EXIT] Timeout absoluto (10s) excedido", {

      metadata: {

        signal,

        timeoutMs: SHUTDOWN_FORCE_EXIT_MS,

        attempt: shutdownAttempts,

        pid: process.pid,

      },

    });

    process.exit(1);

  }, SHUTDOWN_FORCE_EXIT_MS);



  // Garante que timeout não impede GC

  absoluteTimeout.unref();



  try {

    // Fase 1: Aguardar conexões ativas se finalizarem

    await drainResources(signal);



    // Fase 2: Cleanup bem-sucedido

    clearTimeout(absoluteTimeout);



    logger.info("[SHUTDOWN_COMPLETE] Encerramento gracioso bem-sucedido", {

      metadata: {

        signal,

        exitCode,

        pid: process.pid,

      },

    });



    // NUNCA RETORNA - apenas mata o processo

    process.exit(exitCode);

  } catch (err) {

    clearTimeout(absoluteTimeout);



    logger.error("[SHUTDOWN_ERROR] Erro durante encerramento", {

      metadata: {

        signal,

        error: err instanceof Error ? err.message : String(err),

        stack: err instanceof Error ? err.stack : undefined,

        exitCode: 1,

        pid: process.pid,

      },

    });



    // NUNCA RETORNA - apenas mata o processo

    process.exit(1);

  }

}



async function shutdownWithExit(signal: string, exitCode: 0 | 1): Promise<void> {

  // Delegate para gracefulShutdown

  try {

    await gracefulShutdown(signal, exitCode);

  } catch {

    // gracefulShutdown nunca retorna (sempre exit)

    // Mas o TypeScript precisa que assincronamente "algo" aconteça

  }

}



/**

 * Solicita encerramento gracioso. Em condições normais o processo termina com `process.exit` dentro deste fluxo

 * (a Promise pode não resolver no sucesso).

 */

export async function requestShutdown(payload: ShutdownPayload): Promise<void> {

  const exitCode: 0 | 1 = payload.code === 1 ? 1 : 0;

  await shutdownWithExit(payload.reason, exitCode);

}



/**

 * Função pública para iniciar shutdown gracioso

 * NUNCA RETORNA - chama process.exit()

 */

export async function initiateGracefulShutdown(

  signal: string = "manual",

  exitCode: 0 | 1 = 0

): Promise<never> {

  return gracefulShutdown(signal, exitCode);

}



export function registerProcessShutdownHandlers(): void {

  if (processHandlersRegistered) return;

  processHandlersRegistered = true;



  if (!RUNTIME.enableGracefulShutdown) {

    logger.info("[BOOT] Graceful shutdown DISABLED", {

      metadata: {

        enabled: false,

      },

    });

    return;

  }



  logger.info("[BOOT] Graceful shutdown ENABLED", {

    metadata: {

      enabled: true,

      forceExitTimeoutMs: SHUTDOWN_FORCE_EXIT_MS,

      maxAttempts: MAX_SHUTDOWN_ATTEMPTS,

    },

  });



  const blockSigintShutdown =

    process.env.BLOCK_SIGINT_SHUTDOWN === "1" || !process.stdin.isTTY;



  process.removeAllListeners("SIGINT");

  process.removeAllListeners("SIGTERM");



  if (blockSigintShutdown) {

    logger.warn("[BOOT] CTRL+C is BLOCKED - shutdown via SIGTERM/HTTP only", {

      metadata: {

        blockSigint: true,

        headless: !process.stdin.isTTY,

      },

    });

    process.on("SIGINT", () => {

      logger.warn("[ERROR] CTRL+C attempted but BLOCKED", {

        metadata: {

          signal: "SIGINT",

          blocked: true,

          instruction: "Use SIGTERM or HTTP endpoint for shutdown",

        },

      });

    });

  } else {

    const onSigInt = (): void => {

      void shutdownWithExit("SIGINT", 0).catch((err) => {

        logger.error("[SHUTDOWN] SIGINT handler error", {

          metadata: {

            signal: "SIGINT",

            error: err instanceof Error ? err.message : String(err),

          },

        });

      });

    };

    process.on("SIGINT", onSigInt);

  }



  const onSigTerm = (): void => {

    if (blockSigintShutdown) {

      logger.info("[SHUTDOWN] SIGTERM received (shutdown authorized)", {

        metadata: {

          signal: "SIGTERM",

          authorized: true,

        },

      });

    }

    void shutdownWithExit("SIGTERM", 0).catch((err) => {

      logger.error("[SHUTDOWN] SIGTERM handler error", {

        metadata: {

          signal: "SIGTERM",

          error: err instanceof Error ? err.message : String(err),

        },

      });

    });

  };

  process.on("SIGTERM", onSigTerm);



  if (!RUNTIME.isDev && process.env.ENABLE_SIGUSR2_SHUTDOWN === "1") {

    process.removeAllListeners("SIGUSR2");

    process.on("SIGUSR2", () => {

      logger.info("[SHUTDOWN] SIGUSR2 received - custom reload signal", {

        metadata: {

          signal: "SIGUSR2",

        },

      });

      void shutdownWithExit("SIGUSR2", 0).catch((err) => {

        logger.error("[SHUTDOWN] SIGUSR2 handler error", {

          metadata: {

            signal: "SIGUSR2",

            error: err instanceof Error ? err.message : String(err),

          },

        });

      });

    });

  }



  process.on("uncaughtException", (error) => {

    logger.error("[ERROR] Uncaught exception detected", {

      metadata: {

        type: "uncaughtException",

        message: error.message,

        stack: error.stack,

      },

    });

    if (!RUNTIME.enableGracefulShutdown) {

      logger.info("[SHUTDOWN] Exception ignored (graceful shutdown disabled)", {

        metadata: {

          reason: "ENABLE_GRACEFUL_SHUTDOWN=false",

        },

      });

      return;

    }

    logger.error("[SHUTDOWN] Initiating shutdown due to uncaught exception", {

      metadata: {

        signal: "UNCAUGHT_EXCEPTION",

        exitCode: 1,

      },

    });

    void shutdownWithExit("UNCAUGHT_EXCEPTION", 1).catch((err) => {

      logger.error("[SHUTDOWN] Exception handler error", {

        metadata: {

          error: err instanceof Error ? err.message : String(err),

        },

      });

    });

  });



  process.on("unhandledRejection", (reason, promise) => {

    logger.error("[ERROR] Unhandled promise rejection", {

      metadata: {

        type: "unhandledRejection",

        reason: reason instanceof Error ? reason.message : String(reason),

        promise: String(promise),

      },

    });

    if (!RUNTIME.enableGracefulShutdown) {

      logger.info("[SHUTDOWN] Rejection ignored (graceful shutdown disabled)", {

        metadata: {

          reason: "ENABLE_GRACEFUL_SHUTDOWN=false",

        },

      });

      return;

    }

    logger.error("[SHUTDOWN] Initiating shutdown due to unhandled rejection", {

      metadata: {

        signal: "UNHANDLED_REJECTION",

        exitCode: 1,

      },

    });

    void shutdownWithExit("UNHANDLED_REJECTION", 1).catch((err) => {

      logger.error("[SHUTDOWN] Rejection handler error", {

        metadata: {

          error: err instanceof Error ? err.message : String(err),

        },

      });

    });

  });

}



export function getShutdownBootCompleteFlag(): boolean {

  return shutdownBootComplete;

}

