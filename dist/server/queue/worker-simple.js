/**
 * Sistema de Workers - BullMQ Workers (Versão Simplificada)
 *
 * Executa tarefas pesadas em processos isolados
 * OCR, screenshots, análises do LEO, relatórios, etc.
 */
import { Worker } from 'bullmq';
import { InfrastructureError } from '../_core/errors/typed-errors.js';
import { getRedisClient } from '../infra/redis.js';
import { logInfo, logError, logWarn } from '../_core/logger.js';
import { QUEUE_NAMES } from './queue.js';
/**
 * Configurações dos workers por fila
 */
const WORKER_CONFIGS = {
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
    static instance;
    workers = new Map();
    isInitialized = false;
    constructor() { }
    static getInstance() {
        if (!WorkerManager.instance) {
            WorkerManager.instance = new WorkerManager();
        }
        return WorkerManager.instance;
    }
    /**
     * Inicializa todos os workers
     */
    async initialize() {
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
        }
        catch (error) {
            logError('Falha ao inicializar WorkerManager', error);
            throw error;
        }
    }
    /**
     * Cria um worker para uma fila específica
     */
    async createWorker(queueName, config) {
        try {
            const worker = new Worker(queueName, async (job) => {
                return await this.processJob(job, queueName);
            }, {
                connection: getRedisClient(),
                concurrency: config.concurrency,
            });
            // Event handlers simplificados
            worker.on('ready', () => {
                logInfo(`${config.name} pronto para processar jobs`);
            });
            worker.on('error', (error) => {
                logError(`Erro no ${config.name}`, error);
            });
            this.workers.set(queueName, worker);
            logInfo(`${config.name} criado com sucesso`, {
                queue: queueName,
                concurrency: config.concurrency,
            });
        }
        catch (error) {
            logError(`Falha ao criar ${config.name}`, error);
            throw error;
        }
    }
    /**
     * Processa um job baseado na fila
     */
    async processJob(job, queueName) {
        const startTime = Date.now();
        const jobData = job.data;
        try {
            logInfo(`Processando job ${job.id} na fila ${queueName}`, {
                jobId: job.id,
                type: jobData.type,
            });
            // Simulação de processamento por enquanto
            await new Promise(resolve => setTimeout(resolve, 2000));
            const result = {
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
        }
        catch (error) {
            logError(`Job ${job.id} falhou no processamento`, error, {
                jobId: job.id,
                queue: queueName,
            });
            return {
                success: false,
                error: error.message,
                executionTime: Date.now() - startTime,
                processedAt: new Date(),
            };
        }
    }
    /**
     * Encerra todos os workers
     */
    async shutdown() {
        try {
            logInfo('Encerrando WorkerManager...');
            const closePromises = Array.from(this.workers.values()).map((worker) => worker.close());
            await Promise.all(closePromises);
            this.workers.clear();
            this.isInitialized = false;
            logInfo('WorkerManager encerrado com sucesso');
        }
        catch (error) {
            logError('Falha ao encerrar WorkerManager', error);
            throw error;
        }
    }
    /**
     * Verifica se o sistema está inicializado
     */
    isReady() {
        return this.isInitialized && this.workers.size > 0;
    }
    /**
     * Lista todos os workers ativos
     */
    getActiveWorkers() {
        return Array.from(this.workers.keys());
    }
}
// Exportar instância singleton
export const workerManager = WorkerManager.getInstance();
// Exportar funções de utilidade
export async function initializeWorkers() {
    await workerManager.initialize();
}
