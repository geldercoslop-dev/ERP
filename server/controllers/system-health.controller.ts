/**
 * System Health Controller
 * 
 * Endpoint único para verificação de saúde do sistema
 * Padrão: /api/system/health
 */

import { Router } from 'express';
import {
  buildSystemHealthFailureResponse,
  getSystemHealthComplete,
} from '../services/system-health.service';
import { systemLogger } from '../_core/logger';

const router = Router();

/**
 * GET /api/system/health
 * 
 * Retorna status de saúde completo do sistema
 * Endpoint padrão único para health checks
 */
router.get('/health', async (req, res) => {
  try {
    const healthData = await getSystemHealthComplete();
    
    // Definir status HTTP baseado na saúde geral
    const httpStatus = healthData.status === 'ok' ? 200 : 503;
    
    res.status(httpStatus).json(healthData);
    
  } catch (error: unknown) {
    systemLogger.error({
      error: error instanceof Error ? error.message : String(error),
      traceId: req.traceId
    }, 'Health check failed');
    
    res.status(503).json(buildSystemHealthFailureResponse(error));
  }
});

export default router;
