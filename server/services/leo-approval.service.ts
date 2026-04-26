/**
 * LEO Approval Service - SAFE MOCK
 *
 * MOCK IMPLEMENTATION: No database table required.
 * All actions are auto-approved for system stability.
 * Preserves interface for future real implementation.
 */

import { ValidationError } from "../_core/errors/typed-errors.js";

export type ApprovalStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
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
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalResult {
  success: boolean;
  approval?: PendingApproval;
  message: string;
}

/**
 * Create a pending approval request for a critical action
 * MOCK: Auto-approves for system stability (no DB table)
 */
export async function createPendingApproval(input: CreatePendingApprovalInput): Promise<ApprovalResult> {
  if (!input.tenantId || !Number.isInteger(input.tenantId) || input.tenantId <= 0) {
    throw new ValidationError('tenantId is required and must be a positive integer');
  }

  if (!input.action || !input.entity) {
    throw new ValidationError('action and entity are required');
  }

  const actionId = `mock_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const now = new Date().toISOString();

  // MOCK: Return auto-approved result
  return {
    success: true,
    approval: {
      id: 1,
      actionId,
      tenantId: input.tenantId,
      action: input.action,
      entity: input.entity,
      description: input.description,
      riskLevel: input.riskLevel,
      payload: input.payload,
      impact: input.impact,
      status: 'APPROVED',
      requestedBy: input.requestedBy || 'LEO',
      approvedBy: 'MOCK_AUTO',
      approvedAt: now,
      expiresAt: now,
      createdAt: now,
      updatedAt: now,
    },
    message: 'MOCK: Action auto-approved (no DB table)',
  };
}

/**
 * Approve a pending action
 * MOCK: Always succeeds (no DB table)
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

  if (!approvedBy) {
    throw new ValidationError('approvedBy is required');
  }

  const now = new Date().toISOString();

  return {
    success: true,
    approval: {
      id: 1,
      actionId,
      tenantId,
      action: 'mock_action',
      entity: 'mock_entity',
      description: 'MOCK approval',
      riskLevel: 'low',
      payload: {},
      status: 'APPROVED',
      requestedBy: 'MOCK',
      approvedBy,
      approvedAt: now,
      expiresAt: now,
      createdAt: now,
      updatedAt: now,
    },
    message: 'MOCK: Action approved (no DB table)',
  };
}

/**
 * Reject a pending action
 * MOCK: Always succeeds (no DB table)
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

  if (!rejectedBy) {
    throw new ValidationError('rejectedBy is required');
  }

  return {
    success: true,
    message: 'MOCK: Action rejected (no DB table)',
  };
}

/**
 * Get a pending approval by actionId
 * MOCK: Returns null (no DB table)
 */
export async function getPendingApproval(actionId: string, tenantId: number): Promise<PendingApproval | null> {
  if (!actionId) {
    throw new ValidationError('actionId is required');
  }

  if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
    throw new ValidationError('tenantId is required and must be a positive integer');
  }

  // MOCK: No DB table, return null
  return null;
}

/**
 * List pending approvals for a tenant
 * MOCK: Returns empty array (no DB table)
 */
export async function listPendingApprovals(tenantId: number, status?: ApprovalStatus): Promise<PendingApproval[]> {
  if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
    throw new ValidationError('tenantId is required and must be a positive integer');
  }

  // MOCK: No DB table, return empty array
  return [];
}

/**
 * Expire old pending approvals
 * MOCK: Returns 0 (no DB table)
 */
export async function expireOldApprovals(): Promise<number> {
  // MOCK: No DB table, return 0
  return 0;
}

/**
 * Execute an approved action
 * MOCK: Always succeeds (no DB table)
 */
export async function executeApprovedAction(actionId: string, tenantId: number): Promise<ApprovalResult> {
  if (!actionId) {
    throw new ValidationError('actionId is required');
  }

  if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
    throw new ValidationError('tenantId is required and must be a positive integer');
  }

  const now = new Date().toISOString();

  return {
    success: true,
    approval: {
      id: 1,
      actionId,
      tenantId,
      action: 'mock_action',
      entity: 'mock_entity',
      description: 'MOCK execution',
      riskLevel: 'low',
      payload: {},
      status: 'APPROVED',
      requestedBy: 'MOCK',
      approvedBy: 'MOCK',
      approvedAt: now,
      expiresAt: now,
      createdAt: now,
      updatedAt: now,
    },
    message: 'MOCK: Action executed (no DB table)',
  };
}
