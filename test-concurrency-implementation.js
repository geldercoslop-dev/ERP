/**
 * TESTE DE IMPLEMENTAÇÃO DE CONCORRÊNCIA
 * 
 * Este script testa a implementação do controle de concorrência
 * em diferentes cenários críticos.
 */

const { runStockTransaction } = require('./server/services/db-transaction');
const { processStockOperation } = require('./server/services/safe-stock');
const { getDb } = require('./server/db/index');
const { eq } = require('drizzle-orm');

// Função para simular múltiplas operações concorrentes
async function simulateConcurrentOperations(operations, delayMs = 0) {
  console.log(`Simulando ${operations.length} operações concorrentes...`);
  
  // Criar promessas para cada operação
  const promises = operations.map((op, index) => {
    return new Promise(async (resolve) => {
      // Adicionar delay para simular concorrência real
      if (delayMs > 0) {
        await new Promise(r => setTimeout(r, Math.random() * delayMs));
      }
      
      try {
        console.log(`[${index}] Iniciando operação: ${JSON.stringify(op)}`);
        const result = await processStockOperation(op);
        console.log(`[${index}] Resultado: ${JSON.stringify(result)}`);
        resolve({ success: true, index, result });
      } catch (error) {
        console.error(`[${index}] Erro: ${error.message}`);
        resolve({ success: false, index, error: error.message });
      }
    });
  });
  
  // Executar todas as operações em paralelo
  return Promise.all(promises);
}

// Função para verificar estoque atual
async function checkStock(produtoId) {
  try {
    const db = await getDb();
    if (!db) {
      throw new Error('Database não disponível');
    }
    
    const produtos = await import('./drizzle/schema').then(m => m.produtos);
    
    const result = await db
      .select({ id: produtos.id, estoque: produtos.estoque })
      .from(produtos)
      .where(eq(produtos.id, produtoId))
      .limit(1);
    
    if (!result || result.length === 0) {
      throw new Error(`Produto ${produtoId} não encontrado`);
    }
    
    return {
      produtoId,
      saldo: Number(result[0].estoque || 0)
    };
  } catch (error) {
    console.error('Erro ao verificar estoque:', error);
    throw error;
  }
}

// Teste 1: Operações de entrada e saída concorrentes
async function testEntradaSaidaConcorrente() {
  console.log('\n=== TESTE 1: Entrada/Saída Concorrente ===');
  
  const PRODUTO_ID = 1; // Ajuste para um ID válido
  
  // Verificar estoque inicial
  const estoqueInicial = await checkStock(PRODUTO_ID);
  console.log(`Estoque inicial: ${estoqueInicial.saldo}`);
  
  // Criar operações: 5 entradas e 5 saídas
  const operations = [];
  for (let i = 0; i < 5; i++) {
    operations.push({
      produtoId: PRODUTO_ID,
      quantidade: 1,
      tipo: 'entrada',
      motivo: `Teste entrada #${i}`,
      traceId: `test_entrada_${i}`
    });
    
    operations.push({
      produtoId: PRODUTO_ID,
      quantidade: 1,
      tipo: 'saida',
      motivo: `Teste saída #${i}`,
      traceId: `test_saida_${i}`
    });
  }
  
  // Executar operações concorrentes
  const results = await simulateConcurrentOperations(operations, 100);
  
  // Verificar estoque final
  const estoqueFinal = await checkStock(PRODUTO_ID);
  console.log(`Estoque final: ${estoqueFinal.saldo}`);
  
  // Analisar resultados
  const sucessos = results.filter(r => r.success).length;
  const falhas = results.filter(r => !r.success).length;
  
  console.log(`\nResultados: ${sucessos} sucessos, ${falhas} falhas`);
  console.log(`Alteração esperada: 0 (5 entradas - 5 saídas)`);
  console.log(`Alteração real: ${estoqueFinal.saldo - estoqueInicial.saldo}`);
  
  if (estoqueFinal.saldo === estoqueInicial.saldo) {
    console.log('✅ TESTE PASSOU: Estoque final igual ao inicial');
  } else {
    console.log('❌ TESTE FALHOU: Estoque final diferente do inicial');
  }
}

// Teste 2: Estoque negativo
async function testEstoqueNegativo() {
  console.log('\n=== TESTE 2: Prevenção de Estoque Negativo ===');
  
  const PRODUTO_ID = 1; // Ajuste para um ID válido
  
  // Verificar estoque inicial
  const estoqueInicial = await checkStock(PRODUTO_ID);
  console.log(`Estoque inicial: ${estoqueInicial.saldo}`);
  
  // Tentar sacar mais do que o disponível
  const quantidadeExcessiva = estoqueInicial.saldo + 10;
  
  const operation = {
    produtoId: PRODUTO_ID,
    quantidade: quantidadeExcessiva,
    tipo: 'saida',
    motivo: 'Teste estoque negativo',
    traceId: `test_negativo_${Date.now()}`
  };
  
  try {
    console.log(`Tentando sacar ${quantidadeExcessiva} unidades (estoque atual: ${estoqueInicial.saldo})...`);
    const result = await processStockOperation(operation);
    console.log('Resultado:', result);
    
    // Verificar estoque final
    const estoqueFinal = await checkStock(PRODUTO_ID);
    console.log(`Estoque final: ${estoqueFinal.saldo}`);
    
    if (estoqueFinal.saldo < 0) {
      console.log('❌ TESTE FALHOU: Permitiu estoque negativo');
    } else if (result.success) {
      console.log('❌ TESTE FALHOU: Operação não deveria ter sucesso');
    } else {
      console.log('✅ TESTE PASSOU: Operação bloqueada corretamente');
    }
  } catch (error) {
    console.log(`✅ TESTE PASSOU: Erro capturado corretamente: ${error.message}`);
  }
}

// Teste 3: Deadlock
async function testDeadlock() {
  console.log('\n=== TESTE 3: Prevenção de Deadlock ===');
  
  const PRODUTO_ID_1 = 1; // Ajuste para um ID válido
  const PRODUTO_ID_2 = 2; // Ajuste para um ID válido
  
  // Simular duas transações que poderiam causar deadlock
  const transaction1 = runStockTransaction(async (tx) => {
    console.log('Transação 1: Bloqueando produto 1...');
    
    // Bloquear produto 1
    const [produto1] = await tx.execute(
      'SELECT * FROM produtos WHERE id = ? FOR UPDATE',
      [PRODUTO_ID_1]
    );
    
    // Delay para aumentar chance de deadlock
    console.log('Transação 1: Aguardando 500ms...');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('Transação 1: Tentando bloquear produto 2...');
    // Bloquear produto 2
    const [produto2] = await tx.execute(
      'SELECT * FROM produtos WHERE id = ? FOR UPDATE',
      [PRODUTO_ID_2]
    );
    
    console.log('Transação 1: Ambos produtos bloqueados com sucesso');
    return { success: true, message: 'Transação 1 concluída' };
  });
  
  const transaction2 = runStockTransaction(async (tx) => {
    // Na versão corrigida, a ordenação de IDs deve prevenir deadlock
    console.log('Transação 2: Bloqueando produto 2...');
    
    // Bloquear produto 2
    const [produto2] = await tx.execute(
      'SELECT * FROM produtos WHERE id = ? FOR UPDATE',
      [PRODUTO_ID_2]
    );
    
    // Delay para aumentar chance de deadlock
    console.log('Transação 2: Aguardando 500ms...');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('Transação 2: Tentando bloquear produto 1...');
    // Bloquear produto 1
    const [produto1] = await tx.execute(
      'SELECT * FROM produtos WHERE id = ? FOR UPDATE',
      [PRODUTO_ID_1]
    );
    
    console.log('Transação 2: Ambos produtos bloqueados com sucesso');
    return { success: true, message: 'Transação 2 concluída' };
  });
  
  try {
    // Executar as duas transações em paralelo
    const results = await Promise.all([transaction1, transaction2]);
    console.log('Resultados:', results);
    console.log('✅ TESTE PASSOU: Ambas transações completadas sem deadlock');
  } catch (error) {
    console.error('❌ TESTE FALHOU: Ocorreu um erro:', error.message);
    
    if (error.message.includes('deadlock') || error.message.includes('Lock wait timeout')) {
      console.log('⚠️ Deadlock ou timeout detectado - verifique a implementação da ordenação de locks');
    }
  }
}

// Executar todos os testes
async function runAllTests() {
  try {
    await testEntradaSaidaConcorrente();
    await testEstoqueNegativo();
    await testDeadlock();
    
    console.log('\n=== TESTES CONCLUÍDOS ===');
  } catch (error) {
    console.error('Erro ao executar testes:', error);
  } finally {
    // Encerrar processo
    process.exit(0);
  }
}

// Iniciar testes
runAllTests();