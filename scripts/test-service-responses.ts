/**
 * Script para testar os retornos padronizados dos serviços
 * 
 * Este script testa os principais serviços para garantir que os retornos
 * estejam padronizados conforme especificado.
 */
import * as clientesService from '../server/services/clientes.service';
import * as inventoryService from '../server/services/inventory.service';
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
  
  // Teste 1: clientes.list - deve retornar um array
  try {
    console.log('\n🧪 Testando clientes.listClientes...');
    const clientesResult = await clientesService.listClientes(TENANT_ID, {});
    const isArray = Array.isArray(clientesResult.items);
    results.push({
      service: 'clientes',
      method: 'listClientes',
      expected: 'Array',
      actual: isArray ? 'Array' : typeof clientesResult.items,
      passed: isArray
    });
    console.log(isArray ? '✅ Retorno é um array' : '❌ Retorno não é um array');
  } catch (error) {
    console.error('❌ Erro ao testar clientes.listClientes:', error);
    results.push({
      service: 'clientes',
      method: 'listClientes',
      expected: 'Array',
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
  
  // Teste 3: produtos com preço - deve retornar um array
  try {
    console.log('\n🧪 Testando inventory.getAllProdutosComPrecoVigente...');
    const produtosPrecoResult = await inventoryService.getAllProdutosComPrecoVigente(TENANT_ID);
    const isArray = Array.isArray(produtosPrecoResult);
    results.push({
      service: 'inventory',
      method: 'getAllProdutosComPrecoVigente',
      expected: 'Array',
      actual: isArray ? 'Array' : typeof produtosPrecoResult,
      passed: isArray
    });
    console.log(isArray ? '✅ Retorno é um array' : '❌ Retorno não é um array');
  } catch (error) {
    console.error('❌ Erro ao testar inventory.getAllProdutosComPrecoVigente:', error);
    results.push({
      service: 'inventory',
      method: 'getAllProdutosComPrecoVigente',
      expected: 'Array',
      actual: 'Error',
      passed: false
    });
  }
  
  // Teste 4: produtos paginados - deve retornar objeto com items como array
  try {
    console.log('\n🧪 Testando inventory.getProdutosComPrecoVigentePaged...');
    const produtosPaginadosResult = await inventoryService.getProdutosComPrecoVigentePaged(TENANT_ID, {
      page: 1,
      pageSize: 10
    });
    const hasItems = 'items' in produtosPaginadosResult;
    const isItemsArray = hasItems && Array.isArray(produtosPaginadosResult.items);
    results.push({
      service: 'inventory',
      method: 'getProdutosComPrecoVigentePaged',
      expected: 'Object with items as Array',
      actual: isItemsArray ? 'Object with items as Array' : `Object with items as ${hasItems ? typeof produtosPaginadosResult.items : 'missing'}`,
      passed: isItemsArray
    });
    console.log(isItemsArray ? '✅ Retorno é um objeto com items como array' : '❌ Retorno não é um objeto com items como array');
  } catch (error) {
    console.error('❌ Erro ao testar inventory.getProdutosComPrecoVigentePaged:', error);
    results.push({
      service: 'inventory',
      method: 'getProdutosComPrecoVigentePaged',
      expected: 'Object with items as Array',
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