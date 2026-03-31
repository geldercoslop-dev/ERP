/**
 * Infraestrutura Redis - Conexão e Gerenciamento
 * 
 * Sistema de conexão com Redis para filas, cache e gerenciamento de estado
 * Reconexão automática, logs de status e tratamento robusto de erros
 */

import { EventEmitter } from "events";
import { Redis } from "ioredis";
import { logInfo, logError, logWarn } from "../utils/logger.js";
import { recordRedis } from "./metrics.js";
import { createLogger } from "./structured-logger.js";
import { instrumentRedis } from "./redis-instrumentation.js";
import { resolveRuntimeServiceHost } from "../config/runtime-host-resolver.js";

const logger = createLogger("redis");

/**
 * Instância ioredis: os .d.ts não expõem EventEmitter/connect/status de forma estável
 * com `InstanceType<typeof Redis>` neste projeto — compomos com EventEmitter.
 */
type IoredisClient = InstanceType<typeof Redis> &
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
      logWarn("REDIS_URL inválida; usando REDIS_HOST/REDIS_PORT.");
    }
  }

  return {
    host: resolveRuntimeServiceHost(process.env.REDIS_HOST || "localhost", "redis"),
    port: parseInt(process.env.REDIS_PORT || "6379"),
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
  private config: RedisConfig;
  private connectionAttempts: number = 0;
  private maxConnectionAttempts: number = 10;
  private lastConnectionTime: Date | null = null;
  private statusCache: RedisStatus | null = null;
  private statusCacheExpiry: number = 30000; // 30 segundos

  private constructor() {
    this.config = parseRedisConfigFromEnv();

    this.initializeClient();
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
    try {
      this.client = new Redis(this.config) as IoredisClient;

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
   */
  public getClient(): IoredisClient | null {
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
  public async isConnected(): Promise<boolean> {
    const startTime = Date.now();
    try {
      const client = this.getClient();
      if (!client) return false;

      const result = await client.ping();
      const duration = Date.now() - startTime;
      recordRedis(duration, result === 'PONG');
      logger.info('Redis ping', {
        duration,
        success: result === 'PONG',
      });
      return result === 'PONG';
    } catch (error) {
      const duration = Date.now() - startTime;
      recordRedis(duration, false);
      logger.error('Redis ping failed', error instanceof Error ? error : new Error(String(error)), {
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
    const now = Date.now();
    
    // Usar cache se ainda válido
    if (this.statusCache && (now - this.statusCache.uptime) < this.statusCacheExpiry) {
      return this.statusCache;
    }

    try {
      const client = this.getClient();
      if (!client) {
        throw new Error('Cliente Redis não disponível');
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

    } catch (error) {
      logError('Falha ao obter status Redis', error as Error);
      
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
    
    this.initializeClient();
  }

  /**
   * Obtém configuração atual
   */
  public getConfig(): Omit<RedisConfig, 'password'> {
    const { password, ...safeConfig } = this.config;
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

// Exportar instância singleton
export const redisManager = RedisManager.getInstance();

// Exportar cliente para uso direto
export function getRedisClient(): IoredisClient | null {
  return redisManager.getClient();
}

// Exportar funções de utilidade
export async function isRedisReady(): Promise<boolean> {
  return redisManager.isConnected();
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
