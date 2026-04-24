/**
 * Sistema de Workers - BullMQ Workers
 * 
 * Executa tarefas pesadas em processos isolados
 * OCR, screenshots, análises do LEO, relatórios, etc.
 */

import { Worker, Job, ConnectionOptions } from 'bullmq';
import { InfrastructureError } from '../_core/errors/typed-errors.js';
import { getRedisClient } from '../infra/redis.js';
import { logInfo, logError, logWarn } from '../_core/logger.js';
import { QUEUE_NAMES, JobData, JobResult } from './queue.js';
import { processOcrJob } from './jobs.js';
import { processScreenshotJob } from './jobs.js';
import { processLeoAnalysisJob } from './jobs.js';
import { processReportGenerationJob } from './jobs.js';
import { processDesktopAutomationJob } from './jobs.js';
import { processNotificationJob } from './jobs.js';
import { processBackupJob } from './jobs.js';
import { processCleanupJob } from './jobs.js';

export interface WorkerConfig {
  name: string;
  concurrency: number;
  maxStalledCount: number;
  stalledInterval: number;
}

/**
 * Configurações dos workers por fila
 */
const WORKER_CONFIGS: Record<string, WorkerConfig> = {
  [QUEUE_NAMES.OCR]: {
    name: 'OCR Worker',
    concurrency: 2, // OCR é pesado, limitar concorrência
    maxStalledCount: 1,
    stalledInterval: 30000,
  },
  [QUEUE_NAMES.SCREENSHOT]: {
    name: 'Screenshot Worker',
    concurrency: 3, // Screenshots são rápidos
    maxStalledCount: 1,
    stalledInterval: 30000,
  },
  [QUEUE_NAMES.LEO_ANALYSIS]: {
    name: 'LEO Analysis Worker',
    concurrency: 1, // Análises do LEO consomem muita CPU
    maxStalledCount: 1,
    stalledInterval: 30000,
  },
  [QUEUE_NAMES.REPORT_GENERATION]: {
    name: 'Report Generation Worker',
    concurrency: 2, // Relatórios podem rodar em paralelo
    maxStalledCount: 1,
    stalledInterval: 30000,
  },
  [QUEUE_NAMES.DESKTOP_AUTOMATION]: {
    name: 'Desktop Automation Worker',
    concurrency: 1, // Apenas uma automação por vez para evitar conflitos
    maxStalledCount: 1,
    stalledInterval: 30000,
  },
  [QUEUE_NAMES.NOTIFICATIONS]: {
    name: 'Notifications Worker',
    concurrency: 5, // Notificações são rápidas e leves
    maxStalledCount: 2,
    stalledInterval: 30000,
  },
  [QUEUE_NAMES.BACKUP]: {
    name: 'Backup Worker',
    concurrency: 1, // Apenas um backup por vez
    maxStalledCount: 1,
    stalledInterval: 30000,
  },
  [QUEUE_NAMES.CLEANUP]: {
    name: 'Cleanup Worker',
    concurrency: 2, // Limpeza pode rodar em paralelo
    maxStalledCount: 1,
    stalledInterval: 30000,
  },
};

/**
 * Gerenciador de Workers
 */
class WorkerManager {
  private static instance: WorkerManager;
  private workers: Map<string, Worker<JobData, JobResult, string>> = new Map();
  private isInitialized: boolean = false;
  private workerStats: Map<string, {
    processed: number;
    failed: number;
    startTime: Date;
    lastActivity: Date;
  }> = new Map();

  private constructor() {}

  public static getInstance(): WorkerManager {
    if (!WorkerManager.instance) {
      WorkerManager.instance = new WorkerManager();
    }
    return WorkerManager.instance;
  }

  /**
   * Inicializa todos os workers
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      logWarn('WorkerManager já inicializado');
      return;
    }

    try {
      const redisClient = getRedisClient();
      if (!redisClient) {
        throw new InfrastructureError('Cliente Redis não disponível');
      }

      // Criar workers para cada fila
      for (const [queueName, config] of Object.entries(WORKER_CONFIGS)) {
        await this.createWorker(queueName, config);
      }

      this.isInitialized = true;
      logInfo('WorkerManager inicializado com sucesso', {
        workers: Array.from(this.workers.keys()),
      });

    } catch (error) {
      logError('Falha ao inicializar WorkerManager', error);
      throw error;
    }
  }

  /**
   * Cria um worker para uma fila específica
   */
  private async createWorker(queueName: string, config: WorkerConfig): Promise<void> {
    try {
      const connection = getRedisClient();
      if (!connection) {
        throw new InfrastructureError('Cliente Redis não disponível');
      }

      const worker = new Worker(
        queueName,
        async (job: Job<JobData, JobResult, string>) => {
          return await this.processJob(job, queueName);
        },
        {
          connection: connection as ConnectionOptions,
          concurrency: config.concurrency,
          maxStalledCount: config.maxStalledCount,
          stalledInterval: config.stalledInterval,
        }
      );

      // Event handlers do worker
      worker.on('ready', () => {
        logInfo(`${config.name} pronto para processar jobs`);
      });

      worker.on('error', (error) => {
        logError(`Erro no ${config.name}`, error);
        this.updateWorkerStats(queueName, 'failed');
      });

      worker.on('completed', (job: Job<JobData, JobResult, string>) => {
        logInfo(`Job ${job.id} completado pelo ${config.name}`, {
          jobId: job.id,
          type: job.name,
          queue: queueName,
        });
        this.updateWorkerStats(queueName, 'processed');
      });

      worker.on('failed', (job: Job<JobData, JobResult, string> | undefined, error: Error) => {
        if (!job) {
          logError(`Job desconhecido falhou no ${config.name}`, error, { queue: queueName });
          this.updateWorkerStats(queueName, 'failed');
          return;
        }
        logError(`Job ${job.id} falhou no ${config.name}`, error, {
          jobId: job.id,
          type: job.name,
          queue: queueName,
          attemptsMade: job.attemptsMade,
        });
        this.updateWorkerStats(queueName, 'failed');
      });

      worker.on('stalled', (jobId: unknown) => {
        const stalledJobId = typeof jobId === 'string' || typeof jobId === 'number' 
          ? String(jobId) 
          : 'unknown';
        logWarn(`Job ${stalledJobId} stalled no ${config.name}`, {
          jobId: stalledJobId,
          queue: queueName,
        });
      });

      this.workers.set(queueName, worker);
      this.workerStats.set(queueName, {
        processed: 0,
        failed: 0,
        startTime: new Date(),
        lastActivity: new Date(),
      });

      logInfo(`${config.name} criado com sucesso`, {
        queue: queueName,
        concurrency: config.concurrency,
      });

    } catch (error) {
      logError(`Falha ao criar ${config.name}`, error);
      throw error;
    }
  }

  /**
   * Processa um job baseado na fila
   */
  private async processJob(
    job: Job<JobData, JobResult, string>,
    queueName: string
  ): Promise<JobResult> {
    const startTime = Date.now();
    const jobData = job.data;

    try {
      logInfo(`Processando job ${job.id} na fila ${queueName}`, {
        jobId: job.id,
        type: jobData.type,
        payload: jobData.payload,
      });

      let result: JobResult;

      // Roteamento para processadores específicos
      switch (queueName) {
        case QUEUE_NAMES.OCR:
          result = await processOcrJob(jobData);
          break;

        case QUEUE_NAMES.SCREENSHOT:
          result = await processScreenshotJob(jobData);
          break;

        case QUEUE_NAMES.LEO_ANALYSIS:
          result = await processLeoAnalysisJob(jobData);
          break;

        case QUEUE_NAMES.REPORT_GENERATION:
          result = await processReportGenerationJob(jobData);
          break;

        case QUEUE_NAMES.DESKTOP_AUTOMATION:
          result = await processDesktopAutomationJob(jobData);
          break;

        case QUEUE_NAMES.NOTIFICATIONS:
          result = await processNotificationJob(jobData);
          break;

        case QUEUE_NAMES.BACKUP:
          result = await processBackupJob(jobData);
          break;

        case QUEUE_NAMES.CLEANUP:
          result = await processCleanupJob(jobData);
          break;

        default:
          throw new InfrastructureError(`Fila desconhecida: ${queueName}`);
      }

      const executionTime = Date.now() - startTime;
      
      logInfo(`Job ${job.id} processado com sucesso`, {
        jobId: job.id,
        queue: queueName,
        type: jobData.type,
        executionTime,
      });

      return {
        ...result,
        executionTime,
        processedAt: new Date(),
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      logError(`Job ${job.id} falhou no processamento`, error, {
        jobId: job.id,
        queue: queueName,
        type: jobData.type,
        executionTime,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        executionTime,
        processedAt: new Date(),
      };
    }
  }

  /**
   * Atualiza estatísticas do worker
   */
  private updateWorkerStats(queueName: string, type: 'processed' | 'failed'): void {
    const stats = this.workerStats.get(queueName);
    if (stats) {
      if (type === 'processed') {
        stats.processed++;
      } else {
        stats.failed++;
      }
      stats.lastActivity = new Date();
    }
  }

  /**
   * Obtém estatísticas de um worker
   */
  public getWorkerStats(queueName: string): {
    processed: number;
    failed: number;
    startTime: Date;
    lastActivity: Date;
    uptime: number;
    successRate: number;
  } | null {
    const stats = this.workerStats.get(queueName);
    if (!stats) return null;

    const total = stats.processed + stats.failed;
    const uptime = Date.now() - stats.startTime.getTime();

    return {
      ...stats,
      uptime,
      successRate: total > 0 ? (stats.processed / total) * 100 : 0,
    };
  }

  /**
   * Obtém estatísticas de todos os workers
   */
  public getAllWorkerStats(): Record<string, {
    processed: number;
    failed: number;
    startTime: Date;
    lastActivity: Date;
    uptime: number;
    successRate: number;
    isRunning: boolean;
    isClosing: boolean;
  } | null> {
    const stats: Record<string, {
      processed: number;
      failed: number;
      startTime: Date;
      lastActivity: Date;
      uptime: number;
      successRate: number;
      isRunning: boolean;
      isClosing: boolean;
    } | null> = {};
    
    for (const queueName of Object.values(QUEUE_NAMES)) {
      const workerStats = this.getWorkerStats(queueName);
      const worker = this.workers.get(queueName);
      
      stats[queueName] = {
        processed: workerStats?.processed ?? 0,
        failed: workerStats?.failed ?? 0,
        startTime: workerStats?.startTime ?? new Date(),
        lastActivity: workerStats?.lastActivity ?? new Date(),
        uptime: workerStats?.uptime ?? 0,
        successRate: workerStats?.successRate ?? 0,
        isRunning: Boolean(worker && !worker.closing),
        isClosing: Boolean(worker?.closing),
      };
    }

    return stats;
  }

  /**
   * Para um worker específico
   */
  public async stopWorker(queueName: string): Promise<void> {
    try {
      const worker = this.workers.get(queueName);
      if (!worker) {
        logWarn(`Worker para fila ${queueName} não encontrado`);
        return;
      }

      await worker.close();
      this.workers.delete(queueName);
      logInfo(`Worker para fila ${queueName} parado`);

    } catch (error) {
      logError(`Falha ao parar worker para fila ${queueName}`, error);
      throw error;
    }
  }

  /**
   * Reinicia um worker específico
   */
  public async restartWorker(queueName: string): Promise<void> {
    try {
      await this.stopWorker(queueName);
      
      const config = WORKER_CONFIGS[queueName];
      if (config) {
        await this.createWorker(queueName, config);
        logInfo(`Worker para fila ${queueName} reiniciado`);
      }

    } catch (error) {
      logError(`Falha ao reiniciar worker para fila ${queueName}`, error);
      throw error;
    }
  }

  /**
   * Encerra todos os workers
   */
  public async shutdown(): Promise<void> {
    try {
      logInfo('Encerrando WorkerManager...');

      const closePromises = Array.from(this.workers.values()).map((worker: Worker) => worker.close());
      await Promise.all(closePromises);

      this.workers.clear();
      this.workerStats.clear();
      this.isInitialized = false;

      logInfo('WorkerManager encerrado com sucesso');

    } catch (error) {
      logError('Falha ao encerrar WorkerManager', error);
      throw error;
    }
  }

  /**
   * Verifica se o sistema está inicializado
   */
  public isReady(): boolean {
    return this.isInitialized && this.workers.size > 0;
  }

  /**
   * Lista todos os workers ativos
   */
  public getActiveWorkers(): string[] {
    return Array.from(this.workers.keys());
  }
}

// Exportar instância singleton
export const workerManager = WorkerManager.getInstance();

// Exportar funções de utilidade
export async function initializeWorkers(): Promise<void> {
  await workerManager.initialize();
}

export function getWorkerStats(queueName?: string): Record<string, unknown> | null {
  if (queueName) {
    return workerManager.getWorkerStats(queueName);
  }
  return workerManager.getAllWorkerStats();
}

export async function stopWorker(queueName: string): Promise<void> {
  await workerManager.stopWorker(queueName);
}

export async function restartWorker(queueName: string): Promise<void> {
  await workerManager.restartWorker(queueName);
}
