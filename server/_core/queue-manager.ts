import { performance } from 'perf_hooks';

interface QueueJob {
  id: string;
  tenantId: number;
  type: 'audit_log' | 'email' | 'heavy_process';
  data: unknown;
  priority: 'low' | 'normal' | 'high';
  createdAt: Date;
  attempts: number;
  maxAttempts: number;
}

interface QueueHandler {
  (job: QueueJob): Promise<void>;
}

class QueueManager {
  private jobs: QueueJob[] = [];
  private handlers: Map<string, QueueHandler> = new Map();
  private processing = false;
  private batchSize = 10;
  private processingInterval = 1000; // 1 segundo

  constructor() {
    this.startProcessor();
  }

  /**
   * Registra handler para tipo de job
   */
  registerHandler(type: string, handler: QueueHandler): void {
    this.handlers.set(type, handler);
  }

  /**
   * Adiciona job na fila
   */
  enqueue(job: Omit<QueueJob, 'id' | 'createdAt' | 'attempts' | 'maxAttempts'>): string {
    const queueJob: QueueJob = {
      ...job,
      id: this.generateJobId(),
      createdAt: new Date(),
      attempts: 0,
      maxAttempts: 3
    };

    this.jobs.push(queueJob);
    
    // Ordenar por prioridade (high primeiro)
    this.jobs.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    return queueJob.id;
  }

  /**
   * Processa jobs em fila
   */
  private async startProcessor(): Promise<void> {
    this.processing = true;

    while (this.processing) {
      try {
        const batch = this.jobs.splice(0, this.batchSize);
        
        if (batch.length > 0) {
          await this.processBatch(batch);
        }

        await this.sleep(this.processingInterval);
      } catch (error) {
        console.error('Erro no processador de fila:', error);
        await this.sleep(this.processingInterval);
      }
    }
  }

  /**
   * Processa lote de jobs
   */
  private async processBatch(batch: QueueJob[]): Promise<void> {
    const promises = batch.map(job => this.processJob(job));
    await Promise.allSettled(promises);
  }

  /**
   * Processa job individual
   */
  private async processJob(job: QueueJob): Promise<void> {
    const handler = this.handlers.get(job.type);
    
    if (!handler) {
      console.error(`Handler não encontrado para job type: ${job.type}`);
      return;
    }

    try {
      job.attempts++;
      await handler(job);
    } catch (error) {
      console.error(`Erro ao processar job ${job.id}:`, error);

      // Se ainda tem tentativas, reenfileira
      if (job.attempts < job.maxAttempts) {
        this.jobs.push(job);
      } else {
        console.error(`Job ${job.id} falhou após ${job.maxAttempts} tentativas`);
      }
    }
  }

  /**
   * Para o processador
   */
  stop(): void {
    this.processing = false;
  }

  /**
   * Gera ID único para job
   */
  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Helper para sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Obtém estatísticas da fila
   */
  getStats(): { pending: number; processing: boolean; handlers: number } {
    return {
      pending: this.jobs.length,
      processing: this.processing,
      handlers: this.handlers.size
    };
  }
}

// Instância global do gerenciador de fila
export const queueManager = new QueueManager();

/**
 * Função utilitária para enfileirar jobs
 */
export function enqueue(job: Omit<QueueJob, 'id' | 'createdAt' | 'attempts' | 'maxAttempts'>): string {
  return queueManager.enqueue(job);
}

