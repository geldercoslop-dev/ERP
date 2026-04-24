import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { validatePayload } from '../middleware/validation.middleware.js';
const router = Router();
/**
 * PAYMENTS API ROUTES
 * Arquitetura: LEO → TOOLS → SERVICES → DATABASE
 */
// Apply tenant and auth middleware to all routes
router.use(authMiddleware);
router.use(tenantMiddleware);
/**
 * POST /payments
 * Create new payment
 */
router.post('/', validatePayload('payment'), PaymentController.create);
/**
 * GET /payments
 * List payments with pagination and filters
 */
router.get('/', PaymentController.list);
/**
 * GET /payments/:id
 * Get payment by ID
 */
router.get('/:id', PaymentController.getById);
/**
 * PUT /payments/:id
 * Update payment
 */
router.put('/:id', validatePayload('payment'), PaymentController.update);
/**
 * DELETE /payments/:id
 * Delete payment
 */
router.delete('/:id', PaymentController.delete);
/**
 * POST /payments/:id/cancel
 * Cancel payment
 */
router.post('/:id/cancel', PaymentController.cancel);
/**
 * POST /payments/:id/reconcile
 * Reconcile payment
 */
router.post('/:id/reconcile', validatePayload('reconciliation'), PaymentController.reconcile);
export default router;
