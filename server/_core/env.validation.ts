import { createLogger } from "../infra/structured-logger.js";
import { parseEnv } from "../services/env.schema.js";

const logger = createLogger("env-validation");

type ValidationIssue = { key: string; message: string };

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
    if (!isLongEnough(base.JWT_ACCESS_SECRET, 10)) {
      issues.push({ key: "JWT_ACCESS_SECRET", message: "must be at least 10 chars" });
    }
    if (!isLongEnough(base.JWT_REFRESH_SECRET, 10)) {
      issues.push({ key: "JWT_REFRESH_SECRET", message: "must be at least 10 chars" });
    }
    if (!isRequired(base.DATABASE_URL)) {
      issues.push({ key: "DATABASE_URL", message: "is required" });
    }
    if (!isRequired(base.REDIS_URL)) {
      issues.push({ key: "REDIS_URL", message: "is required" });
    }
  }

  if (!isLongEnough(process.env.APP_SECRET, 64)) {
    issues.push({ key: "APP_SECRET", message: "must be at least 64 chars" });
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
