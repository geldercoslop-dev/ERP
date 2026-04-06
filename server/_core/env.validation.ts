import { createLogger } from "../infra/structured-logger.js";
import { parseEnv } from "../services/env.schema.js";

const logger = createLogger("env-validation");

type ValidationIssue = { key: string; message: string };
type Env = Record<string, unknown>;

function getTrimmedString(env: Env, key: string): string {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
}

function isLongEnough(value: string | undefined, min: number): boolean {
  return typeof value === "string" && value.trim().length >= min;
}

function isRequired(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateProductionEnv(): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const base = (() => {
    try {
      return parseEnv();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      issues.push({ key: "ENV", message: msg });
      return null;
    }
  })();

  if (base) {
    if (!isLongEnough(base.JWT_SECRET, 32)) {
      issues.push({ key: "JWT_SECRET", message: "must be at least 32 chars" });
    }
    if (!isLongEnough(base.JWT_ACCESS_SECRET, 10)) {
      issues.push({ key: "JWT_ACCESS_SECRET", message: "must be at least 10 chars" });
    }
    if (!isLongEnough(base.JWT_REFRESH_SECRET, 10)) {
      issues.push({ key: "JWT_REFRESH_SECRET", message: "must be at least 10 chars" });
    }
    if (!isRequired(base.DB_HOST)) issues.push({ key: "DB_HOST", message: "is required" });
    if (!isRequired(base.DB_PORT)) issues.push({ key: "DB_PORT", message: "is required" });
    if (!isRequired(base.DB_USER)) issues.push({ key: "DB_USER", message: "is required" });
    if (!isRequired(base.DB_PASSWORD)) issues.push({ key: "DB_PASSWORD", message: "is required" });
    if (!isRequired(base.DB_NAME)) issues.push({ key: "DB_NAME", message: "is required" });
    if (!isRequired(base.REDIS_URL)) {
      issues.push({ key: "REDIS_URL", message: "is required" });
    }
  }

  if (process.env.NODE_ENV === "production" && !isLongEnough(process.env.APP_SECRET, 64)) {
    issues.push({ key: "APP_SECRET", message: "must be at least 64 chars in production" });
  }

  if (!isRequired(process.env.REDIS_HOST)) {
    issues.push({ key: "REDIS_HOST", message: "is required" });
  }

  if (!isRequired(process.env.REDIS_PORT)) {
    issues.push({ key: "REDIS_PORT", message: "is required" });
  } else if (!Number.isFinite(Number(process.env.REDIS_PORT))) {
    issues.push({ key: "REDIS_PORT", message: "must be numeric" });
  }

  return issues;
}

export function validateCriticalBootEnvOrExit(env: Env): void {
  const issues: ValidationIssue[] = [];

  const appSecret = getTrimmedString(env, "APP_SECRET");
  const jwtAccessSecret = getTrimmedString(env, "JWT_ACCESS_SECRET");
  const jwtRefreshSecret = getTrimmedString(env, "JWT_REFRESH_SECRET");
  const dbHost = getTrimmedString(env, "DB_HOST");
  const redisHost = getTrimmedString(env, "REDIS_HOST");

  if (appSecret.length < 64) {
    issues.push({ key: "APP_SECRET", message: "must be at least 64 chars" });
  }
  if (jwtAccessSecret.length < 64) {
    issues.push({ key: "JWT_ACCESS_SECRET", message: "must be at least 64 chars" });
  }
  if (jwtRefreshSecret.length < 64) {
    issues.push({ key: "JWT_REFRESH_SECRET", message: "must be at least 64 chars" });
  }
  if (dbHost.length === 0) {
    issues.push({ key: "DB_HOST", message: "is required" });
  }
  if (redisHost.length === 0) {
    issues.push({ key: "REDIS_HOST", message: "is required" });
  }

  if (issues.length === 0) {
    logger.info("critical_environment_valid", {
      metadata: { scope: "boot-critical" },
    });
    return;
  }

  const lines = issues.map((i) => `${i.key}: ${i.message}`);
  logger.error("critical_environment_invalid", {
    metadata: {
      scope: "boot-critical",
      issues: lines,
    },
  });
  console.error("[ENV] inválido (critical boot):");
  for (const line of lines) console.error(`[ENV]  - ${line}`);
  process.exit(1);
}

export function validateProductionEnvOrExit(): void {
  const issues = validateProductionEnv();
  if (issues.length === 0) {
    logger.info("environment_valid", {
      metadata: { scope: "production-boot" },
    });
    return;
  }

  const lines = issues.map((i) => `${i.key}: ${i.message}`);
  logger.error("environment_invalid", {
    metadata: {
      scope: "boot",
      issues: lines,
    },
  });
  console.error("[ENV] inválido:");
  for (const line of lines) console.error(`[ENV]  - ${line}`);
  process.exit(1);
}
