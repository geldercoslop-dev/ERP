import { Router } from 'express';
import { OrderController } from '../controllers/order.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { validatePayload } from '../middleware/validation.middleware.js';

type Payload = Record<string, unknown>;

const router = Router();

/**
 * ORDERS API ROUTES
 * Arquitetura: LEO → TOOLS → SERVICES → DATABASE
 */

/**
 * POST /orders
 * Create new order
 */
router.post(
	'/',
	(req, _res, next) => {
		console.log('>>> ROUTE HIT', req.method, req.originalUrl || req.url, {
			headers: {
				authorization: req.headers.authorization,
				'x-tenant-id': req.headers['x-tenant-id'],
				'content-type': req.headers['content-type'],
			},
		});
		next();
	},
	authMiddleware,
	(req, _res, next) => {
		console.log('>>> AFTER AUTH', {
			user: (req as unknown as Payload).user,
			userId: (req as unknown as Payload).userId,
			tenantId: (req as unknown as Payload).tenantId,
			headers: req.headers,
		});
		next();
	},
	tenantMiddleware,
	(req, _res, next) => {
		console.log('>>> AFTER TENANT', {
			user: (req as unknown as Payload).user,
			tenantId: (req as unknown as Payload).tenantId,
			headers: req.headers,
		});
		next();
	},
	validatePayload('order'),
	OrderController.create,
);

/**
 * GET /orders
 * List orders with pagination and filters
 */
router.get('/', authMiddleware, tenantMiddleware, OrderController.list);

/**
 * GET /orders/:id
 * Get order by ID
 */
router.get('/:id', authMiddleware, tenantMiddleware, OrderController.getById);

/**
 * PUT /orders/:id
 * Update order
 */
router.put('/:id', authMiddleware, tenantMiddleware, validatePayload('order'), OrderController.update);

/**
 * DELETE /orders/:id
 * Delete order
 */
router.delete('/:id', authMiddleware, tenantMiddleware, OrderController.delete);

/**
 * POST /orders/:id/cancel
 * Cancel order
 */
router.post('/:id/cancel', authMiddleware, tenantMiddleware, OrderController.cancel);

/**
 * POST /orders/:id/status
 * Update order status
 */
router.post('/:id/status', authMiddleware, tenantMiddleware, validatePayload('status'), OrderController.updateStatus);

export default router;
