import { queueManager } from './queue-manager.js';
import * as db from '../db/index.js';
/**
 * Handler para jobs de audit log
 */
async function auditLogHandler(job) {
    const jobData = job.data;
    await db.insertAuditLog({
        tenantId: jobData.tenantId,
        actorUserId: jobData.actorUserId,
        actorVendedorId: jobData.actorVendedorId,
        action: jobData.action,
        entity: jobData.entity,
        entityId: jobData.entityId ?? null,
        payloadJson: jobData.payloadJson,
    });
}
/**
 * Handler para jobs de email (placeholder)
 */
async function emailHandler(job) {
    const { tenantId, to, subject, body } = job.data;
    // Simular envio de email
    console.log(`[EMAIL] Tenant ${tenantId}: Enviando email para ${to} - ${subject}`);
    // Simular latência de envio
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    console.log(`[EMAIL] Tenant ${tenantId}: Email enviado com sucesso`);
}
/**
 * Handler para processamento pesado
 */
async function heavyProcessHandler(job) {
    const { tenantId, processType, data } = job.data;
    console.log(`[HEAVY] Tenant ${tenantId}: Processando ${processType}`);
    // Simular processamento pesado
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
    console.log(`[HEAVY] Tenant ${tenantId}: Processamento ${processType} concluído`);
}
// Registrar handlers
queueManager.registerHandler('audit_log', auditLogHandler);
queueManager.registerHandler('email', emailHandler);
queueManager.registerHandler('heavy_process', heavyProcessHandler);
/**
 * Funções de enqueue para cada tipo
 */
export function enqueueAuditLog(tenantId, actorUserId, actorVendedorId, action, entity, entityId, payloadJson) {
    return queueManager.enqueue({
        tenantId,
        type: 'audit_log',
        data: {
            tenantId,
            actorUserId,
            actorVendedorId,
            action,
            entity,
            entityId,
            payloadJson
        },
        priority: 'normal'
    });
}
export function enqueueEmail(tenantId, to, subject, body, priority = 'normal') {
    return queueManager.enqueue({
        tenantId,
        type: 'email',
        data: { tenantId, to, subject, body },
        priority
    });
}
export function enqueueHeavyProcess(tenantId, processType, data, priority = 'low') {
    return queueManager.enqueue({
        tenantId,
        type: 'heavy_process',
        data: { tenantId, processType, data },
        priority
    });
}
