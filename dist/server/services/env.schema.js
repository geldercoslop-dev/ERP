import { z } from "zod";
import { ENV_SECRET_MIN_LENGTH } from "../_core/env-validator.js";
export const EnvSchema = z.object({
    APP_SECRET: z.string().min(ENV_SECRET_MIN_LENGTH, `APP_SECRET must be at least ${ENV_SECRET_MIN_LENGTH} chars`),
    JWT_SECRET: z.string().min(ENV_SECRET_MIN_LENGTH, `JWT_SECRET must be at least ${ENV_SECRET_MIN_LENGTH} chars`),
    JWT_ACCESS_SECRET: z.string().min(ENV_SECRET_MIN_LENGTH, `JWT_ACCESS_SECRET must be at least ${ENV_SECRET_MIN_LENGTH} chars`),
    JWT_REFRESH_SECRET: z.string().min(ENV_SECRET_MIN_LENGTH, `JWT_REFRESH_SECRET must be at least ${ENV_SECRET_MIN_LENGTH} chars`),
    // DB_* são opcionais quando DATABASE_URL existe
    DB_HOST: z.string().min(1, "DB_HOST is required").optional(),
    DB_PORT: z
        .string()
        .min(1, "DB_PORT is required")
        .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, "DB_PORT must be numeric and > 0")
        .optional(),
    DB_USER: z.string().min(1, "DB_USER is required").optional(),
    DB_PASSWORD: z.string().min(1, "DB_PASSWORD is required").optional(),
    DB_NAME: z.string().min(1, "DB_NAME is required").optional(),
    DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL").optional(),
    // REDIS_* são opcionais quando REDIS_URL existe
    REDIS_HOST: z.string().min(1, "REDIS_HOST is required").optional(),
    REDIS_PORT: z
        .string()
        .min(1, "REDIS_PORT is required")
        .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, "REDIS_PORT must be numeric and > 0")
        .optional(),
    REDIS_URL: z.string().url("REDIS_URL must be a valid URL").optional(),
    // Variáveis opcionais para configuração avançada
    REDIS_BOOT_TIMEOUT_MS: z.string().optional(),
    K6_MODE: z.string().optional(),
    ALLOWED_ORIGINS: z.string().optional(),
});
let _cached = null;
function buildDatabaseUrl(raw) {
    // PRIORIDADE: DATABASE_URL优先
    if (raw.DATABASE_URL && raw.DATABASE_URL.trim().length > 0) {
        return raw.DATABASE_URL.trim();
    }
    // FAIL-HARD: Se não tem DATABASE_URL, exige DB_*
    if (!raw.DB_HOST || !raw.DB_PORT || !raw.DB_USER || !raw.DB_PASSWORD || !raw.DB_NAME) {
        console.error("[ENV] DATABASE_URL ausente e variáveis DB_* incompletas:");
        if (!raw.DB_HOST)
            console.error("[ENV]  - DB_HOST é required");
        if (!raw.DB_PORT)
            console.error("[ENV]  - DB_PORT é required");
        if (!raw.DB_USER)
            console.error("[ENV]  - DB_USER é required");
        if (!raw.DB_PASSWORD)
            console.error("[ENV]  - DB_PASSWORD é required");
        if (!raw.DB_NAME)
            console.error("[ENV]  - DB_NAME é required");
        console.error("[ENV_FATAL] Exiting with process.exit(1)");
        process.exit(1);
    }
    const user = encodeURIComponent(raw.DB_USER);
    const password = encodeURIComponent(raw.DB_PASSWORD);
    return `mysql://${user}:${password}@${raw.DB_HOST}:${raw.DB_PORT}/${raw.DB_NAME}`;
}
function buildRedisUrl(raw) {
    // PRIORIDADE: REDIS_URL优先
    if (raw.REDIS_URL && raw.REDIS_URL.trim().length > 0) {
        return raw.REDIS_URL.trim();
    }
    // FAIL-HARD: Se não tem REDIS_URL, exige REDIS_*
    if (!raw.REDIS_HOST || !raw.REDIS_PORT) {
        console.error("[ENV] REDIS_URL ausente e variáveis REDIS_* incompletas:");
        if (!raw.REDIS_HOST)
            console.error("[ENV]  - REDIS_HOST é required");
        if (!raw.REDIS_PORT)
            console.error("[ENV]  - REDIS_PORT é required");
        console.error("[ENV_FATAL] Exiting with process.exit(1)");
        process.exit(1);
    }
    return `redis://${raw.REDIS_HOST}:${raw.REDIS_PORT}`;
}
export function parseEnv() {
    // Cache para evitar múltiplos parses sob imports concorrentes.
    if (_cached)
        return _cached;
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
        REDIS_BOOT_TIMEOUT_MS: process.env.REDIS_BOOT_TIMEOUT_MS,
        K6_MODE: process.env.K6_MODE,
        ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    });
    if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
        console.error("[ENV] inválido:");
        for (const line of issues)
            console.error(`[ENV]  - ${line}`);
        console.error("[ENV_FATAL] Exiting with process.exit(1)");
        process.exit(1);
    }
    // FAIL-HARD: Verificar se tem pelo menos DATABASE_URL ou REDIS_URL
    const hasDatabaseUrl = parsed.data.DATABASE_URL && parsed.data.DATABASE_URL.trim().length > 0;
    const hasRedisUrl = parsed.data.REDIS_URL && parsed.data.REDIS_URL.trim().length > 0;
    if (!hasDatabaseUrl && !parsed.data.DB_HOST) {
        console.error("[ENV] DATABASE_URL é obrigatório ou DB_HOST deve ser fornecido");
        console.error("[ENV_FATAL] Exiting with process.exit(1)");
        process.exit(1);
    }
    if (!hasRedisUrl && !parsed.data.REDIS_HOST) {
        console.error("[ENV] REDIS_URL é obrigatório ou REDIS_HOST deve ser fornecido");
        console.error("[ENV_FATAL] Exiting with process.exit(1)");
        process.exit(1);
    }
    const normalized = {
        ...parsed.data,
        DATABASE_URL: buildDatabaseUrl(parsed.data),
        REDIS_URL: buildRedisUrl(parsed.data),
    };
    _cached = normalized;
    return _cached;
}
