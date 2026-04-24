import { getRedisClient } from "../infra/redis.js";
import { createLogger } from "../infra/structured-logger.js";
const logger = createLogger("rate-limit-service");
class RateLimitExceededError extends Error {
    code;
    count;
    constructor(count) {
        super(`Rate limit exceeded: ${count} attempts`);
        this.name = "RateLimitExceededError";
        this.code = "RATE_LIMIT_EXCEEDED";
        this.count = count;
    }
}
const WINDOW_MS = 60_000; // 60 seconds
const MAX_ATTEMPTS = 5;
const REDIS_KEY_PREFIX = "ratelimit:service:";
function toError(error) {
    return error instanceof Error ? error : new Error(String(error));
}
/**
 * Check rate limit using Redis.
 * Increments counter, sets expiration.
 * Throws if limit exceeded.
 */
export async function checkRateLimit(key) {
    const redis = getRedisClient();
    if (!redis) {
        logger.warn("Redis not available, skipping rate limit check");
        return;
    }
    try {
        const redisKey = `${REDIS_KEY_PREFIX}${key}`;
        const ttlSeconds = Math.ceil(WINDOW_MS / 1000);
        // Evita pipeline aqui porque a instrumentação envolve `pipeline()` em Promise.
        // Operações simples de INCR/EXPIRE já atendem ao caso de uso deste rate limit.
        const count = await redis.incr(redisKey);
        if (count === 1) {
            await redis.expire(redisKey, ttlSeconds);
        }
        if (count > MAX_ATTEMPTS) {
            throw new RateLimitExceededError(count);
        }
    }
    catch (error) {
        if (error instanceof RateLimitExceededError) {
            throw error;
        }
        // Se Redis falhar, não bloquear o fluxo de auth.
        logger.warn("Redis error in rate limit check", {
            error: toError(error).message,
        });
    }
}
/**
 * Clear rate limit for a specific key.
 */
export async function clearRateLimitForKey(key) {
    const redis = getRedisClient();
    if (!redis) {
        logger.debug("Redis not available, skipping clear rate limit");
        return;
    }
    try {
        const redisKey = `${REDIS_KEY_PREFIX}${key}`;
        await redis.del(redisKey);
    }
    catch (error) {
        logger.warn("Error clearing rate limit for key:", {
            error: toError(error).message,
        });
    }
}
/**
 * Get current count for a rate limit key (for monitoring/debugging).
 */
export async function getRateLimitCount(key) {
    const redis = getRedisClient();
    if (!redis) {
        return 0;
    }
    try {
        const redisKey = `${REDIS_KEY_PREFIX}${key}`;
        const count = await redis.get(redisKey);
        return parseInt(count || "0", 10);
    }
    catch (error) {
        logger.warn("Error getting rate limit count:", {
            error: toError(error).message,
        });
        return 0;
    }
}
