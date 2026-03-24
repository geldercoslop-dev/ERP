// Validação de dados no banco - SELECT *
import { getDb } from './server/db/index';

async function validarDadosBanco() {
  console.log('🔍 VALIDANDO DADOS NO BANCO (SELECT *)\n');
  
  const db = await getDb();
  if (!db) {
    console.log('❌ Banco não disponível');
    return { sucesso: false, dados: {} };
  }
  
  try {
    // 1️⃣ Verificar clientes
    console.log('📋 Verificando clientes...');
    const clientes = await (db as any).execute('SELECT * FROM clientes ORDER BY createdAt DESC LIMIT 5');
    console.log(`✅ Encontrados ${clientes[0]?.length || 0} clientes recentes`);
    
    // 2️⃣ Verificar produtos
    console.log('📦 Verificando produtos...');
    const produtos = await (db as any).execute('SELECT * FROM produtos ORDER BY createdAt DESC LIMIT 5');
    console.log(`✅ Encontrados ${produtos[0]?.length || 0} produtos recentes`);
    
    // 3️⃣ Verificar pedidos
    console.log('🛒 Verificando pedidos...');
    const pedidos = await (db as any).execute('SELECT * FROM pedidos ORDER BY createdAt DESC LIMIT 5');
    console.log(`✅ Encontrados ${pedidos[0]?.length || 0} pedidos recentes`);
    
    // 4️⃣ Verificar itens de pedido
    console.log('📄 Verificando itens de pedido...');
    const itensPedido = await (db as any).execute('SELECT * FROM itens_pedido ORDER BY createdAt DESC LIMIT 5');
    console.log(`✅ Encontrados ${itensPedido[0]?.length || 0} itens de pedido recentes`);
    
    // 5️⃣ Verificar integridade referencial
    console.log('🔗 Verificando integridade referencial...');
    
    // Clientes sem tenant
    const clientesSemTenant = await (db as any).execute('SELECT COUNT(*) as count FROM clientes WHERE tenantId IS NULL');
    console.log(`⚠️ Clientes sem tenant: ${clientesSemTenant[0]?.[0]?.count || 0}`);
    
    // Produtos sem tenant
    const produtosSemTenant = await (db as any).execute('SELECT COUNT(*) as count FROM produtos WHERE tenantId IS NULL');
    console.log(`⚠️ Produtos sem tenant: ${produtosSemTenant[0]?.[0]?.count || 0}`);
    
    // Pedidos com cliente inexistente
    const pedidosClienteInvalido = await (db as any).execute(`
      SELECT COUNT(*) as count 
      FROM pedidos p 
      LEFT JOIN clientes c ON p.clienteId = c.id 
      WHERE c.id IS NULL
    `);
    console.log(`⚠️ Pedidos com cliente inválido: ${pedidosClienteInvalido[0]?.[0]?.count || 0}`);
    
    // Itens de pedido com produto inexistente
    const itensProdutoInvalido = await (db as any).execute(`
      SELECT COUNT(*) as count 
      FROM itens_pedido ip 
      LEFT JOIN produtos p ON ip.produtoId = p.id 
      WHERE p.id IS NULL
    `);
    console.log(`⚠️ Itens com produto inválido: ${itensProdutoInvalido[0]?.[0]?.count || 0}`);
    
    return {
      sucesso: true,
      dados: {
        clientes: clientes[0]?.length || 0,
        produtos: produtos[0]?.length || 0,
        pedidos: pedidos[0]?.length || 0,
        itensPedido: itensPedido[0]?.length || 0,
        clientesSemTenant: clientesSemTenant[0]?.[0]?.count || 0,
        produtosSemTenant: produtosSemTenant[0]?.[0]?.count || 0,
        pedidosClienteInvalido: pedidosClienteInvalido[0]?.[0]?.count || 0,
        itensProdutoInvalido: itensProdutoInvalido[0]?.[0]?.count || 0
      }
    };
    
  } catch (error) {
    console.error('❌ Erro ao validar banco:', error);
    return { sucesso: false, dados: {}, erro: error instanceof Error ? error.message : String(error) };
  }
}

export { validarDadosBanco };
