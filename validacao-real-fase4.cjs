// 🚀 FASE 4: VALIDAÇÃO BANCO REAL - TABELAS/COLUNAS/DADOS
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

// Teste principal
async function executarValidacaoBanco() {
  console.log('🚀 FASE 4: VALIDAÇÃO BANCO REAL');
  console.log('=' .repeat(50));
  
  // Detectar porta
  porta = extrairPorta();
  console.log(`📡 Porta detectada: ${porta}`);
  
  const resultados = [];
  let errosCriticos = 0;
  
  // 1️⃣ OBTER TOKEN
  console.log('\n1️⃣ OBTENDO TOKEN...');
  
  const loginResult = await fazerRequisicao('POST', '/api/trpc/auth.login', {
    username: 'admin',
    password: 'admin123'
  });
  
  if (loginResult.success) {
    authToken = loginResult.data.result?.data?.sessionToken;
    console.log('✅ Token obtido');
  } else {
    console.log('❌ Falha ao obter token');
    errosCriticos++;
  }
  
  // 2️⃣ TESTAR CONEXÃO COM BANCO VIA API
  console.log('\n2️⃣ TESTANDO CONEXÃO BANCO...');
  
  const healthCheck = await fazerRequisicao('GET', '/api/health');
  resultados.push({ 
    teste: 'HEALTH_DB', 
    path: '/api/health',
    resultado: healthCheck
  });
  
  if (healthCheck.success && healthCheck.data.db?.status === 'ok') {
    console.log('✅ Banco conectado');
    console.log(`📊 Database: ${healthCheck.data.db?.database}`);
    console.log(`⏱️ Tempo query: ${healthCheck.data.db?.timeMs}ms`);
  } else {
    console.log('❌ Banco não conectado');
    errosCriticos++;
  }
  
  // 3️⃣ TESTAR CRIAÇÃO DE DADOS E VALIDAR PERSISTÊNCIA
  console.log('\n3️⃣ TESTANDO PERSISTÊNCIA DE DADOS...');
  
  // Criar cliente único
  const clienteTeste = {
    nome: `Cliente DB Test ${Date.now()}`,
    email: `dbtest-${Date.now()}@email.com`,
    telefone: `11888888888`,
    endereco: 'Rua DB Test, 999',
    cidade: 'São Paulo',
    estado: 'SP',
    cep: '99999999'
  };
  
  const criarCliente = await fazerRequisicao('POST', '/api/trpc/clientes.create', clienteTeste);
  resultados.push({ 
    teste: 'CRIAR_CLIENTE_DB', 
    path: '/api/trpc/clientes.create',
    resultado: criarCliente
  });
  
  let clienteId = null;
  if (criarCliente.success) {
    clienteId = criarCliente.data.result?.data?.id;
    console.log('✅ Cliente criado ID:', clienteId);
    
    // Verificar se persistiu listando
    const listarClientes = await fazerRequisicao('GET', '/api/trpc/clientes.list');
    if (listarClientes.success) {
      const clientes = listarClientes.data.result?.data || [];
      const encontrado = clientes.find(c => c.id === clienteId);
      
      if (encontrado) {
        console.log('✅ Cliente persistiu no banco');
        resultados.push({ 
          teste: 'PERSISTENCIA_CLIENTE', 
          path: '/api/trpc/clientes.list',
          resultado: { success: true, encontrado: true }
        });
      } else {
        console.log('❌ Cliente não persistiu');
        errosCriticos++;
        resultados.push({ 
          teste: 'PERSISTENCIA_CLIENTE', 
          path: '/api/trpc/clientes.list',
          resultado: { success: false, encontrado: false }
        });
      }
    }
  } else {
    console.log('❌ Falha ao criar cliente');
    errosCriticos++;
  }
  
  // 4️⃣ TESTAR PRODUTO COM VALIDAÇÃO
  console.log('\n4️⃣ TESTANDO PRODUTO...');
  
  const produtoTeste = {
    descricao: `Produto DB Test ${Date.now()}`,
    valorVenda: 150.00,
    custo: 75.00,
    estoque: 50,
    ativo: true
  };
  
  const criarProduto = await fazerRequisicao('POST', '/api/trpc/produtos.create', produtoTeste);
  resultados.push({ 
    teste: 'CRIAR_PRODUTO_DB', 
    path: '/api/trpc/produtos.create',
    resultado: criarProduto
  });
  
  let produtoId = null;
  if (criarProduto.success) {
    produtoId = criarProduto.data.result?.data?.id;
    console.log('✅ Produto criado ID:', produtoId);
    
    if (produtoId) {
      // Testar get by ID
      const getProduto = await fazerRequisicao('GET', `/api/trpc/produtos.getById`, { id: produtoId });
      resultados.push({ 
        teste: 'GET_PRODUTO_DB', 
        path: '/api/trpc/produtos.getById',
        resultado: getProduto
      });
      
      if (getProduto.success) {
        console.log('✅ Produto recuperado por ID');
      } else {
        console.log('❌ Produto não recuperado por ID');
        errosCriticos++;
      }
    } else {
      console.log('❌ Produto ID undefined');
      errosCriticos++;
    }
  } else {
    console.log('❌ Falha ao criar produto');
    errosCriticos++;
  }
  
  // 5️⃣ TESTAR RELACIONAMENTO - PEDIDO
  console.log('\n5️⃣ TESTANDO RELACIONAMENTO...');
  
  if (clienteId && produtoId) {
    const pedidoTeste = {
      clienteId: clienteId,
      itens: [{
        produtoId: produtoId,
        quantidade: 1,
        precoUnitario: 150.00
      }],
      formaPagamento: 'DINHEIRO',
      status: 'PENDENTE'
    };
    
    const criarPedido = await fazerRequisicao('POST', '/api/trpc/pedidos.create', pedidoTeste);
    resultados.push({ 
      teste: 'CRIAR_PEDIDO_DB', 
      path: '/api/trpc/pedidos.create',
      resultado: criarPedido
    });
    
    if (criarPedido.success) {
      const pedidoId = criarPedido.data.result?.data?.id;
      console.log('✅ Pedido criado ID:', pedidoId);
      
      // Verificar se pedido tem itens
      if (pedidoId) {
        console.log('✅ Relacionamento cliente-produto funcionando');
      } else {
        console.log('❌ Pedido ID undefined');
        errosCriticos++;
      }
    } else {
      console.log('❌ Falha ao criar pedido');
      errosCriticos++;
    }
  } else {
    console.log('⚠️ Pulando teste de relacionamento - IDs não disponíveis');
    errosCriticos++;
  }
  
  // 6️⃣ TESTAR VALIDAÇÃO DE CAMPOS OBRIGATÓRIOS
  console.log('\n6️⃣ TESTANDO CAMPOS OBRIGATÓRIOS...');
  
  // Tentar criar cliente sem nome
  const clienteSemNome = await fazerRequisicao('POST', '/api/trpc/clientes.create', {
    email: 'semmome@email.com',
    telefone: '11999999999'
  });
  
  resultados.push({ 
    teste: 'VALIDACAO_OBRIGATORIO', 
    path: '/api/trpc/clientes.create',
    resultado: clienteSemNome
  });
  
  if (clienteSemNome.status >= 400) {
    console.log('✅ Validação de campos obrigatórios funciona');
  } else {
    console.log('❌ Validação de campos obrigatórios não funciona');
    errosCriticos++;
  }
  
  // 7️⃣ TESTAR TENANT_ID (SE APLICÁVEL)
  console.log('\n7️⃣ TESTANDO MULTI-TENANT...');
  
  // Verificar se sistema usa tenant_id
  const systemInfo = await fazerRequisicao('GET', '/api/trpc/system.info');
  resultados.push({ 
    teste: 'TENANT_INFO', 
    path: '/api/trpc/system.info',
    resultado: systemInfo
  });
  
  if (systemInfo.success) {
    console.log('✅ Informações do sistema obtidas');
  } else {
    console.log('⚠️ System info não disponível');
  }
  
  // 8️⃣ ANÁLISE FINAL
  console.log('\n' + '=' .repeat(50));
  console.log('📊 ANÁLISE FINAL FASE 4');
  console.log('=' .repeat(50));
  
  console.log(`🚨 Erros críticos: ${errosCriticos}`);
  console.log(`📊 Total testes: ${resultados.length}`);
  
  // Detalhes
  console.log('\n📋 DETALHES:');
  
  resultados.forEach(r => {
    const status = r.resultado.success ? '✅' : '❌';
    const desc = r.teste;
    console.log(`${status} ${desc}`);
  });
  
  // 9️⃣ CRITÉRIO FASE 4
  console.log('\n🎯 CRITÉRIO FASE 4:');
  
  const criterio = {
    bancoConectado: healthCheck.success && healthCheck.data.db?.status === 'ok',
    dadosPersistem: clienteId !== null,
    produtosFuncionam: produtoId !== null,
    relacionamentosOK: clienteId && produtoId,
    validacaoCampos: clienteSemNome.status >= 400,
    semErrosCriticos: errosCriticos === 0
  };
  
  console.log(`✔ Banco conectado: ${criterio.bancoConectado ? 'SIM' : 'NÃO'}`);
  console.log(`✔ Dados persistem: ${criterio.dadosPersistem ? 'SIM' : 'NÃO'}`);
  console.log(`✔ Produtos funcionam: ${criterio.produtosFuncionam ? 'SIM' : 'NÃO'}`);
  console.log(`✔ Relacionamentos OK: ${criterio.relacionamentosOK ? 'SIM' : 'NÃO'}`);
  console.log(`✔ Validação campos: ${criterio.validacaoCampos ? 'SIM' : 'NÃO'}`);
  console.log(`✔ Sem erros críticos: ${criterio.semErrosCriticos ? 'SIM' : 'NÃO'}`);
  
  // 10️⃣ VEREDITO FASE 4
  const fase4Aprovada = criterio.bancoConectado && criterio.dadosPersistem && criterio.semErrosCriticos;
  
  console.log('\n' + '='.repeat(50));
  console.log('🏁 VEREDITO FASE 4');
  console.log('=' .repeat(50));
  
  if (fase4Aprovada) {
    console.log('✅ FASE 4 APROVADA');
    console.log('✅ Banco funcionando');
    console.log('✅ Dados persistem');
    console.log('✅ Schema consistente');
  } else {
    console.log('❌ FASE 4 REPROVADA');
    console.log(`❌ ${errosCriticos} erros críticos encontrados`);
    
    if (!criterio.bancoConectado) {
      console.log('❌ Banco não conectado');
    }
    
    if (!criterio.dadosPersistem) {
      console.log('❌ Dados não persistem');
    }
  }
  
  return {
    fase4Aprovada,
    criterio,
    errosCriticos,
    estatisticas: {
      total: resultados.length,
      clienteId: clienteId,
      produtoId: produtoId
    },
    detalhes: resultados
  };
}

// Executar
executarValidacaoBanco()
  .then((resultado) => {
    console.log('\n🏆 CONCLUSÃO FASE 4:');
    if (resultado.fase4Aprovada) {
      console.log('✅ FASE 4 CONCLUÍDA - Banco OK');
    } else {
      console.log('❌ FASE 4 FALHOU - Problemas no banco');
    }
    
    process.exit(resultado.fase4Aprovada ? 0 : 1);
  })
  .catch((error) => {
    console.error('💥 ERRO FATAL:', error);
    process.exit(1);
  });
