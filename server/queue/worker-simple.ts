/**
 * Sistema de Workers - BullMQ Workers (Versão Simplificada)
 * 
 * Executa tarefas pesadas em processos isolados
 * OCR, screenshots, análises do LEO, relatórios, etc.
 */

import { Worker, Job, ConnectionOptions } from 'bullmq';
import { InfrastructureError } from '../_core/errors/typed-errors.js';
import { logInfo, logError, logWarn } from '../_core/logger.js';
import { QUEUE_NAMES, JobData, JobResult } from './queue.js';
import { queueConfig } from '../infra/queue/queue.config.js';

/**
 * Configurações dos workers por fila
 */
const WORKER_CONFIGS: Record<string, { name: string; concurrency: number }> = {
  [QUEUE_NAMES.OCR]: { name: 'OCR Worker', concurrency: 2 },
  [QUEUE_NAMES.SCREENSHOT]: { name: 'Screenshot Worker', concurrency: 3 },
  [QUEUE_NAMES.LEO_ANALYSIS]: { name: 'LEO Analysis Worker', concurrency: 1 },
  [QUEUE_NAMES.REPORT_GENERATION]: { name: 'Report Generation Worker', concurrency: 2 },
  [QUEUE_NAMES.DESKTOP_AUTOMATION]: { name: 'Desktop Automation Worker', concurrency: 1 },
  [QUEUE_NAMES.NOTIFICATIONS]: { name: 'Notifications Worker', concurrency: 5 },
  [QUEUE_NAMES.BACKUP]: { name: 'Backup Worker', concurrency: 1 },
  [QUEUE_NAMES.CLEANUP]: { name: 'Cleanup Worker', concurrency: 2 },
};

/**
 * Gerenciador de Workers
 */
class WorkerManager {
  private static instance: WorkerManager;
  private workers: Map<string, Worker> = new Map();
  private isInitialized: boolean = false;

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
      const redisClient = queueConfig.getConnection();
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
  private async createWorker(queueName: string, config: { name: string; concurrency: number }): Promise<void> {
    try {
      const redisClient = queueConfig.getConnection();
      if (!redisClient) {
        throw new InfrastructureError('Cliente Redis não disponível para criar worker');
      }

      const worker = new Worker(
        queueName,
        async (job: Job<JobData, JobResult, string>) => {
          return await this.processJob(job, queueName);
        },
        {
          connection: redisClient as ConnectionOptions,
          concurrency: config.concurrency,
        }
      );

      // Event handlers simplificados
      worker.on('ready', () => {
        logInfo(`${config.name} pronto para processar jobs`);
      });

      worker.on('error', (error: Error) => {
        logError(`Erro no ${config.name}`, error);
      });

      this.workers.set(queueName, worker);
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
      });

      // Simulação de processamento por enquanto
      await new Promise(resolve => setTimeout(resolve, 2000));

      const result: JobResult = {
        success: true,
        data: {
          processed: true,
          queue: queueName,
          type: jobData.type,
        },
        executionTime: Date.now() - startTime,
        processedAt: new Date(),
      };

      logInfo(`Job ${job.id} processado com sucesso`, {
        jobId: job.id,
        queue: queueName,
        executionTime: result.executionTime,
      });

      return result;

    } catch (error) {
      logError(`Job ${job.id} falhou no processamento`, error as Error, {
        jobId: job.id,
        queue: queueName,
      });

      return {
        success: false,
        error: (error as Error).message,
        executionTime: Date.now() - startTime,
        processedAt: new Date(),
      };
    }
  }

  /**
   * Encerra todos os workers
   */
  public async shutdown(): Promise<void> {
    try {
      logInfo('Encerrando WorkerManager...');

      const closePromises = Array.from(this.workers.values()).map((worker: any) => worker.close());
      await Promise.all(closePromises);

      this.workers.clear();
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
