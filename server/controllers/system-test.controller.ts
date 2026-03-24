/**
 * System Test Controller
 * 
 * Endpoint para testes internos de concorrência e segurança
 */

import { Router } from 'express';
import { runStockTransaction, runTransaction } from '../services/db-transaction';
import { updateStockSafe } from '../services/stock-safety.service';
import { getDb, getPool } from '../db/index';

const router = Router();

/**
 * POST /system/test-concurrency
 * 
 * Testa concorrência em operações de estoque
 * Simula duas vendas simultâneas do mesmo produto
 */
router.post('/test-concurrency', async (req, res): Promise<void> => {
  const startTime = Date.now();
  
  try {
    console.log('[ConcurrencyTest] Iniciando teste de concorrência');
    
    // Parâmetros do teste
    const { produtoId = 1, quantidade = 5, testId = Date.now() } = req.body;
    
    // 1. Verificar estoque inicial (pool raw para execute)
    const pool = await getPool();
    const [initialStockRows] = await pool.execute(
      `SELECT id, descricao, estoque FROM produtos WHERE id = ?`,
      [produtoId]
    );
    const initialStock = Array.isArray(initialStockRows) ? initialStockRows : [];
    
    if (!initialStock.length || !initialStock[0]) {
      res.status(400).json({
        success: false,
        error: 'Produto não encontrado',
        testId
      });
      return;
    }
    
    const initialData = initialStock[0] as Record<string, unknown>;
    const estoqueInicial = Number(initialData.estoque || 0);
    
    console.log(`[ConcurrencyTest] Estoque inicial: ${estoqueInicial} - Produto: ${initialData.descricao}`);
    
    // 2. Simular duas operações simultâneas
    const operacoes = [
      // Operação 1
      runStockTransaction(async (tx) => {
        console.log(`[ConcurrencyTest] Operação 1 - Iniciando`);
        
        const [produto] = await tx.execute(
          `SELECT id, descricao, estoque FROM produtos WHERE id = ? FOR UPDATE`,
          [produtoId]
        );
        
        const produtoData = (produto as any[])[0];
        const estoqueAtual = Number(produtoData.estoque || 0);
        
        // Simular processamento
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (estoqueAtual < quantidade) {
          throw new Error(`ESTOQUE_INSUFICIENTE_OP1: Estoque ${estoqueAtual} < Solicitado ${quantidade}`);
        }
        
        const novoEstoque = estoqueAtual - quantidade;
        
        await tx.execute(
          `UPDATE produtos SET estoque = ?, updatedAt = NOW() WHERE id = ?`,
          [novoEstoque, produtoId]
        );
        
        await tx.execute(
          `INSERT INTO audit_log (
            actorUserId, action, entity, entityId, payloadJson, traceId, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
          [
            null,
            'STOCK_TEST_CONCURRENCY_OP1',
            'produto',
            produtoId,
            JSON.stringify({
              testId,
              operacao: 1,
              produtoId,
              quantidade,
              estoqueAnterior: estoqueAtual,
              estoqueNovo: novoEstoque,
              timestamp: new Date().toISOString()
            }),
            `CONCURRENCY_TEST_${testId}_OP1`
          ]
        );
        
        console.log(`[ConcurrencyTest] Operação 1 - Sucesso: ${estoqueAtual} → ${novoEstoque}`);
        
        return {
          operacao: 1,
          sucesso: true,
          estoqueAnterior: estoqueAtual,
          estoqueNovo: novoEstoque
        };
      }),
      
      // Operação 2
      runStockTransaction(async (tx) => {
        console.log(`[ConcurrencyTest] Operação 2 - Iniciando`);
        
        const [produto] = await tx.execute(
          `SELECT id, descricao, estoque FROM produtos WHERE id = ? FOR UPDATE`,
          [produtoId]
        );
        
        const produtoData = (produto as any[])[0];
        const estoqueAtual = Number(produtoData.estoque || 0);
        
        // Simular processamento
        await new Promise(resolve => setTimeout(resolve, 50));
        
        if (estoqueAtual < quantidade) {
          throw new Error(`ESTOQUE_INSUFICIENTE_OP2: Estoque ${estoqueAtual} < Solicitado ${quantidade}`);
        }
        
        const novoEstoque = estoqueAtual - quantidade;
        
        await tx.execute(
          `UPDATE produtos SET estoque = ?, updatedAt = NOW() WHERE id = ?`,
          [novoEstoque, produtoId]
        );
        
        await tx.execute(
          `INSERT INTO audit_log (
            actorUserId, action, entity, entityId, payloadJson, traceId, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
          [
            null,
            'STOCK_TEST_CONCURRENCY_OP2',
            'produto',
            produtoId,
            JSON.stringify({
              testId,
              operacao: 2,
              produtoId,
              quantidade,
              estoqueAnterior: estoqueAtual,
              estoqueNovo: novoEstoque,
              timestamp: new Date().toISOString()
            }),
            `CONCURRENCY_TEST_${testId}_OP2`
          ]
        );
        
        console.log(`[ConcurrencyTest] Operação 2 - Sucesso: ${estoqueAtual} → ${novoEstoque}`);
        
        return {
          operacao: 2,
          sucesso: true,
          estoqueAnterior: estoqueAtual,
          estoqueNovo: novoEstoque
        };
      })
    ];
    
    // 3. Executar operações em paralelo
    const resultados = await Promise.allSettled(operacoes);
    
    // 4. Verificar estoque final
    const [finalStockRows] = await pool.execute(
      `SELECT id, descricao, estoque FROM produtos WHERE id = ?`,
      [produtoId]
    );
    const finalStock = Array.isArray(finalStockRows) ? finalStockRows : [];
    const finalData = finalStock[0] as Record<string, unknown> | undefined;
    const estoqueFinal = Number(finalData?.estoque ?? 0);
    
    // 5. Analisar resultados
    const operacoesSucesso = resultados.filter(r => r.status === 'fulfilled').length;
    const operacoesFalha = resultados.filter(r => r.status === 'rejected').length;
    
    const resultadoOperacoes = resultados.map((r, index) => {
      if (r.status === 'fulfilled') {
        return r.value;
      } else {
        return {
          operacao: index + 1,
          sucesso: false,
          erro: r.reason?.message || 'Erro desconhecido'
        };
      }
    });
    
    const duracao = Date.now() - startTime;
    
    // 6. Validar consistência
    const estoqueEsperado = estoqueInicial - (operacoesSucesso * quantidade);
    const consistente = Math.abs(estoqueFinal - estoqueEsperado) < 0.01;
    
    console.log(`[ConcurrencyTest] Resultado - Sucessos: ${operacoesSucesso}, Falhas: ${operacoesFalha}`);
    console.log(`[ConcurrencyTest] Estoque: ${estoqueInicial} → ${estoqueFinal} (Esperado: ${estoqueEsperado})`);
    console.log(`[ConcurrencyTest] Consistente: ${consistente}, Duração: ${duracao}ms`);
    
    const resultado = {
      success: true,
      testId,
      duracao,
      produto: {
        id: produtoId,
        descricao: initialData.descricao,
        estoqueInicial,
        estoqueFinal,
        estoqueEsperado
      },
      operacoes: {
        quantidade,
        simultaneas: 2,
        sucesso: operacoesSucesso,
        falha: operacoesFalha,
        detalhes: resultadoOperacoes
      },
      validacao: {
        consistente,
        mensagem: consistente ? '✅ Teste passou - Consistência mantida' : '❌ Teste falhou - Inconsistência detectada'
      },
      timestamp: new Date().toISOString()
    };
    
    // 7. Restaurar estoque se necessário (apenas em ambiente de teste)
    if (process.env.NODE_ENV !== 'production' && !consistente) {
      await pool.execute(
        `UPDATE produtos SET estoque = ?, updatedAt = NOW() WHERE id = ?`,
        [estoqueInicial, produtoId]
      );
      
      console.log(`[ConcurrencyTest] Estoque restaurado para teste: ${estoqueInicial}`);
    }
    
    res.json(resultado);
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[ConcurrencyTest] Erro no teste:', errorMessage);
    
    res.status(500).json({
      success: false,
      error: 'Erro no teste de concorrência',
      details: errorMessage,
      testId: req.body.testId || Date.now(),
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /system/test-deadlock
 * 
 * Testa detecção e recuperação de deadlocks
 */
router.post('/test-deadlock', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('[DeadlockTest] Iniciando teste de deadlock');
    
    const { produto1Id = 1, produto2Id = 2, testId = Date.now() } = req.body;
    
    // Operação 1: tenta bloquear produto1 depois produto2
    const operacao1 = runTransaction(async (tx) => {
      console.log(`[DeadlockTest] Op1 - Bloqueando produto ${produto1Id}`);
      
      await tx.execute(
        `SELECT * FROM produtos WHERE id = ? FOR UPDATE`,
        [produto1Id]
      );
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      console.log(`[DeadlockTest] Op1 - Tentando bloquear produto ${produto2Id}`);
      
      await tx.execute(
        `SELECT * FROM produtos WHERE id = ? FOR UPDATE`,
        [produto2Id]
      );
      
      return { operacao: 1, sucesso: true };
    }, 'SERIALIZABLE');
    
    // Operação 2: tenta bloquear produto2 depois produto1
    const operacao2 = runTransaction(async (tx) => {
      console.log(`[DeadlockTest] Op2 - Bloqueando produto ${produto2Id}`);
      
      await tx.execute(
        `SELECT * FROM produtos WHERE id = ? FOR UPDATE`,
        [produto2Id]
      );
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      console.log(`[DeadlockTest] Op2 - Tentando bloquear produto ${produto1Id}`);
      
      await tx.execute(
        `SELECT * FROM produtos WHERE id = ? FOR UPDATE`,
        [produto1Id]
      );
      
      return { operacao: 2, sucesso: true };
    }, 'SERIALIZABLE');
    
    // Executar em paralelo para induzir deadlock
    const resultados = await Promise.allSettled([operacao1, operacao2]);
    
    const duracao = Date.now() - startTime;
    
    const resultado = {
      success: true,
      testId,
      duracao,
      produtos: [produto1Id, produto2Id],
      operacoes: resultados.map((r, index) => {
        if (r.status === 'fulfilled') {
          return r.value;
        } else {
          return {
            operacao: index + 1,
            sucesso: false,
            erro: r.reason?.message || 'Erro desconhecido'
          };
        }
      }),
      timestamp: new Date().toISOString()
    };
    
    console.log(`[DeadlockTest] Concluído em ${duracao}ms`);
    
    res.json(resultado);
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[DeadlockTest] Erro no teste:', errorMessage);
    
    res.status(500).json({
      success: false,
      error: 'Erro no teste de deadlock',
      details: errorMessage,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
