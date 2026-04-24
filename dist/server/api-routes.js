import { Router } from 'express';
import { globalErrorHandler, notFoundHandler } from './middleware/error-handler.middleware.js';
import clientRoutes from './routes/clients.js';
import orderRoutes from './routes/orders.js';
import paymentRoutes from './routes/payments.js';
/**
 * API ROUTES CONFIGURATION
 *
 * Configures all REST API routes with proper middleware
 * Arquitetura: LEO → TOOLS → SERVICES → DATABASE
 */
const apiRouter = Router();
console.log('ROUTES REGISTERED', {
    clients: '/api/clients',
    orders: '/api/orders',
    payments: '/api/payments',
});
/**
 * API Routes
 * Mount all entity routes under /api prefix
 */
apiRouter.use('/clients', clientRoutes);
apiRouter.use('/orders', orderRoutes);
apiRouter.use('/payments', paymentRoutes);
/**
 * API info endpoint
 */
apiRouter.get('/info', (req, res) => {
    res.json({
        success: true,
        message: 'ERP REST API',
        version: '1.0.0',
        endpoints: {
            clients: {
                'POST /api/clients': 'Create client',
                'GET /api/clients': 'List clients',
                'GET /api/clients/:id': 'Get client by ID',
                'PUT /api/clients/:id': 'Update client',
                'DELETE /api/clients/:id': 'Delete client'
            },
            orders: {
                'POST /api/orders': 'Create order',
                'GET /api/orders': 'List orders',
                'GET /api/orders/:id': 'Get order by ID',
                'PUT /api/orders/:id': 'Update order',
                'DELETE /api/orders/:id': 'Delete order',
                'POST /api/orders/:id/cancel': 'Cancel order',
                'POST /api/orders/:id/status': 'Update order status'
            },
            payments: {
                'POST /api/payments': 'Create payment',
                'GET /api/payments': 'List payments',
                'GET /api/payments/:id': 'Get payment by ID',
                'PUT /api/payments/:id': 'Update payment',
                'DELETE /api/payments/:id': 'Delete payment',
                'POST /api/payments/:id/cancel': 'Cancel payment',
                'POST /api/payments/:id/reconcile': 'Reconcile payment'
            }
        },
        documentation: {
            'HTTP Tests': 'test-api.http (VS Code REST Client)',
            'Node Tests': 'node test-api-node.js',
            'Auth Header': 'Authorization: Bearer <token>',
            'Tenant Header': 'x-tenant-id: <number>'
        }
    });
});
/**
 * Apply global error handling
 */
apiRouter.use(notFoundHandler);
apiRouter.use(globalErrorHandler);
export { apiRouter };
