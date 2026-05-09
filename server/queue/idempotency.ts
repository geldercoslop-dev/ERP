/**
 * Wrapper Fino de Idempotência para Jobs
 * 
 * Delega todas as operações para o serviço oficial IdempotencyJobService.
 * Mantém compatibilidade com API existente de queue.ts e system-health.ts.
 */

import {
  generateJobIdempotencyKey as serviceGenerateKey,
  wasJobExecuted as serviceWasJobExecuted,
  markJobStarted as serviceMarkJobStarted,
  markJobCompleted as serviceMarkJobCompleted,
  markJobFailed as serviceMarkJobFailed,
  getJobExecution as serviceGetJobExecution,
  cleanupExpiredExecutions,
  getJobExecutionStats as serviceGetJobExecutionStats,
  type JobIdempotencyIdentity,
  type JobExecutionRecord as ServiceJobExecutionRecord,
} from '../services/idempotency-job.service.js';

export interface JobIdempotencyConfig {
  jobType: string;
  entity?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
  userId?: string;
}

export interface JobExecutionRecord {
  id: number;
  jobId: string;
  jobType: string;
  entity?: string;
  entityId?: string;
  executedAt: Date;
  status: 'started' | 'completed' | 'failed';
  resultJson?: string;
  errorJson?: string;
  executionTimeMs?: number;
  traceId?: string;
}

/**
 * Gera chave de idempotência única para job.
 * Delega para o serviço oficial.
 */
export function generateJobIdempotencyKey(config: JobIdempotencyConfig): string {
  return serviceGenerateKey(config);
}

/**
 * Verifica se job já foi executado.
 * Requer tenantId e idempotencyKey.
 */
export async function wasJobExecuted(identity: JobIdempotencyIdentity): Promise<boolean> {
  return serviceWasJobExecuted(identity);
}

/**
 * Registra início de execução de job.
 * Requer tenantId, idempotencyKey, jobId, queueName, jobType.
 */
export async function markJobStarted(
  identity: JobIdempotencyIdentity & {
    jobId: string;
    queueName: string;
    jobType: string;
    traceId?: string;
  }
): Promise<boolean> {
  const result = await serviceMarkJobStarted(identity);
  return result.started;
}

/**
 * Marca job como completado.
 * Requer tenantId e idempotencyKey.
 */
export async function markJobCompleted(
  identity: JobIdempotencyIdentity & {
    result?: Record<string, unknown>;
    executionTimeMs?: number;
  }
): Promise<void> {
  await serviceMarkJobCompleted(identity);
}

/**
 * Marca job como falho.
 * Requer tenantId e idempotencyKey.
 */
export async function markJobFailed(
  identity: JobIdempotencyIdentity & {
    error: unknown;
    executionTimeMs?: number;
  }
): Promise<void> {
  await serviceMarkJobFailed(identity);
}

/**
 * Obtém registro de execução de job.
 * Requer tenantId e idempotencyKey.
 */
export async function getJobExecution(identity: JobIdempotencyIdentity): Promise<JobExecutionRecord | null> {
  const record = await serviceGetJobExecution(identity);
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    jobId: record.jobId,
    jobType: record.jobType,
    executedAt: record.startedAt,
    status: record.status as 'started' | 'completed' | 'failed',
    resultJson: record.resultJson ?? undefined,
    errorJson: record.errorJson ?? undefined,
    executionTimeMs: record.executionTimeMs ?? undefined,
    traceId: record.traceId ?? undefined,
  };
}

/**
 * Limpa registros antigos de execução (manter apenas últimos 7 dias).
 */
export async function cleanupJobExecutions(): Promise<void> {
  await cleanupExpiredExecutions({ olderThanDays: 7 });
}

/**
 * Obtém estatísticas de execuções de jobs.
 * Adapta retorno para compatibilidade com system-health.ts.
 */
export async function getJobExecutionStats(): Promise<{
  total: number;
  started: number;
  completed: number;
  failed: number;
  byType: Record<string, number>;
}> {
  const stats = await serviceGetJobExecutionStats();

  return {
    total: stats.total,
    started: stats.started,
    completed: stats.completed,
    failed: stats.failed,
    byType: {},
  };
}
