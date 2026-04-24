/**
 * Inicialização do Sistema de Filas - Queue System Bootstrap
 *
 * Inicializa Redis, filas BullMQ e workers de forma ordenada
 * Garante que tudo esteja pronto antes de aceitar jobs
 */
import { redisManager } from '../infra/redis.js';
import { InfrastructureError } from '../_core/errors/typed-errors.js';
import { queueManager } from './queue.js';
import { workerManager } from './worker-simple.js';
import { logInfo, logError, logWarn } from '../_core/logger.js';
/**
 * Gerenciador de inicialização do sistema de filas
 */
class QueueSystemBootstrap {
    static instance;
    startTime;
    initialized = false;
    status;
    constructor() {
        this.startTime = new Date();
        this.status = this.createEmptyStatus();
    }
    static getInstance() {
        if (!QueueSystemBootstrap.instance) {
            QueueSystemBootstrap.instance = new QueueSystemBootstrap();
        }
        return QueueSystemBootstrap.instance;
    }
    createEmptyStatus() {
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
    async initialize() {
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
        }
        catch (error) {
            logError('Falha na inicialização do sistema de filas', error);
            throw error;
        }
    }
    /**
     * Inicializa conexão Redis
     */
    async initializeRedis() {
        try {
            logInfo('Testando conexão Redis...');
            const redisTest = await redisManager.testConnection();
            if (!redisTest.success) {
                throw new InfrastructureError(`Redis não conectado: ${redisTest.message}`);
            }
            this.status.redis = {
                connected: true,
                latency: redisTest.latency,
            };
            logInfo('Redis conectado com sucesso', {
                latency: redisTest.latency,
            });
        }
        catch (error) {
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
    async initializeQueues() {
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
        }
        catch (error) {
            this.status.queues.initialized = false;
            throw error;
        }
    }
    /**
     * Inicializa workers
     */
    async initializeWorkers() {
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
        }
        catch (error) {
            this.status.workers.initialized = false;
            throw error;
        }
    }
    /**
     * Atualiza status completo do sistema
     */
    updateStatus() {
        this.status.ready = (this.status.redis.connected &&
            this.status.queues.initialized &&
            this.status.workers.initialized);
        this.status.uptime = Date.now() - this.startTime.getTime();
    }
    /**
     * Obtém status atual do sistema
     */
    async getStatus() {
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
        }
        catch (error) {
            logError('Erro ao atualizar status do sistema de filas', error);
        }
        return { ...this.status };
    }
    /**
     * Verifica saúde do sistema
     */
    async healthCheck() {
        const errors = [];
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
    async restart() {
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
        }
        catch (error) {
            logError('Falha ao reiniciar sistema de filas', error);
            throw error;
        }
    }
    /**
     * Encerra o sistema completo
     */
    async shutdown() {
        logInfo('Encerrando sistema de filas...');
        try {
            await workerManager.shutdown();
            await queueManager.shutdown();
            await redisManager.disconnect();
            this.initialized = false;
            this.status = this.createEmptyStatus();
            logInfo('Sistema de filas encerrado com sucesso');
        }
        catch (error) {
            logError('Falha ao encerrar sistema de filas', error);
            throw error;
        }
    }
    /**
     * Verifica se o sistema está pronto
     */
    isReady() {
        return this.initialized && this.status.ready;
    }
    /**
     * Obtém tempo de uptime
     */
    getUptime() {
        return Date.now() - this.startTime.getTime();
    }
}
// Exportar instância singleton
export const queueSystem = QueueSystemBootstrap.getInstance();
// Exportar funções de utilidade
export async function initializeQueueSystem() {
    await queueSystem.initialize();
}
export async function getQueueSystemStatus() {
    return await queueSystem.getStatus();
}
export async function healthCheckQueueSystem() {
    return await queueSystem.healthCheck();
}
export async function restartQueueSystem() {
    await queueSystem.restart();
}
export async function shutdownQueueSystem() {
    await queueSystem.shutdown();
}
