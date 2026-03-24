/**
 * Saúde agregada do processo (HTTP + DB + Redis + shutdown).
 * Todos os checks são limitados por tempo — nunca bloqueiam indefinidamente se DB/Redis estiverem off.
 */
import { isShutdownInProgress, isHttpServerListening } from "./shutdown.service";
import { withCriticalDbTimeout, withExternalRequestTimeout } from "./enterprise-timeout.service";

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

const DEFAULT_TIMEOUT_MS = Math.min(
  90,
  Math.max(15, Number(process.env.HEALTH_CHECK_TIMEOUT_MS || 80))
);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, rej) => {
      setTimeout(() => rej(new Error("health_check_timeout")), ms);
    }),
  ]);
}

async function pingDb(ms: number): Promise<boolean> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return false;
  try {
    return await withCriticalDbTimeout(
      (async () => {
        const { getConnectionPool } = await import("../../config/database");
        const pool = await getConnectionPool();
        await pool.query("SELECT 1 AS health_ping");
        return true;
      })(),
      ms,
      "HEALTH_DB_PING"
    );
  } catch {
    return false;
  }
}

async function pingRedis(ms: number): Promise<boolean> {
  try {
    return await withExternalRequestTimeout(
      (async () => {
        const { redisManager } = await import("../../infra/redis");
        const client = redisManager.getClient();
        if (!client) return false;
        const pong = await client.ping();
        return pong === "PONG";
      })(),
      ms,
      "HEALTH_REDIS_PING"
    );
  } catch {
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
