/**
 * Rate Limiter para Jobs — Redis-backed
 * 
 * Controla a quantidade de jobs por minuto e implementa debounce
 * Evita explosão de jobs em eventos repetidos
 * Usa Redis para persistência entre instâncias
 */

import { getRedisClient } from "../infra/redis.js";
import { createLogger } from "../infra/structured-logger.js";
import { createHash } from "crypto";

const logger = createLogger("job-rate-limiter");

export interface RateLimitConfig {
  maxJobsPerMinute?: number;
  debounceMs?: number;
  bucketSize?: number;
}

export interface JobRateLimitEntry {
  timestamp: number;
  jobType: string;
  entity?: string;
  entityId?: string;
  payload?: unknown;
}

const ONE_MINUTE = 60_000;

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Rate Limiter com debounce por tipo de job — Redis-backed
 */
class JobRateLimiter {
  private static instance: JobRateLimiter;
  private debounceCache: Map<string, NodeJS.Timeout> = new Map(); // local debounce timeouts
  private config: Map<string, RateLimitConfig> = new Map(); // jobType -> config

  private constructor() {}

  public static getInstance(): JobRateLimiter {
    if (!JobRateLimiter.instance) {
      JobRateLimiter.instance = new JobRateLimiter();
    }
    return JobRateLimiter.instance;
  }

  /**
   * Configura rate limit para um tipo de job
   */
  public configure(jobType: string, config: RateLimitConfig): void {
    this.config.set(jobType, {
      maxJobsPerMinute: config.maxJobsPerMinute || 60,
      debounceMs: config.debounceMs || 1000,
      bucketSize: config.bucketSize || 100,
    });
  }

  /**
   * Verifica se job pode ser executado (rate limit) usando Redis sorted sets
   */
  public async canExecute(
    jobType: string,
    tenantId: number,
    entity?: string,
    entityId?: string
  ): Promise<boolean> {
    if (!tenantId || typeof tenantId !== 'number' || tenantId <= 0) {
      throw new Error("RATE_LIMIT: tenantId obrigatório para isolamento multi-tenant");
    }

    const redis = getRedisClient();
    if (!redis) {
      logger.warn("Redis not available, allowing job execution");
      return true;
    }

    const config = this.config.get(jobType);
    if (!config || !config.maxJobsPerMinute) {
      return true; // Sem limite configurado
    }

    try {
      const now = Date.now();
      const oneMinuteAgo = now - ONE_MINUTE;
      const redisKey = `tenant:${tenantId}:ratelimit:job:${jobType}`;

      // Usar Redis sorted set com timestamps como scores
      // Remove entradas antigas
      await redis.zremrangebyscore(redisKey, "-inf", oneMinuteAgo);

      // Contar jobs nos últimos 60 segundos
      const count = await redis.zcard(redisKey);

      if (count >= config.maxJobsPerMinute) {
        logger.warn(
          `Rate limit reached for ${jobType}: ${count}/${config.maxJobsPerMinute} jobs/min`
        );
        return false;
      }

      // Adicionar timestamp atual
      const entryData = JSON.stringify({
        entity: entity || "unknown",
        entityId: entityId || "unknown",
      });
      await redis.zadd(redisKey, now, `${now}:${entryData}`);

      // Set expiration to 2 minutes (cleanup)
      await redis.expire(redisKey, 120);

      return true;
    } catch (error) {
      logger.error("Redis error checking rate limit:", toError(error));
      // Fail open - allow execution if Redis is down
      return true;
    }
  }

  /**
   * Implementa debounce para jobs repetidos (local timeouts + Redis tracking)
   */
  public debounce(
    jobType: string,
    entity: string | undefined,
    entityId: string | undefined,
    payload: unknown,
    callback: () => void | Promise<void>
  ): void {
    const config = this.config.get(jobType);
    if (!config || !config.debounceMs) {
      // Sem debounce, executar imediatamente
      callback();
      return;
    }

    // Gerar chave de debounce
    const debounceKey = this.generateDebounceKey(jobType, entity, entityId, payload);

    // Limpar timeout anterior se existir
    const existingTimeout = this.debounceCache.get(debounceKey);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Configurar novo timeout
    const timeout = setTimeout(async () => {
      this.debounceCache.delete(debounceKey);
      try {
        await callback();
      } catch (error) {
        logger.error(`Error executing debounced job ${jobType}:`, toError(error));
      }
    }, config.debounceMs);

    this.debounceCache.set(debounceKey, timeout);
  }

  /**
   * Executa job com rate limit e debounce
   */
  public async executeWithLimits(
    jobType: string,
    tenantId: number,
    entity: string | undefined,
    entityId: string | undefined,
    payload: unknown,
    callback: () => void | Promise<void>
  ): Promise<boolean> {
    // Verificar rate limit
    const canExecute = await this.canExecute(jobType, tenantId, entity, entityId);
    if (!canExecute) {
      return false;
    }

    // Aplicar debounce
    return new Promise((resolve) => {
      this.debounce(jobType, entity, entityId, payload, async () => {
        try {
          await callback();
          resolve(true);
        } catch (error) {
          logger.error(`Error executing job with limits ${jobType}:`, toError(error));
          resolve(false);
        }
      });
    });
  }

  /**
   * Gera chave única para debounce
   */
  private generateDebounceKey(
    jobType: string,
    entity: string | undefined,
    entityId: string | undefined,
    payload: unknown
  ): string {
    const parts = [jobType];
    if (entity) parts.push(entity);
    if (entityId) parts.push(entityId);

    // Hash do payload se existir (para capturar mudanças nos dados)
    if (payload) {
      const payloadHash = createHash("md5")
        .update(JSON.stringify(payload))
        .digest("hex")
        .substring(0, 8);
      parts.push(payloadHash);
    }

    return parts.join(":");
  }

  /**
   * Obtém estatísticas de rate limit (Redis-backed)
   */
  public async getStats(): Promise<Record<string, unknown>> {
    const redis = getRedisClient();
    const stats: Record<string, unknown> = {};

    if (!redis) {
      logger.warn("Redis not available for stats");
      return { error: "Redis not available" };
    }

    try {
      const now = Date.now();
      const oneMinuteAgo = now - ONE_MINUTE;

      for (const [jobType, config] of Array.from(this.config.entries())) {
        // Nota: stats não precisa de tenantId específico, usa wildcard para agregação
        const redisKeyPattern = `tenant:*:ratelimit:job:${jobType}`;
        const keys = await redis.keys(redisKeyPattern);
        
        for (const key of keys) {
          await redis.zremrangebyscore(key, "-inf", oneMinuteAgo);
          const count = await redis.zcard(key);
          const activeDebounces = Array.from(this.debounceCache.keys()).filter((k) =>
            k.startsWith(jobType)
          ).length;

          stats[jobType] = {
            jobsLastMinute: count,
            maxJobsPerMinute: config.maxJobsPerMinute || "unlimited",
            activeDebounces,
            utilizationRate:
              config.maxJobsPerMinute && config.maxJobsPerMinute > 0
                ? `${((count / config.maxJobsPerMinute) * 100).toFixed(1)}%`
                : "N/A",
          };
        }
      }
    } catch (error) {
      logger.error("Error getting rate limit stats:", toError(error));
    }

    return stats;
  }

  /**
   * Limpa caches antigos (local debounce timeouts + Redis old entries)
   */
  public async cleanup(): Promise<void> {
    const redis = getRedisClient();
    const now = Date.now();
    const oneMinuteAgo = now - ONE_MINUTE;

    // Limpar timeouts de debounce locais antigos
    for (const [key, timeout] of Array.from(this.debounceCache.entries())) {
      // Keep for now - local timeouts are cleaned up naturally
    }

    // Limpar entradas antigas no Redis
    if (redis) {
      try {
        for (const jobType of this.config.keys()) {
          const redisKeyPattern = `tenant:*:ratelimit:job:${jobType}`;
          const keys = await redis.keys(redisKeyPattern);
          for (const key of keys) {
            await redis.zremrangebyscore(key, "-inf", oneMinuteAgo);
          }
        }
        logger.debug(
          `Cleanup complete: ${this.config.size} rate limit types monitored`
        );
      } catch (error) {
        logger.error("Error during cleanup:", toError(error));
      }
    }
  }
}

// Configurações padrão para diferentes tipos de jobs
export const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Jobs críticos de negócio - limite alto
  pedido_create: { maxJobsPerMinute: 30, debounceMs: 500 },
  estoque_update: { maxJobsPerMinute: 60, debounceMs: 200 },
  financeiro_update: { maxJobsPerMinute: 20, debounceMs: 1000 },

  // Jobs de análise - limite moderado
  leo_analysis: { maxJobsPerMinute: 10, debounceMs: 2000 },
  ocr_processing: { maxJobsPerMinute: 5, debounceMs: 5000 },

  // Jobs de notificação - limite alto com debounce
  notifications: { maxJobsPerMinute: 100, debounceMs: 100 },

  // Jobs de sistema - limite baixo
  backup: { maxJobsPerMinute: 2, debounceMs: 30000 },
  cleanup: { maxJobsPerMinute: 1, debounceMs: 60000 },

  // Jobs de automação - limite muito baixo
  desktop_automation: { maxJobsPerMinute: 3, debounceMs: 10000 },
  screenshot_capture: { maxJobsPerMinute: 10, debounceMs: 1000 },

  // Jobs de relatórios - limite moderado
  report_generation: { maxJobsPerMinute: 5, debounceMs: 5000 },
};

// Exportar instância singleton
export const jobRateLimiter = JobRateLimiter.getInstance();

// Inicializar configurações padrão
export function initializeRateLimits(): void {
  Object.entries(DEFAULT_RATE_LIMITS).forEach(([jobType, config]) => {
    jobRateLimiter.configure(jobType, config);
  });

  // Limpeza periódica (a cada 5 minutos)
  setInterval(() => {
    jobRateLimiter.cleanup().catch((err) => {
      logger.warn("Cleanup error:", err);
    });
  }, 5 * 60 * 1000);

  logger.info("Rate limits initialized for jobs (Redis-backed)");
}

// Funções de conveniência
export async function executeJobWithLimits(
  jobType: string,
  tenantId: number,
  entity: string | undefined,
  entityId: string | undefined,
  payload: unknown,
  callback: () => void | Promise<void>
): Promise<boolean> {
  return jobRateLimiter.executeWithLimits(jobType, tenantId, entity, entityId, payload, callback);
}

export async function getRateLimitStats(): Promise<Record<string, unknown>> {
  return jobRateLimiter.getStats();
}
