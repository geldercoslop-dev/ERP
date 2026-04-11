/**
 * System Test Controller
 * 
 * Endpoint para testes internos de concorrência e segurança
 */

import { Router } from 'express';
import { testConcurrency, testDeadlock } from '../services/system-test.service.js';

const router = Router();

/**
 * POST /system/test-concurrency
 * 
 * Testa concorrência em operações de estoque
 * Simula duas vendas simultâneas do mesmo produto
 */
router.post('/test-concurrency', async (req, res): Promise<void> => {
  try {
    const { produtoId, quantidade, testId } = req.body;
    
    const result = await testConcurrency(
      Number(produtoId) || 1,
      Number(quantidade) || 5,
      Number(testId) || Date.now()
    );
    
    if (!result.success && result.operations.operation1.error?.includes('Produto não encontrado')) {
      res.status(400).json({
        success: false,
        error: 'Produto não encontrado',
        testId: result.testId
      });
      return;
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('[ConcurrencyTest] Erro no teste:', error);
    
    res.status(500).json({
      success: false,
      testId: Date.now(),
      initialStock: 0,
      finalStock: 0,
      expectedStock: 0,
      consistent: false,
      duration: 0,
      operations: {
        operation1: { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' },
        operation2: { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' }
      }
    });
  }
});

/**
 * POST /system/test-deadlock
 * 
 * Testa detecção e recuperação de deadlocks
 */
router.post('/test-deadlock', async (req, res) => {
  try {
    const { produto1Id, produto2Id, testId } = req.body;
    
    const result = await testDeadlock(
      Number(produto1Id) || 1,
      Number(produto2Id) || 2,
      Number(testId) || Date.now()
    );
    
    res.json(result);
    
  } catch (error) {
    console.error('[DeadlockTest] Erro no teste:', error);
    
    res.status(500).json({
      success: false,
      testId: Date.now(),
      deadlockDetected: false,
      duration: 0,
      operations: {
        operation1: { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' },
        operation2: { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' }
      }
    });
  }
});

export default router;
