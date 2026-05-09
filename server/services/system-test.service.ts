/**
 * System Test Service
 * 
 * Serviço para testes internos de concorrência e segurança
 * APENAS PARA TESTES - NÃO USAR EM PRODUÇÃO
 */

import { runStockTransaction, runTransaction } from './db-transaction.js';
import { getPool, getDb, getInsertId, idempotencyKeys, pedidos } from '../db/index.js';
import {
  auditLogs,
  users,
  vendedores,
  clientes,
  clienteVendedores,
  pendencias,
  contasReceber,
  produtos,
} from '../../drizzle/schema.js';
import { ValidationError } from '../_core/errors/typed-errors.js';
import { eq, and, desc, inArray } from 'drizzle-orm';
import pino from 'pino';

const logger = pino();

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

/**
 * Métodos de infraestrutura para testes de concorrência
 * APENAS PARA TESTES - NÃO USAR EM PRODUÇÃO
 */

export interface TestIdempotencyKey {
  id: number;
  tenantId: number;
}

export interface TestPedido {
  numero: number;
  clienteNome: string;
  tenantId: number;
}

export interface TestAuditLog {
  entity: string;
  tenantId: number;
  createdAt: Date;
}

/** Limpa todas as chaves de idempotência do banco para o tenant */
export async function clearConcurrencyTestIdempotencyKeys(tenantId: number): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.delete(idempotencyKeys).where(eq(idempotencyKeys.tenantId, tenantId));
  }
}

/** Lista pedidos filtrados por tenant e nome do cliente */
export async function listConcurrencyTestPedidos(tenantId: number, clienteNome: string): Promise<TestPedido[]> {
  const db = await getDb();
  if (!db) return [];
  const results = await db.select({
    numero: pedidos.numero,
    clienteNome: pedidos.clienteNome,
    tenantId: pedidos.tenantId
  }).from(pedidos).where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.clienteNome, clienteNome)));
  
  // Garantir tipagem correta para o TSC
  return results.map(r => ({
    numero: Number(r.numero),
    clienteNome: String(r.clienteNome),
    tenantId: Number(r.tenantId)
  }));
}

/** Lista registros de idempotência para o tenant */
export async function listConcurrencyTestIdempotencyKeys(tenantId: number): Promise<TestIdempotencyKey[]> {
  const db = await getDb();
  if (!db) return [];
  const results = await db.select({
    id: idempotencyKeys.id,
    tenantId: idempotencyKeys.tenantId
  }).from(idempotencyKeys).where(eq(idempotencyKeys.tenantId, tenantId));
  
  return results.map(r => ({
    id: Number(r.id),
    tenantId: Number(r.tenantId)
  }));
}

/** Lista registros de auditoria filtrados por tenant e entidade */
export async function listConcurrencyTestAuditLogs(tenantId: number, entity: string): Promise<TestAuditLog[]> {
  const db = await getDb();
  if (!db) return [];
  const results = await db.select({
    entity: auditLogs.entity,
    tenantId: auditLogs.tenantId,
    createdAt: auditLogs.createdAt
  }).from(auditLogs)
    .where(and(eq(auditLogs.tenantId, tenantId), eq(auditLogs.entity, entity)))
    .orderBy(desc(auditLogs.createdAt));

  return results.map(r => ({
    entity: String(r.entity),
    tenantId: Number(r.tenantId),
    createdAt: r.createdAt
  }));
}

/**
 * Métodos de infraestrutura para pedidos-heavy.integration.test.ts
 * APENAS PARA TESTES - NÃO USAR EM PRODUÇÃO
 */

export interface PedidosHeavyTestUserResult {
  userId: number;
}

export interface PedidosHeavyTestVendedorResult {
  vendedorId: number;
}

/** Cria um usuário de teste para o heavy test */
export async function createPedidosHeavyTestUser(
  tenantId: number,
  openId: string,
  name: string
): Promise<PedidosHeavyTestUserResult> {
  const db = await getDb();
  if (!db) throw new Error("Sem conexão DB");

  const insertResult = await db.insert(users).values({
    tenantId,
    openId: openId.slice(0, 64),
    name,
    role: "user",
  });
  const userId = getInsertId(insertResult);
  if (!userId || userId <= 0) throw new Error("Falha ao criar usuário de teste heavy");

  return { userId };
}

/** Cria um vendedor de teste para o heavy test */
export async function createPedidosHeavyTestVendedor(
  tenantId: number,
  userId: number,
  nome: string
): Promise<PedidosHeavyTestVendedorResult> {
  const db = await getDb();
  if (!db) throw new Error("Sem conexão DB");

  const insertResult = await db.insert(vendedores).values({
    tenantId,
    userId,
    nome,
    ativo: true,
    admin: false,
  });
  const vendedorId = getInsertId(insertResult);
  if (!vendedorId || vendedorId <= 0) throw new Error("Falha ao criar vendedor de teste heavy");

  return { vendedorId };
}

export interface PedidosHeavyCleanupIds {
  pedidoIds: number[];
  clienteIds: number[];
  vendedorIds: number[];
  userIds: number[];
}

/** Limpa todos os dados de teste criados pelo pedidos-heavy.integration.test.ts */
export async function cleanupPedidosHeavyTestData(
  tenantId: number,
  ids: PedidosHeavyCleanupIds
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Sem conexão DB");

  const { pedidoIds, clienteIds, vendedorIds, userIds } = ids;
  const errors: string[] = [];

  // Buscar números dos pedidos para cleanup de contasReceber
  const pids = pedidoIds.filter((id) => id > 0);
  if (pids.length > 0) {
    try {
      const numerosRows = await db
        .select({ numero: pedidos.numero })
        .from(pedidos)
        .where(and(eq(pedidos.tenantId, tenantId), inArray(pedidos.id, pids)));
      const numeros = numerosRows.map((r) => r.numero).filter((n) => n > 0);

      // Deletar pendencias por tenantId + pedidoIds
      try {
        await db
          .delete(pendencias)
          .where(and(eq(pendencias.tenantId, tenantId), inArray(pendencias.pedidoId, pids)));
      } catch (e) {
        errors.push(`pendencias: ${e instanceof Error ? e.message : String(e)}`);
      }

      // Deletar contasReceber por tenantId + pedidoNumero
      if (numeros.length > 0) {
        try {
          await db
            .delete(contasReceber)
            .where(and(eq(contasReceber.tenantId, tenantId), inArray(contasReceber.pedidoNumero, numeros)));
        } catch (e) {
          errors.push(`contasReceber: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // Deletar pedidos por tenantId + pedidoIds
      try {
        await db.delete(pedidos).where(and(eq(pedidos.tenantId, tenantId), inArray(pedidos.id, pids)));
      } catch (e) {
        errors.push(`pedidos: ${e instanceof Error ? e.message : String(e)}`);
      }
    } catch (e) {
      errors.push(`busca pedidos: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Deletar clienteVendedores por tenantId + clienteIds
  if (clienteIds.length > 0) {
    try {
      await db
        .delete(clienteVendedores)
        .where(and(eq(clienteVendedores.tenantId, tenantId), inArray(clienteVendedores.clienteId, clienteIds)));
    } catch (e) {
      errors.push(`clienteVendedores: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Deletar clientes por tenantId + clienteIds
  if (clienteIds.length > 0) {
    try {
      await db
        .delete(clientes)
        .where(and(eq(clientes.tenantId, tenantId), inArray(clientes.id, clienteIds)));
    } catch (e) {
      errors.push(`clientes: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Deletar vendedores por tenantId + vendedorIds
  if (vendedorIds.length > 0) {
    try {
      await db
        .delete(vendedores)
        .where(and(eq(vendedores.tenantId, tenantId), inArray(vendedores.id, vendedorIds)));
    } catch (e) {
      errors.push(`vendedores: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Deletar users por tenantId + userIds
  if (userIds.length > 0) {
    try {
      await db.delete(users).where(and(eq(users.tenantId, tenantId), inArray(users.id, userIds)));
    } catch (e) {
      errors.push(`users: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`cleanupPedidosHeavyTestData falhou: ${errors.join("; ")}`);
  }
}

/**
 * Métodos de infraestrutura para testes de consistência do banco
 * APENAS PARA TESTES - NÃO USAR EM PRODUÇÃO
 */

export interface ConsistencyTestDataSetup {
  produtoId: number;
  clienteId: number;
  vendedorId: number;
  estoque: number;
  createdProduto: boolean;
  createdCliente: boolean;
  createdVendedor: boolean;
}

/**
 * Configura dados de teste para testes de consistência
 * Cria produto, cliente e vendedor necessários para os testes
 */
export async function setupConsistencyTestData(tenantId: number): Promise<ConsistencyTestDataSetup> {
  const db = await getDb();
  if (!db) throw new Error('Database não disponível');

  logger.info('🔧 Configurando dados de teste de consistência...');

  let createdProduto = false;
  let produtoId = 1;
  const produtoExists = await db
    .select()
    .from(produtos)
    .where(and(eq(produtos.tenantId, tenantId), eq(produtos.id, produtoId)))
    .limit(1);

  if (!produtoExists.length) {
    logger.info(`📦 Criando produto teste...`);
    const result = await db.insert(produtos).values({
      tenantId,
      descricao: 'Produto Teste Consistência',
      valorVenda: '100',
      estoque: 100,
    });
    produtoId = getInsertId(result) || 1;
    createdProduto = true;
    logger.info(`✅ Produto criado: ID ${produtoId}`);
  } else {
    await db
      .update(produtos)
      .set({ estoque: 100 })
      .where(and(eq(produtos.tenantId, tenantId), eq(produtos.id, produtoId)));
    logger.info(`✅ Estoque do produto resetado para 100`);
  }

  let createdCliente = false;
  let clienteId = 1;

  const telefoneNorm = '1199999999';
  const nomeNorm = 'cliente teste';
  const sobrenomeNorm = 'teste';

  const existingCliente = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(
      and(
        eq(clientes.tenantId, tenantId),
        eq(clientes.telefoneNorm, telefoneNorm),
        eq(clientes.nomeNorm, nomeNorm),
        eq(clientes.sobrenomeNorm, sobrenomeNorm)
      )
    )
    .limit(1);

  if (existingCliente.length > 0) {
    clienteId = existingCliente[0].id;
    logger.info(`✅ Cliente teste existente reutilizado: ID ${clienteId}`);
  } else {
    logger.info(`👤 Criando cliente teste...`);
    const result = await db.insert(clientes).values({
      tenantId,
      nome: 'Cliente Teste',
      telefone: '1199999999',
      telefoneNorm,
      nomeNorm,
      sobrenomeNorm,
    });
    clienteId = getInsertId(result) || 1;
    createdCliente = true;
    logger.info(`✅ Cliente criado: ID ${clienteId}`);
  }

  let createdVendedor = false;
  let vendedorId = 1;
  const vendedorExists = await db
    .select()
    .from(vendedores)
    .where(and(eq(vendedores.tenantId, tenantId), eq(vendedores.id, vendedorId)))
    .limit(1);

  if (!vendedorExists.length) {
    logger.info(`🧑 Criando vendedor teste...`);
    try {
      const result = await db.insert(vendedores).values({
        tenantId,
        nome: 'Vendedor Teste',
        email: `vendedor-${Date.now()}@test.local`,
        ativo: true,
      });
      vendedorId = getInsertId(result) || 1;
      createdVendedor = true;
      logger.info(`✅ Vendedor criado: ID ${vendedorId}`);
    } catch (e) {
      logger.warn(`⚠️ Não foi possível criar vendedor, usando existente`);
    }
  }

  const setup: ConsistencyTestDataSetup = {
    produtoId,
    clienteId,
    vendedorId,
    estoque: 100,
    createdProduto,
    createdCliente,
    createdVendedor,
  };

  logger.info('✅ Dados de teste de consistência configurados');
  return setup;
}

/**
 * Limpa dados de teste de consistência
 * Remove pedidos e outros dados criados durante os testes
 * Somente deleta registros que foram criados pelo setup
 */
export async function cleanupConsistencyTestData(tenantId: number, setup: ConsistencyTestDataSetup): Promise<void> {
  const db = await getDb();
  if (!db) return;

  logger.info('🧹 Limpando dados de teste de consistência...');

  try {
    // Deletar produto se foi criado pelo setup
    if (setup.createdProduto) {
      await db
        .delete(produtos)
        .where(and(eq(produtos.tenantId, tenantId), eq(produtos.id, setup.produtoId)));
      logger.info(`✅ Produto ${setup.produtoId} removido`);
    }

    // Deletar cliente se foi criado pelo setup
    if (setup.createdCliente) {
      await db
        .delete(clientes)
        .where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, setup.clienteId)));
      logger.info(`✅ Cliente ${setup.clienteId} removido`);
    }

    // Deletar vendedor se foi criado pelo setup
    if (setup.createdVendedor) {
      await db
        .delete(vendedores)
        .where(and(eq(vendedores.tenantId, tenantId), eq(vendedores.id, setup.vendedorId)));
      logger.info(`✅ Vendedor ${setup.vendedorId} removido`);
    }

    logger.info('✅ Dados de teste de consistência limpos');
  } catch (e) {
    logger.warn(`⚠️ Não foi possível limpar todos os dados: ${e instanceof Error ? e.message : String(e)}`);
  }
}
