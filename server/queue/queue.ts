/**
 * Sistema de Filas - BullMQ Queue Manager
 * 
 * Gerencia filas de processamento para operações pesadas e assíncronas
 * Isola a API de tarefas demoradas (OCR, screenshots, análises)
 * Inclui fila global tipada com LeoTask.
 */

import { Queue, Job } from "bullmq";

/**
 * Opções do construtor `Queue` (equivalente a `QueueOptions` do pacote).
 * Import direto de `QueueOptions` falha quando `compilerOptions.types` é restrito no tsconfig do servidor.
 */
type BullMQQueueOptions = NonNullable<ConstructorParameters<typeof Queue>[1]>;
import { getRedisClient } from '../infra/redis.js';
import { logInfo, logError, logWarn } from '../_core/logger-rotation.js';
import type { LeoTask, Payload } from "../../shared/types/index.js";
import {
  generateJobIdempotencyKey,
  wasJobExecuted,
} from './idempotency.js';
import { executeJobWithLimits } from './rate-limiter.js';

/** Payload genérico de jobs (alinhado a `shared/types` Payload) */
export type QueuePayload = Payload;

/** Payload genérico para jobs do sistema */
export type JobPayload = Record<string, unknown>;

/** Job tipado da fila — padrão para todos os jobs */
export interface QueueJob {
  id: string;
  type: string;
  payload: Payload;
  createdAt: Date;
}

/** Fila global do sistema, alinhada com LeoTask */
const systemQueue: LeoTask[] = [];

/**
 * Adiciona uma tarefa à fila global.
 */
function enqueue(task: LeoTask): void {
  systemQueue.push(task);
}

/**
 * Processa a fila global (consome tarefas em ordem).
 */
async function processQueue(): Promise<void> {
  while (systemQueue.length > 0) {
    const task = systemQueue.shift();
    if (!task) break;
    try {
      logInfo(`[systemQueue] Processando tarefa ${task.id}`, { type: task.type });
      // Processamento delegado aos workers por tipo; aqui apenas drena a fila
    } catch (err: unknown) {
      logError(`[systemQueue] Erro ao processar tarefa ${task.id}`, err);
    }
  }
}

type QueueConfigOptions = { connection?: unknown; defaultJobOptions?: { attempts?: number; backoff?: { type?: string; delay?: number }; removeOnComplete?: number; removeOnFail?: number; delay?: number }; settings?: unknown };

export interface QueueConfig {
  name: string;
  defaultJobOptions?: QueueConfigOptions['defaultJobOptions'];
  settings?: QueueConfigOptions['settings'];
}

export interface WorkerConfig {
  name: string;
  concurrency: number;
  maxStalledCount: number;
  stalledInterval: number;
}

export interface QueueJobData {
  type: string;
  payload: Payload;
  userId?: string;
  traceId?: string;
  priority?: number;
  delay?: number;
  attempts?: number;
  entity?: string;
  entityId?: string;
  idempotencyKey?: string;
}

export interface JobData extends QueueJobData {}

export interface JobResult {
  success: boolean;
  data?: unknown;
  error?: string;
  executionTime: number;
  processedAt: Date;
  /** Alias usado em jobs; equivale a executionTime em ms. */
  processingTime?: number;
}

export type QueueStats = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
};

/**
 * Nomes das filas do sistema
 */
export const QUEUE_NAMES = {
  OCR: 'ocr-processing',
  SCREENSHOT: 'screenshot-capture', 
  LEO_ANALYSIS: 'leo-analysis',
  REPORT_GENERATION: 'report-generation',
  DESKTOP_AUTOMATION: 'desktop-automation',
  NOTIFICATIONS: 'notifications',
  BACKUP: 'backup-operations',
  CLEANUP: 'cleanup-operations',
} as const;

/**
 * Gerenciador de filas BullMQ
 */
class QueueManager {
  private static instance: QueueManager;
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, { close: () => Promise<void> }> = new Map();
  private isInitialized: boolean = false;

  private constructor() {}

  public static getInstance(): QueueManager {
    if (!QueueManager.instance) {
      QueueManager.instance = new QueueManager();
    }
    return QueueManager.instance;
  }

  /**
   * Inicializa todas as filas do sistema
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      logWarn('QueueManager já inicializado');
      return;
    }

    try {
      const redisClient = getRedisClient();
      if (!redisClient) {
        throw new Error('Cliente Redis não disponível');
      }

      // Configurações padrão para todas as filas
      const defaultQueueConfig: QueueConfigOptions = {
        connection: redisClient,
        defaultJobOptions: {
          removeOnComplete: 100, // Manter 100 jobs completos
          removeOnFail: 50,      // Manter 50 jobs falhos
          attempts: 3,           // 3 tentativas
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      };

      // Inicializar filas individuais com configurações específicas
      await this.createQueue(QUEUE_NAMES.OCR, {
        ...defaultQueueConfig,
        defaultJobOptions: {
          ...defaultQueueConfig.defaultJobOptions,
          attempts: 2, // OCR pode falhar por imagem corrompida
          backoff: {
            type: 'fixed',
            delay: 5000,
          },
        },
      });

      await this.createQueue(QUEUE_NAMES.SCREENSHOT, {
        ...defaultQueueConfig,
        defaultJobOptions: {
          ...defaultQueueConfig.defaultJobOptions,
          attempts: 3,
        },
      });

      await this.createQueue(QUEUE_NAMES.LEO_ANALYSIS, {
        ...defaultQueueConfig,
        defaultJobOptions: {
          ...defaultQueueConfig.defaultJobOptions,
          attempts: 2, // Análises podem ser repetidas
          delay: 1000, // Pequeno delay para evitar sobrecarga
        },
      });

      await this.createQueue(QUEUE_NAMES.REPORT_GENERATION, {
        ...defaultQueueConfig,
        defaultJobOptions: {
          ...defaultQueueConfig.defaultJobOptions,
          attempts: 1, // Relatórios falham geralmente por dados ausentes
        },
      });

      await this.createQueue(QUEUE_NAMES.DESKTOP_AUTOMATION, {
        ...defaultQueueConfig,
        defaultJobOptions: {
          ...defaultQueueConfig.defaultJobOptions,
          attempts: 2,
          removeOnComplete: 50, // Manter menos jobs de automação
        },
      });

      await this.createQueue(QUEUE_NAMES.NOTIFICATIONS, {
        ...defaultQueueConfig,
        defaultJobOptions: {
          ...defaultQueueConfig.defaultJobOptions,
          attempts: 5, // Notificações devem tentar mais
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      });

      await this.createQueue(QUEUE_NAMES.BACKUP, {
        ...defaultQueueConfig,
        defaultJobOptions: {
          ...defaultQueueConfig.defaultJobOptions,
          attempts: 1,
          removeOnComplete: 10, // Manter poucos backups
        },
      });

      await this.createQueue(QUEUE_NAMES.CLEANUP, {
        ...defaultQueueConfig,
        defaultJobOptions: {
          ...defaultQueueConfig.defaultJobOptions,
          attempts: 1,
          removeOnComplete: 5,
        },
      });

      this.isInitialized = true;
      logInfo('QueueManager inicializado com sucesso', {
        queues: Array.from(this.queues.keys()) as string[],
      });

    } catch (error: unknown) {
      logError('Falha ao inicializar QueueManager', error);
      throw error;
    }
  }

  /**
   * Cria uma fila específica
   */
  private async createQueue(name: string, config: QueueConfigOptions): Promise<void> {
    try {
      const queue = new Queue<JobData, JobResult, string>(name, config as BullMQQueueOptions);
      
      if (queue?.on !== undefined) {
        queue.on('error', (error: unknown) => {
          logError(`Erro na fila ${name}`, error);
        });
      }

      // Outros eventos desabilitados temporariamente para evitar erros de tipo

      this.queues.set(name, queue);
      logInfo(`Fila ${name} criada com sucesso`);

    } catch (error: unknown) {
      logError(`Falha ao criar fila ${name}`, error);
      throw error;
    }
  }

  /**
   * Obtém uma fila pelo nome
   */
  public getQueue(name: string): Queue | undefined {
    return this.queues.get(name);
  }

  /**
   * Adiciona job a uma fila com proteção de idempotência
   */
  public async addJob(
    queueName: string,
    jobName: string,
    data: JobData,
    options?: {
      priority?: number;
      delay?: number;
      removeOnComplete?: number;
      removeOnFail?: number;
    }
  ): Promise<Job | null> {
    try {
      const queue = this.getQueue(queueName);
      if (!queue) {
        throw new Error(`Fila ${queueName} não encontrada`);
      }

      const payload = data.payload as QueuePayload;
      // Verificar rate limit antes de adicionar
      const canExecute = await executeJobWithLimits(
        data.type,
        data.entity,
        data.entityId,
        payload,
        async () => { return; } // Callback void para verificação
      );
      
      if (!canExecute) {
        logInfo(`Job bloqueado por rate limit`, {
          queueName,
          jobName,
          type: data.type,
          entity: data.entity,
          entityId: data.entityId,
        });
        return null;
      }

      // Gerar chave de idempotência se não fornecida
      let idempotencyKey = data.idempotencyKey;
      if (!idempotencyKey) {
        idempotencyKey = generateJobIdempotencyKey({
          jobType: data.type,
          entity: data.entity,
          entityId: data.entityId,
          payload,
          userId: data.userId,
        });
      }

      // Verificar se job já foi executado
      const alreadyExecuted = await wasJobExecuted(idempotencyKey);
      if (alreadyExecuted) {
        logInfo(`Job já executado, ignorando`, {
          queueName,
          jobName,
          idempotencyKey,
          type: data.type,
        });
        return null;
      }

      // Adicionar job com idempotencyKey como ID
      const job = await queue.add(
        jobName,
        { ...data, idempotencyKey },
        {
          priority: options?.priority ?? 0,
          delay: options?.delay ?? 0,
          removeOnComplete: options?.removeOnComplete,
          removeOnFail: options?.removeOnFail,
        }
      );

      logInfo(`Job adicionado à fila ${queueName}`, {
        jobId: job.id,
        jobName,
        type: data.type,
        idempotencyKey,
        priority: options?.priority,
      });

      return job;

    } catch (error) {
      logError(`Falha ao adicionar job à fila ${queueName}`, error);
      throw error;
    }
  }

  /**
   * Obtém estatísticas de uma fila
   */
  public async getQueueStats(queueName: string): Promise<QueueStats> {
    try {
      const queue = this.getQueue(queueName);
      if (!queue) {
        throw new Error(`Fila ${queueName} não encontrada`);
      }

      const q = queue as { getWaitingCount?: () => Promise<number>; getActiveCount?: () => Promise<number>; getCompletedCount?: () => Promise<number>; getFailedCount?: () => Promise<number>; getDelayedCount?: () => Promise<number>; isPaused?: () => Promise<boolean> };
      const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
        typeof q.getWaitingCount === 'function' ? q.getWaitingCount() : Promise.resolve(0),
        typeof q.getActiveCount === 'function' ? q.getActiveCount() : Promise.resolve(0),
        typeof q.getCompletedCount === 'function' ? q.getCompletedCount() : Promise.resolve(0),
        typeof q.getFailedCount === 'function' ? q.getFailedCount() : Promise.resolve(0),
        typeof q.getDelayedCount === 'function' ? q.getDelayedCount() : Promise.resolve(0),
        typeof q.isPaused === 'function' ? q.isPaused() : Promise.resolve(false),
      ]);

      return {
        waiting: typeof waiting === 'number' ? waiting : 0,
        active: typeof active === 'number' ? active : 0,
        completed: typeof completed === 'number' ? completed : 0,
        failed: typeof failed === 'number' ? failed : 0,
        delayed: typeof delayed === 'number' ? delayed : 0,
        paused: Boolean(paused),
      };

    } catch (error: unknown) {
      logError(`Falha ao obter estatísticas da fila ${queueName}`, error);
      throw error;
    }
  }

  /**
   * Obtém estatísticas de todas as filas
   */
  public async getAllQueueStats(): Promise<Record<string, QueueStats | { error: string }>> {
    const stats: Record<string, QueueStats | { error: string }> = {};

    const names = Object.values(QUEUE_NAMES) as string[];
    for (const queueName of names) {
      try {
        stats[queueName] = await this.getQueueStats(queueName);
      } catch (error) {
        stats[queueName] = { error: error instanceof Error ? error.message : 'Erro desconhecido' };
      }
    }

    return stats;
  }

  /**
   * Pausa uma fila
   */
  public async pauseQueue(queueName: string): Promise<void> {
    try {
      const queue = this.getQueue(queueName);
      if (!queue) {
        throw new Error(`Fila ${queueName} não encontrada`);
      }

      await queue.pause();
      logInfo(`Fila ${queueName} pausada`);

    } catch (error) {
      logError(`Falha ao pausar fila ${queueName}`, error);
      throw error;
    }
  }

  /**
   * Resume uma fila
   */
  public async resumeQueue(queueName: string): Promise<void> {
    try {
      const queue = this.getQueue(queueName);
      if (!queue) {
        throw new Error(`Fila ${queueName} não encontrada`);
      }

      await queue.resume();
      logInfo(`Fila ${queueName} resumida`);

    } catch (error: unknown) {
      logError(`Falha ao resumir fila ${queueName}`, error);
      throw error;
    }
  }

  /**
   * Limpa uma fila (remove todos os jobs)
   */
  public async clearQueue(queueName: string): Promise<void> {
    try {
      const queue = this.getQueue(queueName);
      if (!queue) {
        throw new Error(`Fila ${queueName} não encontrada`);
      }

      if (queue && typeof queue.drain === 'function') {
        await queue.drain();
      }
      logInfo(`Fila ${queueName} limpa`);

    } catch (error) {
      logError(`Falha ao limpar fila ${queueName}`, error);
      throw error;
    }
  }

  /**
   * Encerra todas as filas e workers
   */
  public async shutdown(): Promise<void> {
    try {
      logInfo('Encerrando QueueManager...');

      // Parar todos os workers
      for (const [name, worker] of Array.from(this.workers.entries())) {
        await worker.close();
        logInfo(`Worker ${name} encerrado`);
      }
      this.workers.clear();

      // Fechar todas as filas
      for (const [name, queue] of Array.from(this.queues.entries())) {
        await queue.close();
        logInfo(`Fila ${name} encerrada`);
      }
      this.queues.clear();

      this.isInitialized = false;
      logInfo('QueueManager encerrado com sucesso');

    } catch (error: unknown) {
      logError('Falha ao encerrar QueueManager', error);
      throw error;
    }
  }

  /**
   * Verifica se o sistema está inicializado
   */
  public isReady(): boolean {
    return this.isInitialized && this.queues.size > 0;
  }

  /**
   * Lista todas as filas disponíveis
   */
  public getQueueNames(): string[] {
    return Array.from(this.queues.keys());
  }
}

// Exportar instância singleton
export const queueManager = QueueManager.getInstance();

// Exportar funções de utilidade
export async function initializeQueues(): Promise<void> {
  await queueManager.initialize();
}

export function getQueue(queueName: string): Queue | undefined {
  return queueManager.getQueue(queueName);
}

export { enqueue, processQueue };

export async function addJobToQueue(
  queueName: string,
  jobName: string,
  data: JobData,
  options?: {
    priority?: number;
    delay?: number;
  }
): Promise<Job<JobData, JobResult, string> | null> {
  return queueManager.addJob(queueName, jobName, data, options) as Promise<
    Job<JobData, JobResult, string> | null
  >;
}
