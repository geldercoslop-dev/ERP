// 🚀 DEBUG CAUSA RAIZ 404 - DEBUG ENGINEER
const axios = require('axios');
const fs = require('fs');

// Configurações
const TIMEOUT_MS = 5000;
let porta = null;

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
async function testarRequisicao(method, path, data = null) {
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
async function executarDebug404() {
  console.log('🚀 INICIANDO DEBUG CAUSA RAIZ 404');
  console.log('=' .repeat(50));
  
  // Detectar porta
  porta = extrairPorta();
  console.log(`📡 Usando porta: ${porta}`);
  
  const resultados = [];
  
  // 1️⃣ TESTE FORÇADO FORA DO tRPC
  console.log('\n1️⃣ TESTE FORÇADO FORA DO tRPC...');
  
  const testFora = await testarRequisicao('GET', '/test-fora');
  resultados.push({ 
    teste: 'FORA_TRPC', 
    path: '/test-fora',
    resultado: testFora 
  });
  
  // 2️⃣ TESTE DENTRO DO tRPC
  console.log('\n2️⃣ TESTE DENTRO DO tRPC...');
  
  const testTrpc = await testarRequisicao('GET', '/api/trpc/auth.me');
  resultados.push({ 
    teste: 'DENTRO_TRPC', 
    path: '/api/trpc/auth.me',
    resultado: testTrpc 
  });
  
  // 3️⃣ TESTE PATHS DIFERENTES
  console.log('\n3️⃣ TESTE PATHS DIFERENTES...');
  
  const pathsTest = [
    '/api',
    '/api/',
    '/trpc',
    '/trpc/',
    '/api/trpc',
    '/api/trpc/',
    '/rpc',
    '/graphql'
  ];
  
  for (const path of pathsTest) {
    const resultado = await testarRequisicao('GET', path);
    resultados.push({ 
      teste: 'PATH_TEST', 
      path: path,
      resultado: resultado 
    });
  }
  
  // 4️⃣ TESTE EXPRESS PURO
  console.log('\n4️⃣ TESTE EXPRESS PURO...');
  
  const expressTest = await testarRequisicao('GET', '/ping');
  resultados.push({ 
    teste: 'EXPRESS PURO', 
    path: '/ping',
    resultado: expressTest 
  });
  
  // 5️⃣ ANÁLISE DE RESULTADOS
  console.log('\n' + '=' .repeat(50));
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
    const desc = r.resultado.success ? 'OK' : r.resultado.error;
    console.log(`${status} ${r.path} - ${code} - ${desc}`);
  });
  
  // 6️⃣ INTERPRETAÇÃO
  console.log('\n🔍 INTERPRETAÇÃO:');
  
  const foraTrpcFunciona = resultados.find(r => r.teste === 'FORA_TRPC')?.resultado.success;
  const dentroTrpcFunciona = resultados.find(r => r.teste === 'DENTRO_TRPC')?.resultado.success;
  const expressFunciona = resultados.find(r => r.teste === 'EXPRESS PURO')?.resultado.success;
  
  console.log(`📊 /test-fora funciona: ${foraTrpcFunciona ? 'SIM' : 'NÃO'}`);
  console.log(`📊 /api/trpc funciona: ${dentroTrpcFunciona ? 'SIM' : 'NÃO'}`);
  console.log(`📊 /ping funciona: ${expressFunciona ? 'SIM' : 'NÃO'}`);
  
  // Diagnóstico
  console.log('\n🏥 DIAGNÓSTICO:');
  
  if (!foraTrpcFunciona && !expressFunciona) {
    console.log('❌ PROBLEMA: Express não está funcionando');
    console.log('🔧 CAUSA: Server não iniciado ou middleware quebrado');
  } else if (foraTrpcFunciona && !dentroTrpcFunciona) {
    console.log('❌ PROBLEMA: tRPC não montado');
    console.log('🔧 CAUSA: createExpressMiddleware não aplicado ou router vazio');
  } else if (expressFunciona && dentroTrpcFunciona) {
    console.log('✅ SISTEMA FUNCIONAL');
    console.log('🔧 404s anteriores foram resolvidos');
  } else {
    console.log('❌ PROBLEMA: Configuração misturada');
    console.log('🔧 CAUSA: Múltiplos issues precisam investigação');
  }
  
  // 7️⃣ EVIDÊNCIAS
  console.log('\n📋 EVIDÊNCIAS:');
  
  if (expressFunciona) {
    console.log('✅ Express server está rodando');
    console.log('✅ Middleware básico funciona');
  }
  
  if (dentroTrpcFunciona) {
    console.log('✅ tRPC está montado');
    console.log('✅ Router está acessível');
  }
  
  if (notFound.length > 0) {
    console.log('❌ Paths não encontrados:');
    notFound.forEach(r => {
      console.log(`   🔍 ${r.path}`);
    });
  }
  
  // 8️⃣ SOLUÇÃO APLICADA
  console.log('\n🔧 SOLUÇÃO APLICADA:');
  
  if (expressFunciona && dentroTrpcFunciona) {
    console.log('✅ Nenhuma solução necessária - sistema funcionando');
  } else if (expressFunciona && !dentroTrpcFunciona) {
    console.log('🔧 Solução: Verificar mount do tRPC em server/_core/index.ts');
    console.log('🔧 Verificar: appRouter import e createExpressMiddleware');
  } else if (!expressFunciona) {
    console.log('🔧 Solução: Verificar inicialização do server');
    console.log('🔧 Verificar: app.listen() e middleware stack');
  }
  
  // 9️⃣ CRITÉRIO
  const criterio = {
    expressFunciona: expressFunciona || false,
    trpcFunciona: dentroTrpcFunciona || false,
    sem404: notFound.length === 0
  };
  
  console.log('\n🎯 CRITÉRIOS:');
  console.log(`✔ Express funciona: ${criterio.expressFunciona ? 'SIM' : 'NÃO'}`);
  console.log(`✔ tRPC funciona: ${criterio.trpcFunciona ? 'SIM' : 'NÃO'}`);
  console.log(`✔ Sem 404: ${criterio.sem404 ? 'SIM' : 'NÃO'}`);
  
  // 10️⃣ RELATÓRIO FINAL
  const aprovado = criterio.expressFunciona && criterio.trpcFunciona;
  
  console.log('\n' + '='.repeat(50));
  console.log('🏁 RELATÓRIO FINAL - DEBUG 404');
  console.log('=' .repeat(50));
  
  if (aprovado) {
    console.log('🎉 SISTEMA TOTALMENTE FUNCIONAL');
    console.log('✅ Express funciona');
    console.log('✅ tRPC funciona');
    console.log('✅ Sem 404s');
  } else {
    console.log('⚠️ SISTEMA PARCIALMENTE FUNCIONAL');
    
    if (!criterio.expressFunciona) {
      console.log('❌ Express não funciona');
    }
    
    if (!criterio.trpcFunciona) {
      console.log('❌ tRPC não funciona');
    }
    
    if (!criterio.sem404) {
      console.log('❌ 404s presentes');
    }
  }
  
  return {
    aprovado,
    criterio,
    diagnostico: {
      expressFunciona,
      trpcFunciona,
      causaRaiz: !expressFunciona ? 'Express não iniciado' : 
                 (!dentroTrpcFunciona ? 'tRPC não montado' : 'Funcional')
    },
    estatisticas: {
      total: resultados.length,
      sucesso: sucesso.length,
      falha: falha.length,
      notFound: notFound.length
    }
  };
}

// Executar
executarDebug404()
  .then((resultado) => {
    console.log('\n🏆 CONCLUSÃO FINAL:');
    console.log(`🎯 Causa raiz: ${resultado.diagnostico.causaRaiz}`);
    console.log(`📊 Status: ${resultado.aprovado ? 'FUNCIONAL' : 'PARCIAL'}`);
    
    process.exit(resultado.aprovado ? 0 : 1);
  })
  .catch((error) => {
    console.error('💥 ERRO FATAL:', error);
    process.exit(1);
  });
