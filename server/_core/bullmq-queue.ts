/**
 * BullMQ Queue System
 * 
 * Migração do sistema de fila para BullMQ com Redis
 * Mantém compatibilidade com interface existente
 */

import { Queue, Worker, QueueEvents } from 'bullmq';
import { redis as connection } from '../core/redis.service.js';
import { ValidationError } from './errors/typed-errors.js';

// Tipos para jobs
export interface BullMQJob<T = unknown> {
  id: string;
  name: string;
  data: T;
  opts: {
    delay?: number;
    attempts?: number;
    backoff?: {
      type: string;
      delay: number;
    };
    priority?: number;
  };
  progress: number;
  returnvalue?: unknown;
  failedReason?: string;
  processedOn?: number;
  finishedOn?: number;
}

// Payload obrigatório para todos os jobs
export interface QueueJobData {
  tenantId: number;
  traceId: string;
  data: unknown;
}

// Interface do handler
export type QueueHandler<T = unknown> = (job: BullMQJob<T>) => Promise<void>;

function startWorkers<T = unknown>(
  queueName: string,
  handler: QueueHandler<T>,
  options: {
    concurrency?: number;
    autorun?: boolean;
  } = {}
): Worker {
  return new Worker(
    queueName,
    async (job) => {
      try {
        // Validar tenant antes de processar
        const jobData = job.data as QueueJobData;
        if (!jobData.tenantId) {
          throw new ValidationError('Job missing tenantId');
        }

        console.log(`[BullMQ] Processing job: ${job.id} (tenant: ${jobData.tenantId}, trace: ${jobData.traceId})`);

        // Executar handler
        await handler(job as BullMQJob<T>);

        console.log(`[BullMQ] Job completed: ${job.id}`);
      } catch (error) {
        console.error(`[BullMQ] Job failed: ${job.id}`, error);
        throw error;
      }
    },
    {
      connection,
      concurrency: options.concurrency || 1,
      autorun: options.autorun !== false,
    }
  );
}

// Classe principal do Queue Manager
export class BullMQQueueManager {
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private events: Map<string, QueueEvents> = new Map();

  /**
   * Criar uma nova fila
   */
  createQueue(name: string): Queue {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }

    const queue = new Queue(name, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    this.queues.set(name, queue);
    console.log(`[BullMQ] Queue '${name}' created`);

    return queue;
  }

  /**
   * Obter fila existente
   */
  getQueue(name: string): Queue | undefined {
    return this.queues.get(name);
  }

  /**
   * Adicionar job na fila (mantém interface compatível)
   */
  async enqueue(
    queueName: string,
    jobData: QueueJobData,
    options: {
      delay?: number;
      priority?: 'low' | 'normal' | 'high';
      attempts?: number;
    } = {}
  ): Promise<string> {
    const queue = this.getQueue(queueName) || this.createQueue(queueName);

    // Validar payload obrigatório
    if (!jobData.tenantId || !jobData.traceId) {
      throw new ValidationError('Job payload is required');
    }

    // Mapear prioridade
    const priorityMap = {
      low: 1,
      normal: 5,
      high: 10,
    };

    const job = await queue.add(
      queueName,
      jobData,
      {
        delay: options.delay,
        priority: priorityMap[options.priority || 'normal'],
        attempts: options.attempts || 3,
        removeOnComplete: 100,
        removeOnFail: 50,
      }
    );

    const jobId = job.id as string;

    console.log(`[BullMQ] Job enqueued: ${jobId} (queue: ${queueName}, tenant: ${jobData.tenantId})`);
    return jobId;
  }

  /**
   * Criar worker para processar jobs
   */
  createWorker<T = unknown>(
    queueName: string,
    handler: QueueHandler<T>,
    options: {
      concurrency?: number;
      autorun?: boolean;
    } = {}
  ): Worker {
    const queue = this.getQueue(queueName);
    if (!queue) {
      throw new ValidationError(`Queue '${queueName}' not found. Create it first.`);
    }

    const worker = startWorkers(queueName, handler, options);

    this.workers.set(queueName, worker);
    console.log(`[BullMQ] Worker created for queue: ${queueName}`);

    return worker;
  }

  /**
   * Obter worker existente
   */
  getWorker(queueName: string): Worker | undefined {
    return this.workers.get(queueName);
  }

  /**
   * Criar event listener para fila
   */
  createEvents(queueName: string): QueueEvents {
    if (this.events.has(queueName)) {
      return this.events.get(queueName)!;
    }

    const events = new QueueEvents(queueName, { connection });
    this.events.set(queueName, events);

    // Event listeners padrão
    events.on('completed', ({ jobId, returnvalue }) => {
      console.log(`[BullMQ] Job completed: ${jobId}`, returnvalue);
    });

    events.on('failed', ({ jobId, failedReason }) => {
      console.error(`[BullMQ] Job failed: ${jobId}`, failedReason);
    });

    events.on('stalled', ({ jobId }) => {
      console.warn(`[BullMQ] Job stalled: ${jobId}`);
    });

    return events;
  }

  /**
   * Obter estatísticas da fila
   */
  async getQueueStats(queueName: string): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  }> {
    const queue = this.getQueue(queueName);
    if (!queue) {
      throw new ValidationError(`Queue '${queueName}' not found`);
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
    ]);

    // BullMQ não tem getPaused, usamos isPaused()
    const isPaused = await queue.isPaused();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      paused: isPaused ? 1 : 0,
    };
  }

  /**
   * Pausar fila
   */
  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    if (queue) {
      await queue.pause();
      console.log(`[BullMQ] Queue paused: ${queueName}`);
    }
  }

  /**
   * Resumir fila
   */
  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    if (queue) {
      await queue.resume();
      console.log(`[BullMQ] Queue resumed: ${queueName}`);
    }
  }

  /**
   * Limpar fila
   */
  async clearQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    if (queue) {
      await queue.drain();
      console.log(`[BullMQ] Queue cleared: ${queueName}`);
    }
  }

  /**
   * Fechar todas as conexões
   */
  async close(): Promise<void> {
    const closePromises: Promise<void>[] = [];

    // Fechar workers
    for (const [name, worker] of this.workers) {
      closePromises.push(worker.close());
      console.log(`[BullMQ] Worker closed: ${name}`);
    }

    // Fechar filas
    for (const [name, queue] of this.queues) {
      closePromises.push(queue.close());
      console.log(`[BullMQ] Queue closed: ${name}`);
    }

    // Fechar events
    for (const [name, events] of this.events) {
      closePromises.push(events.close());
      console.log(`[BullMQ] Events closed: ${name}`);
    }

    await Promise.all(closePromises);
    this.queues.clear();
    this.workers.clear();
    this.events.clear();

    // Fechar conexão Redis
    await connection.quit();
    console.log('[BullMQ] All connections closed');
  }

  /**
   * Verificar saúde do sistema
   */
  async healthCheck(): Promise<{
    redis: boolean;
    queues: string[];
    workers: string[];
  }> {
    try {
      // Testar conexão Redis
      await connection.ping();
      
      return {
        redis: true,
        queues: Array.from(this.queues.keys()),
        workers: Array.from(this.workers.keys()),
      };
    } catch (error) {
      console.error('[BullMQ] Health check failed', error);
      return {
        redis: false,
        queues: Array.from(this.queues.keys()),
        workers: Array.from(this.workers.keys()),
      };
    }
  }
}

// Instância global do gerenciador
export const bullMQManager = new BullMQQueueManager();

// Filas padrão do sistema
export const QUEUES = {
  AUDIT_LOG: 'audit-log',
  EMAIL: 'email',
  HEAVY_PROCESS: 'heavy-process',
  NOTIFICATIONS: 'notifications',
  REPORTS: 'reports',
} as const;

// Inicializar filas padrão
bullMQManager.createQueue(QUEUES.AUDIT_LOG);
bullMQManager.createQueue(QUEUES.EMAIL);
bullMQManager.createQueue(QUEUES.HEAVY_PROCESS);
bullMQManager.createQueue(QUEUES.NOTIFICATIONS);
bullMQManager.createQueue(QUEUES.REPORTS);

