/**
 * Configuração global da aplicação
 * IMPORTANTE: Não coloque secrets aqui. Use variáveis de ambiente.
 */

/** Ambiente de execução */
export const ENV = process.env.NODE_ENV || 'development';
export const isDevelopment = ENV === 'development';
export const isProduction = ENV === 'production';

/** URL da API */
const defaultApiUrl = isDevelopment ? 'http://localhost:3000/api' : '/api';
export const API_URL = (
  typeof window !== 'undefined'
    ? import.meta.env.VITE_API_URL
    : process.env.VITE_API_URL
) as string | undefined || defaultApiUrl;

export const API_TIMEOUT_DEFAULT = 30000; // 30 segundos
export const API_TIMEOUT_UPLOAD = 60000; // 60 segundos para upload
export const API_TIMEOUT_DOWNLOAD = 120000; // 120 segundos para download

/** Configuração de retry */
export const RETRY_CONFIG = {
  maxAttempts: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 10000,
} as const;

/** Configuração de rate limiting (client-side) */
export const RATE_LIMIT_CONFIG = {
  requestsPerMinute: 100,
  requestsPerHour: 5000,
} as const;

/** Headers padrão */
export const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
} as const;

/** Configuração de logging */
export const LOG_CONFIG = {
  enabled: isDevelopment,
  level: isDevelopment ? 'debug' : 'error',
  maxLogs: 100,
} as const;

/** Configuração de storage */
export const STORAGE_CONFIG = {
  prefix: 'app_',
  version: '1.0',
} as const;

/** Configuração de cache */
export const CACHE_CONFIG = {
  enabled: true,
  ttlSeconds: 300, // 5 minutos
  maxEntries: 100,
} as const;

/** Configuração de validação */
export const VALIDATION_CONFIG = {
  maxStringLength: 10000,
  maxArrayLength: 1000,
  maxObjectDepth: 10,
} as const;

/** Chaves de armazenamento local */
export const STORAGE_KEYS = {
  AUTH_TOKEN: `${STORAGE_CONFIG.prefix}auth_token`,
  USER_INFO: `${STORAGE_CONFIG.prefix}user_info`,
  PREFERENCES: `${STORAGE_CONFIG.prefix}preferences`,
  CACHE: `${STORAGE_CONFIG.prefix}cache`,
} as const;

/** Valores padrão */
export const DEFAULTS = {
  pageSize: 20,
  timeout: API_TIMEOUT_DEFAULT,
} as const;
