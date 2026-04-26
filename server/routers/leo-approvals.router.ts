/**
 * LEO Approval Router
 * 
 * Endpoints for managing LEO action approvals.
 * Users can approve or reject pending critical actions.
 */

import { Router } from 'express';
import {
  listPendingApprovals,
  approveAction,
  rejectAction,
  getPendingApproval,
} from '../services/leo-approval.service.js';
import { ValidationError } from '../_core/errors/typed-errors.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';

const router = Router();

// Apply auth and tenant middleware to all routes
router.use(authMiddleware);
router.use(tenantMiddleware);

/**
 * GET /api/leo/approvals
 * List pending approvals for a tenant
 */
router.get('/', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const status = req.query.status as string | undefined;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'tenantId is required',
      });
    }

    const approvals = await listPendingApprovals(
      tenantId,
      status as any
    );

    res.json({
      success: true,
      data: approvals,
    });
  } catch (error) {
    console.error('[LeoApprovalsRouter] Error listing approvals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list approvals',
    });
  }
});

/**
 * GET /api/leo/approvals/:actionId
 * Get a specific pending approval
 */
router.get('/:actionId', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const { actionId } = req.params;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'tenantId is required',
      });
    }

    const approval = await getPendingApproval(actionId, tenantId);

    if (!approval) {
      return res.status(404).json({
        success: false,
        error: 'Approval not found',
      });
    }

    res.json({
      success: true,
      data: approval,
    });
  } catch (error) {
    console.error('[LeoApprovalsRouter] Error getting approval:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get approval',
    });
  }
});

/**
 * POST /api/leo/approvals/:actionId/approve
 * Approve a pending action
 */
router.post('/:actionId/approve', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    const { actionId } = req.params;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'tenantId is required',
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required for approval',
      });
    }

    const result = await approveAction(actionId, tenantId, `user_${userId}`);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }

    res.json({
      success: true,
      data: result.approval,
      message: result.message,
    });
  } catch (error) {
    console.error('[LeoApprovalsRouter] Error approving action:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve action',
    });
  }
});

/**
 * POST /api/leo/approvals/:actionId/reject
 * Reject a pending action
 */
router.post('/:actionId/reject', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    const { actionId } = req.params;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'tenantId is required',
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required for rejection',
      });
    }

    const result = await rejectAction(actionId, tenantId, `user_${userId}`);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error('[LeoApprovalsRouter] Error rejecting action:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reject action',
    });
  }
});

export default router;
