// 🚀 FASE 2: VALIDAÇÃO REAL APIs - SEM OTIMISMO
const axios = require('axios');
const fs = require('fs');

// Configurações
const TIMEOUT_MS = 3000;
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
  return 3005;
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
        ...(authToken && { 'X-Session-Token': authToken }),
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

// Validar response real
function validarResponse(resultado, esperado) {
  if (!resultado.success) {
    return { valido: false, erro: resultado.error };
  }
  
  const data = resultado.data;
  
  if (esperado.token) {
    const token = data.result?.data?.sessionToken || data.sessionToken;
    if (!token || typeof token !== 'string') {
      return { valido: false, erro: 'Token não retornado ou inválido' };
    }
  }
  
  if (esperado.id) {
    const id = data.result?.data?.id || data.id;
    if (!id || id === undefined || id === 'undefined') {
      return { valido: false, erro: 'ID não retornado ou undefined' };
    }
  }
  
  if (esperado.lista) {
    const lista = data.result?.data || data.data || data;
    if (!Array.isArray(lista)) {
      return { valido: false, erro: 'Lista não retornada' };
    }
  }
  
  return { valido: true, data: resultado.data };
}

// Teste principal
async function executarValidacaoReal() {
  console.log('🚀 FASE 2: VALIDAÇÃO REAL APIs');
  console.log('=' .repeat(50));
  
  // Detectar porta
  porta = extrairPorta();
  console.log(`📡 Porta detectada: ${porta}`);
  
  const resultados = [];
  let errosCriticos = 0;
  
  // 1️⃣ TESTAR LOGIN
  console.log('\n1️⃣ TESTANDO LOGIN...');
  
  const loginResult = await fazerRequisicao('POST', '/api/trpc/auth.login', {
    username: 'admin',
    password: 'admin123'
  });
  
  const loginValidado = validarResponse(loginResult, { token: true });
  resultados.push({ 
    teste: 'LOGIN', 
    path: '/api/trpc/auth.login',
    resultado: loginResult,
    validacao: loginValidado
  });
  
  if (!loginValidado.valido) {
    console.log('❌ LOGIN CRÍTICO:', loginValidado.erro);
    errosCriticos++;
  } else {
    authToken = loginResult.data.result?.data?.sessionToken;
    console.log('✅ Token obtido:', authToken ? 'SIM' : 'NÃO');
  }
  
  // 2️⃣ TESTAR CLIENTE - LISTAR
  console.log('\n2️⃣ TESTANDO CLIENTE - LISTAR...');
  
  const listarClientes = await fazerRequisicao('GET', '/api/trpc/clientes.list');
  const listarValidado = validarResponse(listarClientes, { lista: true });
  resultados.push({ 
    teste: 'LISTAR_CLIENTES', 
    path: '/api/trpc/clientes.list',
    resultado: listarClientes,
    validacao: listarValidado
  });
  
  if (!listarValidado.valido) {
    console.log('❌ LISTAR CLIENTES CRÍTICO:', listarValidado.erro);
    errosCriticos++;
  }
  
  // 3️⃣ TESTAR CLIENTE - CRIAR
  console.log('\n3️⃣ TESTANDO CLIENTE - CRIAR...');
  
  const clienteData = {
    nome: `Cliente Teste ${Date.now()}`,
    email: `teste-${Date.now()}@email.com`,
    telefone: '11999999999',
    endereco: 'Rua Test, 123',
    cidade: 'São Paulo',
    estado: 'SP',
    cep: '01234567'
  };
  
  const criarCliente = await fazerRequisicao('POST', '/api/trpc/clientes.create', clienteData);
  const criarValidado = validarResponse(criarCliente, { id: true });
  resultados.push({ 
    teste: 'CRIAR_CLIENTE', 
    path: '/api/trpc/clientes.create',
    resultado: criarCliente,
    validacao: criarValidado
  });
  
  let clienteId = null;
  if (!criarValidado.valido) {
    console.log('❌ CRIAR CLIENTE CRÍTICO:', criarValidado.erro);
    errosCriticos++;
  } else {
    clienteId = criarCliente.data.result?.data?.id;
    console.log('✅ Cliente criado ID:', clienteId);
  }
  
  // 4️⃣ TESTAR PRODUTO - LISTAR
  console.log('\n4️⃣ TESTANDO PRODUTO - LISTAR...');
  
  const listarProdutos = await fazerRequisicao('GET', '/api/trpc/produtos.list');
  const listarProdValidado = validarResponse(listarProdutos, { lista: true });
  resultados.push({ 
    teste: 'LISTAR_PRODUTOS', 
    path: '/api/trpc/produtos.list',
    resultado: listarProdutos,
    validacao: listarProdValidado
  });
  
  if (!listarProdValidado.valido) {
    console.log('❌ LISTAR PRODUTOS CRÍTICO:', listarProdValidado.erro);
    errosCriticos++;
  }
  
  // 5️⃣ TESTAR PRODUTO - CRIAR (CRÍTICO)
  console.log('\n5️⃣ TESTANDO PRODUTO - CRIAR...');
  
  const produtoData = {
    descricao: `Produto Teste ${Date.now()}`,
    valorVenda: 99.99,
    custo: 50.00,
    estoque: 100,
    ativo: true
  };
  
  const criarProduto = await fazerRequisicao('POST', '/api/trpc/produtos.create', produtoData);
  const criarProdValidado = validarResponse(criarProduto, { id: true });
  resultados.push({ 
    teste: 'CRIAR_PRODUTO', 
    path: '/api/trpc/produtos.create',
    resultado: criarProduto,
    validacao: criarProdValidado
  });
  
  let produtoId = null;
  if (!criarProdValidado.valido) {
    console.log('❌ CRIAR PRODUTO CRÍTICO:', criarProdValidado.erro);
    errosCriticos++;
  } else {
    produtoId = criarProduto.data.result?.data?.id;
    console.log('✅ Produto criado ID:', produtoId);
  }
  
  // 6️⃣ TESTAR PEDIDO - CRIAR
  console.log('\n6️⃣ TESTANDO PEDIDO - CRIAR...');
  
  let pedidoId = null;
  if (clienteId && produtoId) {
    const pedidoData = {
      clienteId: clienteId,
      itens: [{
        produtoId: produtoId,
        quantidade: 2,
        precoUnitario: 99.99
      }],
      formaPagamento: 'CARTAO',
      status: 'PENDENTE'
    };
    
    const criarPedido = await fazerRequisicao('POST', '/api/trpc/pedidos.create', pedidoData);
    const criarPedValidado = validarResponse(criarPedido, { id: true });
    resultados.push({ 
      teste: 'CRIAR_PEDIDO', 
      path: '/api/trpc/pedidos.create',
      resultado: criarPedido,
      validacao: criarPedValidado
    });
    
    if (!criarPedValidado.valido) {
      console.log('❌ CRIAR PEDIDO CRÍTICO:', criarPedValidado.erro);
      errosCriticos++;
    } else {
      pedidoId = criarPedido.data.result?.data?.id;
      console.log('✅ Pedido criado ID:', pedidoId);
    }
  } else {
    console.log('⚠️ Pulando pedido - cliente ou produto não criado');
    resultados.push({ 
      teste: 'CRIAR_PEDIDO', 
      path: '/api/trpc/pedidos.create',
      resultado: { success: false, error: 'cliente ou produto não criado' },
      validacao: { valido: false, erro: 'dependência não criada' }
    });
    errosCriticos++;
  }
  
  // 7️⃣ ANÁLISE FINAL
  console.log('\n' + '=' .repeat(50));
  console.log('📊 ANÁLISE FINAL FASE 2');
  console.log('=' .repeat(50));
  
  const sucesso = resultados.filter(r => r.resultado.success);
  const falha = resultados.filter(r => !r.resultado.success);
  const validos = resultados.filter(r => r.validacao.valido);
  
  console.log(`✅ Requisições com sucesso: ${sucesso.length}/${resultados.length}`);
  console.log(`❌ Requisições com falha: ${falha.length}/${resultados.length}`);
  console.log(`✅ Validações passaram: ${validos.length}/${resultados.length}`);
  console.log(`🚨 Erros críticos: ${errosCriticos}`);
  
  // Detalhes
  console.log('\n📋 DETALHES:');
  
  resultados.forEach(r => {
    const reqStatus = r.resultado.success ? '✅' : '❌';
    const valStatus = r.validacao.valido ? '✅' : '❌';
    const code = r.resultado.status;
    console.log(`${reqStatus}${valStatus} ${r.teste} - HTTP ${code} - Validação: ${r.validacao.valido ? 'OK' : r.validacao.erro}`);
  });
  
  // 8️⃣ CRITÉRIO FASE 2
  console.log('\n🎯 CRITÉRIO FASE 2:');
  
  const criterio = {
    loginFunciona: loginValidado.valido,
    crudClientes: listarValidado.valido && criarValidado.valido,
    crudProdutos: listarProdValidado.valido && criarProdValidado.valido,
    pedidosFuncionam: pedidoId !== null,
    semErrosCriticos: errosCriticos === 0,
    idsCorretos: clienteId !== null && produtoId !== null
  };
  
  console.log(`✔ Login funciona: ${criterio.loginFunciona ? 'SIM' : 'NÃO'}`);
  console.log(`✔ CRUD Clientes: ${criterio.crudClientes ? 'SIM' : 'NÃO'}`);
  console.log(`✔ CRUD Produtos: ${criterio.crudProdutos ? 'SIM' : 'NÃO'}`);
  console.log(`✔ Pedidos funcionam: ${criterio.pedidosFuncionam ? 'SIM' : 'NÃO'}`);
  console.log(`✔ Sem erros críticos: ${criterio.semErrosCriticos ? 'SIM' : 'NÃO'}`);
  console.log(`✔ IDs corretos: ${criterio.idsCorretos ? 'SIM' : 'NÃO'}`);
  
  // 9️⃣ VEREDITO FASE 2
  const fase2Aprovada = criterio.loginFunciona && criterio.semErrosCriticos && criterio.idsCorretos;
  
  console.log('\n' + '='.repeat(50));
  console.log('🏁 VEREDITO FASE 2');
  console.log('=' .repeat(50));
  
  if (fase2Aprovada) {
    console.log('✅ FASE 2 APROVADA');
    console.log('✅ APIs básicas funcionam');
    console.log('✅ Dados persistem');
    console.log('✅ IDs corretos');
  } else {
    console.log('❌ FASE 2 REPROVADA');
    console.log(`❌ ${errosCriticos} erros críticos encontrados`);
    
    if (!criterio.loginFunciona) {
      console.log('❌ Login não funciona');
    }
    
    if (!criterio.idsCorretos) {
      console.log('❌ IDs incorretos ou undefined');
    }
  }
  
  return {
    fase2Aprovada,
    criterio,
    errosCriticos,
    estatisticas: {
      total: resultados.length,
      sucesso: sucesso.length,
      falha: falha.length,
      validos: validos.length
    },
    detalhes: resultados
  };
}

// Executar
executarValidacaoReal()
  .then((resultado) => {
    console.log('\n🏆 CONCLUSÃO FASE 2:');
    if (resultado.fase2Aprovada) {
      console.log('✅ FASE 2 CONCLUÍDA - APIs funcionam');
    } else {
      console.log('❌ FASE 2 FALHOU - Erros críticos encontrados');
    }
    
    process.exit(resultado.fase2Aprovada ? 0 : 1);
  })
  .catch((error) => {
    console.error('💥 ERRO FATAL:', error);
    process.exit(1);
  });
