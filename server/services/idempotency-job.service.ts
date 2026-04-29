/**
 * Idempotency Job Service
 * 
 * Gerencia idempotência de jobs usando a tabela jobExecutionLog.
 * Fornece métodos para registrar, verificar e atualizar execuções de jobs.
 */

import { and, eq, lt, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDb } from "../db/index.js";
import { jobExecutionLog } from "../../drizzle/schema.js";

// ===== EXPORTED TYPES =====

export type JobExecutionStatus = "started" | "completed" | "failed" | "skipped" | "expired";

export interface JobIdempotencyIdentity {
  tenantId: number;
  idempotencyKey: string;
}

export interface MarkJobStartedInput extends JobIdempotencyIdentity {
  jobId: string;
  queueName: string;
  jobType: string;
  payloadHash?: string;
  traceId?: string;
  attempts?: number;
}

export interface MarkJobCompletedInput extends JobIdempotencyIdentity {
  result?: Record<string, unknown>;
  executionTimeMs?: number;
}

export interface MarkJobFailedInput extends JobIdempotencyIdentity {
  error: unknown;
  executionTimeMs?: number;
}

export interface JobExecutionRecord {
  id: number;
  tenantId: number;
  jobId: string;
  idempotencyKey: string;
  queueName: string;
  jobType: string;
  status: JobExecutionStatus;
  payloadHash: string | null;
  resultJson: string | null;
  errorJson: string | null;
  traceId: string | null;
  startedAt: Date;
  completedAt: Date | null;
  failedAt: Date | null;
  executionTimeMs: number | null;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

// ===== INTERNAL HELPERS =====

function assertValidJobIdentity(input: JobIdempotencyIdentity): void {
  if (!Number.isFinite(input.tenantId) || input.tenantId <= 0) {
    throw new Error("Invalid tenantId: must be a positive finite number");
  }
  if (!input.idempotencyKey || input.idempotencyKey.trim().length === 0) {
    throw new Error("Invalid idempotencyKey: must be a non-empty string");
  }
}

function safeJsonStringify(value: unknown): string {
  try {
    const result = JSON.stringify(value);
    return typeof result === "string" ? result : JSON.stringify({ value: String(value) });
  } catch {
    return JSON.stringify({ _error: "JSON.stringify failed", _type: typeof value });
  }
}

function serializeError(error: unknown): string {
  if (error instanceof Error) {
    return safeJsonStringify({
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
  }
  return safeJsonStringify({ _error: "Non-error thrown", value: error });
}

function isDuplicateKeyError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("duplicate") ||
      message.includes("unique") ||
      message.includes("constraint")
    );
  }
  return false;
}

function createStableHash(value: unknown): string {
  return createHash("sha256").update(safeJsonStringify(value)).digest("hex");
}

// ===== PUBLIC METHODS =====

/**
 * Gera chave de idempotência determinística para job.
 * Usa SHA-256 para garantir hash estável de 64 caracteres.
 */
export function generateJobIdempotencyKey(input: {
  jobType: string;
  entity?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
}): string {
  const { jobType, entity, entityId, payload } = input;

  // Montar objeto estável para hash
  const hashInput = {
    jobType,
    entity: entity ?? null,
    entityId: entityId ?? null,
    payload: payload ?? null,
  };

  return createStableHash(hashInput);
}

/**
 * Verifica se job já foi executado com sucesso.
 * Retorna true somente se existir registro com status = "completed".
 */
export async function wasJobExecuted(
  input: JobIdempotencyIdentity
): Promise<boolean> {
  assertValidJobIdentity(input);

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const records = await db
    .select()
    .from(jobExecutionLog)
    .where(
      and(
        eq(jobExecutionLog.tenantId, input.tenantId),
        eq(jobExecutionLog.idempotencyKey, input.idempotencyKey),
        eq(jobExecutionLog.status, "completed")
      )
    )
    .limit(1);

  return records.length > 0;
}

/**
 * Obtém registro de execução de job por tenantId + idempotencyKey.
 */
export async function getJobExecution(
  input: JobIdempotencyIdentity
): Promise<JobExecutionRecord | null> {
  assertValidJobIdentity(input);

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const records = await db
    .select()
    .from(jobExecutionLog)
    .where(
      and(
        eq(jobExecutionLog.tenantId, input.tenantId),
        eq(jobExecutionLog.idempotencyKey, input.idempotencyKey)
      )
    )
    .limit(1);

  if (records.length === 0) {
    return null;
  }

  const record = records[0];
  return {
    id: record.id,
    tenantId: record.tenantId,
    jobId: record.jobId,
    idempotencyKey: record.idempotencyKey,
    queueName: record.queueName,
    jobType: record.jobType,
    status: record.status,
    payloadHash: record.payloadHash,
    resultJson: record.resultJson,
    errorJson: record.errorJson,
    traceId: record.traceId,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    failedAt: record.failedAt,
    executionTimeMs: record.executionTimeMs,
    attempts: record.attempts,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Marca início de execução de job.
 * Usa unique constraint (tenantId + idempotencyKey) como barreira real.
 */
export async function markJobStarted(
  input: MarkJobStartedInput
): Promise<{ started: true } | { started: false; reason: "duplicate_completed" | "already_started" }> {
  assertValidJobIdentity(input);

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const now = new Date();

  try {
    await db.insert(jobExecutionLog).values({
      tenantId: input.tenantId,
      jobId: input.jobId,
      idempotencyKey: input.idempotencyKey,
      queueName: input.queueName,
      jobType: input.jobType,
      status: "started",
      payloadHash: input.payloadHash ?? null,
      traceId: input.traceId ?? null,
      attempts: input.attempts ?? 1,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return { started: true };
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    // Duplicate key: consultar registro existente
    const existing = await getJobExecution({
      tenantId: input.tenantId,
      idempotencyKey: input.idempotencyKey,
    });

    if (!existing) {
      // Should not happen, but treat as started false
      return { started: false, reason: "already_started" };
    }

    if (existing.status === "completed") {
      return { started: false, reason: "duplicate_completed" };
    }

    if (existing.status === "started") {
      return { started: false, reason: "already_started" };
    }

    // Se status é failed/skipped/expired: permitir retry
    await db
      .update(jobExecutionLog)
      .set({
        status: "started",
        jobId: input.jobId,
        queueName: input.queueName,
        jobType: input.jobType,
        payloadHash: input.payloadHash ?? null,
        traceId: input.traceId ?? null,
        attempts: existing.attempts + 1,
        startedAt: now,
        failedAt: null,
        completedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(jobExecutionLog.tenantId, input.tenantId),
          eq(jobExecutionLog.idempotencyKey, input.idempotencyKey)
        )
      );

    return { started: true };
  }
}

/**
 * Marca job como completado.
 */
export async function markJobCompleted(input: MarkJobCompletedInput): Promise<void> {
  assertValidJobIdentity(input);

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const now = new Date();

  await db
    .update(jobExecutionLog)
    .set({
      status: "completed",
      completedAt: now,
      resultJson: safeJsonStringify(input.result ?? {}),
      executionTimeMs: input.executionTimeMs ?? null,
      updatedAt: now,
    })
    .where(
      and(
        eq(jobExecutionLog.tenantId, input.tenantId),
        eq(jobExecutionLog.idempotencyKey, input.idempotencyKey)
      )
    );
}

/**
 * Marca job como falho.
 */
export async function markJobFailed(input: MarkJobFailedInput): Promise<void> {
  assertValidJobIdentity(input);

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const now = new Date();

  await db
    .update(jobExecutionLog)
    .set({
      status: "failed",
      failedAt: now,
      errorJson: serializeError(input.error),
      executionTimeMs: input.executionTimeMs ?? null,
      updatedAt: now,
    })
    .where(
      and(
        eq(jobExecutionLog.tenantId, input.tenantId),
        eq(jobExecutionLog.idempotencyKey, input.idempotencyKey)
      )
    );
}

/**
 * Marca job como skipped.
 * Se não houver registro, insere registro mínimo com status skipped.
 */
export async function markJobSkipped(
  input: JobIdempotencyIdentity & { reason?: string }
): Promise<void> {
  assertValidJobIdentity(input);

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const now = new Date();

  const existing = await getJobExecution({
    tenantId: input.tenantId,
    idempotencyKey: input.idempotencyKey,
  });

  if (existing) {
    // Atualizar registro existente
    await db
      .update(jobExecutionLog)
      .set({
        status: "skipped",
        errorJson: input.reason ? safeJsonStringify({ reason: input.reason }) : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(jobExecutionLog.tenantId, input.tenantId),
          eq(jobExecutionLog.idempotencyKey, input.idempotencyKey)
        )
      );
  } else {
    // Inserir registro mínimo
    await db.insert(jobExecutionLog).values({
      tenantId: input.tenantId,
      jobId: `skipped-${input.idempotencyKey.slice(0, 56)}`,
      idempotencyKey: input.idempotencyKey,
      queueName: "skipped",
      jobType: "skipped",
      status: "skipped",
      errorJson: input.reason ? safeJsonStringify({ reason: input.reason }) : null,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }
}

/**
 * Marca execuções antigas como expired.
 * Usa createdAt como referência.
 * Apenas expira status finais (completed, failed, skipped).
 * Retorna quantidade afetada (0 se Drizzle não retornar count).
 */
export async function cleanupExpiredExecutions(input: {
  olderThanDays: number;
  tenantId?: number;
}): Promise<number> {
  const { olderThanDays, tenantId } = input;

  if (!olderThanDays || olderThanDays <= 0) {
    throw new Error("olderThanDays must be a positive number");
  }

  if (tenantId !== undefined && (!Number.isFinite(tenantId) || tenantId <= 0)) {
    throw new Error("Invalid tenantId: must be a positive number");
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const now = new Date();

  // Apenas expirar status finais, não started
  const baseCondition = and(
    inArray(jobExecutionLog.status, ["completed", "failed", "skipped"]),
    lt(jobExecutionLog.createdAt, cutoffDate)
  );

  const whereCondition = tenantId
    ? and(baseCondition, eq(jobExecutionLog.tenantId, tenantId))
    : baseCondition;

  await db
    .update(jobExecutionLog)
    .set({
      status: "expired",
      updatedAt: now,
    })
    .where(whereCondition);

  // Drizzle MySQL não retorna count em update
  // TODO: implementar count via select se necessário
  return 0;
}

/**
 * Obtém estatísticas de execuções de jobs.
 * Agrega em TypeScript para simplicidade.
 */
export async function getJobExecutionStats(input?: {
  tenantId?: number;
}): Promise<{
  total: number;
  started: number;
  completed: number;
  failed: number;
  skipped: number;
  expired: number;
}> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const whereCondition = input?.tenantId
    ? eq(jobExecutionLog.tenantId, input.tenantId)
    : undefined;

  const records = whereCondition
    ? await db.select().from(jobExecutionLog).where(whereCondition)
    : await db.select().from(jobExecutionLog);

  const stats = {
    total: records.length,
    started: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    expired: 0,
  };

  for (const record of records) {
    const status = record.status;
    if (status === "started") stats.started++;
    else if (status === "completed") stats.completed++;
    else if (status === "failed") stats.failed++;
    else if (status === "skipped") stats.skipped++;
    else if (status === "expired") stats.expired++;
  }

  return stats;
}
