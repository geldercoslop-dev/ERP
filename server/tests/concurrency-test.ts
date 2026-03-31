import { createPedidoSafe } from '../services/orders.service.js';
import { getDb } from '../db/index.js';

/**
 * TESTE REAL DE IDEMPOTÊNCIA E CONCORRÊNCIA
 * 
 * Este teste simula 2 requests simultâneos para criar o mesmo pedido
 * e verifica se apenas 1 é criado (idempotência funcionando)
 */
async function testIdempotencyReal() {
  console.log('🧪 INICIANDO TESTE REAL DE IDEMPOTÊNCIA...');
  const tenantId = Number(process.env.TEST_TENANT_ID || process.env.DEFAULT_TENANT_ID || 99);
  const pedidoData = {
    vendedorId: 1,
    clienteId: 1,
    cliente: {
      nome: 'Cliente Teste',
      telefone: '11999999999',
      rua: 'Rua Teste',
      numero: '123',
      bairro: 'Centro',
      cidade: 'São Paulo',
      uf: 'SP'
    },
    subtotal: 100.00,
    desconto: 0,
    frete: 0,
    total: 100.00,
    formaPagamento: 'DINHEIRO',
    itens: [
      {
        tipo: 'CATALOGO',
        produtoId: 1,
        descricao: 'Produto Teste',
        quantidade: 2,
        valorUnitario: 50.00,
        custo: 25.00
      }
    ]
  };

  try {
    // Limpar registros de idempotência antes do teste
    const db = await getDb();
    if (db) {
      await db.delete((await import('../db/index.js')).idempotencyKeys);
      console.log('✅ Tabela de idempotência limpa');
    }

    // 🔄 SIMULAR 2 REQUESTS SIMULTÂNEOS
    console.log('🚀 Enviando 2 requests simultâneos...');
    
    const promises = [
      createPedidoSafe(tenantId, pedidoData, { vendedorId: 1 }),
      createPedidoSafe(tenantId, pedidoData, { vendedorId: 1 })
    ];

    const results = await Promise.all(promises);
    
    console.log('📊 RESULTADOS:');
    results.forEach((result, index) => {
      console.log(`Request ${index + 1}:`, {
        success: result.success,
        pedidoId: result.pedidoId,
        numero: result.numero,
        status: result.status
      });
    });

    // 🎯 VERIFICAR RESULTADO ESPERADO
    const successfulRequests = results.filter(r => r.success);
    const failedRequests = results.filter(r => !r.success);
    
    console.log('\n🔍 ANÁLISE:');
    console.log(`✅ Requests bem-sucedidos: ${successfulRequests.length}`);
    console.log(`❌ Requests falhados: ${failedRequests.length}`);
    
    if (successfulRequests.length === 1 && failedRequests.length === 1) {
      console.log('🎉 IDEMPOTÊNCIA FUNCIONOU! Apenas 1 pedido criado.');
      
      // Verificar se não há duplicação no banco
      const db2 = await getDb();
      if (db2) {
        const pedidos = await db2.select().from((await import('../db/index.js')).pedidos);
        console.log(`📈 Total de pedidos no banco: ${pedidos.length}`);
        
        const idempotencyRecords = await db2.select().from((await import('../db/index.js')).idempotencyKeys);
        console.log(`🔑 Registros de idempotência: ${idempotencyRecords.length}`);
      }
      
      return true;
    } else {
      console.log('❌ IDEMPOTÊNCIA FALHOU! Verificar implementação.');
      return false;
    }
    
  } catch (error) {
    console.error('💥 Erro no teste:', error);
    return false;
  }
}

/**
 * TESTE DE LOCK NO ESTOQUE
 */
async function testEstoqueLock() {
  console.log('\n🔒 TESTANDO LOCK NO ESTOQUE...');
  const tenantId = Number(process.env.TEST_TENANT_ID || process.env.DEFAULT_TENANT_ID || 99);
  const pedidoDataEstoqueBaixo = {
    vendedorId: 1,
    clienteId: 1,
    cliente: {
      nome: 'Cliente Teste Estoque',
      telefone: '11999999998',
      rua: 'Rua Teste',
      numero: '456',
      bairro: 'Centro',
      cidade: 'São Paulo',
      uf: 'SP'
    },
    subtotal: 1000.00,
    desconto: 0,
    frete: 0,
    total: 1000.00,
    formaPagamento: 'DINHEIRO',
    itens: [
      {
        tipo: 'CATALOGO',
        produtoId: 1,
        descricao: ' Produto Teste Estoque',
        quantidade: 999, // Quantidade maior que estoque
        valorUnitario: 50.00,
        custo: 25.00
      }
    ]
  };

  try {
    const result = await createPedidoSafe(tenantId, pedidoDataEstoqueBaixo, { vendedorId: 1 });
    
    console.log('📊 Resultado com estoque insuficiente:', {
      success: result.success,
      status: result.status,
      gerouPendencia: result.gerouPendencia
    });
    
    if (result.status === 'PENDENTE_ESTOQUE' && result.gerouPendencia) {
      console.log('✅ LOCK DE ESTOQUE FUNCIONOU! Pedido com pendência criado.');
      return true;
    } else {
      console.log('❌ LOCK DE ESTOQUE FALHOU!');
      return false;
    }
    
  } catch (error) {
    console.error('💥 Erro no teste de estoque:', error);
    return false;
  }
}

/**
 * EXECUTAR TODOS OS TESTES
 */
export async function runConcurrencyTests() {
  console.log('🚀 INICIANDO TESTES DE CONCORRÊNCIA E IDEMPOTÊNCIA\n');
  
  const results = {
    idempotency: false,
    estoqueLock: false
  };
  
  try {
    results.idempotency = await testIdempotencyReal();
    results.estoqueLock = await testEstoqueLock();
    
    console.log('\n📋 RELATÓRIO FINAL:');
    console.log(`✅ Idempotência: ${results.idempotency ? 'FUNCIONANDO' : 'FALHOU'}`);
    console.log(`✅ Lock Estoque: ${results.estoqueLock ? 'FUNCIONANDO' : 'FALHOU'}`);
    
    if (results.idempotency && results.estoqueLock) {
      console.log('🎉 TODOS OS TESTES PASSARAM! Sistema blindado contra concorrência.');
    } else {
      console.log('⚠️ ALGUNS TESTES FALHARAM! Revisar implementação.');
    }
    
  } catch (error) {
    console.error('💥 Erro geral nos testes:', error);
  }
  
  return results;
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  runConcurrencyTests();
}
