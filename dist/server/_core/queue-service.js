/**
 * Queue Service - Compatibilidade com Sistema Antigo
 *
 * Mantém interface existente enquanto usa BullMQ internamente
 */
import { bullMQManager, QUEUES } from './bullmq-queue.js';
import { initializeWorkers, closeWorkers } from './bullmq-workers.js';
import { logInfo, logError } from './service-logger.js';
import { InfrastructureError } from './errors/typed-errors.js';
/**
 * Serviço de Fila - Mantém compatibilidade
 */
export class QueueService {
    initialized = false;
    workersStarted = false;
    /**
     * Inicializar o serviço de fila
     */
    async initialize() {
        if (this.initialized) {
            return;
        }
        try {
            // Verificar saúde do sistema
            const health = await bullMQManager.healthCheck();
            if (!health.redis) {
                throw new InfrastructureError('Redis connection failed');
            }
            this.initialized = true;
            logInfo('Queue service initialized', {
                service: 'queue-service',
                payload: { queues: health.queues, workers: health.workers, workersStarted: this.workersStarted }
            });
        }
        catch (error) {
            logError('QUEUE_INIT_ERROR', 'Failed to initialize queue service', {
                service: 'queue-service',
                error: error
            });
            throw error;
        }
    }
    /**
     * Inicia consumidores BullMQ explicitamente (apenas processo worker).
     */
    async startWorkers() {
        if (!this.initialized) {
            await this.initialize();
        }
        if (this.workersStarted) {
            logInfo('Queue workers já iniciados neste processo', {
                service: 'queue-service',
                payload: { pid: process.pid }
            });
            return;
        }
        initializeWorkers();
        this.workersStarted = true;
        logInfo('Queue workers initialized', {
            service: 'queue-service',
            payload: { pid: process.pid }
        });
    }
    /**
     * Adicionar job na fila (mantém interface compatível)
     */
    async enqueue(type, data, options = {}) {
        if (!this.initialized) {
            await this.initialize();
        }
        try {
            // Mapear tipo para nome da fila BullMQ
            const queueNameMap = {
                audit_log: QUEUES.AUDIT_LOG,
                email: QUEUES.EMAIL,
                heavy_process: QUEUES.HEAVY_PROCESS,
            };
            const queueName = queueNameMap[type];
            if (!queueName) {
                throw new InfrastructureError(`Invalid queue type: ${type}`);
            }
            // Gerar traceId se não existir
            const dataObj = data;
            const traceId = dataObj.traceId || this.generateTraceId();
            // Preparar payload obrigatório
            const jobData = {
                tenantId: dataObj.tenantId,
                traceId: traceId,
                data: dataObj,
            };
            // Enfileirar usando BullMQ
            const jobId = await bullMQManager.enqueue(queueName, jobData, options);
            logInfo('Job enqueued', {
                service: 'queue-service',
                payload: { jobId, type, tenantId: dataObj.tenantId, traceId }
            });
            return jobId;
        }
        catch (error) {
            logError('ENQUEUE_ERROR', 'Failed to enqueue job', {
                service: 'queue-service',
                error: error,
                payload: { type, data }
            });
            throw error;
        }
    }
    /**
     * Adicionar job de audit log (wrapper específico)
     */
    async enqueueAuditLog(tenantId, actorUserId, actorVendedorId, action, entity, entityId, payloadJson) {
        return this.enqueue('audit_log', {
            tenantId,
            actorUserId,
            actorVendedorId,
            action,
            entity,
            entityId,
            payloadJson,
        });
    }
    /**
     * Adicionar job de email (wrapper específico)
     */
    async enqueueEmail(tenantId, to, subject, body, priority = 'normal') {
        return this.enqueue('email', {
            tenantId,
            to,
            subject,
            body,
        }, { priority });
    }
    /**
     * Adicionar job de heavy process (wrapper específico)
     */
    async enqueueHeavyProcess(tenantId, processType, data, priority = 'low') {
        return this.enqueue('heavy_process', {
            tenantId,
            processType,
            data,
        }, { priority });
    }
    /**
     * Obter estatísticas da fila
     */
    async getStats() {
        if (!this.initialized) {
            await this.initialize();
        }
        try {
            // Obter estatísticas de todas as filas
            const queueStats = await Promise.all([
                bullMQManager.getQueueStats(QUEUES.AUDIT_LOG),
                bullMQManager.getQueueStats(QUEUES.EMAIL),
                bullMQManager.getQueueStats(QUEUES.HEAVY_PROCESS),
            ]);
            const [auditLog, email, heavyProcess] = queueStats;
            const totalPending = auditLog.waiting + email.waiting + heavyProcess.waiting;
            const totalActive = auditLog.active + email.active + heavyProcess.active;
            return {
                pending: totalPending,
                processing: totalActive > 0,
                handlers: 3, // Número de workers
                queues: {
                    'audit_log': auditLog,
                    'email': email,
                    'heavy_process': heavyProcess,
                },
            };
        }
        catch (error) {
            logError('QUEUE_STATS_ERROR', 'Failed to get queue stats', {
                service: 'queue-service',
                error: error
            });
            throw error;
        }
    }
    /**
     * Pausar fila específica
     */
    async pauseQueue(type) {
        if (!this.initialized) {
            return;
        }
        const queueNameMap = {
            audit_log: QUEUES.AUDIT_LOG,
            email: QUEUES.EMAIL,
            heavy_process: QUEUES.HEAVY_PROCESS,
        };
        const queueName = queueNameMap[type];
        if (queueName) {
            await bullMQManager.pauseQueue(queueName);
        }
    }
    /**
     * Resumir fila específica
     */
    async resumeQueue(type) {
        if (!this.initialized) {
            return;
        }
        const queueNameMap = {
            audit_log: QUEUES.AUDIT_LOG,
            email: QUEUES.EMAIL,
            heavy_process: QUEUES.HEAVY_PROCESS,
        };
        const queueName = queueNameMap[type];
        if (queueName) {
            await bullMQManager.resumeQueue(queueName);
        }
    }
    /**
     * Limpar fila específica
     */
    async clearQueue(type) {
        if (!this.initialized) {
            return;
        }
        const queueNameMap = {
            audit_log: QUEUES.AUDIT_LOG,
            email: QUEUES.EMAIL,
            heavy_process: QUEUES.HEAVY_PROCESS,
        };
        const queueName = queueNameMap[type];
        if (queueName) {
            await bullMQManager.clearQueue(queueName);
        }
    }
    /**
     * Gerar trace ID único
     */
    generateTraceId() {
        return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
     * Verificar saúde do serviço
     */
    async healthCheck() {
        try {
            const health = await bullMQManager.healthCheck();
            let status = 'healthy';
            if (!health.redis) {
                status = 'unhealthy';
            }
            else if (health.workers.length === 0) {
                status = 'degraded';
            }
            return {
                status,
                redis: health.redis,
                queues: health.queues,
                workers: health.workers,
                uptime: process.uptime(),
            };
        }
        catch (error) {
            logError('QUEUE_HEALTH_ERROR', 'Health check failed', {
                service: 'queue-service',
                error: error
            });
            return {
                status: 'unhealthy',
                redis: false,
                queues: [],
                workers: [],
                uptime: process.uptime(),
            };
        }
    }
    /**
     * Fechar o serviço
     */
    async close() {
        if (!this.initialized) {
            return;
        }
        try {
            if (this.workersStarted) {
                await closeWorkers();
                this.workersStarted = false;
            }
            await bullMQManager.close();
            this.initialized = false;
            logInfo('Queue service closed', {
                service: 'queue-service'
            });
        }
        catch (error) {
            logError('QUEUE_CLOSE_ERROR', 'Failed to close queue service', {
                service: 'queue-service',
                error: error
            });
            throw error;
        }
    }
}
// Instância global do serviço (compatível com sistema antigo)
export const queueService = new QueueService();
// Funções de conveniência para manter compatibilidade
export async function enqueue(type, data, options) {
    return queueService.enqueue(type, data, options);
}
export function enqueueAuditLog(tenantId, actorUserId, actorVendedorId, action, entity, entityId, payloadJson) {
    return queueService.enqueueAuditLog(tenantId, actorUserId, actorVendedorId, action, entity, entityId, payloadJson);
}
export function enqueueEmail(tenantId, to, subject, body, priority) {
    return queueService.enqueueEmail(tenantId, to, subject, body, priority);
}
export function enqueueHeavyProcess(tenantId, processType, data, priority) {
    return queueService.enqueueHeavyProcess(tenantId, processType, data, priority);
}
