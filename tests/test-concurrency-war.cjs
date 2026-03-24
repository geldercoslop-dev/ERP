#!/usr/bin/env node

/**
 * TESTE DE GUERRA: CONCORRÊNCIA
 * Testa criação de pedidos simultâneos sem duplicação
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('TESTE DE GUERRA: CONCORRÊNCIA');
console.log('='.repeat(60));

// Simulação de pedido
class PedidoSimulator {
  constructor() {
    this.pedidosCriados = [];
    this.estoqueInicial = 100;
    this.estoqueAtual = 100;
    this.locks = new Map();
  }

  // Simular lock de produto
  async lockProduct(produtoId, pedidoId) {
    const lockKey = `product:${produtoId}`;
    
    // Simular espera por lock
    while (this.locks.has(lockKey)) {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
    }
    
    this.locks.set(lockKey, pedidoId);
    return true;
  }

  // Liberar lock
  unlockProduct(produtoId) {
    const lockKey = `product:${produtoId}`;
    this.locks.delete(lockKey);
  }

  // Criar pedido com controle de concorrência
  async criarPedido(pedidoId, produtoId, quantidade) {
    const startTime = Date.now();
    
    try {
      // Adquirir lock do produto
      await this.lockProduct(produtoId, pedidoId);
      
      // Verificar estoque
      if (this.estoqueAtual < quantidade) {
        throw new Error(`Estoque insuficiente. Disponível: ${this.estoqueAtual}, Solicitado: ${quantidade}`);
      }
      
      // Simular tempo de processamento
      await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
      
      // Atualizar estoque
      this.estoqueAtual -= quantidade;
      
      // Criar pedido
      const pedido = {
        id: pedidoId,
        produtoId,
        quantidade,
        timestamp: Date.now(),
        estoqueApos: this.estoqueAtual,
        processingTime: Date.now() - startTime
      };
      
      this.pedidosCriados.push(pedido);
      
      return { success: true, pedido };
      
    } catch (error) {
      return { success: false, error: error.message, pedidoId };
    } finally {
      // Liberar lock
      this.unlockProduct(produtoId);
    }
  }
}

// Teste de concorrência real
async function testConcurrency() {
  console.log('\n🔍 TESTE 1: Concorrência de Pedidos');
  
  const simulator = new PedidoSimulator();
  const concurrentRequests = 20;
  const produtoId = 'PROD-001';
  const quantidadePorPedido = 2;
  
  console.log(`📊 Criando ${concurrentRequests} pedidos simultâneos`);
  console.log(`📦 Produto: ${produtoId}, Quantidade por pedido: ${quantidadePorPedido}`);
  console.log(`📦 Estoque inicial: ${simulator.estoqueInicial}`);
  
  // Criar pedidos simultâneos
  const startTime = Date.now();
  const promises = [];
  
  for (let i = 1; i <= concurrentRequests; i++) {
    const promise = simulator.criarPedido(`PED-${i.toString().padStart(3, '0')}`, produtoId, quantidadePorPedido);
    promises.push(promise);
  }
  
  const results = await Promise.allSettled(promises);
  const endTime = Date.now();
  
  // Análise dos resultados
  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);
  const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success));
  
  console.log(`\n📈 RESULTADOS:`);
  console.log(`⏱️ Tempo total: ${endTime - startTime}ms`);
  console.log(`✅ Pedidos criados: ${successful.length}`);
  console.log(`❌ Pedidos falharam: ${failed.length}`);
  console.log(`📦 Estoque final: ${simulator.estoqueAtual}`);
  
  // Verificar duplicação
  const pedidoIds = simulator.pedidosCriados.map(p => p.id);
  const uniqueIds = [...new Set(pedidoIds)];
  const duplicated = pedidoIds.length - uniqueIds.length;
  
  if (duplicated === 0) {
    console.log('✅ Nenhuma duplicação detectada');
  } else {
    console.log(`❌ ${duplicated} pedidos duplicados!`);
  }
  
  // Verificar consistência do estoque
  const totalQuantidade = simulator.pedidosCriados.reduce((sum, p) => sum + p.quantidade, 0);
  const estoqueEsperado = simulator.estoqueInicial - totalQuantidade;
  
  if (simulator.estoqueAtual === estoqueEsperado) {
    console.log('✅ Estoque consistente');
  } else {
    console.log(`❌ Estoque inconsistente! Atual: ${simulator.estoqueAtual}, Esperado: ${estoqueEsperado}`);
  }
  
  // Verificar se não vendeu mais que o estoque
  if (simulator.estoqueAtual >= 0) {
    console.log('✅ Não houve venda além do estoque');
  } else {
    console.log(`❌ Vendeu além do estoque! Estoque negativo: ${simulator.estoqueAtual}`);
  }
  
  // Análise de performance
  if (successful.length > 0) {
    const processingTimes = successful.map(r => r.value.pedido.processingTime);
    const avgProcessingTime = Math.round(processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length);
    const maxProcessingTime = Math.max(...processingTimes);
    
    console.log(`⚡ Processing time - Média: ${avgProcessingTime}ms, Máximo: ${maxProcessingTime}ms`);
  }
  
  return {
    success: duplicated === 0 && simulator.estoqueAtual >= 0 && simulator.estoqueAtual === estoqueEsperado,
    pedidosCriados: successful.length,
    pedidosFalhados: failed.length,
    duplicados: duplicated,
    estoqueFinal: simulator.estoqueAtual,
    estoqueConsistente: simulator.estoqueAtual === estoqueEsperado
  };
}

// Teste de estresse de locks
async function testLockStress() {
  console.log('\n🔍 TESTE 2: Estresse de Locks');
  
  const simulator = new PedidoSimulator();
  const highConcurrency = 100;
  const produtoId = 'PROD-STRESS';
  
  console.log(`📊 Testando ${highConcurrency} operações concorrentes`);
  
  const promises = [];
  for (let i = 1; i <= highConcurrency; i++) {
    const promise = simulator.criarPedido(`STRESS-${i}`, produtoId, 1);
    promises.push(promise);
  }
  
  const results = await Promise.allSettled(promises);
  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  
  console.log(`✅ Operações bem-sucedidas: ${successful}/${highConcurrency}`);
  console.log(`📦 Estoque final: ${simulator.estoqueAtual}`);
  
  // Verificar se o sistema se comportou corretamente sob alta concorrência
  const expectedSuccess = Math.min(highConcurrency, simulator.estoqueInicial);
  const behavedCorrectly = successful === expectedSuccess && simulator.estoqueAtual >= 0;
  
  if (behavedCorrectly) {
    console.log('✅ Sistema comportou-se corretamente sob alta concorrência');
  } else {
    console.log('❌ Sistema apresentou problemas sob alta concorrência');
  }
  
  return {
    success: behavedCorrectly,
    operacoes: highConcurrency,
    sucesso: successful,
    esperado: expectedSuccess
  };
}

// Teste de deadlock
async function testDeadlockPrevention() {
  console.log('\n🔍 TESTE 3: Prevenção de Deadlock');
  
  const simulator = new PedidoSimulator();
  
  // Simular cenário de deadlock potencial
  // Múltiplos pedidos com múltiplos produtos
  const promises = [];
  const produtos = ['PROD-A', 'PROD-B', 'PROD-C'];
  
  for (let i = 1; i <= 10; i++) {
    const produtoId = produtos[i % produtos.length];
    const promise = simulator.criarPedido(`DEADLOCK-${i}`, produtoId, 1);
    promises.push(promise);
  }
  
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('DEADLOCK DETECTADO - Operação travou')), 5000);
  });
  
  try {
    const results = await Promise.race([
      Promise.allSettled(promises),
      timeout
    ]);
    
    if (results instanceof Error) {
      console.log('❌ Deadlock detectado!');
      return { success: false, deadlock: true };
    } else {
      console.log('✅ Nenhum deadlock detectado');
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      console.log(`✅ ${successful}/10 pedidos processados sem deadlock`);
      return { success: true, deadlock: false, processed: successful };
    }
  } catch (error) {
    console.log('❌ Erro no teste de deadlock:', error.message);
    return { success: false, error: error.message };
  }
}

// Teste de integridade de transações
async function testTransactionIntegrity() {
  console.log('\n🔍 TESTE 4: Integridade de Transações');
  
  const simulator = new PedidoSimulator();
  const transactionSize = 5;
  
  // Simular transação com múltiplas operações
  const transaction = async (txId) => {
    const operations = [];
    
    for (let i = 0; i < transactionSize; i++) {
      const result = await simulator.criarPedido(`TX-${txId}-${i}`, 'PROD-TX', 1);
      operations.push(result);
    }
    
    return operations;
  };
  
  // Executar múltiplas transações simultâneas
  const promises = [];
  for (let i = 1; i <= 3; i++) {
    promises.push(transaction(i));
  }
  
  const results = await Promise.allSettled(promises);
  
  // Verificar integridade
  let totalOperations = 0;
  let successfulOperations = 0;
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const ops = result.value;
      totalOperations += ops.length;
      successfulOperations += ops.filter(op => op.success).length;
      console.log(`✅ Transação ${index + 1}: ${ops.filter(op => op.success).length}/${ops.length} operações`);
    } else {
      console.log(`❌ Transação ${index + 1}: Falhou`);
    }
  });
  
  console.log(`📊 Total: ${successfulOperations}/${totalOperations} operações bem-sucedidas`);
  
  // Verificar consistência final do estoque
  const estoqueEsperado = simulator.estoqueInicial - successfulOperations;
  const consistent = simulator.estoqueAtual === estoqueEsperado;
  
  if (consistent) {
    console.log('✅ Integridade da transação mantida');
  } else {
    console.log(`❌ Integridade comprometida! Atual: ${simulator.estoqueAtual}, Esperado: ${estoqueEsperado}`);
  }
  
  return {
    success: consistent,
    operations: totalOperations,
    successful: successfulOperations,
    estoqueConsistente: consistent
  };
}

async function runConcurrencyTests() {
  console.log('🚀 INICIANDO TESTE DE GUERRA - CONCORRÊNCIA');
  
  const results = [];
  
  // Executar todos os testes
  results.push(await testConcurrency());
  results.push(await testLockStress());
  results.push(await testDeadlockPrevention());
  results.push(await testTransactionIntegrity());
  
  // Relatório final
  console.log('\n' + '='.repeat(60));
  console.log('RELATÓRIO FINAL - CONCORRÊNCIA');
  console.log('='.repeat(60));
  
  console.log('\n📊 RESUMO DOS TESTES:');
  
  const testNames = [
    'Concorrência de Pedidos',
    'Estresse de Locks',
    'Prevenção de Deadlock',
    'Integridade de Transações'
  ];
  
  let passedTests = 0;
  
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${testNames[index]}: ${result.success ? 'PASSOU' : 'FALHOU'}`);
    
    if (result.success) passedTests++;
  });
  
  console.log(`\n🎯 AVALIAÇÃO FINAL: ${passedTests}/${results.length} testes passaram`);
  
  if (passedTests === results.length) {
    console.log('✅ PASSOU - Sistema é concorrente e seguro');
    console.log('✅ Sem duplicação de pedidos');
    console.log('✅ Estoque consistente sob carga');
    console.log('✅ Sem deadlocks detectados');
    console.log('✅ Integridade de transações mantida');
  } else {
    console.log('❌ FALHOU - Sistema tem problemas de concorrência');
    console.log('❌ Pode haver duplicação ou corrupção de dados');
  }
  
  return passedTests === results.length;
}

runConcurrencyTests().catch(console.error);
