/**
 * Internal Status Router
 * 
 * GET /internal/status - Endpoint protegido para debug/monitoring
 */

import { Router, type Request, type Response } from 'express';
import {
  getInternalStatus,
  getPublicHealth,
  internalStatusAuthGuard,
} from './internal-status.controller.js';

const router = Router();

/**
 * GET /internal/status
 * 
 * Endpoint protegido (requer token INTERNAL_API_TOKEN via header ou query)
 * Retorna status completo: uptime, memória, DB, circuit breakers, error rate
 */
router.get('/status', internalStatusAuthGuard, (req: Request, res: Response) => {
  getInternalStatus(req, res).catch((error) => {
    console.error('Internal status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  });
});

/**
 * GET /health (público)
 * 
 * Health check simples sem detalhes sensíveis
 */
router.get('/health', (req: Request, res: Response) => {
  getPublicHealth(req, res);
});

export default router;
