import { z } from 'zod';
import { ENV_SECRET_MIN_LENGTH } from '../_core/env-validator.js';
import { exitProcessInProductionUnlessDevelopment } from '../_core/dev-process-exit.js';

/**
 * Schema de validação de environment variables
 * Garante que todas as variáveis obrigatórias estejam presentes
 */
const envSchema = z.object({
  // Node.js
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  PORT: z.string().transform(Number).default(() => 3000),
  APP_SECRET: z.string().min(ENV_SECRET_MIN_LENGTH, `APP_SECRET é obrigatório (mínimo ${ENV_SECRET_MIN_LENGTH} caracteres)`),

  // Database — DATABASE_URL obrigatório (mysql://user:pass@host:port/db)
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),
  DATABASE_HOST: z.string().optional(),
  DATABASE_PORT: z
    .string()
    .optional()
    .transform((s) => (s === undefined || s === "" ? undefined : Number(s))),
  DATABASE_NAME: z.string().optional(),
  DATABASE_USER: z.string().optional(),
  DATABASE_PASSWORD: z.string().optional(),
  DATABASE_SSL: z.string().transform(val => val === 'true').default(() => false),

  // JWT — access + refresh (validação será refinada por environment)
  JWT_ACCESS_SECRET: z.string().min(ENV_SECRET_MIN_LENGTH, `JWT_ACCESS_SECRET deve ter pelo menos ${ENV_SECRET_MIN_LENGTH} caracteres`),
  JWT_REFRESH_SECRET: z.string().min(ENV_SECRET_MIN_LENGTH, `JWT_REFRESH_SECRET deve ter pelo menos ${ENV_SECRET_MIN_LENGTH} caracteres`),
  JWT_ISSUER: z.string().default('erp-system'),
  JWT_AUDIENCE: z.string().default('erp-users'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // CORS
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  CORS_ORIGIN: z.string().optional(),

  // Redis — obrigatório para filas e cache
  REDIS_HOST: z.string().min(1, 'REDIS_HOST é obrigatório para Workers/Filas').default('localhost'),
  REDIS_PORT: z.string().transform(Number).default(() => 6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().transform(Number).default(() => 0),
  REDIS_URL: z.string().optional(),

  // Email
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(Number).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // Uploads
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE: z.string().transform(Number).default(() => 10485760),
  ALLOWED_FILE_TYPES: z.string().default('jpg,jpeg,png,pdf,doc,docx'),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FILE: z.string().default('./logs/app.log'),
  LOG_MAX_SIZE: z.string().default('10m'),
  LOG_MAX_FILES: z.string().transform(Number).default(() => 5),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default(() => 900000),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default(() => 1000),
  AUTH_RATE_LIMIT_MAX: z.string().transform(Number).default(() => 10),

  // Security
  ENABLE_HELMET: z.string().transform(val => val === 'true').default(() => true),
  ENABLE_COMPRESSION: z.string().transform(val => val === 'true').default(() => true),
  TRUST_PROXY: z.string().transform(val => val === 'true').default(() => false),

  // Monitoring
  ENABLE_METRICS: z.string().transform(val => val === 'true').default(() => true),
  HEALTH_CHECK_INTERVAL: z.string().transform(Number).default(() => 30000),
  METRICS_PORT: z.string().transform(Number).default(() => 9090),

  // Backup
  BACKUP_ENABLED: z.string().transform(val => val === 'true').default(() => true),
  BACKUP_SCHEDULE: z.string().default('0 2 * * *'),
  BACKUP_RETENTION_DAYS: z.string().transform(Number).default(() => 30),
  BACKUP_DIR: z.string().default('./backups'),

  // LEO AI
  LEO_API_KEY: z.string().optional(),
  LEO_RATE_LIMIT: z.string().transform(Number).default(() => 20),
  LEO_RATE_WINDOW: z.string().transform(Number).default(() => 60000),
}).superRefine((data, ctx) => {
  // ============================================================================
  // SECURITY CONSTRAINTS (fail-fast for 128+ char secrets)
  // ============================================================================
  if (data.JWT_ACCESS_SECRET.length < ENV_SECRET_MIN_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_ACCESS_SECRET'],
        message: `JWT_ACCESS_SECRET deve ter MÍNIMO ${ENV_SECRET_MIN_LENGTH} caracteres`,
      });
  }

  if (data.JWT_REFRESH_SECRET.length < ENV_SECRET_MIN_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: `JWT_REFRESH_SECRET deve ter MÍNIMO ${ENV_SECRET_MIN_LENGTH} caracteres`,
      });
  }

  if (data.APP_SECRET.length < ENV_SECRET_MIN_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['APP_SECRET'],
        message: `APP_SECRET deve ter MÍNIMO ${ENV_SECRET_MIN_LENGTH} caracteres`,
      });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret && jwtSecret.length < ENV_SECRET_MIN_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: `JWT_SECRET deve ter MÍNIMO ${ENV_SECRET_MIN_LENGTH} caracteres`,
      });
  }
});

export type Env = {
  PORT: number;
  APP_SECRET: string;
  NODE_ENV: 'development' | 'production';
};

export type EnvConfig = z.infer<typeof envSchema> & Env;

/**
 * Valida e carrega as variáveis de ambiente
 * Implementa padrão fail-fast com erros detalhados
 * 
 * Validações de segurança:
 * - JWT_ACCESS_SECRET: mínimo 128 caracteres
 * - JWT_REFRESH_SECRET: mínimo 128 caracteres
 * - APP_SECRET: mínimo 128 caracteres
 */
export function validateEnv(): EnvConfig {
  try {
    const validatedEnv = envSchema.parse(process.env);

    // Log validação bem-sucedida apenas em desenvolvimento
    if (process.env.NODE_ENV === 'development') {
      console.log('[ENV] validado com sucesso');
      console.log(`[ENV] NODE_ENV=${validatedEnv.NODE_ENV}`);
      console.log(`[ENV] PORT=${validatedEnv.PORT}`);
      console.log(
        `[ENV] Database: ${validatedEnv.DATABASE_HOST ?? '(via DATABASE_URL)'}:${validatedEnv.DATABASE_PORT ?? ''}/${validatedEnv.DATABASE_NAME ?? ''}`
      );
    }
    
    return validatedEnv;
    
  } catch (error) {
    // ========================================================================
    // FAIL-FAST: Erro crítico de validação de environment
    // ========================================================================
    console.error('');
    console.error('╔════════════════════════════════════════════════════════════╗');
    console.error('║           ❌ ERRO CRÍTICO: ENVIRONMENT INVÁLIDO             ║');
    console.error('╚════════════════════════════════════════════════════════════╝');
    console.error('');
    
    if (error instanceof z.ZodError) {
      console.error('📋 VARIÁVEIS INVÁLIDAS OU FALTANDO:');
      console.error('');
      error.issues.forEach((err, index) => {
        const path = err.path.join('.');
        const message = err.message;
        console.error(`  ${index + 1}. ${path || 'config'}`);
        console.error(`     └─ ${message}`);
      });
    } else {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ ${message}`);
    }
    
    console.error('');
    console.error('📖 SOLUÇÃO:');
    console.error('  1. Copie .env.example para .env');
    console.error('     $ cp .env.example .env');
    console.error('');
    console.error('  2. Configure todas as variáveis obrigatórias:');
    console.error('     - DATABASE_URL (mysql://user:pass@host:3306/db)');
    console.error(`     - JWT_ACCESS_SECRET (mínimo ${ENV_SECRET_MIN_LENGTH} chars)`);
    console.error(`     - JWT_REFRESH_SECRET (mínimo ${ENV_SECRET_MIN_LENGTH} chars)`);
    console.error(`     - APP_SECRET (mínimo ${ENV_SECRET_MIN_LENGTH} chars)`);
    console.error('     - REDIS_HOST e REDIS_PORT');
    console.error('');
    console.error('  3. Reinicie o servidor');
    console.error('');
    console.error('🔐 NOTA DE SEGURANÇA:');
    console.error(`  Os secrets devem ter MÍNIMO ${ENV_SECRET_MIN_LENGTH} caracteres`);
    console.error('  Use: openssl rand -base64 128 | head -c 128');
    console.error('');

    process.exit(1);
    throw error;
  }
}

/**
 * Singleton para environment validado
 */
let cachedEnv: EnvConfig | null = null;

export function getEnv(): EnvConfig {
  if (!cachedEnv) {
    cachedEnv = validateEnv();
  }
  return cachedEnv;
}

/**
 * Verifica se está em modo desenvolvimento
 */
export function isDevelopment(): boolean {
  return getEnv().NODE_ENV === 'development';
}

/**
 * Verifica se está em modo produção
 */
export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production';
}

/**
 * Verifica se está em modo teste
 */
export function isTest(): boolean {
  return false;
}

/**
 * Avalia a força do JWT secret (para checks em runtime)
 * 
 * @returns { valid, strength }
 *   - valid: boolean - se o secret atende o mínimo requerido
 *   - strength: 'weak' | 'acceptable' | 'strong'
 */
export function validateJwtSecretStrength(
  secret: string,
  context: string = 'JWT_SECRET'
): { valid: boolean; strength: 'weak' | 'acceptable' | 'strong' } {
  const length = secret.length;

  if (length < 32) {
    return { valid: false, strength: 'weak' };
  }

  if (length < 64) {
    return { valid: true, strength: 'acceptable' };
  }

  return { valid: true, strength: 'strong' };
}

/**
 * Constrói URL de conexão MySQL a partir de variáveis individuais
 * Prioriza DATABASE_URL se presente
 * FAIL-HARD: sem fallback - todas as variáveis são obrigatórias
 * 
 * @param env - Variáveis de ambiente validadas
 * @returns String de conexão MySQL
 */
export function getDatabaseUrl(env: EnvConfig): string {
  if (env.DATABASE_URL) {
    return env.DATABASE_URL;
  }

  // FAIL-HARD: todas as variáveis são obrigatórias
  if (!env.DATABASE_HOST || !env.DATABASE_PORT || !env.DATABASE_USER || !env.DATABASE_NAME) {
    throw new Error('DATABASE_URL, DATABASE_HOST, DATABASE_PORT, DATABASE_USER, and DATABASE_NAME are required');
  }

  const password = env.DATABASE_PASSWORD ? `:${env.DATABASE_PASSWORD}` : '';
  const host = env.DATABASE_HOST;
  const port = env.DATABASE_PORT;
  const user = env.DATABASE_USER;
  const name = env.DATABASE_NAME;

  return `mysql://${user}${password}@${host}:${port}/${name}`;
}

/**
 * Obtém opções de conexão Redis (host, port, password)
 * Compatível com ioredis
 * 
 * @param env - Variáveis de ambiente validadas
 * @returns Opções de conexão Redis
 */
export function getRedisOptions(env: EnvConfig) {
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    db: env.REDIS_DB,
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) => Math.min(times * 50, 2000),
  };
}

/**
 * Configurações estruturadas para compatibilidade
 * NOTA: Estes getters chamam getEnv() - só use após bootstrapServer()
 */
export const config = {
  get database() {
    const env = getEnv();
    return {
      url: env.DATABASE_URL,
      host: env.DATABASE_HOST,
      port: env.DATABASE_PORT,
      user: env.DATABASE_USER,
      password: env.DATABASE_PASSWORD,
      name: env.DATABASE_NAME,
      ssl: env.DATABASE_SSL,
    };
  },

  get server() {
    const env = getEnv();
    return {
      port: env.PORT,
      host: 'localhost',
      env: env.NODE_ENV,
      isProduction: isProduction(),
      isDevelopment: isDevelopment(),
      isTest: isTest(),
      corsOrigin: env.CORS_ORIGIN || env.ALLOWED_ORIGINS,
    };
  },

  get security() {
    const env = getEnv();
    return {
      jwtAccessSecret: env.JWT_ACCESS_SECRET,
      jwtRefreshSecret: env.JWT_REFRESH_SECRET,
      jwtExpiresIn: env.JWT_EXPIRES_IN,
      jwtRefreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
      jwtIssuer: env.JWT_ISSUER,
      jwtAudience: env.JWT_AUDIENCE,
      helmetEnabled: env.ENABLE_HELMET,
      trustProxy: env.TRUST_PROXY,
    };
  },

  get logging() {
    const env = getEnv();
    return {
      level: env.LOG_LEVEL,
      file: env.LOG_FILE,
      maxSize: env.LOG_MAX_SIZE,
      maxFiles: env.LOG_MAX_FILES,
    };
  },

  get cache() {
    const env = getEnv();
    return {
      enabled: !!env.REDIS_HOST,
      redis: {
        host: env.REDIS_HOST || 'localhost',
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD,
        db: env.REDIS_DB,
      },
    };
  },

  get email() {
    const env = getEnv();
    return {
      enabled: !!env.SMTP_HOST,
      smtp: {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        user: env.SMTP_USER,
        pass: env.SMTP_PASSWORD,
      },
      from: env.EMAIL_FROM,
    };
  },

  get monitoring() {
    const env = getEnv();
    return {
      enabled: env.ENABLE_METRICS,
      healthCheckInterval: env.HEALTH_CHECK_INTERVAL,
      metricsPort: env.METRICS_PORT,
    };
  },

  get backup() {
    const env = getEnv();
    return {
      enabled: env.BACKUP_ENABLED,
      schedule: env.BACKUP_SCHEDULE,
      retentionDays: env.BACKUP_RETENTION_DAYS,
      dir: env.BACKUP_DIR,
    };
  },

  get leo() {
    const env = getEnv();
    return {
      apiKey: env.LEO_API_KEY,
      rateLimit: env.LEO_RATE_LIMIT,
      rateWindow: env.LEO_RATE_WINDOW,
    };
  },
};

// ============================================================================
// BOOTSTRAP: ENV não é mais carregado no import-time
// ============================================================================
// REMOVIDO: export const env = getEnv(); (causava import-time side effect)
// REMOVIDO: validação de segurança no import-time (dependia de env)
// Use getEnv() após bootstrapServer() ser chamado
// Validação de segurança movida para runtime se necessário
