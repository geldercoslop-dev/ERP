// 🚀 TESTE FLUXO REAL - QA ENGINEER
const axios = require('axios');
const fs = require('fs');

// Configurações
const TIMEOUT_MS = 5000;
let porta = null;
let authToken = null;

// Extrair porta
function extrairPorta() {
  try {
    const portFile = 'server/_core/port.ts';
    if (fs.existsSync(portFile)) {
      const content = fs.readFileSync(portFile, 'utf8');
      const match = content.match(/export const PORT = (\d+)/);
      if (match) {
        return parseInt(match[1]);
      }
    }
  } catch (error) {
    console.log('Erro ao ler porta:', error.message);
  }
  return 3005; // fallback
}

// Função para requisição
async function fazerRequisicao(method, path, data = null, headers = {}) {
  const url = `http://localhost:${porta}${path}`;
  
  try {
    console.log(`🧪 ${method} ${path}`);
    
    const config = {
      method,
      url,
      timeout: TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken && { Authorization: `Bearer ${authToken}` }),
        ...headers
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    
    console.log(`✅ ${response.status} - ${response.statusText}`);
    return { success: true, status: response.status, data: response.data };
  } catch (error) {
    console.log(`❌ ${error.response?.status || 'NETWORK'} - ${error.message}`);
    return { 
      success: false, 
      status: error.response?.status || 0, 
      error: error.message 
    };
  }
}

// Teste principal
async function executarFluxoReal() {
  console.log('🚀 INICIANDO TESTE FLUXO REAL');
  console.log('=' .repeat(50));
  
  // Detectar porta
  porta = extrairPorta();
  console.log(`📡 Usando porta: ${porta}`);
  
  const resultados = [];
  
  // 1️⃣ TESTAR LOGIN
  console.log('\n1️⃣ TESTANDO LOGIN...');
  
  const loginResult = await fazerRequisicao('POST', '/api/trpc/auth.login', {
    username: 'admin',
    password: 'admin123'
  });
  
  resultados.push({ 
    teste: 'LOGIN', 
    path: '/api/trpc/auth.login',
    resultado: loginResult 
  });
  
  if (loginResult.success) {
    console.log('🔐 Login realizado com sucesso');
    authToken = loginResult.data.result?.data?.sessionToken;
    console.log(`🎫 Token: ${authToken ? 'OK' : 'NULL'}`);
  } else {
    console.log('❌ Login falhou - pulando testes autenticados');
  }
  
  // 2️⃣ TESTAR CRUD - CLIENTES
  console.log('\n2️⃣ TESTANDO CRUD CLIENTES...');
  
  // Listar clientes
  const listarClientes = await fazerRequisicao('GET', '/api/trpc/clientes.list');
  resultados.push({ 
    teste: 'LISTAR_CLIENTES', 
    path: '/api/trpc/clientes.list',
    resultado: listarClientes 
  });
  
  // Criar cliente
  const criarCliente = await fazerRequisicao('POST', '/api/trpc/clientes.create', {
    nome: 'Cliente Teste E2E',
    email: `teste-${Date.now()}@email.com`,
    telefone: '11999999999',
    endereco: 'Rua Test, 123',
    cidade: 'São Paulo',
    estado: 'SP',
    cep: '01234567'
  });
  
  resultados.push({ 
    teste: 'CRIAR_CLIENTE', 
    path: '/api/trpc/clientes.create',
    resultado: criarCliente 
  });
  
  let clienteId = null;
  if (criarCliente.success) {
    clienteId = criarCliente.data.result?.data?.id;
    console.log(`👤 Cliente criado: ${clienteId}`);
  }
  
  // 3️⃣ TESTAR CRUD - PRODUTOS
  console.log('\n3️⃣ TESTANDO CRUD PRODUTOS...');
  
  // Listar produtos
  const listarProdutos = await fazerRequisicao('GET', '/api/trpc/produtos.list');
  resultados.push({ 
    teste: 'LISTAR_PRODUTOS', 
    path: '/api/trpc/produtos.list',
    resultado: listarProdutos 
  });
  
  // Criar produto
  const criarProduto = await fazerRequisicao('POST', '/api/trpc/produtos.create', {
    descricao: 'Produto Teste E2E',
    valorVenda: 99.99,
    custo: 50.00,
    estoque: 100,
    ativo: true
  });
  
  resultados.push({ 
    teste: 'CRIAR_PRODUTO', 
    path: '/api/trpc/produtos.create',
    resultado: criarProduto 
  });
  
  let produtoId = null;
  if (criarProduto.success) {
    produtoId = criarProduto.data.result?.data?.id;
    console.log(`📦 Produto criado: ${produtoId}`);
  }
  
  // 4️⃣ TESTAR PEDIDO
  console.log('\n4️⃣ TESTANDO PEDIDO...');
  
  if (clienteId && produtoId) {
    const criarPedido = await fazerRequisicao('POST', '/api/trpc/pedidos.create', {
      clienteId: clienteId,
      itens: [{
        produtoId: produtoId,
        quantidade: 2,
        precoUnitario: 99.99
      }],
      formaPagamento: 'CARTAO',
      status: 'PENDENTE'
    });
    
    resultados.push({ 
      teste: 'CRIAR_PEDIDO', 
      path: '/api/trpc/pedidos.create',
      resultado: criarPedido 
    });
    
    if (criarPedido.success) {
      const pedidoId = criarPedido.data.result?.data?.id;
      console.log(`🛒 Pedido criado: ${pedidoId}`);
    }
  } else {
    console.log('⚠️ Pulando criação de pedido - cliente ou produto não criado');
  }
  
  // 5️⃣ TESTAR ENDPOINTS DE SAÚDE
  console.log('\n5️⃣ TESTANDO ENDPOINTS DE SAÚDE...');
  
  const healthCheck = await fazerRequisicao('GET', '/api/health');
  resultados.push({ 
    teste: 'HEALTH_CHECK', 
    path: '/api/health',
    resultado: healthCheck 
  });
  
  const pingCheck = await fazerRequisicao('GET', '/ping');
  resultados.push({ 
    teste: 'PING_CHECK', 
    path: '/ping',
    resultado: pingCheck 
  });
  
  // 6️⃣ ANÁLISE DE RESULTADOS
  console.log('\n' + '=' .repeat(50));
  console.log('📊 ANÁLISE DE RESULTADOS');
  console.log('=' .repeat(50));
  
  const sucesso = resultados.filter(r => r.resultado.success);
  const falha = resultados.filter(r => !r.resultado.success);
  const critical404 = falha.filter(r => r.resultado.status === 404);
  const auth401 = falha.filter(r => r.resultado.status === 401);
  
  console.log(`✅ Sucessos: ${sucesso.length}/${resultados.length}`);
  console.log(`❌ Falhas: ${falha.length}/${resultados.length}`);
  console.log(`🔍 404s: ${critical404.length}/${resultados.length}`);
  console.log(`🔒 401s: ${auth401.length}/${resultados.length}`);
  
  // Detalhes
  console.log('\n📋 DETALHES:');
  
  resultados.forEach(r => {
    const status = r.resultado.success ? '✅' : '❌';
    const code = r.resultado.status;
    const desc = r.resultado.success ? 'OK' : r.resultado.error;
    console.log(`${status} ${r.teste} - ${code} - ${desc}`);
  });
  
  // 7️⃣ VALIDAR CRITÉRIOS
  const criterios = {
    loginFunciona: resultados.find(r => r.teste === 'LOGIN')?.resultado.success || false,
    crudBasico: ['LISTAR_CLIENTES', 'CRIAR_CLIENTE', 'LISTAR_PRODUTOS', 'CRIAR_PRODUTO'].some(
      teste => resultados.find(r => r.teste === teste)?.resultado.success
    ),
    sem404Critico: critical404.length === 0,
    sistemaResponde: sucesso.length > 0,
    fluxoCompleto: clienteId && produtoId
  };
  
  console.log('\n🎯 CRITÉRIOS:');
  console.log(`✔ Login funciona: ${criterios.loginFunciona ? 'SIM' : 'NÃO'}`);
  console.log(`✔ CRUD básico: ${criterios.crudBasico ? 'SIM' : 'NÃO'}`);
  console.log(`✔ Sem 404 crítico: ${criterios.sem404Critico ? 'SIM' : 'NÃO'}`);
  console.log(`✔ Sistema responde: ${criterios.sistemaResponde ? 'SIM' : 'NÃO'}`);
  console.log(`✔ Fluxo completo: ${criterios.fluxoCompleto ? 'SIM' : 'NÃO'}`);
  
  // 8️⃣ RELATÓRIO FINAL
  const aprovado = criterios.sistemaResponde && criterios.sem404Critico && criterios.loginFunciona;
  
  console.log('\n' + '='.repeat(50));
  console.log('🏁 RELATÓRIO FINAL - FLUXO REAL');
  console.log('=' .repeat(50));
  
  if (aprovado) {
    console.log('🎉 SISTEMA FUNCIONAL PARA USO REAL');
    console.log('✅ Login funciona');
    console.log('✅ Endpoints respondem');
    console.log('✅ Sem 404s críticos');
    
    if (criterios.fluxoCompleto) {
      console.log('✅ Fluxo completo funciona');
    } else {
      console.log('⚠️ Fluxo completo parcial');
    }
  } else {
    console.log('❌ SISTEMA NÃO FUNCIONAL PARA USO REAL');
    
    if (!criterios.loginFunciona) {
      console.log('❌ Login não funciona');
    }
    
    if (critical404.length > 0) {
      console.log('❌ 404s críticos detectados');
    }
    
    if (!criterios.sistemaResponde) {
      console.log('❌ Sistema não responde');
    }
  }
  
  // 9️⃣ ESTATÍSTICAS FINAIS
  console.log('\n📈 ESTATÍSTICAS FINAIS:');
  console.log(`📊 Total testes: ${resultados.length}`);
  console.log(`✅ Sucesso: ${sucesso.length}`);
  console.log(`❌ Falha: ${falha.length}`);
  console.log(`🔍 404: ${critical404.length}`);
  console.log(`🔒 401: ${auth401.length}`);
  
  return {
    aprovado,
    criterios,
    estatisticas: {
      total: resultados.length,
      sucesso: sucesso.length,
      falha: falha.length,
      notFound: critical404.length,
      unauthorized: auth401.length
    },
    detalhes: resultados
  };
}

// Executar
executarFluxoReal()
  .then((resultado) => {
    console.log('\n🏆 CONCLUSÃO:');
    if (resultado.aprovado) {
      console.log('✅ SISTEMA APROVADO PARA USO REAL');
    } else {
      console.log('❌ SISTEMA REPROVADO PARA USO REAL');
    }
    
    process.exit(resultado.aprovado ? 0 : 1);
  })
  .catch((error) => {
    console.error('💥 ERRO FATAL:', error);
    process.exit(1);
  });
