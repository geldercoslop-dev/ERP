import * as mysql from "mysql2/promise";
import { systemLogger } from "../_core/logger";
import { createLogger } from "../infra/structured-logger";
import { recordDatabase } from "../infra/metrics";
import { instrumentMySQL } from "../infra/mysql-instrumentation";

/**
 * Pool MySQL — única fonte de conexão.
 * Obrigatório: DATABASE_URL (mysql://user:pass@host:port/dbname)
 */

const observabilityLogger = createLogger("database-config");

let _pool: mysql.Pool | null = null;

/** Falha imediata se DATABASE_URL não estiver definido. */
export function requireDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    throw new Error(
      "DATABASE_URL é obrigatório. Ex.: mysql://usuario:senha@host:3306/nome_do_banco"
    );
  }
  return raw;
}

function parseUrlToPoolOptions(urlString: string): mysql.PoolOptions {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    throw new Error("DATABASE_URL inválido: não é uma URL válida.");
  }
  if (u.protocol !== "mysql:" && u.protocol !== "mysql2:") {
    throw new Error("DATABASE_URL deve usar o protocolo mysql://");
  }
  const database = u.pathname.replace(/^\//, "").split("/")[0];
  if (!database) {
    throw new Error("DATABASE_URL deve incluir o nome do banco no path (ex.: .../vendas_app).");
  }
  /** Sob carga (ex.: 50× mesma idempotencyKey), cada request segura 1 conexão até o lock liberar. */
  const connectionLimit = Math.max(
    10,
    Number(process.env.DB_POOL_CONNECTION_LIMIT || process.env.MYSQL_POOL_SIZE || 100)
  );
  const queueLimit = Math.max(0, Number(process.env.DB_POOL_QUEUE_LIMIT || 200));

  return {
    host: u.hostname,
    port: parseInt(u.port || "3306", 10),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database,
    waitForConnections: true,
    connectionLimit,
    queueLimit,
    enableKeepAlive: true,
    keepAliveInitialDelay: 30000,
    connectTimeout: Math.min(60_000, Number(process.env.DB_CONNECT_TIMEOUT_MS || 15_000)),
    maxIdle: Math.min(connectionLimit, Number(process.env.DB_POOL_MAX_IDLE || 20)),
    idleTimeout: 60000,
    debug: false,
  };
}

export function getMysqlPoolOptionsFromEnv(): mysql.PoolOptions {
  return parseUrlToPoolOptions(requireDatabaseUrl());
}

/** Cache leve para middleware de saúde (evita ping em toda requisição). */
let lastPoolHealth: { ok: boolean; at: number } = { ok: true, at: 0 };
const HEALTH_CACHE_MS = Math.max(3000, Number(process.env.DB_HEALTH_CACHE_MS || 30_000));

/** Uma única verificação em voo — evita 35× pool.query simultâneos sob autocannon. */
let healthCheckInFlight: Promise<boolean> | null = null;

export function getPoolHealthSnapshot(): { healthy: boolean; lastCheckAt: number } {
  return { healthy: lastPoolHealth.ok, lastCheckAt: lastPoolHealth.at };
}

/**
 * Estatísticas síncronas do pool (para logs sob carga).
 */
export function getPoolStatsSnapshot(): {
  total: number;
  free: number;
  used: number;
  queued: number;
  lastHealthOk: boolean;
  lastHealthAt: number;
} {
  const sync = getPoolHealthSnapshot();
  if (!_pool) {
    return { total: 0, free: 0, used: 0, queued: 0, lastHealthOk: sync.healthy, lastHealthAt: sync.lastCheckAt };
  }
  const pool = _pool as mysql.Pool & {
    config?: { connectionLimit?: number };
    _freeConnections?: unknown[];
    _connectionQueue?: unknown[];
  };
  const total = pool.config?.connectionLimit || 0;
  const free = pool._freeConnections?.length || 0;
  const queued = pool._connectionQueue?.length || 0;
  const used = total > 0 ? Math.max(0, total - free) : 0;
  return {
    total,
    free,
    used,
    queued,
    lastHealthOk: sync.healthy,
    lastHealthAt: sync.lastCheckAt,
  };
}

/**
 * Ping no pool compartilhado; resultado cacheado.
 * Usa `pool.query` (não `getConnection` manual) para reduzir conflito com transações.
 * Deduplicação: concorrentes aguardam o mesmo Promise (evita tempestade de pings).
 */
export async function checkDatabasePoolHealth(): Promise<boolean> {
  const now = Date.now();
  if (now - lastPoolHealth.at < HEALTH_CACHE_MS && lastPoolHealth.ok) {
    return true;
  }
  if (healthCheckInFlight) {
    return healthCheckInFlight;
  }

  const queryMs = Math.min(15_000, Math.max(500, Number(process.env.DB_HEALTH_CHECK_QUERY_MS || 8000)));

  healthCheckInFlight = (async (): Promise<boolean> => {
    const started = Date.now();
    try {
      const pool = await getConnectionPool();
      await Promise.race([
        pool.query("SELECT 1 AS health_check"),
        new Promise<never>((_, rej) => {
          setTimeout(() => rej(new Error("health_check_timeout")), queryMs);
        }),
      ]);
      lastPoolHealth = { ok: true, at: started };
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[DB] health check falhou:", msg);
      lastPoolHealth = { ok: false, at: started };
      return false;
    } finally {
      healthCheckInFlight = null;
    }
  })();

  return healthCheckInFlight;
}

function getDatabaseConfig(): mysql.PoolOptions {
  return getMysqlPoolOptionsFromEnv();
}

/**
 * Cria e retorna um pool de conexões MySQL
 */
export async function getConnectionPool(): Promise<mysql.Pool> {
  if (_pool) {
    globalThis.db = _pool;
    return _pool;
  }

  const config = getDatabaseConfig();
  console.log(`[Database] Creating connection pool to MySQL at ${config.host}:${config.port}`);

  _pool = mysql.createPool(config);

  try {
    await testPool(_pool);
    console.log("[Database] Connection pool created and tested successfully");

    instrumentMySQL({ pool: _pool });
    console.log("[Database] OpenTelemetry instrumentation enabled");

    (_pool as mysql.Pool & { on?: (ev: string, fn: (err: unknown) => void) => void }).on?.(
      "error",
      (err: unknown) => {
        console.error("[Database] Unexpected pool error:", err);
        const code = err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : undefined;
        if (code === "PROTOCOL_CONNECTION_LOST" || code === "ECONNREFUSED" || code === "ETIMEDOUT") {
          console.log("[Database] Connection lost. Attempting to recreate pool...");
          _pool = null;
          globalThis.db = undefined;
        }
      }
    );

    globalThis.db = _pool;
    return _pool;
  } catch (error) {
    console.error("[Database] Failed to create connection pool:", error);
    _pool = null;
    globalThis.db = undefined;
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Database connection pool failed: ${msg}`);
  }
}

/**
 * Após `globalThis.db.end()` no graceful shutdown — evita reuso do pool encerrado.
 */
export function clearPoolAfterGracefulShutdown(): void {
  _pool = null;
  globalThis.db = undefined;
}

async function testPool(pool: mysql.Pool, maxRetries = 3, retryDelay = 2000): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const conn = await pool.getConnection();
      await conn.query("SELECT 1 AS connection_test");
      conn.release();
      return;
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[Database] Connection test failed (attempt ${attempt}/${maxRetries}):`, msg);

      if (attempt < maxRetries) {
        console.log(`[Database] Retrying in ${retryDelay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        retryDelay *= 1.5;
      }
    }
  }

  const lastMsg = lastError instanceof Error ? lastError.message : String(lastError ?? "");
  throw new Error(`Failed to connect to database after ${maxRetries} attempts: ${lastMsg}`);
}

export async function getConnection(maxRetries = 3): Promise<mysql.PoolConnection> {
  const pool = await getConnectionPool();
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await pool.getConnection();
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[Database] Failed to get connection (attempt ${attempt}/${maxRetries}):`, msg);

      if (attempt < maxRetries) {
        const delay = 1000 * Math.pow(2, attempt - 1);
        console.log(`[Database] Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  const lastMsg = lastError instanceof Error ? lastError.message : String(lastError ?? "");
  throw new Error(`Failed to get database connection after ${maxRetries} attempts: ${lastMsg}`);
}

export async function executeQuery(
  query: string,
  params: unknown[] = [],
  maxRetries = 3
): Promise<[unknown, mysql.FieldPacket[]]> {
  const startTime = Date.now();
  let conn: mysql.PoolConnection | null = null;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      conn = await getConnection();
      const result = await conn.query(query, params as any[]);

      const duration = Date.now() - startTime;
      recordDatabase({
        query: query.replace(/\s+/g, " ").substring(0, 300),
        duration,
        timestamp: new Date(),
        success: true,
      });
      if (duration > 300) {
        systemLogger.warn({
          message: "Slow query detected",
          query: query.replace(/\s+/g, " ").substring(0, 200) + (query.length > 200 ? "..." : ""),
          duration,
          params: params.length > 0 ? "[PARAMS_PRESENT]" : "[NO_PARAMS]",
        } as Record<string, unknown>);
        observabilityLogger.warn("Slow query detected", {
          duration,
          query: query.replace(/\s+/g, " ").substring(0, 200),
        });
      }

      return result;
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[Database] Query failed (attempt ${attempt}/${maxRetries}):`, msg);
      const duration = Date.now() - startTime;
      recordDatabase({
        query: query.replace(/\s+/g, " ").substring(0, 300),
        duration,
        timestamp: new Date(),
        success: false,
        error: msg,
      });
      observabilityLogger.error(
        "Database query failed",
        error instanceof Error ? error : new Error(msg),
        {
          duration,
          query: query.replace(/\s+/g, " ").substring(0, 200),
        }
      );

      if (attempt < maxRetries) {
        const delay = 1000 * Math.pow(2, attempt - 1);
        console.log(`[Database] Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } finally {
      if (conn) {
        conn.release();
      }
    }
  }

  const lastMsg = lastError instanceof Error ? lastError.message : String(lastError ?? "");
  throw new Error(`Query failed after ${maxRetries} attempts: ${lastMsg}`);
}

export async function closeConnectionPool(): Promise<void> {
  if (_pool) {
    try {
      await _pool.end();
      console.log("[Database] Connection pool closed successfully");
      _pool = null;
    } catch (error) {
      console.error("[Database] Error closing connection pool:", error);
    }
  }
}

export async function getPoolStats(): Promise<{
  total: number;
  free: number;
  used: number;
  queued: number;
}> {
  if (!_pool) {
    return { total: 0, free: 0, used: 0, queued: 0 };
  }

  const pool = _pool as mysql.Pool & {
    config?: { connectionLimit?: number };
    _freeConnections?: unknown[];
    _connectionQueue?: unknown[];
  };
  const total = pool.config?.connectionLimit || 0;
  const free = pool._freeConnections?.length || 0;
  const queued = pool._connectionQueue?.length || 0;
  const used = total - free;

  return {
    total,
    free,
    used,
    queued,
  };
}
