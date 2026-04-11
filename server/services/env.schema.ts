import { z } from "zod";
import { ENV_SECRET_MIN_LENGTH } from "../_core/env-validator.js";

export const EnvSchema = z.object({
  APP_SECRET: z.string().min(ENV_SECRET_MIN_LENGTH, `APP_SECRET must be at least ${ENV_SECRET_MIN_LENGTH} chars`),
  JWT_SECRET: z.string().min(ENV_SECRET_MIN_LENGTH, `JWT_SECRET must be at least ${ENV_SECRET_MIN_LENGTH} chars`),
  JWT_ACCESS_SECRET: z.string().min(ENV_SECRET_MIN_LENGTH, `JWT_ACCESS_SECRET must be at least ${ENV_SECRET_MIN_LENGTH} chars`),
  JWT_REFRESH_SECRET: z.string().min(ENV_SECRET_MIN_LENGTH, `JWT_REFRESH_SECRET must be at least ${ENV_SECRET_MIN_LENGTH} chars`),
  DB_HOST: z.string().min(1, "DB_HOST is required"),
  DB_PORT: z
    .string()
    .min(1, "DB_PORT is required")
    .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, "DB_PORT must be numeric and > 0"),
  DB_USER: z.string().min(1, "DB_USER is required"),
  DB_PASSWORD: z.string().min(1, "DB_PASSWORD is required"),
  DB_NAME: z.string().min(1, "DB_NAME is required"),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL").optional(),
  REDIS_HOST: z.string().min(1, "REDIS_HOST is required"),
  REDIS_PORT: z
    .string()
    .min(1, "REDIS_PORT is required")
    .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, "REDIS_PORT must be numeric and > 0"),
  REDIS_URL: z.string().url("REDIS_URL must be a valid URL").optional(),
});

type RawEnv = z.infer<typeof EnvSchema>;

export type Env = Omit<RawEnv, "DATABASE_URL" | "REDIS_URL"> & {
  DATABASE_URL: string;
  REDIS_URL: string;
};

let _cached: Env | null = null;

function buildDatabaseUrl(raw: Pick<RawEnv, "DB_HOST" | "DB_PORT" | "DB_USER" | "DB_PASSWORD" | "DB_NAME" | "DATABASE_URL">): string {
  if (raw.DATABASE_URL && raw.DATABASE_URL.trim().length > 0) {
    return raw.DATABASE_URL.trim();
  }
  const user = encodeURIComponent(raw.DB_USER);
  const password = encodeURIComponent(raw.DB_PASSWORD);
  return `mysql://${user}:${password}@${raw.DB_HOST}:${raw.DB_PORT}/${raw.DB_NAME}`;
}

function buildRedisUrl(raw: Pick<RawEnv, "REDIS_HOST" | "REDIS_PORT" | "REDIS_URL">): string {
  if (raw.REDIS_URL && raw.REDIS_URL.trim().length > 0) {
    return raw.REDIS_URL.trim();
  }
  return `redis://${raw.REDIS_HOST}:${raw.REDIS_PORT}`;
}

export function parseEnv(): Env {
  // Cache para evitar múltiplos parses sob imports concorrentes.
  if (_cached) return _cached;
  const parsed = EnvSchema.safeParse({
    APP_SECRET: process.env.APP_SECRET,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
    DB_HOST: process.env.DB_HOST,
    DB_PORT: process.env.DB_PORT,
    DB_USER: process.env.DB_USER,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_NAME: process.env.DB_NAME,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT,
    REDIS_URL: process.env.REDIS_URL,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    console.error("[ENV] inválido:");
    for (const line of issues) console.error(`[ENV]  - ${line}`);
    console.error("[ENV_FATAL] Exiting with process.exit(1)");
    process.exit(1);
  }

  const normalized: Env = {
    ...parsed.data,
    DATABASE_URL: buildDatabaseUrl(parsed.data),
    REDIS_URL: buildRedisUrl(parsed.data),
  };

  _cached = normalized;
  return _cached;
}

