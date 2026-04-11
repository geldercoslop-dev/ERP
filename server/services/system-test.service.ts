/**
 * System Test Service
 * 
 * Serviço para testes internos de concorrência e segurança
 * APENAS PARA TESTES - NÃO USAR EM PRODUÇÃO
 */

import { runStockTransaction, runTransaction } from './db-transaction.js';
import { getPool } from '../db/index.js';
import { ValidationError } from '../_core/errors/typed-errors.js';

export interface ConcurrencyTestResult {
  success: boolean;
  testId: number;
  initialStock: number;
  finalStock: number;
  expectedStock: number;
  consistent: boolean;
  duration: number;
  operations: {
    operation1: { success: boolean; stock?: number; error?: string };
    operation2: { success: boolean; stock?: number; error?: string };
  };
}

export interface DeadlockTestResult {
  success: boolean;
  testId: number;
  deadlockDetected: boolean;
  duration: number;
  operations: {
    operation1: { success: boolean; error?: string };
    operation2: { success: boolean; error?: string };
  };
}

/**
 * Testa concorrência em operações de estoque
 * Simula duas vendas simultâneas do mesmo produto
 */
export async function testConcurrency(
  produtoId: number = 1,
  quantidade: number = 5,
  testId: number = Date.now()
): Promise<ConcurrencyTestResult> {
  const startTime = Date.now();
  
  try {
    console.log('[ConcurrencyTest] Iniciando teste de concorrência');
    
    // 1. Verificar estoque inicial (pool raw para execute)
    const pool = await getPool();
    const [initialStockRows] = await pool.execute(
      `SELECT id, descricao, estoque FROM produtos WHERE id = ?`,
      [produtoId]
    );
    const initialStock = Array.isArray(initialStockRows) ? initialStockRows : [];
    
    if (!initialStock.length || !initialStock[0]) {
      throw new ValidationError('Produto não encontrado');
    }
    
    const initialData = initialStock[0] as Record<string, unknown>;
    const estoqueInicial = Number(initialData.estoque || 0);
    
    console.log(`[ConcurrencyTest] Estoque inicial: ${estoqueInicial} - Produto: ${initialData.descricao}`);
    
    // 2. Simular duas operações concorrentes
    const operacoes = [
      // Operação 1
      runStockTransaction(async (tx) => {
        console.log(`[ConcurrencyTest] Operação 1 - Iniciando`);
        
        const [produto] = await tx.execute(
          `SELECT id, descricao, estoque FROM produtos WHERE id = ? FOR UPDATE`,
          [produtoId]
        );
        
        if (!Array.isArray(produto) || !produto[0]) {
          throw new ValidationError('Produto não encontrado na operação 1');
        }
        
        const produtoData = produto[0] as Record<string, unknown>;
        const estoqueAtual = Number(produtoData.estoque || 0);
        
        console.log(`[ConcurrencyTest] Operação 1 - Estoque atual: ${estoqueAtual}`);
        
        const novoEstoque = estoqueAtual - quantidade;
        
        await tx.execute(
          `UPDATE produtos SET estoque = ?, updatedAt = NOW() WHERE id = ?`,
          [novoEstoque, produtoId]
        );
        
        await tx.execute(
          `INSERT INTO audit_log (
            actorUserId, action, entity, entityId, payloadJson, traceId, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
          [1, 'STOCK_DECREMENT', 'produtos', produtoId, JSON.stringify({
            quantidade,
            estoqueAnterior: estoqueAtual,
            estoqueNovo: novoEstoque,
            testId,
            operacao: 1
          }), `test_${testId}_1`]
        );
        
        console.log(`[ConcurrencyTest] Operação 1 - Estoque atualizado para: ${novoEstoque}`);
        return { success: true, stock: novoEstoque };
      }),
      
      // Operação 2
      runStockTransaction(async (tx) => {
        console.log(`[ConcurrencyTest] Operação 2 - Iniciando`);
        
        const [produto] = await tx.execute(
          `SELECT id, descricao, estoque FROM produtos WHERE id = ? FOR UPDATE`,
          [produtoId]
        );
        
        if (!Array.isArray(produto) || !produto[0]) {
          throw new ValidationError('Produto não encontrado na operação 2');
        }
        
        const produtoData = produto[0] as Record<string, unknown>;
        const estoqueAtual = Number(produtoData.estoque || 0);
        
        console.log(`[ConcurrencyTest] Operação 2 - Estoque atual: ${estoqueAtual}`);
        
        const novoEstoque = estoqueAtual - quantidade;
        
        await tx.execute(
          `UPDATE produtos SET estoque = ?, updatedAt = NOW() WHERE id = ?`,
          [novoEstoque, produtoId]
        );
        
        await tx.execute(
          `INSERT INTO audit_log (
            actorUserId, action, entity, entityId, payloadJson, traceId, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
          [2, 'STOCK_DECREMENT', 'produtos', produtoId, JSON.stringify({
            quantidade,
            estoqueAnterior: estoqueAtual,
            estoqueNovo: novoEstoque,
            testId,
            operacao: 2
          }), `test_${testId}_2`]
        );
        
        console.log(`[ConcurrencyTest] Operação 2 - Estoque atualizado para: ${novoEstoque}`);
        return { success: true, stock: novoEstoque };
      })
    ];
    
    // 3. Executar operações concorrentes
    const resultados = await Promise.allSettled(operacoes);
    
    // 4. Verificar estoque final
    const [finalStockRows] = await pool.execute(
      `SELECT id, descricao, estoque FROM produtos WHERE id = ?`,
      [produtoId]
    );
    const finalStock = Array.isArray(finalStockRows) ? finalStockRows : [];
    
    if (!finalStock.length || !finalStock[0]) {
      throw new ValidationError('Produto não encontrado na verificação final');
    }
    
    const finalData = finalStock[0] as Record<string, unknown>;
    const estoqueFinal = Number(finalData.estoque || 0);
    const estoqueEsperado = estoqueInicial - (quantidade * 2);
    
    console.log(`[ConcurrencyTest] Estoque final: ${estoqueFinal} - Esperado: ${estoqueEsperado}`);
    
    // 5. Analisar resultados
    const operacao1 = resultados[0];
    const operacao2 = resultados[1];
    
    const consistent = estoqueFinal === estoqueEsperado;
    
    const duration = Date.now() - startTime;
    
    console.log(`[ConcurrencyTest] Teste concluído em ${duration}ms - Consistente: ${consistent}`);
    
    // 6. Restaurar estoque se necessário (apenas em ambiente de teste)
    if (process.env.NODE_ENV !== 'production' && !consistent) {
      await pool.execute(
        `UPDATE produtos SET estoque = ?, updatedAt = NOW() WHERE id = ?`,
        [estoqueInicial, produtoId]
      );
      console.log(`[ConcurrencyTest] Estoque restaurado para: ${estoqueInicial}`);
    }
    
    return {
      success: true,
      testId,
      initialStock: estoqueInicial,
      finalStock: estoqueFinal,
      expectedStock: estoqueEsperado,
      consistent,
      duration,
      operations: {
        operation1: operacao1.status === 'fulfilled' 
          ? { success: true, stock: operacao1.value?.stock }
          : { success: false, error: operacao1.reason?.message },
        operation2: operacao2.status === 'fulfilled'
          ? { success: true, stock: operacao2.value?.stock }
          : { success: false, error: operacao2.reason?.message }
      }
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[ConcurrencyTest] Erro no teste:', error);
    
    return {
      success: false,
      testId,
      initialStock: 0,
      finalStock: 0,
      expectedStock: 0,
      consistent: false,
      duration,
      operations: {
        operation1: { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' },
        operation2: { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' }
      }
    };
  }
}

/**
 * Testa deadlock com bloqueio em ordem diferente
 * Simula duas transações que bloqueiam produtos em ordem inversa
 */
export async function testDeadlock(
  produto1Id: number,
  produto2Id: number,
  testId: number = Date.now()
): Promise<DeadlockTestResult> {
  const startTime = Date.now();
  
  try {
    console.log(`[DeadlockTest] Iniciando teste de deadlock - Produtos: ${produto1Id}, ${produto2Id}`);
    
    const operacao1 = runTransaction(async (tx) => {
      console.log(`[DeadlockTest] Op1 - Bloqueando produto ${produto1Id}`);
      
      await tx.execute(
        `SELECT * FROM produtos WHERE id = ? FOR UPDATE`,
        [produto1Id]
      );
      
      // Pequeno delay para aumentar chance de deadlock
      await new Promise(resolve => setTimeout(resolve, 50));
      
      console.log(`[DeadlockTest] Op1 - Tentando bloquear produto ${produto2Id}`);
      
      await tx.execute(
        `SELECT * FROM produtos WHERE id = ? FOR UPDATE`,
        [produto2Id]
      );
      
      console.log(`[DeadlockTest] Op1 - Concluída sem deadlock`);
    });
    
    const operacao2 = runTransaction(async (tx) => {
      console.log(`[DeadlockTest] Op2 - Bloqueando produto ${produto2Id}`);
      
      await tx.execute(
        `SELECT * FROM produtos WHERE id = ? FOR UPDATE`,
        [produto2Id]
      );
      
      // Pequeno delay para aumentar chance de deadlock
      await new Promise(resolve => setTimeout(resolve, 50));
      
      console.log(`[DeadlockTest] Op2 - Tentando bloquear produto ${produto1Id}`);
      
      await tx.execute(
        `SELECT * FROM produtos WHERE id = ? FOR UPDATE`,
        [produto1Id]
      );
      
      console.log(`[DeadlockTest] Op2 - Concluída sem deadlock`);
    });
    
    // Executar em paralelo para induzir deadlock
    const resultados = await Promise.allSettled([
      operacao1,
      operacao2
    ]);
    
    const duration = Date.now() - startTime;
    
    // Verificar se ocorreu deadlock (timeout ou erro de lock)
    const deadlockDetected = resultados.some(r => 
      r.status === 'rejected' && 
      (r.reason?.message?.includes('lock wait timeout') || 
       r.reason?.message?.includes('deadlock') ||
       r.reason?.message?.includes('Lock wait timeout'))
    );
    
    console.log(`[DeadlockTest] Concluído em ${duration}ms - Deadlock detectado: ${deadlockDetected}`);
    
    return {
      success: true,
      testId,
      deadlockDetected,
      duration,
      operations: {
        operation1: resultados[0].status === 'fulfilled'
          ? { success: true }
          : { success: false, error: resultados[0].reason?.message },
        operation2: resultados[1].status === 'fulfilled'
          ? { success: true }
          : { success: false, error: resultados[1].reason?.message }
      }
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[DeadlockTest] Erro no teste:', error);
    
    return {
      success: false,
      testId,
      deadlockDetected: false,
      duration,
      operations: {
        operation1: { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' },
        operation2: { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' }
      }
    };
  }
}
