/**
 * BullMQ Dedicated Redis Connection
 *
 * Isolated Redis client specifically for BullMQ operations
 * Prevents conflicts with main Redis infrastructure
 */
import { Redis } from "ioredis";
import { InfrastructureError } from '../_core/errors/typed-errors.js';
import { parseEnv } from '../services/env.schema.js';
/**
 * Parse Redis configuration from environment variables
 * Similar to redis.ts but simplified for BullMQ
 */
function parseBullMQRedisConfig() {
    // Priority: REDIS_URL
    if (parseEnv().REDIS_URL?.trim()) {
        try {
            const redisUrl = new URL(parseEnv().REDIS_URL);
            const port = Number(redisUrl.port || "6379");
            const dbPart = redisUrl.pathname.replace("/", "").trim();
            const db = dbPart ? Number(dbPart) : 0;
            return {
                host: redisUrl.hostname,
                port: Number.isFinite(port) ? port : 6379,
                password: redisUrl.password ? decodeURIComponent(redisUrl.password) : parseEnv().DB_PASSWORD,
                db: Number.isFinite(db) ? db : 0,
            };
        }
        catch {
            throw new InfrastructureError("REDIS_URL inválida para BullMQ");
        }
    }
    // Fallback: REDIS_HOST/REDIS_PORT
    const hostFromEnv = parseEnv().REDIS_HOST?.trim();
    const portFromEnv = parseEnv().REDIS_PORT?.trim();
    if (!hostFromEnv || !portFromEnv) {
        throw new InfrastructureError("REDIS_URL é obrigatório ou REDIS_HOST e REDIS_PORT devem ser fornecidos para BullMQ");
    }
    const portNumber = Number(portFromEnv);
    if (!Number.isInteger(portNumber) || portNumber <= 0) {
        throw new InfrastructureError("REDIS_PORT inválido para BullMQ: deve ser inteiro positivo");
    }
    return {
        host: hostFromEnv,
        port: portNumber,
        password: parseEnv().DB_PASSWORD,
        db: 0,
    };
}
/**
 * Create dedicated Redis connection for BullMQ
 */
function createBullMQRedisConnection() {
    const config = parseBullMQRedisConfig();
    console.log('[BullMQ-Redis] Creating dedicated connection', {
        host: config.host,
        port: config.port,
        db: config.db,
        password: config.password ? '[REDACTED]' : undefined
    });
    const redis = new Redis({
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.db,
        connectTimeout: 10000,
        lazyConnect: true,
        retryStrategy: (times) => {
            if (times > 5) {
                console.error('[BullMQ-Redis] Retry limit reached. Aborting reconnection.', { attempts: times - 1 });
                return null;
            }
            const delay = Math.min(200 * Math.pow(2, times - 1), 2000);
            console.warn('[BullMQ-Redis] Reconnecting with backoff', { attempt: times, delay });
            return delay;
        },
        maxRetriesPerRequest: 3,
        keepAlive: 30000,
        family: 4,
    });
    // Event handlers for monitoring
    redis.on('connect', () => {
        console.log('[BullMQ-Redis] Connected successfully', {
            host: config.host,
            port: config.port,
            db: config.db
        });
    });
    redis.on('ready', () => {
        console.log('[BullMQ-Redis] Ready for BullMQ operations');
    });
    redis.on('error', (error) => {
        console.error('[BullMQ-Redis] Connection error', error);
    });
    redis.on('close', () => {
        console.warn('[BullMQ-Redis] Connection closed');
    });
    redis.on('reconnecting', (delay) => {
        console.info('[BullMQ-Redis] Reconnecting', { delay });
    });
    return redis;
}
/**
 * Dedicated Redis connection for BullMQ
 * Isolated from main Redis infrastructure
 */
export const bullmqRedisConnection = createBullMQRedisConnection();
/**
 * Test BullMQ Redis connection
 */
export async function testBullMQRedisConnection() {
    const startTime = Date.now();
    try {
        const result = await bullmqRedisConnection.ping();
        const latency = Date.now() - startTime;
        if (result === 'PONG') {
            return {
                success: true,
                message: 'BullMQ Redis connected and responding',
                latency,
            };
        }
        else {
            return {
                success: false,
                message: `Unexpected response: ${result}`,
            };
        }
    }
    catch (error) {
        const latency = Date.now() - startTime;
        console.error('[BullMQ-Redis] Connection test failed', error);
        return {
            success: false,
            message: `Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`,
            latency,
        };
    }
}
/**
 * Graceful shutdown for BullMQ Redis
 */
export async function disconnectBullMQRedis() {
    try {
        await bullmqRedisConnection.quit();
        console.log('[BullMQ-Redis] Disconnected successfully');
    }
    catch (error) {
        console.error('[BullMQ-Redis] Error during disconnect', error);
    }
}
