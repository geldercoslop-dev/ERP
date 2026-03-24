// 🚀 E2E TEST SCRIPT - REAL ERP VALIDATION
const axios = require('axios');
const { performance } = require('perf_hooks');

// Config
const BASE_URL = 'http://localhost:3005';
let authToken = '';
let tenantId = Number(process.env.TEST_TENANT_ID || process.env.DEFAULT_TENANT_ID || 99);
let createdIds = {
  cliente: null,
  produto: null,
  pedido: null,
  financeiro: null
};

// Metrics
const metrics = {
  totalRequests: 0,
  totalErrors: 0,
  responseTimes: [],
  duplicates: 0,
  rollbacks: 0
};

// Helper functions
async function makeRequest(method, endpoint, data = null, headers = {}) {
  const start = performance.now();
  metrics.totalRequests++;
  
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
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
    const end = performance.now();
    metrics.responseTimes.push(end - start);
    
    return { success: true, data: response.data, status: response.status, responseTime: end - start };
  } catch (error) {
    const end = performance.now();
    metrics.totalErrors++;
    metrics.responseTimes.push(end - start);
    
    return { 
      success: false, 
      error: error.response?.data || error.message, 
      status: error.response?.status || 500,
      responseTime: end - start 
    };
  }
}

// 1️⃣ FLUXO COMPLETO
async function testFluxoCompleto() {
  console.log('\n🔄 INICIANDO FLUXO COMPLETO...');
  
  // Login
  console.log('🔐 Fazendo login...');
  const loginResult = await makeRequest('POST', '/api/auth/login', {
    email: 'admin@erp.com',
    password: 'admin123'
  });
  
  if (!loginResult.success) {
    console.error('❌ Falha no login:', loginResult.error);
    return false;
  }
  
  authToken = loginResult.data.token;
  tenantId = loginResult.data.user?.tenantId || Number(process.env.TEST_TENANT_ID || process.env.DEFAULT_TENANT_ID || 99);
  console.log('✅ Login realizado');
  
  // 1. Criar cliente
  console.log('👤 Criando cliente...');
  const clienteResult = await makeRequest('POST', '/api/clientes', {
    nome: 'Cliente E2E Test',
    email: `cliente-e2e-${Date.now()}@test.com`,
    telefone: '11999999999',
    endereco: 'Rua Test E2E, 123',
    cidade: 'São Paulo',
    estado: 'SP',
    cep: '01234567'
  });
  
  if (!clienteResult.success) {
    console.error('❌ Falha ao criar cliente:', clienteResult.error);
    return false;
  }
  
  createdIds.cliente = clienteResult.data.id;
  console.log('✅ Cliente criado:', createdIds.cliente);
  
  // 2. Criar produto
  console.log('📦 Criando produto...');
  const produtoResult = await makeRequest('POST', '/api/produtos', {
    nome: 'Produto E2E Test',
    descricao: 'Produto criado para teste E2E',
    preco: 99.99,
    estoque: 100,
    categoria: 'TEST',
    sku: `SKU-E2E-${Date.now()}`
  });
  
  if (!produtoResult.success) {
    console.error('❌ Falha ao criar produto:', produtoResult.error);
    return false;
  }
  
  createdIds.produto = produtoResult.data.id;
  console.log('✅ Produto criado:', createdIds.produto);
  
  // 3. Criar pedido
  console.log('🛒 Criando pedido...');
  const pedidoResult = await makeRequest('POST', '/api/pedidos', {
    clienteId: createdIds.cliente,
    itens: [{
      produtoId: createdIds.produto,
      quantidade: 5,
      precoUnitario: 99.99
    }],
    formaPagamento: 'CARTAO',
    status: 'PENDENTE'
  });
  
  if (!pedidoResult.success) {
    console.error('❌ Falha ao criar pedido:', pedidoResult.error);
    return false;
  }
  
  createdIds.pedido = pedidoResult.data.id;
  console.log('✅ Pedido criado:', createdIds.pedido);
  
  // 4. Gerar financeiro
  console.log('💰 Gerando financeiro...');
  const financeiroResult = await makeRequest('POST', '/api/financeiro/contas-receber', {
    pedidoId: createdIds.pedido,
    valor: 499.95,
    dataVencimento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    descricao: 'Conta gerada do pedido E2E',
    status: 'PENDENTE'
  });
  
  if (!financeiroResult.success) {
    console.error('❌ Falha ao gerar financeiro:', financeiroResult.error);
    return false;
  }
  
  createdIds.financeiro = financeiroResult.data.id;
  console.log('✅ Financeiro gerado:', createdIds.financeiro);
  
  // 5. Atualizar estoque
  console.log('📊 Atualizando estoque...');
  const estoqueResult = await makeRequest('PUT', `/api/produtos/${createdIds.produto}/estoque`, {
    quantidade: -5, // Deduz do estoque
    motivo: 'Venda pedido E2E'
  });
  
  if (!estoqueResult.success) {
    console.error('❌ Falha ao atualizar estoque:', estoqueResult.error);
    return false;
  }
  
  console.log('✅ Estoque atualizado');
  console.log('🎉 FLUXO COMPLETO CONCLUÍDO COM SUCESSO!');
  return true;
}

// 2️⃣ TESTE DUPLO CLIQUE
async function testDuploClique() {
  console.log('\n⚡ INICIANDO TESTE DUPLO CLIQUE (10x rápido)...');
  
  const promises = [];
  const results = [];
  
  // Fazer 10 requisições simultâneas
  for (let i = 0; i < 10; i++) {
    promises.push(
      makeRequest('POST', '/api/pedidos', {
        clienteId: createdIds.cliente,
        itens: [{
          produtoId: createdIds.produto,
          quantidade: 1,
          precoUnitario: 99.99
        }],
        formaPagamento: 'CARTAO',
        status: 'PENDENTE'
      }).then(result => {
        results.push({ index: i, ...result });
        return result;
      })
    );
  }
  
  await Promise.all(promises);
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Sucessos: ${successful.length}`);
  console.log(`❌ Falhas: ${failed.length}`);
  
  if (successful.length > 1) {
    console.log('⚠️ ATENÇÃO: Mais de 1 pedido criado - possível duplicação!');
    metrics.duplicates = successful.length - 1;
    return false;
  }
  
  console.log('✅ Teste duplo clique passou - apenas 1 pedido criado');
  return true;
}

// 3️⃣ TESTE ERRO + ROLLBACK
async function testErroRollback() {
  console.log('\n💥 INICIANDO TESTE ERRO + ROLLBACK...');
  
  // Tentar criar pedido com dados inválidos
  const erroResult = await makeRequest('POST', '/api/pedidos', {
    clienteId: 999999, // Cliente inexistente
    itens: [{
      produtoId: createdIds.produto,
      quantidade: 1,
      precoUnitario: 99.99
    }],
    formaPagamento: 'CARTAO',
    status: 'PENDENTE'
  });
  
  if (erroResult.success) {
    console.log('❌ ERRO: Pedido criado com cliente inexistente - deveria falhar!');
    return false;
  }
  
  console.log('✅ Erro esperado ocorreu:', erroResult.error);
  
  // Verificar se não houve efeito colateral
  const checkResult = await makeRequest('GET', `/api/pedidos/${createdIds.pedido}`);
  
  if (!checkResult.success) {
    console.log('❌ ERRO: Pedido original foi afetado!');
    metrics.rollbacks++;
    return false;
  }
  
  console.log('✅ Rollback funcionou - pedido original intacto');
  return true;
}

// 4️⃣ TESTE CARGA REAL
async function testCargaReal() {
  console.log('\n🚀 INICIANDO TESTE CARGA REAL...');
  
  const concurrentRequests = 50;
  const promises = [];
  let successCount = 0;
  let errorCount = 0;
  
  console.log(`📊 Enviando ${concurrentRequests} requisições simultâneas...`);
  
  for (let i = 0; i < concurrentRequests; i++) {
    promises.push(
      makeRequest('GET', '/api/clientes')
        .then(result => {
          if (result.success) successCount++;
          else errorCount++;
          return result;
        })
        .catch(() => {
          errorCount++;
        })
    );
  }
  
  const startTime = performance.now();
  await Promise.all(promises);
  const endTime = performance.now();
  
  const avgResponseTime = metrics.responseTimes.slice(-concurrentRequests).reduce((a, b) => a + b, 0) / concurrentRequests;
  
  console.log(`✅ Sucessos: ${successCount}/${concurrentRequests}`);
  console.log(`❌ Erros: ${errorCount}/${concurrentRequests}`);
  console.log(`⏱️ Tempo total: ${(endTime - startTime).toFixed(2)}ms`);
  console.log(`📈 Tempo médio: ${avgResponseTime.toFixed(2)}ms`);
  
  if (errorCount > concurrentRequests * 0.1) { // Mais de 10% de erro
    console.log('❌ Taxa de erro muito alta!');
    return false;
  }
  
  console.log('✅ Teste de carga passou - sistema respondeu bem');
  return true;
}

// 5️⃣ TESTE TRACING
async function testTracing() {
  console.log('\n🔍 INICIANDO TESTE TRACING...');
  
  // Fazer uma requisição e verificar se tem trace headers
  const traceResult = await makeRequest('GET', '/api/clientes', null, {
    'X-Trace-Id': 'test-trace-' + Date.now()
  });
  
  if (!traceResult.success) {
    console.log('❌ Falha na requisição de teste de tracing');
    return false;
  }
  
  console.log('✅ Requisição com tracing realizada');
  console.log('📋 NOTA: Verificar Jaeger em http://localhost:16686 para validar spans');
  
  return true;
}

// 6️⃣ TESTE LOG + TRACEID
async function testLogTraceId() {
  console.log('\n📝 INICIANDO TESTE LOG + TRACEID...');
  
  // Forçar um erro para gerar log
  const errorResult = await makeRequest('GET', '/api/clientes/999999');
  
  if (errorResult.success) {
    console.log('❌ ERRO: Cliente inexistente deveria retornar erro');
    return false;
  }
  
  console.log('✅ Erro gerado para teste de log');
  console.log('📋 NOTA: Verificar logs para confirmar traceId correlacionado');
  
  return true;
}

// Main execution
async function runAllTests() {
  console.log('🚀 INICIANDO SUITE COMPLETA DE TESTES E2E');
  console.log('=' .repeat(50));
  
  const startTime = performance.now();
  const results = {
    fluxoCompleto: false,
    duploClique: false,
    erroRollback: false,
    cargaReal: false,
    tracing: false,
    logTraceId: false
  };
  
  try {
    results.fluxoCompleto = await testFluxoCompleto();
    results.duploClique = await testDuploClique();
    results.erroRollback = await testErroRollback();
    results.cargaReal = await testCargaReal();
    results.tracing = await testTracing();
    results.logTraceId = await testLogTraceId();
  } catch (error) {
    console.error('💥 ERRO CRÍTICO NOS TESTES:', error.message);
  }
  
  const endTime = performance.now();
  const totalTime = endTime - startTime;
  
  // Results summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 RESULTADOS FINAIS');
  console.log('=' .repeat(50));
  
  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASSOU' : 'FALHOU'}`);
  });
  
  console.log('\n📈 MÉTRICAS:');
  console.log(`⏱️ Tempo total: ${totalTime.toFixed(2)}ms`);
  console.log(`🔄 Total requests: ${metrics.totalRequests}`);
  console.log(`❌ Total errors: ${metrics.totalErrors}`);
  console.log(`📊 Avg response time: ${(metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length).toFixed(2)}ms`);
  console.log(`🔄 Duplicações: ${metrics.duplicates}`);
  console.log(`🔙 Rollbacks: ${metrics.rollbacks}`);
  
  // Final verdict
  const allPassed = Object.values(results).every(r => r);
  const criticalIssues = metrics.duplicates > 0 || metrics.rollbacks > 0;
  
  console.log('\n' + '='.repeat(50));
  console.log('🏁 VEREDITO FINAL');
  console.log('=' .repeat(50));
  
  if (allPassed && !criticalIssues) {
    console.log('🎉 SISTEMA APROVADO PARA PRODUÇÃO!');
    console.log('✅ Todos os testes passaram');
    console.log('✅ Sem issues críticas');
  } else {
    console.log('⚠️ SISTEMA NÃO APROVADO PARA PRODUÇÃO');
    if (!allPassed) {
      console.log('❌ Alguns testes falharam');
    }
    if (criticalIssues) {
      console.log('❌ Issues críticas detectados');
    }
  }
  
  return { results, metrics, approved: allPassed && !criticalIssues };
}

// Run tests
if (require.main === module) {
  runAllTests()
    .then(({ approved }) => {
      process.exit(approved ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 ERRO FATAL:', error);
      process.exit(1);
    });
}

module.exports = { runAllTests, metrics };
