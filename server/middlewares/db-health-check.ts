import { Request, Response, NextFunction } from "express";
import { checkDatabasePoolHealth, getPoolHealthSnapshot, getPoolStatsSnapshot } from "../config/database";
import { systemLogger } from "../_core/logger";

/**
 * Um único middleware: health do pool + circuit breaker.
 * Antes: dois middlewares chamavam checkDatabasePoolHealth() em sequência — sob carga,
 * competiam por getConnection() e geravam 503 falsos.
 */
export function createDbGateMiddleware(options: {
  failureThreshold?: number;
  recoveryTimeout?: number;
  monitoringPeriod?: number;
} = {}) {
  const {
    failureThreshold = Number(process.env.DB_CIRCUIT_FAILURE_THRESHOLD) || 12,
    recoveryTimeout = Number(process.env.DB_CIRCUIT_RECOVERY_MS) || 30_000,
    monitoringPeriod = Number(process.env.DB_CIRCUIT_MONITORING_MS) || 120_000,
  } = options;

  let failures = 0;
  let lastFailureTime = 0;
  let circuitOpen = false;
  let nextAttempt = 0;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const pathOnly = (req.originalUrl ?? req.url ?? "").split("?")[0] ?? "";
    if (pathOnly === "/api/system/health" || pathOnly.startsWith("/api/system/health") || pathOnly.startsWith("/health")) {
      return next();
    }

    const now = Date.now();

    if (now - lastFailureTime > monitoringPeriod) {
      failures = 0;
      circuitOpen = false;
    }

    if (circuitOpen) {
      if (now < nextAttempt) {
        const snap = getPoolStatsSnapshot();
        systemLogger.warn(
          {
            method: req.method,
            url: req.url,
            circuitOpen: true,
            nextAttempt: new Date(nextAttempt).toISOString(),
            failures,
            pool: snap,
            traceId: req.traceId,
          },
          "Circuit breaker open — rejecting request"
        );

        res.status(503).json({
          error: "Service Unavailable",
          message: "Database circuit breaker is open",
          retryAfter: Math.ceil((nextAttempt - now) / 1000),
          timestamp: new Date().toISOString(),
        });
        return;
      }
      circuitOpen = false;
      failures = 0;
      systemLogger.info({ method: req.method, url: req.url, traceId: req.traceId }, "Circuit breaker attempting to close");
    }

    const healthy = await checkDatabasePoolHealth();

    if (!healthy) {
      failures++;
      lastFailureTime = now;

      const snap = getPoolStatsSnapshot();
      systemLogger.warn(
        {
          method: req.method,
          url: req.url,
          failures,
          failureThreshold,
          pool: snap,
          traceId: req.traceId,
        },
        "Database health check failed"
      );

      if (failures >= failureThreshold) {
        circuitOpen = true;
        nextAttempt = now + recoveryTimeout;

        systemLogger.error(
          {
            method: req.method,
            url: req.url,
            failures,
            failureThreshold,
            circuitOpen: true,
            nextAttempt: new Date(nextAttempt).toISOString(),
            pool: snap,
            traceId: req.traceId,
          },
          "Circuit breaker opened due to repeated failures"
        );
      }

      res.status(503).json({
        error: "Service Unavailable",
        message: "Database connection unavailable",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (failures > 0) {
      systemLogger.info(
        {
          method: req.method,
          url: req.url,
          failures,
          traceId: req.traceId,
        },
        "Database healthy — resetting failure counter"
      );
      failures = 0;
    }

    next();
  };
}

/** Compat: nomes antigos (um único gate). */
export const dbHealthCheckMiddleware = createDbGateMiddleware();
export function dbCircuitBreakerMiddleware(
  opts?: Parameters<typeof createDbGateMiddleware>[0]
) {
  return createDbGateMiddleware(opts);
}
