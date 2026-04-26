/**
 * Infraestrutura Redis - Conexão e Gerenciamento
 * 
 * Sistema de conexão com Redis para filas, cache e gerenciamento de estado
 * Reconexão automática, logs de status e tratamento robusto de erros
 */

import { EventEmitter } from "events";
import { InfrastructureError } from '../_core/errors/typed-errors.js';
import { Redis } from "ioredis";
import { logInfo, logError, logWarn } from "../utils/logger.js";
import { recordRedis } from "./metrics.js";
import { createLogger } from "./structured-logger.js";
import { instrumentRedis } from "./redis-instrumentation.js";
import { resolveRuntimeServiceHost } from "../config/runtime-host-resolver.js";
import { requireBootstrap } from "../_core/bootstrap.js";

const logger = createLogger("redis");

/**
 * Instância ioredis: os .d.ts não expõem EventEmitter/connect/status de forma estável
 * com `InstanceType<typeof Redis>` neste projeto — compomos com EventEmitter.
 */
export type IoredisClient = InstanceType<typeof Redis> &
  Pick<EventEmitter, "on" | "once" | "off" | "emit"> & {
    connect(): Promise<void>;
    status: string;
    quit(): Promise<string>;
    ping(): Promise<string>;
    info(...sections: string[]): Promise<string>;
  };

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  maxRetriesPerRequest: number;
  retryDelayOnFailover: number;
  lazyConnect: boolean;
  keepAlive: number;
  family: 4 | 6;
}

export interface RedisStatus {
  connected: boolean;
  host: string;
  port: number;
  db: number;
  memory: {
    used: number;
    peak: number;
    rss: number;
  };
  stats: {
    totalCommandsProcessed: number;
    totalConnectionsReceived: number;
    keyspaceHits: number;
    keyspaceMisses: number;
  };
  lastError?: string;
  uptime: number;
}

function parseRedisConfigFromEnv(): RedisConfig {
  const hostFromEnv = process.env.REDIS_HOST?.trim();
  const portFromEnv = process.env.REDIS_PORT?.trim();
  if (!hostFromEnv || !portFromEnv) {
    throw new InfrastructureError("REDIS_HOST e REDIS_PORT são obrigatórios");
  }
  const portNumber = Number(portFromEnv);
  if (!Number.isInteger(portNumber) || portNumber <= 0) {
    throw new InfrastructureError("REDIS_PORT inválido: deve ser inteiro positivo");
  }

  if (process.env.REDIS_URL?.trim()) {
    try {
      const redisUrl = new URL(process.env.REDIS_URL);
      const port = Number(redisUrl.port || "6379");
      const dbPart = redisUrl.pathname.replace("/", "").trim();
      const db = dbPart ? Number(dbPart) : 0;
      return {
        host: resolveRuntimeServiceHost(redisUrl.hostname, "redis"),
        port: Number.isFinite(port) ? port : 6379,
        password: redisUrl.password ? decodeURIComponent(redisUrl.password) : process.env.REDIS_PASSWORD,
        db: Number.isFinite(db) ? db : 0,
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        lazyConnect: true,
        keepAlive: 30000,
        family: 4,
      };
    } catch {
      throw new InfrastructureError("REDIS_URL inválida");
    }
  }

  return {
    host: resolveRuntimeServiceHost(hostFromEnv, "redis"),
    port: portNumber,
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || "0"),
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
  private static instance: RedisManager;
  private client: IoredisClient | null = null;
  private config: RedisConfig | null = null;
  private connectionAttempts: number = 0;
  private maxConnectionAttempts: number = 10;
  private lastConnectionTime: Date | null = null;
  private statusCache: RedisStatus | null = null;
  private statusCacheExpiry: number = 30000; // 30 segundos
  private lastHealthCheck: number = 0;
  private isHealthyCache: boolean = false;
  private initialized: boolean = false;

  private constructor() {
    // Lazy initialization - don't parse ENV or connect in constructor
    // This allows system to start without Redis configured
  }

  private ensureInitialized(): void {
    if (this.initialized) {
      return;
    }
    this.config = parseRedisConfigFromEnv();
    this.initializeClient();
    this.initialized = true;
  }

  public static getInstance(): RedisManager {
    if (!RedisManager.instance) {
      RedisManager.instance = new RedisManager();
    }
    return RedisManager.instance;
  }

  /**
   * Inicializa cliente Redis com configurações robustas
   */
  private initializeClient(): void {
    if (!this.config) {
      throw new InfrastructureError("Redis config not available - ENV not loaded");
    }
    try {
      this.client = new Redis(this.config) as IoredisClient;

      // Aplicar instrumentação OpenTelemetry (só se habilitado)
      instrumentRedis({ client: this.client });
      if (process.env.ENABLE_REDIS_TRACING === "true") {
        logger.info('Redis OpenTelemetry instrumentation enabled');
      }

      // Event handlers para monitoramento
      this.client.on('connect', () => {
        this.connectionAttempts = 0;
        this.lastConnectionTime = new Date();
        if (this.config) {
          logInfo('Redis conectado com sucesso', {
            host: this.config.host,
            port: this.config.port,
            db: this.config.db,
          });
        }
      });

      this.client.on('ready', () => {
        logInfo('Redis pronto para uso');
      });

      this.client.on('error', (error: any) => {
        logError('Redis connection error', error as Error, {
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

      this.client.on('reconnecting', (delay: any) => {
        logInfo('Redis reconectando', { delay });
      });

      this.client.on('end', () => {
        logWarn('Conexão Redis finalizada');
      });

      this.bindGlobalRedisClient();
    } catch (error) {
      logError('Falha ao inicializar cliente Redis', error as Error);
      this.client = null;
    }
  }

  /**
   * Expõe o cliente em globalThis.redis após conexão (graceful shutdown).
   */
  private bindGlobalRedisClient(): void {
    if (!this.client) return;
    void this.client
      .connect()
      .then(() => {
        globalThis.redis = this.client ?? undefined;
      })
      .catch((err: unknown) => {
        logWarn("Redis: globalThis.redis não vinculado (conexão falhou ou indisponível)", {
          message: err instanceof Error ? err.message : String(err),
        });
      });
  }

  /**
   * Obtém cliente Redis conectado
   * FAIL-HARD: nunca retorna client inválido
   */
  public getClient(): IoredisClient {
    this.ensureInitialized();
    
    if (!this.client) {
      throw new InfrastructureError("Redis client not initialized");
    }

    if (this.client.status !== "ready") {
      throw new InfrastructureError(`Redis not ready (status: ${this.client.status})`);
    }

    return this.client;
  }

  /**
   * Verifica se Redis está conectado e funcionando
   * Usa cache de 5 segundos para evitar ping excessivo
   */
  public async isConnected(): Promise<boolean> {
    this.ensureInitialized();
    return this.isHealthy();
  }

  /**
   * Verifica saúde do Redis com cache (5 segundos)
   * Evita ping excessivo em chamadas frequentes
   */
  public async isHealthy(): Promise<boolean> {
    const now = Date.now();

    // Retornar cache se válido (5 segundos)
    if (now - this.lastHealthCheck < 5000) {
      return this.isHealthyCache;
    }

    const startTime = Date.now();
    try {
      const client = this.getClient();
      const result = await client.ping();
      const duration = Date.now() - startTime;
      
      this.isHealthyCache = result === 'PONG';
      this.lastHealthCheck = now;
      
      recordRedis(duration, this.isHealthyCache);
      logger.info('Redis health check', {
        duration,
        success: this.isHealthyCache,
      });
      
      return this.isHealthyCache;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.isHealthyCache = false;
      this.lastHealthCheck = now;
      
      recordRedis(duration, false);
      logger.error('Redis health check failed', error instanceof Error ? error : new Error(String(error)), {
        duration,
      });
      logError('Falha ao verificar conexão Redis', error as Error);
      return false;
    }
  }

  /**
   * Obtém status detalhado do Redis
   */
  public async getStatus(): Promise<RedisStatus> {
    this.ensureInitialized();
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
      const memory: any = {};
      const stats: any = {};
      const server: any = {};

      infoLines.forEach((line: any) => {
        if (line.startsWith('memory_used:')) memory.used = parseInt(line.split(':')[1]);
        if (line.startsWith('memory_peak:')) memory.peak = parseInt(line.split(':')[1]);
        if (line.startsWith('used_memory_rss:')) memory.rss = parseInt(line.split(':')[1]);
        if (line.startsWith('total_commands_processed:')) stats.totalCommandsProcessed = parseInt(line.split(':')[1]);
        if (line.startsWith('total_connections_received:')) stats.totalConnectionsReceived = parseInt(line.split(':')[1]);
        if (line.startsWith('keyspace_hits:')) stats.keyspaceHits = parseInt(line.split(':')[1]);
        if (line.startsWith('keyspace_misses:')) stats.keyspaceMisses = parseInt(line.split(':')[1]);
        if (line.startsWith('uptime_in_seconds:')) server.uptime = parseInt(line.split(':')[1]);
      });

      this.statusCache = {
        connected: isConnected,
        host: this.config!.host,
        port: this.config!.port,
        db: this.config!.db,
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

    } catch (error) {
      logError('Falha ao obter status Redis', error as Error);
      
      return {
        connected: false,
        host: this.config!.host,
        port: this.config!.port,
        db: this.config!.db,
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
  public async testConnection(): Promise<{ success: boolean; message: string; latency?: number }> {
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
      } else {
        return {
          success: false,
          message: `Resposta inesperada: ${result}`,
        };
      }

    } catch (error) {
      const latency = Date.now() - startTime;
      recordRedis(latency, false);
      logger.error(
        'Redis connection test failed',
        error instanceof Error ? error : new Error(String(error)),
        { duration: latency }
      );
      return {
        success: false,
        message: `Falha ao conectar: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      };
    }
  }

  /**
   * Limpa cache de status
   */
  public clearStatusCache(): void {
    this.statusCache = null;
  }

  /**
   * Desconecta cliente Redis
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.client) {
        if (globalThis.redis === this.client) {
          globalThis.redis = undefined;
        }
        await this.client.quit();
        this.client = null;
        logInfo('Redis desconectado com sucesso');
      }
    } catch (error) {
      logError('Erro ao desconectar Redis', error as Error);
    }
  }

  /**
   * Após `globalThis.redis.quit()` no graceful shutdown — alinha singleton ao cliente encerrado.
   */
  public clearClientAfterGracefulShutdown(): void {
    this.client = null;
    this.lastConnectionTime = null;
    this.statusCache = null;
  }

  /**
   * Reinicia conexão Redis
   */
  public async restart(): Promise<void> {
    logInfo('Reiniciando conexão Redis');
    
    await this.disconnect();
    this.connectionAttempts = 0;
    this.lastConnectionTime = null;
    this.statusCache = null;
    this.initialized = false;
    
    this.ensureInitialized();
  }

  /**
   * Obtém configuração atual
   */
  public getConfig(): Omit<RedisConfig, 'password'> {
    this.ensureInitialized();
    const { password, ...safeConfig } = this.config!;
    return safeConfig;
  }

  /**
   * Estatísticas de conexão
   */
  public getConnectionStats(): {
    attempts: number;
    lastConnection: Date | null;
    status: string;
  } {
    return {
      attempts: this.connectionAttempts,
      lastConnection: this.lastConnectionTime,
      status: this.client?.status || 'disconnected'
    };
  }
}

// Lazy initialization - no singleton at import time
let redisInstance: RedisManager | null = null;

/**
 * Lazy getter for RedisManager instance
 * Initializes on first call, not at import time
 */
export function getRedis(): RedisManager {
  if (!redisInstance) {
    redisInstance = RedisManager.getInstance();
  }
  return redisInstance;
}

// Exportar cliente para uso direto
export function getRedisClient(): IoredisClient {
  requireBootstrap('redis.getRedisClient');
  return getRedis().getClient();
}

/**
 * Obtém cliente Redis configurado para BullMQ
 * BullMQ exige maxRetriesPerRequest: null para workers
 */
export function getBullMQClient(): IoredisClient {
  const config = parseRedisConfigFromEnv();
  const bullMQConfig = {
    ...config,
    maxRetriesPerRequest: null as null,
  };
  
  const client = new Redis(bullMQConfig) as IoredisClient;
  return client;
}

// Exportar funções de utilidade
export async function isRedisReady(): Promise<boolean> {
  return getRedis().isConnected();
}

export async function waitForRedis(timeout: number = 10000): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await isRedisReady()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return false;
}
