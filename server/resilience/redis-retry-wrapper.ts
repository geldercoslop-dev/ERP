/**
 * Redis Retry Wrapper
 * Implementa exponential backoff para operações Redis
 * Nunca deixa o servidor quebrado - fallback automático
 */

import { createLogger } from '../infra/structured-logger';
import { Redis } from 'ioredis';

const logger = createLogger('redis-retry');

interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 100, // ms
  maxDelay: 1200, // ms
};

// Tipo do cliente Redis ioredis
type RedisClientInstance = InstanceType<typeof Redis>;

export class RedisRetryWrapper {
  private redis: RedisClientInstance;
  private options: Required<RetryOptions>;

  constructor(redis: RedisClientInstance, options: Partial<RetryOptions> = {}) {
    this.redis = redis;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Exponential backoff delay
   */
  private calculateDelay(attempt: number): number {
    const delay = this.options.initialDelay * Math.pow(2, attempt - 1);
    return Math.min(delay, this.options.maxDelay);
  }

  /**
   * Exécuta um comando com retry
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T | null> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        const result = await Promise.race<T | never>([
          operation(),
          new Promise<never>(
            (_, reject) =>
              setTimeout(
                () => reject(new Error('Redis operation timeout')),
                5000 // 5s timeout per operation
              )
          ),
        ]);

        if (attempt > 1) {
          logger.info(`Redis retry success on attempt ${attempt}`, {
            metadata: {
              operation: operationName,
              attempt,
            },
          });
        }

        return result;
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.options.maxRetries) {
          const delay = this.calculateDelay(attempt);
          logger.warn(`Redis operation failed, retrying...`, {
            metadata: {
              operation: operationName,
              attempt,
              nextRetryIn: `${delay}ms`,
              error: (error as Error).message,
            },
          });

          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // Após todas as tentativas falharem
    logger.error(`Redis operation failed after ${this.options.maxRetries} retries`, lastError!, {
      metadata: {
        operation: operationName,
        totalAttempts: this.options.maxRetries,
      },
    });

    // Retorna null em vez de throw para graceful fallback
    return null;
  }

  // =============== Operações Comuns ===============

  async get(key: string): Promise<string | null> {
    return this.executeWithRetry(() => this.redis.get(key), `get:${key}`);
  }

  async set(key: string, value: string, exSeconds?: number): Promise<boolean> {
    const operation = exSeconds
      ? () => this.redis.set(key, value, 'EX', exSeconds)
      : () => this.redis.set(key, value);

    const result = await this.executeWithRetry(operation, `set:${key}`);
    return result !== null;
  }

  async del(...keys: string[]): Promise<number> {
    const result = await this.executeWithRetry(
      () => this.redis.del(...keys),
      `del:${keys.join(',')}`
    );
    return typeof result === 'number' ? result : 0;
  }

  async exists(...keys: string[]): Promise<number> {
    const result = await this.executeWithRetry(
      () => this.redis.exists(...keys),
      `exists:${keys.join(',')}`
    );
    return typeof result === 'number' ? result : 0;
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    const result = await this.executeWithRetry(
      () => this.redis.expire(key, seconds),
      `expire:${key}`
    );
    return (result ?? 0) > 0;
  }

  async ttl(key: string): Promise<number> {
    const result = await this.executeWithRetry(
      () => this.redis.ttl(key),
      `ttl:${key}`
    );
    return result ?? -2; // -2 = key não existe
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.executeWithRetry(
      () => this.redis.hget(key, field),
      `hget:${key}:${field}`
    );
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    const result = await this.executeWithRetry(
      () => this.redis.hset(key, field, value),
      `hset:${key}:${field}`
    );
    return result ?? 0;
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    const result = await this.executeWithRetry(
      () => this.redis.hdel(key, ...fields),
      `hdel:${key}`
    );
    return typeof result === 'number' ? result : 0;
  }

  async hgetall(key: string): Promise<Record<string, string> | null> {
    return this.executeWithRetry(
      () => this.redis.hgetall(key),
      `hgetall:${key}`
    );
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    const result = await this.executeWithRetry(
      () => this.redis.lpush(key, ...values),
      `lpush:${key}`
    );
    return typeof result === 'number' ? result : 0;
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    const result = await this.executeWithRetry(
      () => this.redis.rpush(key, ...values),
      `rpush:${key}`
    );
    return typeof result === 'number' ? result : 0;
  }

  async lpop(key: string): Promise<string | null> {
    return this.executeWithRetry(() => this.redis.lpop(key), `lpop:${key}`);
  }

  async rpop(key: string): Promise<string | null> {
    return this.executeWithRetry(() => this.redis.rpop(key), `rpop:${key}`);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const result = await this.executeWithRetry(
      () => this.redis.lrange(key, start, stop),
      `lrange:${key}`
    );
    return result ?? [];
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    const result = await this.executeWithRetry(
      () => this.redis.sadd(key, ...members),
      `sadd:${key}`
    );
    return typeof result === 'number' ? result : 0;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const result = await this.executeWithRetry(
      () => this.redis.srem(key, ...members),
      `srem:${key}`
    );
    return typeof result === 'number' ? result : 0;
  }

  async smembers(key: string): Promise<string[]> {
    const result = await this.executeWithRetry(
      () => this.redis.smembers(key),
      `smembers:${key}`
    );
    return result ?? [];
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    const result = await this.executeWithRetry(
      () => this.redis.zadd(key, score, member),
      `zadd:${key}`
    );
    return result ?? 0;
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    const result = await this.executeWithRetry(
      () => this.redis.zrange(key, start, stop),
      `zrange:${key}`
    );
    return result ?? [];
  }

  async incr(key: string): Promise<number> {
    const result = await this.executeWithRetry(
      () => this.redis.incr(key),
      `incr:${key}`
    );
    return result ?? 0;
  }

  async decr(key: string): Promise<number> {
    const result = await this.executeWithRetry(
      () => this.redis.decr(key),
      `decr:${key}`
    );
    return result ?? 0;
  }

  /**
   * Operação customizada com retry
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationName: string = 'custom'
  ): Promise<T | null> {
    return this.executeWithRetry(operation, operationName);
  }
}

/**
 * Singleton global Redis wrapper
 */
let globalRedisWrapper: RedisRetryWrapper | null = null;

export function getRedisWrapper(redis: RedisClientInstance): RedisRetryWrapper {
  if (!globalRedisWrapper) {
    globalRedisWrapper = new RedisRetryWrapper(redis);
  }
  return globalRedisWrapper;
}

export function resetRedisWrapper(): void {
  globalRedisWrapper = null;
}
