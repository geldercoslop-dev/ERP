/**
 * Rotas para testar o sistema de monitoramento
 * 
 * ATENÇÃO: Estas rotas são apenas para testes e devem ser desabilitadas em produção
 */

import { Router, Request, Response } from 'express';
import { createLogger } from '../infra/structured-logger';
import { trackError } from '../monitoring/error-alerter';

const router = Router();
const logger = createLogger('test-monitoring');

/**
 * GET /api/test-monitoring/error
 * Simula um erro para testar o sistema de logs
 */
router.get('/error', (req: Request, res: Response) => {
  const errorType = req.query.type as string || 'generic';
  const errorMessage = req.query.message as string || 'Erro simulado para teste';
  
  logger.error(`Erro simulado: ${errorType}`, {
    requestId: req.requestId,
    error: errorMessage,
    metadata: {
      simulatedError: true,
      errorType
    }
  });
  
  // Registrar no sistema de alertas
  trackError(errorMessage, {
    requestId: req.requestId,
    path: req.path,
    errorType
  });
  
  res.status(500).json({
    error: 'Erro simulado',
    message: errorMessage,
    type: errorType,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/test-monitoring/slow
 * Simula uma requisição lenta para testar o sistema de timeout
 */
router.get('/slow', async (req: Request, res: Response) => {
  const delayMs = Number(req.query.delay) || 5000;
  
  logger.info(`Iniciando requisição lenta (${delayMs}ms)`, {
    requestId: req.requestId,
    delay: delayMs
  });
  
  try {
    // Simular processamento lento
    await new Promise(resolve => setTimeout(resolve, delayMs));
    
    // Se chegou aqui, não houve timeout
    logger.info(`Requisição lenta concluída após ${delayMs}ms`, {
      requestId: req.requestId
    });
    
    res.json({
      message: `Requisição lenta concluída após ${delayMs}ms`,
      delay: delayMs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erro durante requisição lenta', {
      requestId: req.requestId,
      error: error instanceof Error ? error.message : String(error)
    });
    
    res.status(500).json({
      error: 'Erro durante requisição lenta',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/test-monitoring/memory-leak
 * Simula um vazamento de memória para testar alertas
 * CUIDADO: Usar apenas em ambiente de teste
 */
router.get('/memory-leak', (req: Request, res: Response) => {
  const sizeInMB = Math.min(Number(req.query.size) || 50, 200);
  
  logger.warn(`Simulando vazamento de memória (${sizeInMB}MB)`, {
    requestId: req.requestId,
    size: sizeInMB
  });
  
  try {
    // Criar um grande array para simular vazamento de memória
    const leak: any[] = [];
    const bytesPerMB = 1024 * 1024;
    const iterations = (sizeInMB * bytesPerMB) / 8;
    
    for (let i = 0; i < iterations; i++) {
      leak.push(new Array(8).fill('X'));
    }
    
    // Armazenar em uma variável global para evitar otimização do GC
    (global as any).memoryLeakTest = leak;
    
    res.json({
      message: `Vazamento de memória simulado (${sizeInMB}MB)`,
      size: sizeInMB,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erro ao simular vazamento de memória', {
      requestId: req.requestId,
      error: error instanceof Error ? error.message : String(error)
    });
    
    res.status(500).json({
      error: 'Erro ao simular vazamento de memória',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/test-monitoring/clear-memory-leak
 * Limpa o vazamento de memória simulado
 */
router.get('/clear-memory-leak', (req: Request, res: Response) => {
  logger.info('Limpando vazamento de memória simulado', {
    requestId: req.requestId
  });
  
  (global as any).memoryLeakTest = null;
  
  // Forçar coleta de lixo (não é garantido)
  try {
    if (global.gc) {
      global.gc();
    }
  } catch (e) {
    // Ignorar erro se gc não estiver disponível
  }
  
  res.json({
    message: 'Vazamento de memória limpo',
    timestamp: new Date().toISOString()
  });
});

export default router;