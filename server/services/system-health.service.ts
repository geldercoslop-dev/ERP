import { getDb } from '../db/index';
import { systemLogger } from '../_core/logger';
import { redisManager } from '../infra/redis';
import { getErrorMessage } from '../utils/safe-error';

const REDIS_HEALTH_TIMEOUT_MS = 2000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label}: timeout ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}

export type SystemHealth = {
  status: 'ok' | 'warning' | 'critical'
  score: number
  details: {
    uptime: number
    memory: NodeJS.MemoryUsage
    env: string
  }
}

/** Health rápido: processo vivo, sem DB/Redis (load balancers / k8s liveness). */
export interface SystemHealthLightResponse {
  status: 'ok';
  checks: 'light';
  timestamp: string;
  responseTime: number;
  uptime: number;
  uptimeFormatted: string;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
}

export interface SystemHealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  responseTime: number;
  server: {
    status: string;
    uptime: number;
    uptimeFormatted: string;
    nodeVersion: string;
    platform: string;
    arch: string;
    environment: string;
    isProduction: boolean;
  };
  database: {
    status: string;
    responseTime: number;
    error?: string;
  };
  redis: {
    status: string;
    responseTime: number;
    error?: string;
  };
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  environment: {
    DATABASE_URL: boolean;
    DB_HOST: boolean;
    DB_NAME: boolean;
    PORT: boolean;
  };
  allEnvironmentOk: boolean;
  version: {
    app: string;
    api: string;
    build: string;
  };
}

const SERVER_START_TIME = Date.now();

/** Reduz tempestade de SELECT/PING quando muitos clientes chamam /health/full em paralelo (0 = desliga cache). */
const HEALTH_FULL_CACHE_MS_RAW = Number(process.env.HEALTH_FULL_CACHE_MS);
const HEALTH_FULL_CACHE_MS =
  Number.isFinite(HEALTH_FULL_CACHE_MS_RAW) && HEALTH_FULL_CACHE_MS_RAW >= 0
    ? HEALTH_FULL_CACHE_MS_RAW
    : 2000;

let fullHealthInflight: Promise<SystemHealthResponse> | null = null;
let fullHealthCache: { data: SystemHealthResponse; until: number } | null = null;

/**
 * Verifica conexão com banco de dados
 */
async function checkDatabaseHealth(): Promise<{
  status: string;
  responseTime: number;
  error?: string;
}> {
  const startTime = Date.now();
  
  try {
    const db = await getDb();
    
    if (!db) {
      return {
        status: 'error',
        responseTime: Date.now() - startTime,
        error: 'Database connection not available'
      };
    }

    // Testar query simples
    await db.execute('SELECT 1 as test');
    const responseTime = Date.now() - startTime;
    
    // Verificar se response time está aceitável
    if (responseTime > 5000) { // 5 segundos
      return {
        status: 'slow',
        responseTime,
        error: `Database response time too high: ${responseTime}ms`
      };
    }
    
    return {
      status: 'ok',
      responseTime
    };
    
  } catch (error: unknown) {
    return {
      status: 'error',
      responseTime: Date.now() - startTime,
      error: getErrorMessage(error)
    };
  }
}

async function checkRedisHealth(): Promise<{
  status: string;
  responseTime: number;
  error?: string;
}> {
  const startTime = Date.now();
  try {
    const ok = await withTimeout(
      redisManager.isConnected(),
      REDIS_HEALTH_TIMEOUT_MS,
      'Redis health check'
    );
    const responseTime = Date.now() - startTime;
    if (!ok) {
      return {
        status: 'error',
        responseTime,
        error: 'Redis não respondeu ao PING',
      };
    }
    return { status: 'ok', responseTime };
  } catch (error: unknown) {
    return {
      status: 'error',
      responseTime: Date.now() - startTime,
      error: getErrorMessage(error),
    };
  }
}

/**
 * Formata uptime para exibição
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
}

/** Resposta consistente quando o health check falha de forma inesperada */
export function buildSystemHealthFailureResponse(error: unknown): SystemHealthResponse {
  const message = getErrorMessage(error);
  return {
    status: 'error',
    timestamp: new Date().toISOString(),
    responseTime: 0,
    server: {
      status: 'error',
      uptime: Date.now() - SERVER_START_TIME,
      uptimeFormatted: formatUptime(Date.now() - SERVER_START_TIME),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      environment: process.env.NODE_ENV || 'development',
      isProduction: false,
    },
    database: {
      status: 'error',
      responseTime: 0,
      error: message,
    },
    redis: {
      status: 'error',
      responseTime: 0,
      error: 'Indisponível',
    },
    memory: {
      rss: 0,
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
    },
    environment: {
      DATABASE_URL: false,
      DB_HOST: false,
      DB_NAME: false,
      PORT: false,
    },
    allEnvironmentOk: false,
    version: {
      app: '1.0.0',
      api: 'v1',
      build: new Date().toISOString().split('T')[0],
    },
  };
}

/**
 * Verifica variáveis de ambiente essenciais
 */
function checkEnvironment() {
  const envChecks = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    DB_HOST: !!process.env.DB_HOST,
    DB_NAME: !!process.env.DB_NAME,
    PORT: !!process.env.PORT
  };
  
  const allEnvOk = Object.values(envChecks).every(Boolean);
  
  return { envChecks, allEnvOk };
}

export function getSystemHealthLight(): SystemHealthLightResponse {
  const startTime = Date.now();
  const memUsage = process.memoryUsage();
  const uptime = Date.now() - SERVER_START_TIME;
  return {
    status: 'ok',
    checks: 'light',
    timestamp: new Date().toISOString(),
    responseTime: Date.now() - startTime,
    uptime,
    uptimeFormatted: formatUptime(uptime),
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
    },
  };
}

async function computeSystemHealthComplete(): Promise<SystemHealthResponse> {
  const startTime = Date.now();

  try {
    const [databaseHealth, redisHealth] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
    ]);

    const memUsage = process.memoryUsage();
    const memUsageMB = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
    };

    const uptime = Date.now() - SERVER_START_TIME;
    const nodeEnv = process.env.NODE_ENV || "development";
    const isProduction = nodeEnv === "production";
    const { envChecks, allEnvOk } = checkEnvironment();
    const serverStatus = databaseHealth.status === "ok" && allEnvOk ? "ok" : "error";

    const healthData: SystemHealthResponse = {
      status: serverStatus,
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime,
      server: {
        status: serverStatus,
        uptime,
        uptimeFormatted: formatUptime(uptime),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        environment: nodeEnv,
        isProduction,
      },
      database: databaseHealth,
      redis: redisHealth,
      memory: memUsageMB,
      environment: envChecks,
      allEnvironmentOk: allEnvOk,
      version: {
        app: "1.0.0",
        api: "v1",
        build: new Date().toISOString().split("T")[0],
      },
    };

    systemLogger.info(
      {
        status: serverStatus,
        responseTime: healthData.responseTime,
        dbStatus: databaseHealth.status,
        memoryUsage: memUsageMB.heapUsed,
      },
      "System health check completed"
    );

    return healthData;
  } catch (error: unknown) {
    systemLogger.error(
      {
        error: getErrorMessage(error),
        duration: Date.now() - startTime,
      },
      "System health check failed"
    );

    const payload = buildSystemHealthFailureResponse(error);
    return {
      ...payload,
      responseTime: Date.now() - startTime,
    };
  }
}

/**
 * Saúde completa (DB + Redis). Coalesce de requisições paralelas + TTL curto para não martelar o pool.
 */
export async function getSystemHealthComplete(): Promise<SystemHealthResponse> {
  if (HEALTH_FULL_CACHE_MS === 0) {
    return computeSystemHealthComplete();
  }

  const now = Date.now();
  if (fullHealthCache && now < fullHealthCache.until) {
    return {
      ...fullHealthCache.data,
      timestamp: new Date().toISOString(),
      responseTime: 0,
    };
  }

  fullHealthInflight ??= computeSystemHealthComplete()
    .then((data) => {
      fullHealthCache = { data, until: Date.now() + HEALTH_FULL_CACHE_MS };
      return data;
    })
    .finally(() => {
      fullHealthInflight = null;
    });

  return fullHealthInflight;
}

/**
 * Função legada para compatibilidade
 */
export function getSystemHealth(): SystemHealth {
  const uptime = process.uptime()
  const memory = process.memoryUsage()

  let score = 100

  if (memory.heapUsed > 500_000_000) score -= 20
  if (uptime < 5) score -= 10

  let status: SystemHealth['status'] = 'ok'
  if (score < 90) status = 'warning'
  if (score < 70) status = 'critical'

  return {
    status,
    score,
    details: {
      uptime,
      memory,
      env: process.env.NODE_ENV || 'unknown'
    }
  }
}
