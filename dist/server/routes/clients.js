import { Router } from 'express';
import { ClientController } from '../controllers/client.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { validatePayload } from '../middleware/validation.middleware.js';
const router = Router();
/**
 * CLIENTS API ROUTES
 * Arquitetura: LEO → TOOLS → SERVICES → DATABASE
 */
// Apply tenant and auth middleware to all routes
router.use(authMiddleware);
router.use(tenantMiddleware);
/**
 * POST /clients
 * Create new client
 */
router.post('/', validatePayload('client'), ClientController.create);
/**
 * GET /clients
 * List clients with pagination and filters
 */
router.get('/', ClientController.list);
/**
 * GET /clients/:id
 * Get client by ID
 */
router.get('/:id', ClientController.getById);
/**
 * PUT /clients/:id
 * Update client
 */
router.put('/:id', validatePayload('client'), ClientController.update);
/**
 * DELETE /clients/:id
 * Delete client
 */
router.delete('/:id', ClientController.delete);
export default router;
