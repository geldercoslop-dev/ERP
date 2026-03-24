// Teste de Fluxo Real ERP - Integração Completa
import { createCliente, getClienteById } from './server/services/clientes.service';
import { createProduto, getProdutoById } from './server/services/inventory.service';
import { createPedidoSafe, getPedidoById } from './server/services/orders.service';

interface FluxoResult {
  cliente: { id: number; nome: string } | null;
  produto: { id: number; descricao: string } | null;
  pedido: { id: number; numero: number; total: string } | null;
  erros: string[];
  tempoExecucao: number;
}

async function testarFluxoCompletoERP(): Promise<FluxoResult> {
  const inicio = Date.now();
  const erros: string[] = [];
  const tenantId = Number(process.env.TEST_TENANT_ID || process.env.DEFAULT_TENANT_ID || 99);
  
  console.log('🚀 INICIANDO FLUXO COMPLETO ERP\n');
  
  try {
    // 1️⃣ CRIAR CLIENTE
    console.log('📋 1. Criando cliente...');
    const clienteResult = await createCliente(tenantId, {
      nome: `Cliente Teste Fluxo ${Date.now()}`,
      telefone: '11999999999',
      rua: 'Rua Teste',
      numero: '123',
      bairro: 'Bairro Teste',
      cidade: 'São Paulo',
      uf: 'SP'
    });
    
    const cliente = await getClienteById(tenantId, clienteResult.id);
    if (!cliente) {
      erros.push('Cliente não encontrado após criação');
    } else {
      console.log(`✅ Cliente criado: ID ${cliente.id} - ${cliente.nome}`);
    }
    
    // 2️⃣ CRIAR PRODUTO
    console.log('\n📦 2. Criando produto...');
    const produtoResult = await createProduto(tenantId, {
      descricao: `Produto Teste Fluxo ${Date.now()}`,
      preco: 99.99,
      estoque: 100,
      ativo: true,
      categoria: 'Teste'
    });
    
    const produto = await getProdutoById(tenantId, produtoResult.id);
    if (!produto) {
      erros.push('Produto não encontrado após criação');
    } else {
      console.log(`✅ Produto criado: ID ${produto.id} - ${produto.descricao}`);
    }
    
    // 3️⃣ CRIAR PEDIDO
    console.log('\n🛒 3. Criando pedido...');
    const pedidoResult = await createPedidoSafe(tenantId, {
      vendedorId: 1,
      clienteId: clienteResult.id,
      subtotal: 99.99,
      desconto: 0,
      frete: 0,
      total: 99.99,
      itens: [
        {
          produtoId: produtoResult.id,
          quantidade: 1,
          valorUnitario: 99.99
        }
      ]
    });
    
    if (!pedidoResult.success) {
      erros.push(`Falha ao criar pedido: ${JSON.stringify(pedidoResult)}`);
    } else {
      const pedido = await getPedidoById(tenantId, pedidoResult.id);
      if (!pedido) {
        erros.push('Pedido não encontrado após criação');
      } else {
        console.log(`✅ Pedido criado: ID ${pedido.id} - Nº ${pedido.numero} - Total R$ ${pedido.total}`);
      }
    }
    
    return {
      cliente: cliente ? { id: cliente.id, nome: cliente.nome } : null,
      produto: produto ? { id: produto.id, descricao: produto.descricao } : null,
      pedido: pedidoResult.success ? { 
        id: pedidoResult.id, 
        numero: pedidoResult.numero, 
        total: '99.99' 
      } : null,
      erros,
      tempoExecucao: Date.now() - inicio
    };
    
  } catch (error) {
    erros.push(`Erro geral: ${error instanceof Error ? error.message : String(error)}`);
    return {
      cliente: null,
      produto: null,
      pedido: null,
      erros,
      tempoExecucao: Date.now() - inicio
    };
  }
}

// Teste de erro e rollback
async function testarErroERollback(): Promise<{ sucesso: boolean; erros: string[] }> {
  console.log('\n🧪 TESTANDO ERRO E ROLLBACK');
  
  const erros: string[] = [];
  const tenantId = Number(process.env.TEST_TENANT_ID || process.env.DEFAULT_TENANT_ID || 99);
  
  try {
    // Tentar criar pedido com produto inexistente
    const resultado = await createPedidoSafe(tenantId, {
      vendedorId: 1,
      clienteId: 99999, // Cliente inexistente
      subtotal: 99.99,
      desconto: 0,
      frete: 0,
      total: 99.99,
      itens: [
        {
          produtoId: 99999, // Produto inexistente
          quantidade: 1,
          valorUnitario: 99.99
        }
      ]
    });
    
    if (resultado.success) {
      erros.push('ERRO: Pedido criado com dados inválidos (deveria falhar)');
    } else {
      console.log('✅ Rollback funcionou: Pedido não criado com dados inválidos');
    }
    
    return { sucesso: !resultado.success, erros };
    
  } catch (error) {
    erros.push(`Erro no teste: ${error instanceof Error ? error.message : String(error)}`);
    return { sucesso: false, erros };
  }
}

// Teste de duplo clique (10 requests simultâneos)
async function testarDuploClique(): Promise<{ sucesso: boolean; duplicados: number; erros: string[] }> {
  console.log('\n⚡ TESTANDO DUPLO CLIQUE (10 REQUESTS)');
  
  const erros: string[] = [];
  const tenantId = Number(process.env.TEST_TENANT_ID || process.env.DEFAULT_TENANT_ID || 99);
  const resultados: any[] = [];
  
  try {
    // Criar cliente base para o teste
    const clienteResult = await createCliente(tenantId, {
      nome: `Cliente Duplo Clique ${Date.now()}`,
      telefone: '11888888888'
    });
    
    const produtoResult = await createProduto(tenantId, {
      descricao: `Produto Duplo Clique ${Date.now()}`,
      preco: 50.00,
      estoque: 100,
      ativo: true
    });
    
    // Executar 10 pedidos simultâneos
    const promises = Array.from({ length: 10 }, (_, i) => 
      createPedidoSafe(tenantId, {
        vendedorId: 1,
        clienteId: clienteResult.id,
        subtotal: 50.00,
        desconto: 0,
        frete: 0,
        total: 50.00,
        itens: [
          {
            produtoId: produtoResult.id,
            quantidade: 1,
            valorUnitario: 50.00
          }
        ]
      })
    );
    
    const results = await Promise.all(promises);
    const sucesso = results.filter(r => r.success);
    const falha = results.filter(r => !r.success);
    
    // Verificar duplicação
    const ids = sucesso.map(r => r.id);
    const idsUnicos = new Set(ids);
    const duplicados = ids.length - idsUnicos.size;
    
    console.log(`✅ Pedidos criados: ${sucesso.length}`);
    console.log(`❌ Pedidos falharam: ${falha.length}`);
    console.log(`🔄 Pedidos duplicados: ${duplicados}`);
    
    return { 
      sucesso: duplicados === 0 && falha.length >= 5, // Deve ter falhas por idempotência
      duplicados, 
      erros 
    };
    
  } catch (error) {
    erros.push(`Erro no teste duplo clique: ${error instanceof Error ? error.message : String(error)}`);
    return { sucesso: false, duplicados: 0, erros };
  }
}

// Função principal de execução
async function executarTestesFluxoERP() {
  console.log('🎯 INICIANDO TESTES DE FLUXO REAL ERP\n');
  
  // Teste 1: Fluxo completo
  const fluxoResult = await testarFluxoCompletoERP();
  
  // Teste 2: Erro e rollback
  const erroResult = await testarErroERollback();
  
  // Teste 3: Duplo clique
  const duploCliqueResult = await testarDuploClique();
  
  // Relatório final
  console.log('\n📊 RELATÓRIO FINAL');
  console.log('='.repeat(50));
  
  console.log(`\n🔄 Fluxo Completo:`);
  console.log(`   Cliente: ${fluxoResult.cliente ? '✅' : '❌'}`);
  console.log(`   Produto: ${fluxoResult.produto ? '✅' : '❌'}`);
  console.log(`   Pedido: ${fluxoResult.pedido ? '✅' : '❌'}`);
  console.log(`   Tempo: ${fluxoResult.tempoExecucao}ms`);
  console.log(`   Erros: ${fluxoResult.erros.length}`);
  
  console.log(`\n🛡️ Erro & Rollback:`);
  console.log(`   Sucesso: ${erroResult.sucesso ? '✅' : '❌'}`);
  console.log(`   Erros: ${erroResult.erros.length}`);
  
  console.log(`\n⚡ Duplo Clique:`);
  console.log(`   Sucesso: ${duploCliqueResult.sucesso ? '✅' : '❌'}`);
  console.log(`   Duplicados: ${duploCliqueResult.duplicados}`);
  console.log(`   Erros: ${duploCliqueResult.erros.length}`);
  
  const sucessoGeral = 
    fluxoResult.cliente && 
    fluxoResult.produto && 
    fluxoResult.pedido && 
    erroResult.sucesso && 
    duploCliqueResult.sucesso;
  
  console.log(`\n🎉 STATUS GERAL: ${sucessoGeral ? '✅ APROVADO' : '❌ REPROVADO'}`);
  
  return {
    fluxoCompleto: fluxoResult,
    erroRollback: erroResult,
    duploClique: duploCliqueResult,
    sucessoGeral
  };
}

// Exportar para uso
export { executarTestesFluxoERP, testarFluxoCompletoERP, testarErroERollback, testarDuploClique };
