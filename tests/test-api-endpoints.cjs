// 🚀 TESTE API ENDPOINTS - ZERO 404
const axios = require('axios');
const fs = require('fs');

// Configurações
const TIMEOUT_MS = 5000;
let porta = null;

// Extrair porta dinâmica
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

// Função para testar endpoint
async function testarEndpoint(method, path, data = null) {
  const url = `http://localhost:${porta}${path}`;
  
  try {
    console.log(`🧪 ${method} ${path}`);
    
    const config = {
      method,
      url,
      timeout: TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    
    console.log(`✅ ${response.status} - ${response.statusText}`);
    if (response.data) {
      console.log(`📦 Data:`, JSON.stringify(response.data).substring(0, 200) + '...');
    }
    
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
async function executarTestes() {
  console.log('🚀 INICIANDO TESTE API ENDPOINTS');
  console.log('=' .repeat(50));
  
  // Detectar porta
  porta = extrairPorta();
  console.log(`📡 Usando porta: ${porta}`);
  
  // 1️⃣ VALIDAR MOUNT tRPC
  console.log('\n1️⃣ TESTANDO MOUNT tRPC...');
  
  const resultados = [];
  
  // Testar diferentes endpoints tRPC
  const endpoints = [
    { method: 'GET', path: '/api/trpc/auth.me', desc: 'tRPC auth.me' },
    { method: 'GET', path: '/api/trpc/system.health', desc: 'tRPC system.health' },
    { method: 'POST', path: '/api/trpc/auth.login', data: { username: 'admin', password: 'admin123' }, desc: 'tRPC auth.login' },
    { method: 'GET', path: '/api/trpc/produtos.list', desc: 'tRPC produtos.list' },
    { method: 'GET', path: '/api/trpc/clientes.list', desc: 'tRPC clientes.list' }
  ];
  
  for (const endpoint of endpoints) {
    console.log(`\n📍 ${endpoint.desc}`);
    const resultado = await testarEndpoint(endpoint.method, endpoint.path, endpoint.data);
    resultados.push({ ...endpoint, resultado });
    
    // Pausa entre requisições
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // 2️⃣ TESTAR ENDPOINTS EXPRESS
  console.log('\n2️⃣ TESTANDO ENDPOINTS EXPRESS...');
  
  const expressEndpoints = [
    { method: 'GET', path: '/ping', desc: 'Express ping' },
    { method: 'GET', path: '/api/health', desc: 'Express health' },
    { method: 'GET', path: '/api/debug/headers', desc: 'Express debug headers' }
  ];
  
  for (const endpoint of expressEndpoints) {
    console.log(`\n📍 ${endpoint.desc}`);
    const resultado = await testarEndpoint(endpoint.method, endpoint.path);
    resultados.push({ ...endpoint, resultado });
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // 3️⃣ ANÁLISE DE RESULTADOS
  console.log('\n' + '='.repeat(50));
  console.log('📊 ANÁLISE DE RESULTADOS');
  console.log('=' .repeat(50));
  
  const sucesso = resultados.filter(r => r.resultado.success);
  const falha = resultados.filter(r => !r.resultado.success);
  const notFound = falha.filter(r => r.resultado.status === 404);
  
  console.log(`✅ Sucessos: ${sucesso.length}/${resultados.length}`);
  console.log(`❌ Falhas: ${falha.length}/${resultados.length}`);
  console.log(`🔍 404s: ${notFound.length}/${resultados.length}`);
  
  // Detalhes
  console.log('\n📋 DETALHES:');
  
  resultados.forEach(r => {
    const status = r.resultado.success ? '✅' : '❌';
    const code = r.resultado.status;
    console.log(`${status} ${r.desc} - ${code}`);
  });
  
  // 4️⃣ DIAGNÓSTICO
  console.log('\n🔍 DIAGNÓSTICO:');
  
  if (notFound.length > 0) {
    console.log('🚨 PROBLEMA: 404s detectados');
    console.log('🔧 POSSÍVEIS CAUSAS:');
    console.log('   - tRPC não montado corretamente');
    console.log('   - Path incorreto (/api vs /trpc)');
    console.log('   - Router vazio');
    console.log('   - Middleware não aplicado');
    
    notFound.forEach(r => {
      console.log(`   ❌ ${r.path}`);
    });
  }
  
  if (sucesso.length > 0) {
    console.log('✅ SISTEMA PARCIALMENTE FUNCIONAL');
    console.log('📊 Endpoints funcionando:');
    sucesso.forEach(r => {
      console.log(`   ✅ ${r.desc}`);
    });
  }
  
  // 5️⃣ CRITÉRIO
  const criterio = {
    sem404: notFound.length === 0,
    peloMenosUm: sucesso.length > 0,
    expressFunciona: sucesso.some(r => r.path.includes('/ping') || r.path.includes('/health')),
    trpcFunciona: sucesso.some(r => r.path.includes('/trpc'))
  };
  
  console.log('\n🎯 CRITÉRIOS:');
  console.log(`✔ Sem 404: ${criterio.sem404 ? 'SIM' : 'NÃO'}`);
  console.log(`✔ Pelo menos 1 endpoint: ${criterio.peloMenosUm ? 'SIM' : 'NÃO'}`);
  console.log(`✔ Express funciona: ${criterio.expressFunciona ? 'SIM' : 'NÃO'}`);
  console.log(`✔ tRPC funciona: ${criterio.trpcFunciona ? 'SIM' : 'NÃO'}`);
  
  // 6️⃣ RELATÓRIO FINAL
  const aprovado = criterio.peloMenosUm && criterio.expressFunciona;
  
  console.log('\n' + '='.repeat(50));
  console.log('🏁 RELATÓRIO FINAL');
  console.log('=' .repeat(50));
  
  if (aprovado) {
    console.log('🎉 SISTEMA FUNCIONAL PARCIALMENTE');
    console.log('✅ Server responde');
    console.log('✅ Express endpoints funcionam');
    
    if (!criterio.trpcFunciona) {
      console.log('⚠️ tRPC precisa de correção');
    }
    
    if (!criterio.sem404) {
      console.log('⚠️ 404s precisam ser eliminados');
    }
  } else {
    console.log('❌ SISTEMA CRÍTICO');
    console.log('❌ Nenhum endpoint funcional');
    console.log('🔧 Requer correção estrutural');
  }
  
  return {
    aprovado,
    criterio,
    estatisticas: {
      total: resultados.length,
      sucesso: sucesso.length,
      falha: falha.length,
      notFound: notFound.length
    }
  };
}

// Executar
executarTestes()
  .then((resultado) => {
    process.exit(resultado.aprovado ? 0 : 1);
  })
  .catch((error) => {
    console.error('💥 ERRO FATAL:', error);
    process.exit(1);
  });
