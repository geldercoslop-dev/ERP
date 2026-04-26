import * as mysql from "mysql2/promise";
import { assertNoDirectDbAccess } from "../_core/db-access-guard.js";
import { systemLogger } from "../_core/logger.js";
import { createLogger } from "../infra/structured-logger.js";
import { recordDatabase } from "../infra/metrics.js";
import { instrumentMySQL } from "../infra/mysql-instrumentation.js";
import { getEnv } from "../_core/env.js";
import { requireBootstrap } from "../_core/bootstrap.js";
import { executeWithResilience } from "../resilience/query-wrapper.js";
import { resolveRuntimeServiceHost } from "./runtime-host-resolver.js";
import { InfrastructureError } from "../_core/errors/typed-errors.js";

/**
 * Pool MySQL — única fonte de conexão.
 * Obrigatório: DATABASE_URL (mysql://user:pass@host:port/dbname)
 */

const observabilityLogger = createLogger("database-config");

let _pool: mysql.Pool | null = null;

/** Falha imediata se DATABASE_URL não estiver definido. */
export function requireDatabaseUrl(): string {
  requireBootstrap('database.requireDatabaseUrl');
  const raw = getEnv().DATABASE_URL.trim();
  if (!raw) {
    throw new InfrastructureError(
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
    throw new InfrastructureError("DATABASE_URL inválido: não é uma URL válida.");
  }
  if (u.protocol !== "mysql:" && u.protocol !== "mysql2:") {
    throw new InfrastructureError("DATABASE_URL deve usar o protocolo mysql://");
  }
  const database = u.pathname.replace(/^\//, "").split("/")[0];
  if (!database) {
    throw new InfrastructureError("DATABASE_URL deve incluir o nome do banco no path (ex.: .../vendas_app).");
  }
  // HARDENING: safe improvement - reduzir connectionLimit para ~20 para produção
  const connectionLimit = Math.max(
    10,
    Number(process.env.DB_POOL_CONNECTION_LIMIT || process.env.MYSQL_POOL_SIZE || 20)
  );
  const queueLimit = Math.max(0, Number(process.env.DB_POOL_QUEUE_LIMIT || 200));

  return {
    host: resolveRuntimeServiceHost(u.hostname, "mysql"),
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
  const config = getMysqlPoolOptionsFromEnv();
  return config;
}

/**
 * Cria e retorna um pool de conexões MySQL
 */
export async function getConnectionPool(): Promise<mysql.Pool> {
  requireBootstrap('database.getConnectionPool');
  
  if (_pool) {
    globalThis.db = _pool;
    return _pool;
  }

  const config = getDatabaseConfig();
  requireDatabaseUrl();
  
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
    throw new InfrastructureError(`Database connection pool failed: ${msg}`);
  }
}

/**
 * Após `globalThis.db.end()` no graceful shutdown — evita reuso do pool encerrado.
 */
export function clearPoolAfterGracefulShutdown(): void {
  _pool = null;
  globalThis.db = undefined;
}

async function testPool(pool: mysql.Pool, maxRetries = 10): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const conn = await pool.getConnection();
      await conn.query("SELECT 1 AS connection_test");
      conn.release();
      console.log(`[Database] Connection test successful on attempt ${attempt}`);
      return;
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      const code = error && typeof error === "object" && "code" in error ? (error as { code?: string }).code : undefined;
      
      // LOG COMPLETO PARA DIAGNÓSTICO
      console.error(`[Database] Connection test failed (attempt ${attempt}/${maxRetries}):`, {
        message: msg,
        code,
        errno: error && typeof error === "object" && "errno" in error ? (error as { errno?: number }).errno : undefined,
        sqlState: error && typeof error === "object" && "sqlState" in error ? (error as { sqlState?: string }).sqlState : undefined,
        fatal: error && typeof error === "object" && "fatal" in error ? (error as { fatal?: boolean }).fatal : undefined,
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });

      if (attempt < maxRetries) {
        const retryDelay = 1000 * Math.pow(2, attempt - 1);
        console.log(`[Database] Retrying in ${retryDelay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  const lastMsg = lastError instanceof Error ? lastError.message : String(lastError ?? "");
  const lastCode = lastError && typeof lastError === "object" && "code" in lastError ? (lastError as { code?: string }).code : undefined;
  
  throw new InfrastructureError(`Failed to connect to database after ${maxRetries} attempts: ${lastMsg} (code: ${lastCode})`);
}

export async function getConnection(maxRetries = 10): Promise<mysql.PoolConnection> {
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
  throw new InfrastructureError(`Failed to get database connection after ${maxRetries} attempts: ${lastMsg}`);
}

export async function executeQuery(
  query: string,
  params: unknown[] = [],
  maxRetries = 3
): Promise<[unknown, mysql.FieldPacket[]]> {
  // Usa wrapper de resilience que coordena: timeout > circuit breaker > retry
  return executeWithResilience(
    async () => _executeQueryCore(query, params),
    {
      serviceName: 'database-query',
      timeoutMs: 10_000, // 10 segundos de timeout
      maxRetries,
      retryDelayMs: 1000,
      circuitBreakerConfig: {
        errorThreshold: 50,
        resetTimeout: 30_000,
      },
    }
  );
}

/**
 * Executa query sem retry (proteção feita pelo wrapper acima)
 */
async function _executeQueryCore(
  query: string,
  params: unknown[] = []
): Promise<[unknown, mysql.FieldPacket[]]> {
  assertNoDirectDbAccess("db");
  const startTime = Date.now();
  let conn: mysql.PoolConnection | null = null;

  try {
    conn = await getConnection();
    const result = await conn.query(query, params as unknown[]);

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
    const msg = error instanceof Error ? error.message : String(error);
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
    throw error;
  } finally {
    if (conn) {
      conn.release();
    }
  }
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
