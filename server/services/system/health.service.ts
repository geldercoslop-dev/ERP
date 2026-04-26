/**
 * Saúde agregada do processo (HTTP + DB + Redis + shutdown).
 * Todos os checks são limitados por tempo — nunca bloqueiam indefinidamente se DB/Redis estiverem off.
 */
import { isShutdownInProgress, isHttpServerListening } from "./shutdown.service.js";
import { withCriticalDbTimeout, withExternalRequestTimeout } from "./enterprise-timeout.service.js";
import { parseEnv } from "../env.schema.js";
import { createLogger } from "../../infra/structured-logger.js";

export type HealthStatus = {
  http: "up" | "down";
  db: "up" | "down";
  redis: "up" | "down";
  shuttingDown: boolean;
};

export type HealthMetrics = {
  uptime: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
  };
  cpu: {
    user: number;
    system: number;
  };
};

export type AdvancedHealthReport = {
  status: "ok" | "degraded" | "down";
  timestamp: number;
  details: HealthStatus;
  metrics: HealthMetrics;
};

export type HealthReport = AdvancedHealthReport;

const logger = createLogger("system-health");

const DEFAULT_TIMEOUT_MS = Math.min(
  90,
  Math.max(15, Number(process.env.HEALTH_CHECK_TIMEOUT_MS || 80))
);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, rej) => {
    timeoutId = setTimeout(() => rej(new Error("health_check_timeout")), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  });
}

async function pingDb(ms: number): Promise<boolean> {
  // Fail-fast: se ENV crítico estiver inválido, o health deve refletir DB down.
  try {
    void parseEnv();
  } catch (error) {
    logger.warn("Health DB ping com ENV inválido", {
      metadata: {
        timeoutMs: ms,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return false;
  }
  try {
    return await withTimeout(withCriticalDbTimeout(
      (async () => {
        const { getConnectionPool } = await import("../../config/database.js");
        const pool = await getConnectionPool();
        await pool.query("SELECT 1 AS health_ping");
        return true;
      })(),
      ms,
      "HEALTH_DB_PING"
    ), ms);
  } catch (error) {
    logger.warn("Health DB ping falhou", {
      metadata: {
        timeoutMs: ms,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return false;
  }
}

async function pingRedis(ms: number): Promise<boolean> {
  try {
    return await withTimeout(withExternalRequestTimeout(
      (async () => {
        const { getRedis } = await import("../../infra/redis.js");
        const client = getRedis().getClient();
        const pong = await client.ping();
        return pong === "PONG";
      })(),
      ms,
      "HEALTH_REDIS_PING"
    ), ms);
  } catch (error) {
    logger.warn("Health Redis ping falhou", {
      metadata: {
        timeoutMs: ms,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return false;
  }
}

/**
 * Snapshot de saúde. DB e Redis em paralelo (cada um com timeout próprio).
 * `http` reflete `server.listening` após `attachShutdownHttpServer` + `listen`; antes do listen, pode ser `down`.
 * Inclui métricas avançadas: uptime, memory, cpu.
 */
export async function getServerHealth(
  options?: { checkTimeoutMs?: number }
): Promise<AdvancedHealthReport> {
  const ms = options?.checkTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const shuttingDown = isShutdownInProgress();
  const http: "up" | "down" = isHttpServerListening() ? "up" : "down";

  const [db, redis] = await Promise.all([pingDb(ms), pingRedis(ms)]);

  const details: HealthStatus = {
    http,
    db: db ? "up" : "down",
    redis: redis ? "up" : "down",
    shuttingDown,
  };

  // Coletar métricas do processo
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  const metrics: HealthMetrics = {
    uptime: process.uptime(),
    memory: {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      rss: memUsage.rss,
      external: memUsage.external,
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system,
    },
  };

  let status: AdvancedHealthReport["status"];
  if (details.http === "down") {
    status = "down";
  } else if (
    shuttingDown ||
    details.db === "down" ||
    details.redis === "down"
  ) {
    status = "degraded";
  } else {
    status = "ok";
  }

  return {
    status,
    timestamp: Date.now(),
    details,
    metrics,
  };
}
