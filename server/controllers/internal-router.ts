/**
 * Internal Status Router
 * 
 * GET /internal/status - Endpoint protegido para debug/monitoring
 */

import { Router, type Request, type Response } from 'express';
import {
  getInternalStatus,
  internalStatusAuthGuard,
} from './internal-status.controller.js';
import { createLogger } from '../infra/structured-logger.js';

const logger = createLogger('InternalRouter');
const router = Router();

/**
 * GET /internal/status
 * 
 * Endpoint protegido (requer token INTERNAL_API_TOKEN via header ou query)
 * Retorna status completo: uptime, memória, DB, circuit breakers, error rate
 */
router.get('/status', internalStatusAuthGuard, (req: Request, res: Response) => {
  getInternalStatus(req, res).catch((error) => {
    logger.error('Internal status error', error instanceof Error ? error : new Error(String(error)), {
      operation: 'getInternalStatus'
    });
    res.status(500).json({ error: 'Internal server error' });
  });
});

export default router;
