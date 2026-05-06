/**
 * LEO Approval Service
 *
 * Real implementation using leo_approvals table.
 * All actions require explicit approval - no auto-approve.
 */

import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { insertAuditLog } from "./audit-service.js";
import { leoApprovals } from "../../drizzle/schema.js";
import { ValidationError, InfrastructureError } from "../_core/errors/typed-errors.js";
import { getInsertId } from "../db/core.js";

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface CreatePendingApprovalInput {
  tenantId: number;
  action: string;
  entity: string;
  description: string;
  riskLevel: RiskLevel;
  payload: Record<string, unknown>;
  impact?: Record<string, unknown>;
  requestedBy?: string;
  expiresInMinutes?: number;
}

export interface PendingApproval {
  id: number;
  actionId: string;
  tenantId: number;
  action: string;
  entity: string;
  description: string;
  riskLevel: RiskLevel;
  payload: Record<string, unknown>;
  impact?: Record<string, unknown>;
  status: ApprovalStatus;
  requestedBy?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalResult {
  success: boolean;
  approval?: PendingApproval;
  message: string;
}

function assertDbConnection(db: unknown): asserts db is Exclude<typeof db, null> {
  if (!db) {
    throw new InfrastructureError("Database connection not available");
  }
}

/**
 * Parse user ID safely - only accepts pure numeric strings or positive integers
 * Rejects strings with non-digit characters (e.g., "user_123")
 */
function parseUserId(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  
  if (typeof value === 'string') {
    // Only accept strings with pure digits (no "user_123", no spaces, no dashes)
    if (!/^\d+$/.test(value.trim())) {
      return null;
    }
    const parsed = parseInt(value.trim(), 10);
    return parsed > 0 ? parsed : null;
  }
  
  return null;
}

function serializePayload(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return "{}";
  }
}

function parsePayload(payloadJson: string | null): Record<string, unknown> {
  if (!payloadJson) return {};
  try {
    return JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function mapApprovalFromDb(row: typeof leoApprovals.$inferSelect): PendingApproval {
  return {
    id: row.id,
    actionId: row.actionId,
    tenantId: row.tenantId,
    action: row.action,
    entity: row.entity,
    description: row.description || "",
    riskLevel: row.riskLevel as RiskLevel,
    payload: parsePayload(row.payloadJson),
    status: row.status as ApprovalStatus,
    requestedBy: row.requestedBy ? String(row.requestedBy) : undefined,
    approvedBy: row.approvedBy ? String(row.approvedBy) : undefined,
    approvedAt: row.approvedAt ? new Date(row.approvedAt).toISOString() : undefined,
    rejectedBy: row.rejectedBy ? String(row.rejectedBy) : undefined,
    rejectedAt: row.rejectedAt ? new Date(row.rejectedAt).toISOString() : undefined,
    expiresAt: new Date(row.expiresAt).toISOString(),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

/**
 * Create a pending approval request for a critical action
 * Creates record with status PENDING - no auto-approve
 */
export async function createPendingApproval(input: CreatePendingApprovalInput): Promise<ApprovalResult> {
  if (!input.tenantId || !Number.isInteger(input.tenantId) || input.tenantId <= 0) {
    throw new ValidationError('tenantId is required and must be a positive integer');
  }

  if (!input.action || !input.entity) {
    throw new ValidationError('action and entity are required');
  }

  const actionId = `${input.entity}_${input.action}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const expiresInMinutes = input.expiresInMinutes || 60;
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  const dbConn = await getDb();
  assertDbConnection(dbConn);

  const result = await dbConn.insert(leoApprovals).values({
    tenantId: input.tenantId,
    actionId,
    action: input.action,
    entity: input.entity,
    description: input.description,
    riskLevel: input.riskLevel,
    payloadJson: serializePayload(input.payload),
    status: "PENDING",
    requestedBy: parseUserId(input.requestedBy),
    expiresAt,
  });

  const approvalId = getInsertId(result);

  await insertAuditLog({
    tenantId: input.tenantId,
    action: "create",
    entity: "leo_approval",
    entityId: String(approvalId),
    payloadJson: JSON.stringify({ actionId, action: input.action, entity: input.entity, riskLevel: input.riskLevel }),
  });

  const created = await dbConn
    .select()
    .from(leoApprovals)
    .where(eq(leoApprovals.id, approvalId))
    .limit(1);

  if (!created || created.length === 0) {
    throw new InfrastructureError("Failed to retrieve created approval");
  }

  return {
    success: true,
    approval: mapApprovalFromDb(created[0]),
    message: 'Approval request created and pending review',
  };
}

/**
 * Approve a pending action
 */
export async function approveAction(
  actionId: string,
  tenantId: number,
  approvedBy: string
): Promise<ApprovalResult> {
  if (!actionId) {
    throw new ValidationError('actionId is required');
  }

  if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
    throw new ValidationError('tenantId is required and must be a positive integer');
  }

  const approverId = parseUserId(approvedBy);
  if (!approverId) {
    throw new ValidationError('approvedBy must be a positive integer or numeric string');
  }

  const dbConn = await getDb();
  assertDbConnection(dbConn);

  const existing = await dbConn
    .select()
    .from(leoApprovals)
    .where(and(eq(leoApprovals.actionId, actionId), eq(leoApprovals.tenantId, tenantId)))
    .limit(1);

  if (!existing || existing.length === 0) {
    throw new ValidationError('Approval request not found');
  }

  const approval = existing[0];

  if (approval.status !== "PENDING") {
    throw new ValidationError(`Cannot approve: status is ${approval.status}`);
  }

  await dbConn
    .update(leoApprovals)
    .set({
      status: "APPROVED",
      approvedBy: approverId,
      approvedAt: new Date(),
    })
    .where(eq(leoApprovals.id, approval.id));

  await insertAuditLog({
    tenantId,
    action: "update",
    entity: "leo_approval",
    entityId: String(approval.id),
    actorUserId: approverId,
    payloadJson: JSON.stringify({ actionId, operation: "approve", previousStatus: approval.status }),
  });

  const updated = await dbConn
    .select()
    .from(leoApprovals)
    .where(eq(leoApprovals.id, approval.id))
    .limit(1);

  return {
    success: true,
    approval: mapApprovalFromDb(updated[0]),
    message: 'Action approved successfully',
  };
}

/**
 * Reject a pending action
 */
export async function rejectAction(
  actionId: string,
  tenantId: number,
  rejectedBy: string
): Promise<ApprovalResult> {
  if (!actionId) {
    throw new ValidationError('actionId is required');
  }

  if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
    throw new ValidationError('tenantId is required and must be a positive integer');
  }

  const rejectorId = parseUserId(rejectedBy);
  if (!rejectorId) {
    throw new ValidationError('rejectedBy must be a positive integer or numeric string');
  }

  const dbConn = await getDb();
  assertDbConnection(dbConn);

  const existing = await dbConn
    .select()
    .from(leoApprovals)
    .where(and(eq(leoApprovals.actionId, actionId), eq(leoApprovals.tenantId, tenantId)))
    .limit(1);

  if (!existing || existing.length === 0) {
    throw new ValidationError('Approval request not found');
  }

  const approval = existing[0];

  if (approval.status !== "PENDING") {
    throw new ValidationError(`Cannot reject: status is ${approval.status}`);
  }

  await dbConn
    .update(leoApprovals)
    .set({
      status: "REJECTED",
      rejectedBy: rejectorId,
      rejectedAt: new Date(),
    })
    .where(eq(leoApprovals.id, approval.id));

  await insertAuditLog({
    tenantId,
    action: "update",
    entity: "leo_approval",
    entityId: String(approval.id),
    actorUserId: rejectorId,
    payloadJson: JSON.stringify({ actionId, operation: "reject", previousStatus: approval.status }),
  });

  return {
    success: true,
    message: 'Action rejected successfully',
  };
}

/**
 * Get a pending approval by actionId
 */
export async function getPendingApproval(actionId: string, tenantId: number): Promise<PendingApproval | null> {
  if (!actionId) {
    throw new ValidationError('actionId is required');
  }

  if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
    throw new ValidationError('tenantId is required and must be a positive integer');
  }

  const dbConn = await getDb();
  assertDbConnection(dbConn);

  const result = await dbConn
    .select()
    .from(leoApprovals)
    .where(and(eq(leoApprovals.actionId, actionId), eq(leoApprovals.tenantId, tenantId)))
    .limit(1);

  if (!result || result.length === 0) {
    return null;
  }

  return mapApprovalFromDb(result[0]);
}

/**
 * List pending approvals for a tenant
 */
export async function listPendingApprovals(tenantId: number, status?: ApprovalStatus): Promise<PendingApproval[]> {
  if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
    throw new ValidationError('tenantId is required and must be a positive integer');
  }

  const dbConn = await getDb();
  assertDbConnection(dbConn);

  const targetStatus = status || "PENDING";

  const results = await dbConn
    .select()
    .from(leoApprovals)
    .where(and(eq(leoApprovals.tenantId, tenantId), eq(leoApprovals.status, targetStatus)))
    .orderBy(desc(leoApprovals.createdAt));

  return results.map(mapApprovalFromDb);
}

/**
 * Expire old pending approvals for a specific tenant
 */
export async function expireOldApprovals(tenantId: number): Promise<number> {
  if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
    throw new ValidationError('tenantId is required and must be a positive integer');
  }

  const dbConn = await getDb();
  assertDbConnection(dbConn);

  const now = new Date();

  const pendingApprovals = await dbConn
    .select()
    .from(leoApprovals)
    .where(and(
      eq(leoApprovals.tenantId, tenantId),
      eq(leoApprovals.status, "PENDING")
    ));

  let expiredCount = 0;

  for (const approval of pendingApprovals) {
    if (new Date(approval.expiresAt) < now) {
      await dbConn
        .update(leoApprovals)
        .set({ status: "EXPIRED" })
        .where(and(
          eq(leoApprovals.id, approval.id),
          eq(leoApprovals.tenantId, tenantId)
        ));

      expiredCount++;

      await insertAuditLog({
        tenantId,
        action: "update",
        entity: "leo_approval",
        entityId: String(approval.id),
        payloadJson: JSON.stringify({ actionId: approval.actionId, operation: "expire", expiredAt: now.toISOString() }),
      });
    }
  }

  return expiredCount;
}

/**
 * Execute an approved action
 * Verifies the action is approved before execution
 */
export async function executeApprovedAction(actionId: string, tenantId: number): Promise<ApprovalResult> {
  if (!actionId) {
    throw new ValidationError('actionId is required');
  }

  if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
    throw new ValidationError('tenantId is required and must be a positive integer');
  }

  const dbConn = await getDb();
  assertDbConnection(dbConn);

  const existing = await dbConn
    .select()
    .from(leoApprovals)
    .where(and(eq(leoApprovals.actionId, actionId), eq(leoApprovals.tenantId, tenantId)))
    .limit(1);

  if (!existing || existing.length === 0) {
    throw new ValidationError('Approval request not found');
  }

  const approval = existing[0];

  if (approval.status !== "APPROVED") {
    throw new ValidationError(`Cannot execute: action is not approved (status: ${approval.status})`);
  }

  await insertAuditLog({
    tenantId,
    action: "create",
    entity: "leo_approval_execution",
    entityId: String(approval.id),
    payloadJson: JSON.stringify({ actionId, executedAt: new Date().toISOString() }),
  });

  return {
    success: true,
    approval: mapApprovalFromDb(approval),
    message: 'Action executed successfully',
  };
}
