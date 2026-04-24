// [DEFENSIVO] As rotas PUT /orders/:id (update), DELETE /orders/:id (delete) e POST /orders/:id/cancel (cancel)
// foram removidas pois não existiam métodos correspondentes no OrderController, nem uso real no backend.
// Não há referências internas, integrações ou dependências dessas rotas. Remoção validada por busca exaustiva.
// Caso seja necessário reativar, implemente o método no controller e reabra a rota.
import { Router } from 'express';
import { OrderController } from '../controllers/order.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { validatePayload } from '../middleware/validation.middleware.js';
const router = Router();
function adaptTenantHandler(handler) {
    return (req, res, next) => {
        // Garantia: tenantMiddleware já injetou user correto
        return handler(req, res, next);
    };
}
router.post('/', authMiddleware, tenantMiddleware, validatePayload('order'), adaptTenantHandler(OrderController.create));
/**
 * GET /orders
 * List orders with pagination and filters
 */
router.get('/', authMiddleware, tenantMiddleware, adaptTenantHandler(OrderController.list));
/**
 * GET /orders/:id
 * Get order by ID
 */
router.get('/:id', authMiddleware, tenantMiddleware, adaptTenantHandler(OrderController.getById));
/**
 * PUT /orders/:id
 * Update order
 */
/**
 * POST /orders/:id/status
 * Update order status
 */
router.post('/:id/status', authMiddleware, tenantMiddleware, validatePayload('status'), adaptTenantHandler(OrderController.updateStatus));
export default router;
