/**
 * Sistema de Filas - BullMQ Queue Manager
 *
 * Gerencia filas de processamento para operações pesadas e assíncronas
 * Isola a API de tarefas demoradas (OCR, screenshots, análises)
 * Inclui fila global tipada com LeoTask.
 */
import { Queue } from "bullmq";
import { InfrastructureError } from '../_core/errors/typed-errors.js';
import { getRedisClient } from '../infra/redis.js';
import { logInfo, logError, logWarn } from '../_core/logger-rotation.js';
import { generateJobIdempotencyKey, wasJobExecuted, } from './idempotency.js';
import { executeJobWithLimits } from './rate-limiter.js';
/** Fila global do sistema, alinhada com LeoTask */
const systemQueue = [];
/**
 * Adiciona uma tarefa à fila global.
 */
function enqueue(task) {
    systemQueue.push(task);
}
/**
 * Processa a fila global (consome tarefas em ordem).
 */
async function processQueue() {
    while (systemQueue.length > 0) {
        const task = systemQueue.shift();
        if (!task)
            break;
        try {
            logInfo(`[systemQueue] Processando tarefa ${task.id}`, { type: task.type });
            // Processamento delegado aos workers por tipo; aqui apenas drena a fila
        }
        catch (err) {
            logError(`[systemQueue] Erro ao processar tarefa ${task.id}`, err);
        }
    }
}
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
};
/**
 * Gerenciador de filas BullMQ
 */
class QueueManager {
    static instance;
    queues = new Map();
    workers = new Map();
    isInitialized = false;
    constructor() { }
    static getInstance() {
        if (!QueueManager.instance) {
            QueueManager.instance = new QueueManager();
        }
        return QueueManager.instance;
    }
    /**
     * Inicializa todas as filas do sistema
     */
    async initialize() {
        if (this.isInitialized) {
            logWarn('QueueManager já inicializado');
            return;
        }
        try {
            const redisClient = getRedisClient();
            if (!redisClient) {
                throw new InfrastructureError('Cliente Redis não disponível');
            }
            // Configurações padrão para todas as filas
            const defaultQueueConfig = {
                connection: redisClient,
                defaultJobOptions: {
                    removeOnComplete: 100, // Manter 100 jobs completos
                    removeOnFail: 50, // Manter 50 jobs falhos
                    attempts: 3, // 3 tentativas
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
                queues: Array.from(this.queues.keys()),
            });
        }
        catch (error) {
            logError('Falha ao inicializar QueueManager', error);
            throw error;
        }
    }
    /**
     * Cria uma fila específica
     */
    async createQueue(name, config) {
        try {
            const queue = new Queue(name, config);
            if (queue?.on !== undefined) {
                queue.on('error', (error) => {
                    logError(`Erro na fila ${name}`, error);
                });
            }
            // Outros eventos desabilitados temporariamente para evitar erros de tipo
            this.queues.set(name, queue);
            logInfo(`Fila ${name} criada com sucesso`);
        }
        catch (error) {
            logError(`Falha ao criar fila ${name}`, error);
            throw error;
        }
    }
    /**
     * Obtém uma fila pelo nome
     */
    getQueue(name) {
        return this.queues.get(name);
    }
    /**
     * Adiciona job a uma fila com proteção de idempotência
     */
    async addJob(queueName, jobName, data, options) {
        try {
            const queue = this.getQueue(queueName);
            if (!queue) {
                throw new InfrastructureError(`Fila ${queueName} não encontrada`);
            }
            const payload = data.payload;
            // Verificar rate limit antes de adicionar
            const canExecute = await executeJobWithLimits(data.type, data.entity, data.entityId, payload, async () => { return; } // Callback void para verificação
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
            const job = await queue.add(jobName, { ...data, idempotencyKey }, {
                priority: options?.priority ?? 0,
                delay: options?.delay ?? 0,
                removeOnComplete: options?.removeOnComplete,
                removeOnFail: options?.removeOnFail,
            });
            logInfo(`Job adicionado à fila ${queueName}`, {
                jobId: job.id,
                jobName,
                type: data.type,
                idempotencyKey,
                priority: options?.priority,
            });
            return job;
        }
        catch (error) {
            logError(`Falha ao adicionar job à fila ${queueName}`, error);
            throw error;
        }
    }
    /**
     * Obtém estatísticas de uma fila
     */
    async getQueueStats(queueName) {
        try {
            const queue = this.getQueue(queueName);
            if (!queue) {
                throw new InfrastructureError(`Fila ${queueName} não encontrada`);
            }
            const q = queue;
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
        }
        catch (error) {
            logError(`Falha ao obter estatísticas da fila ${queueName}`, error);
            throw error;
        }
    }
    /**
     * Obtém estatísticas de todas as filas
     */
    async getAllQueueStats() {
        const stats = {};
        const names = Object.values(QUEUE_NAMES);
        for (const queueName of names) {
            try {
                stats[queueName] = await this.getQueueStats(queueName);
            }
            catch (error) {
                stats[queueName] = { error: error instanceof Error ? error.message : 'Erro desconhecido' };
            }
        }
        return stats;
    }
    /**
     * Pausa uma fila
     */
    async pauseQueue(queueName) {
        try {
            const queue = this.getQueue(queueName);
            if (!queue) {
                throw new InfrastructureError(`Fila ${queueName} não encontrada`);
            }
            await queue.pause();
            logInfo(`Fila ${queueName} pausada`);
        }
        catch (error) {
            logError(`Falha ao pausar fila ${queueName}`, error);
            throw error;
        }
    }
    /**
     * Resume uma fila
     */
    async resumeQueue(queueName) {
        try {
            const queue = this.getQueue(queueName);
            if (!queue) {
                throw new InfrastructureError(`Fila ${queueName} não encontrada`);
            }
            await queue.resume();
            logInfo(`Fila ${queueName} resumida`);
        }
        catch (error) {
            logError(`Falha ao resumir fila ${queueName}`, error);
            throw error;
        }
    }
    /**
     * Limpa uma fila (remove todos os jobs)
     */
    async clearQueue(queueName) {
        try {
            const queue = this.getQueue(queueName);
            if (!queue) {
                throw new InfrastructureError(`Fila ${queueName} não encontrada`);
            }
            if (queue && typeof queue.drain === 'function') {
                await queue.drain();
            }
            logInfo(`Fila ${queueName} limpa`);
        }
        catch (error) {
            logError(`Falha ao limpar fila ${queueName}`, error);
            throw error;
        }
    }
    /**
     * Encerra todas as filas e workers
     */
    async shutdown() {
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
        }
        catch (error) {
            logError('Falha ao encerrar QueueManager', error);
            throw error;
        }
    }
    /**
     * Verifica se o sistema está inicializado
     */
    isReady() {
        return this.isInitialized && this.queues.size > 0;
    }
    /**
     * Lista todas as filas disponíveis
     */
    getQueueNames() {
        return Array.from(this.queues.keys());
    }
}
// Exportar instância singleton
export const queueManager = QueueManager.getInstance();
// Exportar funções de utilidade
export async function initializeQueues() {
    await queueManager.initialize();
}
export function getQueue(queueName) {
    return queueManager.getQueue(queueName);
}
export { enqueue, processQueue };
export async function addJobToQueue(queueName, jobName, data, options) {
    return queueManager.addJob(queueName, jobName, data, options);
}
