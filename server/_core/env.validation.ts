import { createLogger } from "../infra/structured-logger.js";
import { ENV_SECRET_MIN_LENGTH } from "./env-validator.js";
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
    if (!isLongEnough(base.APP_SECRET, ENV_SECRET_MIN_LENGTH)) {
      issues.push({ key: "APP_SECRET", message: `must be at least ${ENV_SECRET_MIN_LENGTH} chars` });
    }
    if (!isLongEnough(base.JWT_SECRET, ENV_SECRET_MIN_LENGTH)) {
      issues.push({ key: "JWT_SECRET", message: `must be at least ${ENV_SECRET_MIN_LENGTH} chars` });
    }
    if (!isLongEnough(base.JWT_ACCESS_SECRET, ENV_SECRET_MIN_LENGTH)) {
      issues.push({ key: "JWT_ACCESS_SECRET", message: `must be at least ${ENV_SECRET_MIN_LENGTH} chars` });
    }
    if (!isLongEnough(base.JWT_REFRESH_SECRET, ENV_SECRET_MIN_LENGTH)) {
      issues.push({ key: "JWT_REFRESH_SECRET", message: `must be at least ${ENV_SECRET_MIN_LENGTH} chars` });
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

  if (appSecret.length < ENV_SECRET_MIN_LENGTH) {
    issues.push({ key: "APP_SECRET", message: `must be at least ${ENV_SECRET_MIN_LENGTH} chars` });
  }
  if (jwtAccessSecret.length < ENV_SECRET_MIN_LENGTH) {
    issues.push({ key: "JWT_ACCESS_SECRET", message: `must be at least ${ENV_SECRET_MIN_LENGTH} chars` });
  }
  if (jwtRefreshSecret.length < ENV_SECRET_MIN_LENGTH) {
    issues.push({ key: "JWT_REFRESH_SECRET", message: `must be at least ${ENV_SECRET_MIN_LENGTH} chars` });
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
