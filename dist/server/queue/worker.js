/**
 * Sistema de Workers - BullMQ Workers
 *
 * Executa tarefas pesadas em processos isolados
 * OCR, screenshots, análises do LEO, relatórios, etc.
 */
import { Worker } from 'bullmq';
import { InfrastructureError } from '../_core/errors/typed-errors.js';
import { getRedisClient } from '../infra/redis.js';
import { logInfo, logError, logWarn } from '../_core/logger.js';
import { QUEUE_NAMES } from './queue.js';
import { processOcrJob } from './jobs.js';
import { processScreenshotJob } from './jobs.js';
import { processLeoAnalysisJob } from './jobs.js';
import { processReportGenerationJob } from './jobs.js';
import { processDesktopAutomationJob } from './jobs.js';
import { processNotificationJob } from './jobs.js';
import { processBackupJob } from './jobs.js';
import { processCleanupJob } from './jobs.js';
/**
 * Configurações dos workers por fila
 */
const WORKER_CONFIGS = {
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
    static instance;
    workers = new Map();
    isInitialized = false;
    workerStats = new Map();
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
            const connection = getRedisClient();
            if (!connection) {
                throw new InfrastructureError('Cliente Redis não disponível');
            }
            const worker = new Worker(queueName, async (job) => {
                return await this.processJob(job, queueName);
            }, {
                // NOTA: connection usa 'as any' devido a conflito de versão ioredis
                // BullMQ@5.71.0 espera ioredis@5.9.3 mas o projeto usa @5.10.1
                // Ambas as versões são compatíveis em runtime
                connection: connection,
                concurrency: config.concurrency,
                maxStalledCount: config.maxStalledCount,
                stalledInterval: config.stalledInterval,
            });
            // Event handlers do worker
            worker.on('ready', () => {
                logInfo(`${config.name} pronto para processar jobs`);
            });
            worker.on('error', (error) => {
                logError(`Erro no ${config.name}`, error);
                this.updateWorkerStats(queueName, 'failed');
            });
            worker.on('completed', (job) => {
                logInfo(`Job ${job.id} completado pelo ${config.name}`, {
                    jobId: job.id,
                    type: job.name,
                    queue: queueName,
                });
                this.updateWorkerStats(queueName, 'processed');
            });
            worker.on('failed', (job, error) => {
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
            worker.on('stalled', (jobId) => {
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
                payload: jobData.payload,
            });
            let result;
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
        }
        catch (error) {
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
    updateWorkerStats(queueName, type) {
        const stats = this.workerStats.get(queueName);
        if (stats) {
            if (type === 'processed') {
                stats.processed++;
            }
            else {
                stats.failed++;
            }
            stats.lastActivity = new Date();
        }
    }
    /**
     * Obtém estatísticas de um worker
     */
    getWorkerStats(queueName) {
        const stats = this.workerStats.get(queueName);
        if (!stats)
            return null;
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
    getAllWorkerStats() {
        const stats = {};
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
    async stopWorker(queueName) {
        try {
            const worker = this.workers.get(queueName);
            if (!worker) {
                logWarn(`Worker para fila ${queueName} não encontrado`);
                return;
            }
            await worker.close();
            this.workers.delete(queueName);
            logInfo(`Worker para fila ${queueName} parado`);
        }
        catch (error) {
            logError(`Falha ao parar worker para fila ${queueName}`, error);
            throw error;
        }
    }
    /**
     * Reinicia um worker específico
     */
    async restartWorker(queueName) {
        try {
            await this.stopWorker(queueName);
            const config = WORKER_CONFIGS[queueName];
            if (config) {
                await this.createWorker(queueName, config);
                logInfo(`Worker para fila ${queueName} reiniciado`);
            }
        }
        catch (error) {
            logError(`Falha ao reiniciar worker para fila ${queueName}`, error);
            throw error;
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
            this.workerStats.clear();
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
export function getWorkerStats(queueName) {
    if (queueName) {
        return workerManager.getWorkerStats(queueName);
    }
    return workerManager.getAllWorkerStats();
}
export async function stopWorker(queueName) {
    await workerManager.stopWorker(queueName);
}
export async function restartWorker(queueName) {
    await workerManager.restartWorker(queueName);
}
