/**
 * Instrumentação Redis com OpenTelemetry
 * Wrapper para cliente Redis com spans de tracing
 */
import { measureRedisOperation } from "../_core/opentelemetry.js";
import { createLogger } from "./structured-logger.js";
const logger = createLogger("redis-instrumentation");
export function instrumentRedis(config) {
    const { client } = config;
    // Wrapper para métodos principais do Redis
    const methodsToInstrument = [
        'get', 'set', 'setex', 'del', 'exists', 'expire', 'ttl',
        'hget', 'hset', 'hdel', 'hgetall', 'hkeys', 'hvals',
        'lpush', 'rpush', 'lpop', 'rpop', 'lrange', 'llen',
        'sadd', 'srem', 'smembers', 'scard', 'sismember',
        'zadd', 'zrem', 'zrange', 'zcard', 'zscore',
        'incr', 'decr', 'incrby', 'decrby',
        'mget', 'mset', 'flushall', 'flushdb'
    ];
    methodsToInstrument.forEach(method => {
        if (client[method]) {
            const originalMethod = client[method];
            client[method] = function (...args) {
                const key = typeof args[0] === 'string' ? args[0] : (typeof args[0] === 'object' ? JSON.stringify(args[0]) : 'unknown');
                return measureRedisOperation(method, key, async () => {
                    try {
                        const result = await originalMethod.apply(this, args);
                        logger.debug('Redis operation executed', {
                            operation: method,
                            metadata: { key: key.substring(0, 100) },
                            argsCount: args.length,
                            success: true,
                            resultType: typeof result,
                        });
                        return result;
                    }
                    catch (error) {
                        logger.error('Redis operation failed', {
                            operation: method,
                            metadata: { key: key.substring(0, 100) },
                            argsCount: args.length,
                            success: false,
                            error: error instanceof Error ? error.message : String(error),
                        });
                        throw error;
                    }
                });
            };
        }
    });
    // Wrapper para pipeline/multi se existir
    if (client.pipeline || client.multi) {
        const pipelineMethod = client.pipeline || client.multi;
        const originalPipeline = pipelineMethod.bind(client);
        client.pipeline = function (...args) {
            return measureRedisOperation('pipeline', undefined, async () => {
                try {
                    const pipeline = originalPipeline(...args);
                    const originalExec = pipeline.exec.bind(pipeline);
                    pipeline.exec = function () {
                        return measureRedisOperation('pipeline-exec', undefined, async () => {
                            try {
                                const results = await originalExec();
                                logger.info('Redis pipeline executed', {
                                    metadata: { operationsCount: results?.length || 0 },
                                    success: true,
                                });
                                return results;
                            }
                            catch (error) {
                                logger.error('Redis pipeline failed', {
                                    success: false,
                                    error: error instanceof Error ? error.message : String(error),
                                });
                                throw error;
                            }
                        });
                    };
                    return pipeline;
                }
                catch (error) {
                    logger.error('Redis pipeline creation failed', {
                        success: false,
                        error: error instanceof Error ? error.message : String(error),
                    });
                    throw error;
                }
            });
        };
    }
    logger.info('Redis instrumentation enabled', {
        metadata: {
            instrumentedMethods: methodsToInstrument.filter(m => client[m]),
            hasPipeline: !!(client.pipeline || client.multi)
        },
    });
    return client;
}
