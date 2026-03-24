/**
 * Script para testar os retornos padronizados dos serviços
 * 
 * Este script testa os principais serviços para garantir que os retornos
 * estejam padronizados conforme especificado.
 */
import * as clientesService from '../server/services/clientes.service';
import * as inventoryService from '../server/services/inventory.service';
import * as ordersService from '../server/services/orders.service';
import * as financeService from '../server/services/finance.service';
import * as stockSafetyService from '../server/services/stock-safety.service';
import { getDb } from '../server/db/core';

const TENANT_ID = 1; // ID do tenant para testes

async function testServiceResponses() {
  console.log('🔍 Iniciando testes de retornos dos serviços...');
  
  // Verificar conexão com o banco
  const db = await getDb();
  if (!db) {
    console.error('❌ Erro: Não foi possível conectar ao banco de dados');
    process.exit(1);
  }
  
  console.log('✅ Conexão com o banco de dados estabelecida');
  
  // Array para armazenar resultados dos testes
  const results: Array<{
    service: string;
    method: string;
    expected: string;
    actual: string;
    passed: boolean;
  }> = [];
  
  // Teste 1: clientes.list - deve retornar um objeto com items como array
  try {
    console.log('\n🧪 Testando clientes.listClientes...');
    const clientesResult = await clientesService.listClientes(TENANT_ID, {});
    const hasItems = 'items' in clientesResult;
    const isItemsArray = hasItems && Array.isArray(clientesResult.items);
    results.push({
      service: 'clientes',
      method: 'listClientes',
      expected: 'Object with items as Array',
      actual: isItemsArray ? 'Object with items as Array' : `Object with items as ${hasItems ? typeof clientesResult.items : 'missing'}`,
      passed: isItemsArray
    });
    console.log(isItemsArray ? '✅ Retorno é um objeto com items como array' : '❌ Retorno não é um objeto com items como array');
    
    // Teste adicional: verificar se o método find funciona no resultado
    if (isItemsArray) {
      try {
        const findTest = clientesResult.items.find(() => true);
        console.log('✅ Método find funciona no resultado');
        results.push({
          service: 'clientes',
          method: 'listClientes.find',
          expected: 'Function works',
          actual: 'Function works',
          passed: true
        });
      } catch (findError) {
        console.error('❌ Erro ao usar método find no resultado:', findError);
        results.push({
          service: 'clientes',
          method: 'listClientes.find',
          expected: 'Function works',
          actual: 'Error',
          passed: false
        });
      }
    }
  } catch (error) {
    console.error('❌ Erro ao testar clientes.listClientes:', error);
    results.push({
      service: 'clientes',
      method: 'listClientes',
      expected: 'Object with items as Array',
      actual: 'Error',
      passed: false
    });
  }
  
  // Teste 2: produtos.list - deve retornar um array
  try {
    console.log('\n🧪 Testando inventory.getAllProdutos...');
    const produtosResult = await inventoryService.getAllProdutos(TENANT_ID);
    const isArray = Array.isArray(produtosResult);
    results.push({
      service: 'inventory',
      method: 'getAllProdutos',
      expected: 'Array',
      actual: isArray ? 'Array' : typeof produtosResult,
      passed: isArray
    });
    console.log(isArray ? '✅ Retorno é um array' : '❌ Retorno não é um array');
    
    // Teste adicional: verificar se o método find funciona no resultado
    if (isArray) {
      try {
        const findTest = produtosResult.find(() => true);
        console.log('✅ Método find funciona no resultado');
        results.push({
          service: 'inventory',
          method: 'getAllProdutos.find',
          expected: 'Function works',
          actual: 'Function works',
          passed: true
        });
      } catch (findError) {
        console.error('❌ Erro ao usar método find no resultado:', findError);
        results.push({
          service: 'inventory',
          method: 'getAllProdutos.find',
          expected: 'Function works',
          actual: 'Error',
          passed: false
        });
      }
    }
  } catch (error) {
    console.error('❌ Erro ao testar inventory.getAllProdutos:', error);
    results.push({
      service: 'inventory',
      method: 'getAllProdutos',
      expected: 'Array',
      actual: 'Error',
      passed: false
    });
  }
  
  // Teste 3: pedidos.list - deve retornar um objeto com items como array
  try {
    console.log('\n🧪 Testando orders.listPedidosExtended...');
    const pedidosResult = await ordersService.listPedidosExtended(TENANT_ID, {});
    const hasItems = 'items' in pedidosResult;
    const isItemsArray = hasItems && Array.isArray(pedidosResult.items);
    results.push({
      service: 'orders',
      method: 'listPedidosExtended',
      expected: 'Object with items as Array',
      actual: isItemsArray ? 'Object with items as Array' : `Object with items as ${hasItems ? typeof pedidosResult.items : 'missing'}`,
      passed: isItemsArray
    });
    console.log(isItemsArray ? '✅ Retorno é um objeto com items como array' : '❌ Retorno não é um objeto com items como array');
    
    // Teste adicional: verificar se o método find funciona no resultado
    if (isItemsArray) {
      try {
        const findTest = pedidosResult.items.find(() => true);
        console.log('✅ Método find funciona no resultado');
        results.push({
          service: 'orders',
          method: 'listPedidosExtended.find',
          expected: 'Function works',
          actual: 'Function works',
          passed: true
        });
      } catch (findError) {
        console.error('❌ Erro ao usar método find no resultado:', findError);
        results.push({
          service: 'orders',
          method: 'listPedidosExtended.find',
          expected: 'Function works',
          actual: 'Error',
          passed: false
        });
      }
    }
  } catch (error) {
    console.error('❌ Erro ao testar orders.listPedidosExtended:', error);
    results.push({
      service: 'orders',
      method: 'listPedidosExtended',
      expected: 'Object with items as Array',
      actual: 'Error',
      passed: false
    });
  }
  
  // Teste 4: finance.getCaixaMensal - deve retornar um array
  try {
    console.log('\n🧪 Testando finance.getCaixaMensal...');
    const caixaResult = await financeService.getCaixaMensal(TENANT_ID);
    const isArray = Array.isArray(caixaResult);
    results.push({
      service: 'finance',
      method: 'getCaixaMensal',
      expected: 'Array',
      actual: isArray ? 'Array' : typeof caixaResult,
      passed: isArray
    });
    console.log(isArray ? '✅ Retorno é um array' : '❌ Retorno não é um array');
    
    // Teste adicional: verificar se o método find funciona no resultado
    if (isArray) {
      try {
        const findTest = caixaResult.find(() => true);
        console.log('✅ Método find funciona no resultado');
        results.push({
          service: 'finance',
          method: 'getCaixaMensal.find',
          expected: 'Function works',
          actual: 'Function works',
          passed: true
        });
      } catch (findError) {
        console.error('❌ Erro ao usar método find no resultado:', findError);
        results.push({
          service: 'finance',
          method: 'getCaixaMensal.find',
          expected: 'Function works',
          actual: 'Error',
          passed: false
        });
      }
    }
  } catch (error) {
    console.error('❌ Erro ao testar finance.getCaixaMensal:', error);
    results.push({
      service: 'finance',
      method: 'getCaixaMensal',
      expected: 'Array',
      actual: 'Error',
      passed: false
    });
  }
  
  // Teste 5: stockSafety.getStockMovements - deve retornar um array
  try {
    console.log('\n🧪 Testando stockSafety.getStockMovements...');
    // Buscar um produto para teste
    const produtos = await inventoryService.getAllProdutos(TENANT_ID);
    if (produtos.length > 0) {
      const produtoId = produtos[0].id;
      const movementsResult = await stockSafetyService.getStockMovements(TENANT_ID, produtoId);
      const isArray = Array.isArray(movementsResult);
      results.push({
        service: 'stockSafety',
        method: 'getStockMovements',
        expected: 'Array',
        actual: isArray ? 'Array' : typeof movementsResult,
        passed: isArray
      });
      console.log(isArray ? '✅ Retorno é um array' : '❌ Retorno não é um array');
      
      // Teste adicional: verificar se o método find funciona no resultado
      if (isArray) {
        try {
          const findTest = movementsResult.find(() => true);
          console.log('✅ Método find funciona no resultado');
          results.push({
            service: 'stockSafety',
            method: 'getStockMovements.find',
            expected: 'Function works',
            actual: 'Function works',
            passed: true
          });
        } catch (findError) {
          console.error('❌ Erro ao usar método find no resultado:', findError);
          results.push({
            service: 'stockSafety',
            method: 'getStockMovements.find',
            expected: 'Function works',
            actual: 'Error',
            passed: false
          });
        }
      }
    } else {
      console.log('⚠️ Não foi possível testar stockSafety.getStockMovements: nenhum produto encontrado');
    }
  } catch (error) {
    console.error('❌ Erro ao testar stockSafety.getStockMovements:', error);
    results.push({
      service: 'stockSafety',
      method: 'getStockMovements',
      expected: 'Array',
      actual: 'Error',
      passed: false
    });
  }
  
  // Exibir resumo dos resultados
  console.log('\n📊 Resumo dos testes:');
  console.log('-----------------------------------');
  console.log('Serviço | Método | Resultado | Status');
  console.log('-----------------------------------');
  
  let passedCount = 0;
  let totalCount = results.length;
  
  for (const result of results) {
    if (result.passed) passedCount++;
    console.log(`${result.service} | ${result.method} | ${result.actual} | ${result.passed ? '✅ PASS' : '❌ FAIL'}`);
  }
  
  console.log('-----------------------------------');
  console.log(`Total: ${passedCount}/${totalCount} testes passaram (${Math.round(passedCount/totalCount*100)}%)`);
  
  // Gerar relatório
  const report = {
    timestamp: new Date().toISOString(),
    totalTests: totalCount,
    passedTests: passedCount,
    passRate: `${Math.round(passedCount/totalCount*100)}%`,
    services: {
      clientes: results.filter(r => r.service === 'clientes').map(r => ({ 
        method: r.method, 
        passed: r.passed,
        expected: r.expected,
        actual: r.actual
      })),
      inventory: results.filter(r => r.service === 'inventory').map(r => ({ 
        method: r.method, 
        passed: r.passed,
        expected: r.expected,
        actual: r.actual
      })),
      orders: results.filter(r => r.service === 'orders').map(r => ({ 
        method: r.method, 
        passed: r.passed,
        expected: r.expected,
        actual: r.actual
      })),
      finance: results.filter(r => r.service === 'finance').map(r => ({ 
        method: r.method, 
        passed: r.passed,
        expected: r.expected,
        actual: r.actual
      })),
      stockSafety: results.filter(r => r.service === 'stockSafety').map(r => ({ 
        method: r.method, 
        passed: r.passed,
        expected: r.expected,
        actual: r.actual
      }))
    }
  };
  
  console.log('\n📝 Relatório completo:');
  console.log(JSON.stringify(report, null, 2));
  
  return report;
}

// Executar os testes
testServiceResponses()
  .then(() => {
    console.log('\n✅ Testes concluídos');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Erro durante a execução dos testes:', error);
    process.exit(1);
  });