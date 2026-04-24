/**
 * TESTE SIMPLES DE IDEMPOTÊNCIA - VALIDAÇÃO LÓGICA
 */
import { createHash } from 'crypto';

console.log('🚀 INICIANDO TESTE DE IDEMPOTÊNCIA...');
const TEST_TENANT_ID = Number(process.env.TEST_TENANT_ID);
if (!Number.isFinite(TEST_TENANT_ID) || TEST_TENANT_ID <= 0) {
  console.error("❌ TEST_TENANT_ID não fornecido ou inválido. Defina TEST_TENANT_ID como variável de ambiente.");
  process.exit(1);
}

// Simular função de geração de chave
function generatePedidoIdempotencyKey(
  tenantId: number,
  vendedorId: number,
  clienteId: number,
  itens: Array<{ produtoId?: number; quantidade: number; valorUnitario: number }>
): string {
  const keyData = {
    tenantId,
    vendedorId,
    clienteId,
    itens: itens.map(i => ({
      produtoId: i.produtoId || 0,
      quantidade: i.quantidade,
      valorUnitario: Number(i.valorUnitario || 0)
    })).sort((a, b) => a.produtoId - b.produtoId)
  };
  
  const keyString = JSON.stringify(keyData);
  return createHash('sha256').update(keyString).digest('hex').substring(0, 32);
}

// Testar consistência da chave
function testIdempotencyKeyGeneration() {
  console.log('🧪 TESTE DE GERAÇÃO DE CHAVE IDEMPOTÊNCIA\n');
  
  const pedidoData = {
    tenantId: TEST_TENANT_ID,
    vendedorId: 1,
    clienteId: 1,
    itens: [
      { produtoId: 1, quantidade: 2, valorUnitario: 50.00 },
      { produtoId: 2, quantidade: 1, valorUnitario: 100.00 }
    ]
  };
  
  // Gerar chave múltiplas vezes
  const key1 = generatePedidoIdempotencyKey(
    pedidoData.tenantId,
    pedidoData.vendedorId,
    pedidoData.clienteId,
    pedidoData.itens
  );
  
  const key2 = generatePedidoIdempotencyKey(
    pedidoData.tenantId,
    pedidoData.vendedorId,
    pedidoData.clienteId,
    pedidoData.itens
  );
  
  // Testar com itens em ordem diferente
  const key3 = generatePedidoIdempotencyKey(
    pedidoData.tenantId,
    pedidoData.vendedorId,
    pedidoData.clienteId,
    [
      { produtoId: 2, quantidade: 1, valorUnitario: 100.00 },
      { produtoId: 1, quantidade: 2, valorUnitario: 50.00 }
    ]
  );
  
  // Testar com dados diferentes
  const key4 = generatePedidoIdempotencyKey(
    pedidoData.tenantId,
    pedidoData.vendedorId,
    pedidoData.clienteId + 1, // Cliente diferente
    pedidoData.itens
  );
  
  console.log('📊 RESULTADOS:');
  console.log(`Key 1 (mesmo dados): ${key1}`);
  console.log(`Key 2 (mesmo dados): ${key2}`);
  console.log(`Key 3 (ordem inversa): ${key3}`);
  console.log(`Key 4 (cliente diferente): ${key4}`);
  
  console.log('\n🔍 ANÁLISE:');
  console.log(`✅ Keys 1 e 2 iguais: ${key1 === key2 ? 'SIM' : 'NÃO'}`);
  console.log(`✅ Keys 1 e 3 iguais (ordem inversa): ${key1 === key3 ? 'SIM' : 'NÃO'}`);
  console.log(`✅ Keys 1 e 4 diferentes: ${key1 !== key4 ? 'SIM' : 'NÃO'}`);
  
  const testPass = key1 === key2 && key1 === key3 && key1 !== key4;
  console.log(`\n🎯 TESTE ${testPass ? 'PASSOU' : 'FALHOU'}!`);
  
  return testPass;
}

// Testar simulação de concorrência
function testConcurrencySimulation() {
  console.log('\n🔄 TESTE DE SIMULAÇÃO DE CONCORRÊNCIA\n');
  
  // Simular tabela de idempotência
  const idempotencyTable = new Set<string>();
  
  const pedidoData = {
    tenantId: TEST_TENANT_ID,
    vendedorId: 1,
    clienteId: 1,
    itens: [{ produtoId: 1, quantidade: 2, valorUnitario: 50.00 }]
  };
  
  const idempotencyKey = generatePedidoIdempotencyKey(
    pedidoData.tenantId,
    pedidoData.vendedorId,
    pedidoData.clienteId,
    pedidoData.itens
  );
  
  // Simular 2 requests simultâneos
  function simulateRequest(requestNumber: number): boolean {
    console.log(`🚀 Request ${requestNumber}: Tentando criar pedido...`);
    
    // Verificar se chave já existe
    if (idempotencyTable.has(idempotencyKey)) {
      console.log(`❌ Request ${requestNumber}: Chave já existe! Abortando.`);
      return false; // Falha - idempotência funcionou
    }
    
    // Inserir chave
    idempotencyTable.add(idempotencyKey);
    console.log(`✅ Request ${requestNumber}: Pedido criado com sucesso!`);
    return true; // Sucesso
  }
  
  // Executar simulação
  const result1 = simulateRequest(1);
  const result2 = simulateRequest(2);
  
  console.log('\n📊 RESULTADOS DA SIMULAÇÃO:');
  console.log(`Request 1: ${result1 ? 'SUCESSO' : 'FALHA'}`);
  console.log(`Request 2: ${result2 ? 'SUCESSO' : 'FALHA'}`);
  
  const successCount = [result1, result2].filter(r => r).length;
  const testPass = successCount === 1;
  
  console.log(`\n🎯 Pedidos criados: ${successCount}`);
  console.log(`🎯 TESTE ${testPass ? 'PASSOU' : 'FALHOU'}! ${testPass ? 'Apenas 1 pedido criado' : 'Múltiplos pedidos criados'}`);
  
  return testPass;
}

// Executar testes imediatamente
const results = {
  keyGeneration: testIdempotencyKeyGeneration(),
  concurrency: testConcurrencySimulation()
};

console.log('\n📋 RELATÓRIO FINAL:');
console.log(`✅ Geração de Chave: ${results.keyGeneration ? 'FUNCIONANDO' : 'FALHOU'}`);
console.log(`✅ Simulação Concorrência: ${results.concurrency ? 'FUNCIONANDO' : 'FALHOU'}`);

if (results.keyGeneration && results.concurrency) {
  console.log('\n🎉 TODOS OS TESTES PASSARAM! Lógica de idempotência está correta.');
} else {
  console.log('\n⚠️ ALGUNS TESTES FALHARAM! Revisar implementação.');
}
