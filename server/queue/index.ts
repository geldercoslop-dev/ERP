/**
 * Inicialização do Sistema de Filas - Queue System Bootstrap
 * 
 * Inicializa Redis, filas BullMQ e workers de forma ordenada
 * Garante que tudo esteja pronto antes de aceitar jobs
 */

import { redisManager } from '../infra/redis';
import { queueManager } from './queue';
import { workerManager } from './worker-simple';
import { logInfo, logError, logWarn } from '../_core/logger';

export interface QueueSystemStatus {
  redis: {
    connected: boolean;
    latency?: number;
    error?: string;
  };
  queues: {
    initialized: boolean;
    count: number;
    names: string[];
  };
  workers: {
    initialized: boolean;
    count: number;
    active: string[];
  };
  ready: boolean;
  uptime: number;
}

/**
 * Gerenciador de inicialização do sistema de filas
 */
class QueueSystemBootstrap {
  private static instance: QueueSystemBootstrap;
  private startTime: Date;
  private initialized: boolean = false;
  private status: QueueSystemStatus;

  private constructor() {
    this.startTime = new Date();
    this.status = this.createEmptyStatus();
  }

  public static getInstance(): QueueSystemBootstrap {
    if (!QueueSystemBootstrap.instance) {
      QueueSystemBootstrap.instance = new QueueSystemBootstrap();
    }
    return QueueSystemBootstrap.instance;
  }

  private createEmptyStatus(): QueueSystemStatus {
    return {
      redis: { connected: false },
      queues: { initialized: false, count: 0, names: [] },
      workers: { initialized: false, count: 0, active: [] },
      ready: false,
      uptime: 0,
    };
  }

  /**
   * Inicializa todo o sistema de filas
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      logWarn('Sistema de filas já inicializado');
      return;
    }

    try {
      logInfo('Iniciando sistema de filas...');

      // 1. Testar conexão Redis
      await this.initializeRedis();

      // 2. Inicializar filas
      await this.initializeQueues();

      // 3. Inicializar workers
      await this.initializeWorkers();

      // 4. Atualizar status
      this.updateStatus();
      this.initialized = true;

      logInfo('Sistema de filas inicializado com sucesso', {
        redisConnected: this.status.redis.connected,
        queuesCount: this.status.queues.count,
        workersCount: this.status.workers.count,
      });

    } catch (error) {
      logError('Falha na inicialização do sistema de filas', error);
      throw error;
    }
  }

  /**
   * Inicializa conexão Redis
   */
  private async initializeRedis(): Promise<void> {
    try {
      logInfo('Testando conexão Redis...');
      
      const redisTest = await redisManager.testConnection();
      
      if (!redisTest.success) {
        throw new Error(`Redis não conectado: ${redisTest.message}`);
      }

      this.status.redis = {
        connected: true,
        latency: redisTest.latency,
      };

      logInfo('Redis conectado com sucesso', {
        latency: redisTest.latency,
      });

    } catch (error) {
      this.status.redis = {
        connected: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
      throw error;
    }
  }

  /**
   * Inicializa filas BullMQ
   */
  private async initializeQueues(): Promise<void> {
    try {
      logInfo('Inicializando filas BullMQ...');
      
      await queueManager.initialize();
      
      const queueNames = queueManager.getQueueNames();
      
      this.status.queues = {
        initialized: true,
        count: queueNames.length,
        names: queueNames,
      };

      logInfo('Filas inicializadas com sucesso', {
        count: queueNames.length,
        names: queueNames,
      });

    } catch (error) {
      this.status.queues.initialized = false;
      throw error;
    }
  }

  /**
   * Inicializa workers
   */
  private async initializeWorkers(): Promise<void> {
    try {
      logInfo('Inicializando workers...');
      
      await workerManager.initialize();
      
      const activeWorkers = workerManager.getActiveWorkers();
      
      this.status.workers = {
        initialized: true,
        count: activeWorkers.length,
        active: activeWorkers,
      };

      logInfo('Workers inicializados com sucesso', {
        count: activeWorkers.length,
        active: activeWorkers,
      });

    } catch (error) {
      this.status.workers.initialized = false;
      throw error;
    }
  }

  /**
   * Atualiza status completo do sistema
   */
  private updateStatus(): void {
    this.status.ready = (
      this.status.redis.connected &&
      this.status.queues.initialized &&
      this.status.workers.initialized
    );
    this.status.uptime = Date.now() - this.startTime.getTime();
  }

  /**
   * Obtém status atual do sistema
   */
  public async getStatus(): Promise<QueueSystemStatus> {
    if (!this.initialized) {
      return this.status;
    }

    try {
      // Atualizar status Redis
      const redisConnected = await redisManager.isConnected();
      this.status.redis.connected = redisConnected;

      // Atualizar status filas
      this.status.queues.initialized = queueManager.isReady();
      this.status.queues.names = queueManager.getQueueNames();
      this.status.queues.count = this.status.queues.names.length;

      // Atualizar status workers
      this.status.workers.initialized = workerManager.isReady();
      this.status.workers.active = workerManager.getActiveWorkers();
      this.status.workers.count = this.status.workers.active.length;

      // Atualizar status geral
      this.updateStatus();

    } catch (error) {
      logError('Erro ao atualizar status do sistema de filas', error);
    }

    return { ...this.status };
  }

  /**
   * Verifica saúde do sistema
   */
  public async healthCheck(): Promise<{
    healthy: boolean;
    checks: {
      redis: boolean;
      queues: boolean;
      workers: boolean;
    };
    errors: string[];
  }> {
    const errors: string[] = [];
    
    const checks = {
      redis: this.status.redis.connected,
      queues: this.status.queues.initialized,
      workers: this.status.workers.initialized,
    };

    if (!checks.redis) {
      errors.push('Redis não conectado');
    }

    if (!checks.queues) {
      errors.push('Filas não inicializadas');
    }

    if (!checks.workers) {
      errors.push('Workers não inicializados');
    }

    return {
      healthy: errors.length === 0,
      checks,
      errors,
    };
  }

  /**
   * Reinicia o sistema completo
   */
  public async restart(): Promise<void> {
    logInfo('Reiniciando sistema de filas...');

    try {
      // 1. Parar workers
      await workerManager.shutdown();

      // 2. Fechar filas
      await queueManager.shutdown();

      // 3. Reiniciar Redis
      await redisManager.restart();

      // 4. Reinicializar tudo
      await this.initialize();

      logInfo('Sistema de filas reiniciado com sucesso');

    } catch (error) {
      logError('Falha ao reiniciar sistema de filas', error);
      throw error;
    }
  }

  /**
   * Encerra o sistema completo
   */
  public async shutdown(): Promise<void> {
    logInfo('Encerrando sistema de filas...');

    try {
      await workerManager.shutdown();
      await queueManager.shutdown();
      await redisManager.disconnect();

      this.initialized = false;
      this.status = this.createEmptyStatus();

      logInfo('Sistema de filas encerrado com sucesso');

    } catch (error) {
      logError('Falha ao encerrar sistema de filas', error);
      throw error;
    }
  }

  /**
   * Verifica se o sistema está pronto
   */
  public isReady(): boolean {
    return this.initialized && this.status.ready;
  }

  /**
   * Obtém tempo de uptime
   */
  public getUptime(): number {
    return Date.now() - this.startTime.getTime();
  }
}

// Exportar instância singleton
export const queueSystem = QueueSystemBootstrap.getInstance();

// Exportar funções de utilidade
export async function initializeQueueSystem(): Promise<void> {
  await queueSystem.initialize();
}

export async function getQueueSystemStatus(): Promise<QueueSystemStatus> {
  return await queueSystem.getStatus();
}

export async function healthCheckQueueSystem(): Promise<{
  healthy: boolean;
  checks: any;
  errors: string[];
}> {
  return await queueSystem.healthCheck();
}

export async function restartQueueSystem(): Promise<void> {
  await queueSystem.restart();
}

export async function shutdownQueueSystem(): Promise<void> {
  await queueSystem.shutdown();
}
