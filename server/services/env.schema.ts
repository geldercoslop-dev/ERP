import { z } from "zod";

export const EnvSchema = z.object({
  JWT_ACCESS_SECRET: z.string().min(10, "JWT_ACCESS_SECRET must be at least 10 chars"),
  JWT_REFRESH_SECRET: z.string().min(10, "JWT_REFRESH_SECRET must be at least 10 chars"),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),
  REDIS_URL: z.string().url("REDIS_URL must be a valid URL"),
});

export type Env = z.infer<typeof EnvSchema>;

let _cached: Env | null = null;

export function parseEnv(): Env {
  // Cache para evitar múltiplos parses sob imports concorrentes.
  if (_cached) return _cached;
  const parsed = EnvSchema.safeParse({
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    console.error("[ENV] inválido:");
    for (const line of issues) console.error(`[ENV]  - ${line}`);
    throw new Error(`Invalid environment: ${issues.join("; ")}`);
  }
  _cached = parsed.data;
  return _cached;
}

