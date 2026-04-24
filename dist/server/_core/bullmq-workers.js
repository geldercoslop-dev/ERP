/**
 * BullMQ Workers
 *
 * Workers para processar jobs com validação de tenant
 */
import { bullMQManager, QUEUES } from './bullmq-queue.js';
import * as db from '../db/core.js';
import { ValidationError } from './errors/typed-errors.js';
import { logInfo, logError } from './service-logger.js';
/**
 * Worker para Audit Log
 */
export class AuditLogWorker {
    worker;
    constructor() {
        this.worker = bullMQManager.createWorker(QUEUES.AUDIT_LOG, this.handleAuditLog.bind(this), { concurrency: 5 });
    }
    async handleAuditLog(job) {
        const { tenantId, traceId, data: rawData } = job.data;
        const data = rawData;
        try {
            // Validar tenant
            await this.validateTenant(tenantId);
            // Inserir audit log no banco
            await db.insertAuditLog({
                tenantId,
                actorUserId: typeof data.actorUserId === 'number' ? data.actorUserId : Number(data.actorUserId) || undefined,
                actorVendedorId: typeof data.actorVendedorId === 'number' ? data.actorVendedorId : Number(data.actorVendedorId) || undefined,
                action: String(data.action),
                entity: String(data.entity),
                entityId: String(data.entityId),
                payloadJson: String(data.payloadJson),
                traceId,
            });
            logInfo('Audit log processed', {
                service: 'audit-log-worker',
                payload: { tenantId, traceId, action: data.action }
            });
        }
        catch (error) {
            logError('AUDIT_LOG_ERROR', 'Failed to process audit log', {
                service: 'audit-log-worker',
                error: error,
                payload: { tenantId, traceId }
            });
            throw error;
        }
    }
    /**
     * Validar se tenant existe
     */
    async validateTenant(tenantId) {
        if (!tenantId || tenantId <= 0) {
            throw new ValidationError(`Tenant ${tenantId} not found`);
        }
    }
    async close() {
        if (this.worker) {
            const workerObj = this.worker;
            if (typeof workerObj.close === 'function') {
                await workerObj.close();
            }
            console.log('[AuditLogWorker] Worker closed');
        }
    }
}
/**
 * Worker para Email
 */
export class EmailWorker {
    worker;
    constructor() {
        this.worker = bullMQManager.createWorker(QUEUES.EMAIL, this.handleEmail.bind(this), { concurrency: 3 });
    }
    async handleEmail(job) {
        const { tenantId, traceId, data: rawData } = job.data;
        const data = rawData;
        try {
            // Validar tenant
            await this.validateTenant(tenantId);
            // Simular envio de email
            console.log(`[EmailWorker] Sending email for tenant ${tenantId}: ${data.to} - ${data.subject}`);
            // Simular latência de envio
            await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
            logInfo('Email sent', {
                service: 'email-worker',
                payload: { tenantId, traceId, to: data.to, subject: data.subject }
            });
        }
        catch (error) {
            logError('EMAIL_ERROR', 'Failed to send email', {
                service: 'email-worker',
                error: error,
                payload: { tenantId, traceId }
            });
            throw error;
        }
    }
    /**
     * Validar se tenant existe
     */
    async validateTenant(tenantId) {
        if (!tenantId || tenantId <= 0) {
            throw new ValidationError(`Tenant ${tenantId} not found`);
        }
    }
    async close() {
        if (this.worker) {
            const workerObj = this.worker;
            if (typeof workerObj.close === 'function') {
                await workerObj.close();
            }
            console.log('[EmailWorker] Worker closed');
        }
    }
}
/**
 * Worker para Heavy Process
 */
export class HeavyProcessWorker {
    worker;
    constructor() {
        this.worker = bullMQManager.createWorker(QUEUES.HEAVY_PROCESS, this.handleHeavyProcess.bind(this), { concurrency: 2 });
    }
    async handleHeavyProcess(job) {
        const { tenantId, traceId, data: rawData } = job.data;
        const data = rawData;
        try {
            // Validar tenant
            await this.validateTenant(tenantId);
            console.log(`[HeavyProcessWorker] Processing ${data.processType} for tenant ${tenantId}`);
            // Simular processamento pesado
            await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
            logInfo('Heavy process completed', {
                service: 'heavy-process-worker',
                payload: { tenantId, traceId, processType: data.processType }
            });
        }
        catch (error) {
            logError('HEAVY_PROCESS_ERROR', 'Failed to process heavy job', {
                service: 'heavy-process-worker',
                error: error,
                payload: { tenantId, traceId }
            });
            throw error;
        }
    }
    /**
     * Validar se tenant existe
     */
    async validateTenant(tenantId) {
        if (!tenantId || tenantId <= 0) {
            throw new ValidationError(`Tenant ${tenantId} not found`);
        }
    }
    async close() {
        if (this.worker) {
            const workerObj = this.worker;
            if (typeof workerObj.close === 'function') {
                await workerObj.close();
            }
            console.log('[HeavyProcessWorker] Worker closed');
        }
    }
}
// Instâncias globais dos workers
let auditLogWorker = null;
let emailWorker = null;
let heavyProcessWorker = null;
let workersInitialized = false;
/**
 * Inicializar todos os workers
 */
export function initializeWorkers() {
    if (workersInitialized) {
        console.log('[BullMQ] Workers já inicializados neste processo');
        return;
    }
    try {
        auditLogWorker = new AuditLogWorker();
        emailWorker = new EmailWorker();
        heavyProcessWorker = new HeavyProcessWorker();
        workersInitialized = true;
        console.log('[BullMQ] All workers initialized');
    }
    catch (error) {
        console.error('[BullMQ] Failed to initialize workers', error);
        throw error;
    }
}
/**
 * Fechar todos os workers
 */
export async function closeWorkers() {
    const closePromises = [];
    if (auditLogWorker) {
        closePromises.push(auditLogWorker.close());
    }
    if (emailWorker) {
        closePromises.push(emailWorker.close());
    }
    if (heavyProcessWorker) {
        closePromises.push(heavyProcessWorker.close());
    }
    await Promise.all(closePromises);
    workersInitialized = false;
    auditLogWorker = null;
    emailWorker = null;
    heavyProcessWorker = null;
    console.log('[BullMQ] All workers closed');
}
/**
 * Obter estatísticas dos workers
 */
export function getWorkersStats() {
    return {
        auditLog: !!auditLogWorker,
        email: !!emailWorker,
        heavyProcess: !!heavyProcessWorker,
    };
}
