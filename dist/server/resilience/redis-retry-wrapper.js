/**
 * Redis Retry Wrapper
 * Implementa exponential backoff para operações Redis
 * Nunca deixa o servidor quebrado - fallback automático
 */
import { createLogger } from '../infra/structured-logger.js';
const logger = createLogger('redis-retry');
const DEFAULT_OPTIONS = {
    maxRetries: 3,
    initialDelay: 100, // ms
    maxDelay: 1200, // ms
};
export class RedisRetryWrapper {
    redis;
    options;
    constructor(redis, options = {}) {
        this.redis = redis;
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }
    /**
     * Exponential backoff delay
     */
    calculateDelay(attempt) {
        const delay = this.options.initialDelay * Math.pow(2, attempt - 1);
        return Math.min(delay, this.options.maxDelay);
    }
    /**
     * Exécuta um comando com retry
     */
    async executeWithRetry(operation, operationName) {
        let lastError = null;
        for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
            try {
                const result = await Promise.race([
                    operation(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Redis operation timeout')), 5000 // 5s timeout per operation
                    )),
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
            }
            catch (error) {
                lastError = error;
                if (attempt < this.options.maxRetries) {
                    const delay = this.calculateDelay(attempt);
                    logger.warn(`Redis operation failed, retrying...`, {
                        metadata: {
                            operation: operationName,
                            attempt,
                            nextRetryIn: `${delay}ms`,
                            error: error.message,
                        },
                    });
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }
            }
        }
        // Após todas as tentativas falharem
        logger.error(`Redis operation failed after ${this.options.maxRetries} retries`, lastError, {
            metadata: {
                operation: operationName,
                totalAttempts: this.options.maxRetries,
            },
        });
        // Retorna null em vez de throw para graceful fallback
        return null;
    }
    // =============== Operações Comuns ===============
    async get(key) {
        return this.executeWithRetry(() => this.redis.get(key), `get:${key}`);
    }
    async set(key, value, exSeconds) {
        const operation = exSeconds
            ? () => this.redis.set(key, value, 'EX', exSeconds)
            : () => this.redis.set(key, value);
        const result = await this.executeWithRetry(operation, `set:${key}`);
        return result !== null;
    }
    async del(...keys) {
        const result = await this.executeWithRetry(() => this.redis.del(...keys), `del:${keys.join(',')}`);
        return typeof result === 'number' ? result : 0;
    }
    async exists(...keys) {
        const result = await this.executeWithRetry(() => this.redis.exists(...keys), `exists:${keys.join(',')}`);
        return typeof result === 'number' ? result : 0;
    }
    async expire(key, seconds) {
        const result = await this.executeWithRetry(() => this.redis.expire(key, seconds), `expire:${key}`);
        return (result ?? 0) > 0;
    }
    async ttl(key) {
        const result = await this.executeWithRetry(() => this.redis.ttl(key), `ttl:${key}`);
        return result ?? -2; // -2 = key não existe
    }
    async hget(key, field) {
        return this.executeWithRetry(() => this.redis.hget(key, field), `hget:${key}:${field}`);
    }
    async hset(key, field, value) {
        const result = await this.executeWithRetry(() => this.redis.hset(key, field, value), `hset:${key}:${field}`);
        return result ?? 0;
    }
    async hdel(key, ...fields) {
        const result = await this.executeWithRetry(() => this.redis.hdel(key, ...fields), `hdel:${key}`);
        return typeof result === 'number' ? result : 0;
    }
    async hgetall(key) {
        return this.executeWithRetry(() => this.redis.hgetall(key), `hgetall:${key}`);
    }
    async lpush(key, ...values) {
        const result = await this.executeWithRetry(() => this.redis.lpush(key, ...values), `lpush:${key}`);
        return typeof result === 'number' ? result : 0;
    }
    async rpush(key, ...values) {
        const result = await this.executeWithRetry(() => this.redis.rpush(key, ...values), `rpush:${key}`);
        return typeof result === 'number' ? result : 0;
    }
    async lpop(key) {
        return this.executeWithRetry(() => this.redis.lpop(key), `lpop:${key}`);
    }
    async rpop(key) {
        return this.executeWithRetry(() => this.redis.rpop(key), `rpop:${key}`);
    }
    async lrange(key, start, stop) {
        const result = await this.executeWithRetry(() => this.redis.lrange(key, start, stop), `lrange:${key}`);
        return result ?? [];
    }
    async sadd(key, ...members) {
        const result = await this.executeWithRetry(() => this.redis.sadd(key, ...members), `sadd:${key}`);
        return typeof result === 'number' ? result : 0;
    }
    async srem(key, ...members) {
        const result = await this.executeWithRetry(() => this.redis.srem(key, ...members), `srem:${key}`);
        return typeof result === 'number' ? result : 0;
    }
    async smembers(key) {
        const result = await this.executeWithRetry(() => this.redis.smembers(key), `smembers:${key}`);
        return result ?? [];
    }
    async zadd(key, score, member) {
        const result = await this.executeWithRetry(() => this.redis.zadd(key, score, member), `zadd:${key}`);
        return result ?? 0;
    }
    async zrange(key, start, stop) {
        const result = await this.executeWithRetry(() => this.redis.zrange(key, start, stop), `zrange:${key}`);
        return result ?? [];
    }
    async incr(key) {
        const result = await this.executeWithRetry(() => this.redis.incr(key), `incr:${key}`);
        return result ?? 0;
    }
    async decr(key) {
        const result = await this.executeWithRetry(() => this.redis.decr(key), `decr:${key}`);
        return result ?? 0;
    }
    /**
     * Operação customizada com retry
     */
    async execute(operation, operationName = 'custom') {
        return this.executeWithRetry(operation, operationName);
    }
}
/**
 * Singleton global Redis wrapper
 */
let globalRedisWrapper = null;
export function getRedisWrapper(redis) {
    if (!globalRedisWrapper) {
        globalRedisWrapper = new RedisRetryWrapper(redis);
    }
    return globalRedisWrapper;
}
export function resetRedisWrapper() {
    globalRedisWrapper = null;
}
