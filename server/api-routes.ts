import { Router } from 'express';
import { globalErrorHandler, notFoundHandler } from './middleware/error-handler.middleware.js';
import leoApprovalRoutes from './routers/leo-approvals.router.js';

/**
 * API ROUTES CONFIGURATION
 * 
 * Configures all REST API routes with proper middleware
 * Arquitetura: LEO → TOOLS → SERVICES → DATABASE
 */

const apiRouter = Router();

/**
 * API Routes
 * Mount all entity routes under /api prefix
 */
apiRouter.use('/leo/approvals', leoApprovalRoutes);

/**
 * API info endpoint
 */
apiRouter.get('/info', (req, res) => {
  res.json({
    success: true,
    message: 'ERP REST API',
    version: '1.0.0',
    endpoints: {},
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
