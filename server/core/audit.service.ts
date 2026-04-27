import { auditLogs } from "../../drizzle/schema.js";
import { logger } from "../_core/logger.js";

export type AuditAction = "READ" | "WRITE" | "DELETE";

type AuditMetadata = {
  userId?: number;
  traceId?: string;
  payload?: unknown;
  [key: string]: unknown;
};

function limitPayload(payload: unknown, maxChars = 2000): unknown {
  if (payload == null) return payload;
  const raw = JSON.stringify(payload);
  if (raw.length <= maxChars) return payload;
  return {
    truncated: true,
    size: raw.length,
    preview: raw.slice(0, maxChars),
  };
}

export async function logAudit(
  tenantId: number,
  action: AuditAction,
  entity: string,
  metadata: AuditMetadata = {}
): Promise<void> {
  const { getDb } = await import("../db/index.js");
  const traceId = typeof metadata.traceId === "string" ? metadata.traceId : null;
  const userId = typeof metadata.userId === "number" ? metadata.userId : null;

  try {
    if (!tenantId || tenantId <= 0) {
      logger.warn({ traceId, tenantId: tenantId ?? null, action, entity }, "audit_log_skipped_invalid_tenant");
      return;
    }

    const db = await getDb();
    if (!db) {
      logger.warn({ traceId, tenantId, action, entity }, "audit_log_skipped_db_unavailable");
      return;
    }

    const payload = limitPayload(metadata.payload);
    const fullMetadata = {
      ...metadata,
      payload,
      timestamp: new Date().toISOString(),
    };

    await db.insert(auditLogs).values({
      tenantId,
      actorUserId: userId,
      action,
      entity,
      payloadJson: JSON.stringify(fullMetadata),
      traceId,
      createdAt: new Date(),
    });

    logger.info(
      {
        traceId,
        tenantId,
        action,
        entity,
        userId,
      },
      "audit_log_recorded"
    );
  } catch (error) {
    logger.warn(
      {
        traceId,
        tenantId: tenantId ?? null,
        action,
        entity,
        error: error instanceof Error ? error.message : String(error),
      },
      "audit_log_failed_non_blocking"
    );
  }
}
