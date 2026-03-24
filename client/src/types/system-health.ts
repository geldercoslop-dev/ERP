/**
 * Contrato do GET /api/system/health (alinhado ao server/services/system-health.service).
 */

export interface SystemHealthPayload {
  status: "ok" | "error";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isServerSlice(v: unknown): v is SystemHealthPayload["server"] {
  if (!isRecord(v)) return false;
  return (
    typeof v.status === "string" &&
    typeof v.uptime === "number" &&
    typeof v.uptimeFormatted === "string" &&
    typeof v.nodeVersion === "string" &&
    typeof v.platform === "string" &&
    typeof v.arch === "string" &&
    typeof v.environment === "string" &&
    typeof v.isProduction === "boolean"
  );
}

function isDbSlice(v: unknown): v is SystemHealthPayload["database"] {
  if (!isRecord(v)) return false;
  return typeof v.status === "string" && typeof v.responseTime === "number";
}

function isRedisSlice(v: unknown): v is SystemHealthPayload["redis"] {
  if (!isRecord(v)) return false;
  return typeof v.status === "string" && typeof v.responseTime === "number";
}

function isMemorySlice(v: unknown): v is SystemHealthPayload["memory"] {
  if (!isRecord(v)) return false;
  return (
    typeof v.rss === "number" &&
    typeof v.heapTotal === "number" &&
    typeof v.heapUsed === "number" &&
    typeof v.external === "number"
  );
}

function isEnvSlice(v: unknown): v is SystemHealthPayload["environment"] {
  if (!isRecord(v)) return false;
  return (
    typeof v.DATABASE_URL === "boolean" &&
    typeof v.DB_HOST === "boolean" &&
    typeof v.DB_NAME === "boolean" &&
    typeof v.PORT === "boolean"
  );
}

function isVersionSlice(v: unknown): v is SystemHealthPayload["version"] {
  if (!isRecord(v)) return false;
  return (
    typeof v.app === "string" &&
    typeof v.api === "string" &&
    typeof v.build === "string"
  );
}

/** Valida JSON do health; retorna null se o formato for inesperado */
export function parseSystemHealthPayload(raw: unknown): SystemHealthPayload | null {
  if (!isRecord(raw)) return null;
  if (raw.status !== "ok" && raw.status !== "error") return null;
  if (typeof raw.timestamp !== "string" || typeof raw.responseTime !== "number") return null;
  if (typeof raw.allEnvironmentOk !== "boolean") return null;
  if (!isServerSlice(raw.server)) return null;
  if (!isDbSlice(raw.database)) return null;
  const redis = isRedisSlice(raw.redis)
    ? raw.redis
    : { status: "unknown", responseTime: 0, error: "Campo redis ausente na resposta" };
  if (!isMemorySlice(raw.memory)) return null;
  if (!isEnvSlice(raw.environment)) return null;
  if (!isVersionSlice(raw.version)) return null;

  return {
    status: raw.status,
    timestamp: raw.timestamp,
    responseTime: raw.responseTime,
    server: raw.server,
    database: raw.database,
    redis,
    memory: raw.memory,
    environment: raw.environment,
    allEnvironmentOk: raw.allEnvironmentOk,
    version: raw.version,
  };
}
