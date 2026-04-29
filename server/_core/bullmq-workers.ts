/**
 * BullMQ Workers
 * 
 * Workers para processar jobs com validação de tenant
 */

import { bullMQManager, QueueJobData, BullMQJob, QUEUES } from './bullmq-queue.js';
import { enqueueAuditLog } from './queue-handlers.js';
import { ValidationError } from './errors/typed-errors.js';
import { logInfo, logError } from './service-logger.js';
import { AuditLogService } from "../services/audit-log.service.js";

function parseAuditPayload(payloadJson: unknown): Record<string, unknown> {
  if (payloadJson == null || payloadJson === "") return {};
  if (typeof payloadJson !== "string") {
    return { rawPayload: payloadJson };
  }

  try {
    const parsed = JSON.parse(payloadJson) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { rawPayload: parsed };
  } catch {
    return { rawPayload: payloadJson };
  }
}

// Interface para dados do job de audit log
interface AuditLogJobData extends QueueJobData {
  actorUserId?: number;
  actorVendedorId?: number;
  action: string;
  entity: string;
  entityId?: string | number | null;
  payloadJson?: string | null;
}

// Interface para dados do job de email
interface EmailJobData extends QueueJobData {
  to: string;
  subject: string;
  body: string;
}

// Interface para dados do job de heavy process
interface HeavyProcessJobData extends QueueJobData {
  processType: string;
  processData: unknown;
}

/**
 * Worker para Audit Log
 */
export class AuditLogWorker {
  private worker: unknown;

  constructor() {
    this.worker = bullMQManager.createWorker<AuditLogJobData>(
      QUEUES.AUDIT_LOG,
      this.handleAuditLog.bind(this),
      { concurrency: 5 }
    );
  }

  private async handleAuditLog(job: BullMQJob<AuditLogJobData>): Promise<void> {
    const { tenantId, traceId, data: rawData } = job.data;
    const data = rawData as Record<string, unknown>;
    
    try {
      // Validar tenant
      await this.validateTenant(tenantId);
      
      // Inserir audit log no banco via service
      await AuditLogService.logAction({
        tenantId,
        actorUserId: typeof data.actorUserId === 'number' ? data.actorUserId : Number(data.actorUserId) || undefined,
        actorVendedorId: typeof data.actorVendedorId === 'number' ? data.actorVendedorId : Number(data.actorVendedorId) || undefined,
        action: String(data.action),
        entity: String(data.entity),
        entityId: data.entityId != null ? String(data.entityId) : undefined,
        payload: parseAuditPayload(data.payloadJson),
        traceId,
      });

      logInfo('Audit log processed', {
        service: 'audit-log-worker',
        payload: { tenantId, traceId, action: data.action }
      });

    } catch (error) {
      logError('AUDIT_LOG_ERROR', 'Failed to process audit log', {
        service: 'audit-log-worker',
        error: error as Error,
        payload: { tenantId, traceId }
      });
      throw error;
    }
  }

  /**
   * Validar se tenant existe
   */
  private async validateTenant(tenantId: number): Promise<void> {
    if (!tenantId || tenantId <= 0) {
      throw new ValidationError(`Tenant ${tenantId} not found`);
    }
  }

  async close(): Promise<void> {
    if (this.worker) {
      const workerObj = this.worker as Record<string, unknown>;
      if (typeof workerObj.close === 'function') {
        await (workerObj.close as () => Promise<void>)();
      }
      console.log('[AuditLogWorker] Worker closed');
    }
  }
}

/**
 * Worker para Email
 */
export class EmailWorker {
  private worker: unknown;

  constructor() {
    this.worker = bullMQManager.createWorker<EmailJobData>(
      QUEUES.EMAIL,
      this.handleEmail.bind(this),
      { concurrency: 3 }
    );
  }

  private async handleEmail(job: BullMQJob<EmailJobData>): Promise<void> {
    const { tenantId, traceId, data: rawData } = job.data;
    const data = rawData as Record<string, unknown>;
    
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

    } catch (error) {
      logError('EMAIL_ERROR', 'Failed to send email', {
        service: 'email-worker',
        error: error as Error,
        payload: { tenantId, traceId }
      });
      throw error;
    }
  }

  /**
   * Validar se tenant existe
   */
  private async validateTenant(tenantId: number): Promise<void> {
    if (!tenantId || tenantId <= 0) {
      throw new ValidationError(`Tenant ${tenantId} not found`);
    }
  }

  async close(): Promise<void> {
    if (this.worker) {
      const workerObj = this.worker as Record<string, unknown>;
      if (typeof workerObj.close === 'function') {
        await (workerObj.close as () => Promise<void>)();
      }
      console.log('[EmailWorker] Worker closed');
    }
  }
}

/**
 * Worker para Heavy Process
 */
export class HeavyProcessWorker {
  private worker: unknown;

  constructor() {
    this.worker = bullMQManager.createWorker<HeavyProcessJobData>(
      QUEUES.HEAVY_PROCESS,
      this.handleHeavyProcess.bind(this),
      { concurrency: 2 }
    );
  }

  private async handleHeavyProcess(job: BullMQJob<HeavyProcessJobData>): Promise<void> {
    const { tenantId, traceId, data: rawData } = job.data;
    const data = rawData as Record<string, unknown>;
    
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

    } catch (error) {
      logError('HEAVY_PROCESS_ERROR', 'Failed to process heavy job', {
        service: 'heavy-process-worker',
        error: error as Error,
        payload: { tenantId, traceId }
      });
      throw error;
    }
  }

  /**
   * Validar se tenant existe
   */
  private async validateTenant(tenantId: number): Promise<void> {
    if (!tenantId || tenantId <= 0) {
      throw new ValidationError(`Tenant ${tenantId} not found`);
    }
  }

  async close(): Promise<void> {
    if (this.worker) {
      const workerObj = this.worker as Record<string, unknown>;
      if (typeof workerObj.close === 'function') {
        await (workerObj.close as () => Promise<void>)();
      }
      console.log('[HeavyProcessWorker] Worker closed');
    }
  }
}

// Instâncias globais dos workers
let auditLogWorker: AuditLogWorker | null = null;
let emailWorker: EmailWorker | null = null;
let heavyProcessWorker: HeavyProcessWorker | null = null;
let workersInitialized = false;

/**
 * Inicializar todos os workers
 */
export function initializeWorkers(): void {
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
  } catch (error) {
    console.error('[BullMQ] Failed to initialize workers', error);
    throw error;
  }
}

/**
 * Fechar todos os workers
 */
export async function closeWorkers(): Promise<void> {
  const closePromises: Promise<void>[] = [];
  
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
export function getWorkersStats(): {
  auditLog: boolean;
  email: boolean;
  heavyProcess: boolean;
} {
  return {
    auditLog: !!auditLogWorker,
    email: !!emailWorker,
    heavyProcess: !!heavyProcessWorker,
  };
}

