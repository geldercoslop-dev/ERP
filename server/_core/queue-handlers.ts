import { queueManager } from './queue-manager.js';
import type { AuditAction } from '../db/core.js';

/**
 * Handler para jobs de audit log
 */
async function auditLogHandler(job: unknown): Promise<void> {
  const db = await import('../db/index.js');
  const jobData = ((job as Record<string, unknown>).data as Record<string, unknown>);
  
  await db.insertAuditLog({
    tenantId: jobData.tenantId as number | null | undefined,
    actorUserId: jobData.actorUserId as number | null | undefined,
    actorVendedorId: jobData.actorVendedorId as number | null | undefined,
    action: jobData.action as AuditAction,
    entity: jobData.entity as string,
    entityId: (jobData.entityId as string | number | null | undefined) ?? null,
    payloadJson: jobData.payloadJson as string | null | undefined,
  });
}

/**
 * Handler para jobs de email (placeholder)
 */
async function emailHandler(job: unknown): Promise<void> {
  const { tenantId, to, subject, body } = (job as Record<string, unknown>).data as Record<string, unknown>;
  
  // Simular envio de email
  console.log(`[EMAIL] Tenant ${tenantId}: Enviando email para ${to} - ${subject}`);
  
  // Simular latência de envio
  await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
  
  console.log(`[EMAIL] Tenant ${tenantId}: Email enviado com sucesso`);
}

/**
 * Handler para processamento pesado
 */
async function heavyProcessHandler(job: unknown): Promise<void> {
  const { tenantId, processType, data } = (job as Record<string, unknown>).data as Record<string, unknown>;
  
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

export function enqueueAuditLog(
  tenantId: number,
  actorUserId: number | null,
  actorVendedorId: number | null,
  action: unknown,
  entity: string,
  entityId: string | number | null | undefined,
  payloadJson: string | null
): string {
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

export function enqueueEmail(
  tenantId: number,
  to: string,
  subject: string,
  body: string,
  priority: 'low' | 'normal' | 'high' = 'normal'
): string {
  return queueManager.enqueue({
    tenantId,
    type: 'email',
    data: { tenantId, to, subject, body },
    priority
  });
}

export function enqueueHeavyProcess(
  tenantId: number,
  processType: string,
  data: unknown,
  priority: 'low' | 'normal' | 'high' = 'low'
): string {
  return queueManager.enqueue({
    tenantId,
    type: 'heavy_process',
    data: { tenantId, processType, data },
    priority
  });
}

