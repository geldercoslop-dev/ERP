// Teste de validação manual dos services
import { 
  createCliente, 
  getClienteById, 
  listClientes 
} from './server/services/clientes.service';

import { 
  createProduto, 
  getProdutoById, 
  getAllProdutos 
} from './server/services/inventory.service';

import { 
  createPedidoSafe, 
  getPedidoById 
} from './server/services/orders.service';

async function testServices() {
  console.log('🧪 INICIANDO TESTES MANUAIS DOS SERVICES\n');
  const tenantId = Number(process.env.TEST_TENANT_ID || process.env.DEFAULT_TENANT_ID || 99);
  
  // Test 1: CLIENTES
  console.log('📋 TESTANDO CLIENTES SERVICE');
  try {
    // Test create
    const clienteResult = await createCliente(tenantId, {
      nome: 'Test Cliente Manual',
      telefone: '11999999999'
    });
    console.log('✅ createCliente:', clienteResult); // Deve ser { id: number }
    
    // Test get by ID
    const cliente = await getClienteById(tenantId, clienteResult.id);
    console.log('✅ getClienteById:', cliente ? 'Object found' : 'Null'); // Deve ser object ou null
    
    // Test list
    const clientes = await listClientes(tenantId, { page: 1, pageSize: 10 });
    console.log('✅ listClientes:', Array.isArray(clientes.items) ? `Array with ${clientes.items.length} items` : 'Not array');
    
  } catch (error) {
    console.error('❌ CLIENTES ERROR:', error);
  }
  
  // Test 2: PRODUTOS
  console.log('\n📦 TESTANDO PRODUTOS SERVICE');
  try {
    // Test create
    const produtoResult = await createProduto(tenantId, {
      descricao: 'Test Produto Manual',
      preco: 99.99,
      estoque: 100,
      ativo: true
    });
    console.log('✅ createProduto:', produtoResult); // Deve ser { id: number }
    
    // Test get by ID
    const produto = await getProdutoById(tenantId, produtoResult.id);
    console.log('✅ getProdutoById:', produto ? 'Object found' : 'Null'); // Deve ser object ou null
    
    // Test list
    const produtos = await getAllProdutos(tenantId);
    console.log('✅ getAllProdutos:', Array.isArray(produtos) ? `Array with ${produtos.length} items` : 'Not array');
    
  } catch (error) {
    console.error('❌ PRODUTOS ERROR:', error);
  }
  
  // Test 3: PEDIDOS
  console.log('\n🛒 TESTANDO PEDIDOS SERVICE');
  try {
    // Test create (se tiver cliente e produto)
    const pedidoResult = await createPedidoSafe(tenantId, {
      vendedorId: 1,
      clienteId: 1,
      subtotal: 100,
      desconto: 0,
      frete: 0,
      total: 100,
      itens: [
        { produtoId: 1, quantidade: 1, valorUnitario: 100 }
      ]
    });
    console.log('✅ createPedidoSafe:', pedidoResult); // Deve ter { id: number }
    
    // Test get by ID
    if (pedidoResult.id > 0) {
      const pedido = await getPedidoById(tenantId, pedidoResult.id);
      console.log('✅ getPedidoById:', pedido ? 'Object found' : 'Null'); // Deve ser object ou null
    }
    
  } catch (error) {
    console.error('❌ PEDIDOS ERROR:', error);
  }
  
  console.log('\n🎯 TESTES CONCLUÍDOS');
  console.log('📊 RESULTADOS ESPERADOS:');
  console.log('- Todos creates devem retornar { id: number }');
  console.log('- Todos gets devem retornar object | null');
  console.log('- Todos lists devem retornar array');
  console.log('- Nenhum undefined ou erro de tipo runtime');
}

// Exportar para uso manual
export { testServices };
