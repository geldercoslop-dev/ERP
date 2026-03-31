/**
 * Integração Express/HTTP do shutdown: middleware + setup do server.
 * Toda a lógica de encerramento vive em `server/services/system/shutdown.service.ts`.
 */
import { Server } from "http";
import type { NextFunction, Request, Response } from "express";
import { RUNTIME } from "../config/runtime.js";
import { createLogger } from "../infra/structured-logger.js";
import {
  attachShutdownHttpServer,
  getShutdownBootCompleteFlag,
  getShutdownConnectionStats,
  isShutdownInProgress,
  markShutdownBootComplete,
  registerProcessShutdownHandlers,
  requestShutdown,
} from "../services/system/shutdown.service.js";
import type { ShutdownPayload } from "../services/system/shutdown.service.js";

const logger = createLogger("graceful-shutdown");

export type { ShutdownPayload };
export {
  markShutdownBootComplete,
  isShutdownInProgress,
};

export class GracefulShutdown {
  setup(server: Server, options: { timeoutMs?: number } = {}): void {
    attachShutdownHttpServer(server, options);
    registerProcessShutdownHandlers();

    const signalsLogged =
      !RUNTIME.isDev && process.env.ENABLE_SIGUSR2_SHUTDOWN === "1"
        ? (["SIGTERM", "SIGINT", "SIGUSR2"] as const)
        : (["SIGTERM", "SIGINT"] as const);

    logger.info("Graceful shutdown module ready", {
      metadata: {
        timeoutMs: options.timeoutMs ?? 30_000,
        signals: [...signalsLogged],
        enableGracefulShutdown: RUNTIME.enableGracefulShutdown,
        bootComplete: getShutdownBootCompleteFlag(),
      },
    });
  }

  async shutdown(signal: string): Promise<void> {
    await requestShutdown({ reason: signal, code: 0 });
  }

  isShutting(): boolean {
    return isShutdownInProgress();
  }

  getConnectionStats(): { active: number; isShuttingDown: boolean } {
    return getShutdownConnectionStats();
  }
}

export const gracefulShutdown = new GracefulShutdown();

export function shutdownCheckMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (gracefulShutdown.isShutting()) {
      res.status(503).json({
        error: "Service Unavailable",
        message: "Server is shutting down",
        retryAfter: 60,
      });
      return;
    }
    next();
  };
}

export function setupGracefulShutdown(
  server: Server,
  options?: { timeoutMs?: number }
) {
  gracefulShutdown.setup(server, options);
  return [shutdownCheckMiddleware()];
}

export default gracefulShutdown;
