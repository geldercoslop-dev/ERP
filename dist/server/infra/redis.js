/**
 * 🔒 ARQUITETURA CONGELADA — NÃO ALTERAR
 *
 * Este arquivo faz parte da infraestrutura crítica (Redis/BullMQ).
 *
 * Regras:
 * - NÃO modificar sem autorização explícita do arquiteto
 * - NÃO refatorar
 * - NÃO trocar dependências
 * - NÃO alterar conexão Redis
 *
 * Alterações só podem ser feitas com plano aprovado.
 */
import { InfrastructureError } from '../_core/errors/typed-errors.js';
import { Redis } from "ioredis";
import { logInfo, logError, logWarn } from "../utils/logger.js";
import { recordRedis } from "./metrics.js";
import { createLogger } from "./structured-logger.js";
import { instrumentRedis } from "./redis-instrumentation.js";
import { resolveRuntimeServiceHost } from "../config/runtime-host-resolver.js";
import { parseEnv } from "../services/env.schema.js";
const logger = createLogger("redis");
function parseRedisConfigFromEnv() {
    // PRIORIDADE: REDIS_URL优先
    if (parseEnv().REDIS_URL?.trim()) {
        try {
            const redisUrl = new URL(parseEnv().REDIS_URL);
            const port = Number(redisUrl.port || "6379");
            const dbPart = redisUrl.pathname.replace("/", "").trim();
            const db = dbPart ? Number(dbPart) : 0;
            return {
                host: resolveRuntimeServiceHost(redisUrl.hostname, "redis"),
                port: Number.isFinite(port) ? port : 6379,
                password: redisUrl.password ? decodeURIComponent(redisUrl.password) : parseEnv().DB_PASSWORD,
                db: Number.isFinite(db) ? db : 0,
                maxRetriesPerRequest: 3,
                retryDelayOnFailover: 100,
                lazyConnect: true,
                keepAlive: 30000,
                family: 4,
            };
        }
        catch {
            throw new InfrastructureError("REDIS_URL inválida");
        }
    }
    // FAIL-HARD: REDIS_HOST e REDIS_PORT são obrigatórios
    const hostFromEnv = parseEnv().REDIS_HOST?.trim();
    const portFromEnv = parseEnv().REDIS_PORT?.trim();
    if (!hostFromEnv || !portFromEnv) {
        throw new InfrastructureError("REDIS_HOST e REDIS_PORT são obrigatórios - configure no .env");
    }
    if (hostFromEnv === "" || portFromEnv === "") {
        throw new InfrastructureError("REDIS_HOST e REDIS_PORT não podem estar vazios");
    }
    const portNumber = Number(portFromEnv);
    if (!Number.isInteger(portNumber) || portNumber <= 0) {
        throw new InfrastructureError("REDIS_PORT inválido: deve ser inteiro positivo");
    }
    return {
        host: resolveRuntimeServiceHost(hostFromEnv, "redis"),
        port: portNumber,
        password: parseEnv().DB_PASSWORD,
        db: 0,
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        lazyConnect: true,
        keepAlive: 30000,
        family: 4,
    };
}
/**
 * Gerenciador de conexão Redis
 */
class RedisManager {
    static instance;
    client = null;
    config;
    connectionAttempts = 0;
    maxConnectionAttempts = 10;
    lastConnectionTime = null;
    statusCache = null;
    statusCacheExpiry = 30000; // 30 segundos
    constructor() {
        this.config = parseRedisConfigFromEnv();
        this.initializeClient();
    }
    static getInstance() {
        if (!RedisManager.instance) {
            RedisManager.instance = new RedisManager();
        }
        return RedisManager.instance;
    }
    /**
     * Inicializa cliente Redis com configurações robustas
     */
    initializeClient() {
        try {
            this.client = new Redis(this.config);
            // Aplicar instrumentação OpenTelemetry
            instrumentRedis({ client: this.client });
            logger.info('Redis OpenTelemetry instrumentation enabled');
            // Event handlers para monitoramento
            this.client.on('connect', () => {
                this.connectionAttempts = 0;
                this.lastConnectionTime = new Date();
                logInfo('Redis conectado com sucesso', {
                    host: this.config.host,
                    port: this.config.port,
                    db: this.config.db,
                });
            });
            this.client.on('ready', () => {
                logInfo('Redis pronto para uso');
            });
            this.client.on('error', (error) => {
                logError('Redis connection error', error, {
                    connectionAttempts: this.connectionAttempts,
                    errorMessage: error?.message
                });
                this.connectionAttempts++;
            });
            this.client.on('close', () => {
                logWarn('Redis connection closed');
                this.lastConnectionTime = null;
                logWarn('Conexão Redis fechada');
            });
            this.client.on('reconnecting', (delay) => {
                logInfo('Redis reconectando', { delay });
            });
            this.client.on('end', () => {
                logWarn('Conexão Redis finalizada');
            });
            this.bindGlobalRedisClient();
        }
        catch (error) {
            logError('Falha ao inicializar cliente Redis', error);
            this.client = null;
        }
    }
    /**
     * Expõe o cliente em globalThis.redis após conexão (graceful shutdown).
     */
    bindGlobalRedisClient() {
        if (!this.client)
            return;
        void this.client
            .connect()
            .then(() => {
            globalThis.redis = this.client ?? undefined;
        })
            .catch((err) => {
            logWarn("Redis: globalThis.redis não vinculado (conexão falhou ou indisponível)", {
                message: err instanceof Error ? err.message : String(err),
            });
        });
    }
    /**
     * Obtém cliente Redis conectado
     */
    getClient() {
        if (!this.client) {
            logError('Cliente Redis não inicializado');
            return null;
        }
        if (this.client.status !== "ready") {
            logWarn("Redis não está pronto", { status: this.client.status });
        }
        return this.client;
    }
    /**
     * Verifica se Redis está conectado e funcionando
     */
    async isConnected() {
        const startTime = Date.now();
        try {
            const client = this.getClient();
            if (!client)
                return false;
            const result = await client.ping();
            const duration = Date.now() - startTime;
            recordRedis(duration, result === 'PONG');
            logger.info('Redis ping', {
                duration,
                success: result === 'PONG',
            });
            return result === 'PONG';
        }
        catch (error) {
            const duration = Date.now() - startTime;
            recordRedis(duration, false);
            logger.error('Redis ping failed', error instanceof Error ? error : new Error(String(error)), {
                duration,
            });
            logError('Falha ao verificar conexão Redis', error);
            return false;
        }
    }
    /**
     * Obtém status detalhado do Redis
     */
    async getStatus() {
        const now = Date.now();
        // Usar cache se ainda válido
        if (this.statusCache && (now - this.statusCache.uptime) < this.statusCacheExpiry) {
            return this.statusCache;
        }
        try {
            const client = this.getClient();
            if (!client) {
                throw new InfrastructureError('Cliente Redis não disponível');
            }
            const [info, ping] = await Promise.all([
                client.info("memory", "stats", "server"),
                client.ping(),
            ]);
            const isConnected = ping === 'PONG';
            // Parse do INFO do Redis
            const infoLines = info.split('\r\n');
            const memory = {};
            const stats = {};
            const server = {};
            infoLines.forEach((line) => {
                if (line.startsWith('memory_used:'))
                    memory.used = parseInt(line.split(':')[1]);
                if (line.startsWith('memory_peak:'))
                    memory.peak = parseInt(line.split(':')[1]);
                if (line.startsWith('used_memory_rss:'))
                    memory.rss = parseInt(line.split(':')[1]);
                if (line.startsWith('total_commands_processed:'))
                    stats.totalCommandsProcessed = parseInt(line.split(':')[1]);
                if (line.startsWith('total_connections_received:'))
                    stats.totalConnectionsReceived = parseInt(line.split(':')[1]);
                if (line.startsWith('keyspace_hits:'))
                    stats.keyspaceHits = parseInt(line.split(':')[1]);
                if (line.startsWith('keyspace_misses:'))
                    stats.keyspaceMisses = parseInt(line.split(':')[1]);
                if (line.startsWith('uptime_in_seconds:'))
                    server.uptime = parseInt(line.split(':')[1]);
            });
            this.statusCache = {
                connected: isConnected,
                host: this.config.host,
                port: this.config.port,
                db: this.config.db,
                memory: {
                    used: memory.used || 0,
                    peak: memory.peak || 0,
                    rss: memory.rss || 0,
                },
                stats: {
                    totalCommandsProcessed: stats.totalCommandsProcessed || 0,
                    totalConnectionsReceived: stats.totalConnectionsReceived || 0,
                    keyspaceHits: stats.keyspaceHits || 0,
                    keyspaceMisses: stats.keyspaceMisses || 0,
                },
                uptime: server.uptime || 0,
            };
            return this.statusCache;
        }
        catch (error) {
            logError('Falha ao obter status Redis', error);
            return {
                connected: false,
                host: this.config.host,
                port: this.config.port,
                db: this.config.db,
                memory: { used: 0, peak: 0, rss: 0 },
                stats: {
                    totalCommandsProcessed: 0,
                    totalConnectionsReceived: 0,
                    keyspaceHits: 0,
                    keyspaceMisses: 0,
                },
                uptime: 0,
                lastError: error instanceof Error ? error.message : 'Erro desconhecido',
            };
        }
    }
    /**
     * Testa conexão com Redis
     */
    async testConnection() {
        const startTime = Date.now();
        try {
            const client = this.getClient();
            if (!client) {
                return {
                    success: false,
                    message: 'Cliente Redis não inicializado',
                };
            }
            const result = await client.ping();
            const latency = Date.now() - startTime;
            recordRedis(latency, result === 'PONG');
            if (result === 'PONG') {
                return {
                    success: true,
                    message: 'Redis conectado e respondendo',
                    latency,
                };
            }
            else {
                return {
                    success: false,
                    message: `Resposta inesperada: ${result}`,
                };
            }
        }
        catch (error) {
            const latency = Date.now() - startTime;
            recordRedis(latency, false);
            logger.error('Redis connection test failed', error instanceof Error ? error : new Error(String(error)), { duration: latency });
            return {
                success: false,
                message: `Falha ao conectar: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
            };
        }
    }
    /**
     * Limpa cache de status
     */
    clearStatusCache() {
        this.statusCache = null;
    }
    /**
     * Desconecta cliente Redis
     */
    async disconnect() {
        try {
            if (this.client) {
                if (globalThis.redis === this.client) {
                    globalThis.redis = undefined;
                }
                await this.client.quit();
                this.client = null;
                logInfo('Redis desconectado com sucesso');
            }
        }
        catch (error) {
            logError('Erro ao desconectar Redis', error);
        }
    }
    /**
     * Após `globalThis.redis.quit()` no graceful shutdown — alinha singleton ao cliente encerrado.
     */
    clearClientAfterGracefulShutdown() {
        this.client = null;
        this.lastConnectionTime = null;
        this.statusCache = null;
    }
    /**
     * Reinicia conexão Redis
     */
    async restart() {
        logInfo('Reiniciando conexão Redis');
        await this.disconnect();
        this.connectionAttempts = 0;
        this.lastConnectionTime = null;
        this.statusCache = null;
        this.initializeClient();
    }
    /**
     * Obtém configuração atual
     */
    getConfig() {
        const { password, ...safeConfig } = this.config;
        return safeConfig;
    }
    /**
     * Estatísticas de conexão
     */
    getConnectionStats() {
        return {
            attempts: this.connectionAttempts,
            lastConnection: this.lastConnectionTime,
            status: this.client?.status || 'disconnected'
        };
    }
}
// Exportar instância singleton
export const redisManager = RedisManager.getInstance();
// Exportar cliente para uso direto
export function getRedisClient() {
    return redisManager.getClient();
}
// Exportar funções de utilidade
export async function isRedisReady() {
    return redisManager.isConnected();
}
export async function waitForRedis(timeout = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        if (await isRedisReady()) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    return false;
}
