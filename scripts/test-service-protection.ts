/**
 * Script para testar a proteção de serviços
 * 
 * Este script testa se a proteção está funcionando corretamente,
 * simulando casos de erro e verificando se os valores de fallback
 * são retornados conforme esperado.
 */
import '../server/_core/init-protection';
import * as clientesService from '../server/services/clientes.service';
import * as inventoryService from '../server/services/inventory.service';
import * as ordersService from '../server/services/orders.service';
import * as financeService from '../server/services/finance.service';
import * as stockSafetyService from '../server/services/stock-safety.service';

/**
 * Testa se um valor é um array
 * @param value - O valor a ser testado
 * @param testName - O nome do teste para fins de log
 */
function testIsArray(value: any, testName: string): void {
  if (Array.isArray(value)) {
    console.log(`✅ ${testName}: É um array`);
    
    // Testar se o método find funciona
    try {
      value.find(() => true);
      console.log(`✅ ${testName}: Método find funciona`);
    } catch (error) {
      console.error(`❌ ${testName}: Método find falhou:`, error);
    }
  } else {
    console.error(`❌ ${testName}: Não é um array, é ${typeof value}`);
  }
}

/**
 * Testa se um valor tem um ID válido
 * @param value - O valor a ser testado
 * @param testName - O nome do teste para fins de log
 */
function testHasId(value: any, testName: string): void {
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'number') {
    console.log(`✅ ${testName}: Tem ID válido: ${value.id}`);
  } else {
    console.error(`❌ ${testName}: Não tem ID válido:`, value);
  }
}

/**
 * Testa se um valor tem um indicador de sucesso
 * @param value - O valor a ser testado
 * @param testName - O nome do teste para fins de log
 */
function testHasSuccess(value: any, testName: string): void {
  if (value && typeof value === 'object' && 'success' in value && typeof value.success === 'boolean') {
    console.log(`✅ ${testName}: Tem indicador de sucesso: ${value.success}`);
  } else {
    console.error(`❌ ${testName}: Não tem indicador de sucesso:`, value);
  }
}

/**
 * Testa a proteção de serviços
 */
async function testServiceProtection(): Promise<void> {
  console.log('🧪 Iniciando testes de proteção de serviços...\n');
  
  // Testar serviço de clientes
  console.log('📋 Testando serviço de clientes...');
  try {
    const clientesResult = await clientesService.listClientes(1, {});
    testIsArray(clientesResult.items, 'clientesService.listClientes.items');
  } catch (error) {
    console.error('❌ Erro ao testar clientesService.listClientes:', error);
  }
  
  // Testar serviço de inventário
  console.log('\n📋 Testando serviço de inventário...');
  try {
    const produtosResult = await inventoryService.getAllProdutos(1);
    testIsArray(produtosResult, 'inventoryService.getAllProdutos');
  } catch (error) {
    console.error('❌ Erro ao testar inventoryService.getAllProdutos:', error);
  }
  
  // Testar serviço de pedidos
  console.log('\n📋 Testando serviço de pedidos...');
  try {
    const pedidosResult = await ordersService.listPedidosExtended(1, {});
    testIsArray(pedidosResult.items, 'ordersService.listPedidosExtended.items');
  } catch (error) {
    console.error('❌ Erro ao testar ordersService.listPedidosExtended:', error);
  }
  
  // Testar serviço financeiro
  console.log('\n📋 Testando serviço financeiro...');
  try {
    const caixaResult = await financeService.getCaixaMensal(1);
    testIsArray(caixaResult, 'financeService.getCaixaMensal');
  } catch (error) {
    console.error('❌ Erro ao testar financeService.getCaixaMensal:', error);
  }
  
  // Testar serviço de estoque
  console.log('\n📋 Testando serviço de estoque...');
  try {
    // Buscar um produto para teste
    const produtos = await inventoryService.getAllProdutos(1);
    if (produtos.length > 0) {
      const produtoId = produtos[0].id;
      const movementsResult = await stockSafetyService.getStockMovements(1, produtoId);
      testIsArray(movementsResult, 'stockSafetyService.getStockMovements');
    } else {
      console.log('⚠️ Não foi possível testar stockSafetyService.getStockMovements: nenhum produto encontrado');
    }
  } catch (error) {
    console.error('❌ Erro ao testar stockSafetyService.getStockMovements:', error);
  }
  
  // Testar proteção contra undefined
  console.log('\n📋 Testando proteção contra undefined...');
  
  // Criar mock de serviço com método que retorna undefined
  const mockService = {
    getUndefined: async () => undefined,
    listUndefined: async () => undefined,
    createUndefined: async () => undefined,
    updateUndefined: async () => undefined,
    deleteUndefined: async () => undefined
  };
  
  // Aplicar proteção ao mock
  const { protectService } = await import('../server/_core/service-protection');
  const safeService = protectService('mockService', mockService);
  
  // Testar métodos protegidos
  try {
    const getResult = await safeService.getUndefined();
    console.log('getUndefined retornou:', getResult);
    if (getResult === null) {
      console.log('✅ getUndefined: Proteção funcionou, retornou null em vez de undefined');
    } else {
      console.error('❌ getUndefined: Proteção falhou, deveria retornar null');
    }
  } catch (error) {
    console.error('❌ Erro ao testar getUndefined:', error);
  }
  
  try {
    const listResult = await safeService.listUndefined();
    console.log('listUndefined retornou:', listResult);
    testIsArray(listResult, 'listUndefined');
  } catch (error) {
    console.error('❌ Erro ao testar listUndefined:', error);
  }
  
  try {
    const createResult = await safeService.createUndefined();
    console.log('createUndefined retornou:', createResult);
    testHasId(createResult, 'createUndefined');
  } catch (error) {
    console.log('✅ createUndefined: Proteção funcionou, lançou erro em vez de retornar undefined');
  }
  
  try {
    const updateResult = await safeService.updateUndefined();
    console.log('updateUndefined retornou:', updateResult);
    testHasSuccess(updateResult, 'updateUndefined');
  } catch (error) {
    console.error('❌ Erro ao testar updateUndefined:', error);
  }
  
  try {
    const deleteResult = await safeService.deleteUndefined();
    console.log('deleteUndefined retornou:', deleteResult);
    testHasSuccess(deleteResult, 'deleteUndefined');
  } catch (error) {
    console.error('❌ Erro ao testar deleteUndefined:', error);
  }
  
  console.log('\n✅ Testes de proteção de serviços concluídos');
}

// Executar os testes
testServiceProtection()
  .then(() => {
    console.log('\n🎉 Todos os testes foram concluídos');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Erro durante a execução dos testes:', error);
    process.exit(1);
  });