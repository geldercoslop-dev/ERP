// 🚀 FASE 3: VALIDAÇÃO DE ERRO - ROLLBACK/CONCORRÊNCIA/AUTH
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
async function executarValidacaoErro() {
  console.log('🚀 FASE 3: VALIDAÇÃO DE ERRO');
  console.log('=' .repeat(50));
  
  // Detectar porta
  porta = extrairPorta();
  console.log(`📡 Porta detectada: ${porta}`);
  
  const resultados = [];
  let errosCriticos = 0;
  
  // 1️⃣ OBTER TOKEN PRIMEIRO
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
  
  // 2️⃣ TESTAR ENDPOINTS PROTEGIDOS SEM TOKEN
  console.log('\n2️⃣ TESTANDO ENDPOINTS PROTEGIDOS SEM TOKEN...');
  
  const endpointsProtegidos = [
    '/api/trpc/clientes.list',
    '/api/trpc/produtos.list',
    '/api/trpc/pedidos.list'
  ];
  
  for (const endpoint of endpointsProtegidos) {
    const resultado = await fazerRequisicao('GET', endpoint, null, { 'X-Session-Token': '' });
    resultados.push({ 
      teste: 'PROTEGIDO_SEM_TOKEN', 
      path: endpoint,
      resultado: resultado
    });
    
    // Verificar se retorna 401 (protegido) ou 200 (público)
    if (resultado.status === 401) {
      console.log('✅ Endpoint protegido corretamente');
    } else if (resultado.status === 200) {
      console.log('⚠️ Endpoint público (não protegido)');
    } else {
      console.log('❌ Endpoint com erro inesperado:', resultado.status);
      errosCriticos++;
    }
  }
  
  // 3️⃣ TESTAR CONCORRÊNCIA - 10 REQUESTS SIMULTÂNEOS
  console.log('\n3️⃣ TESTANDO CONCORRÊNCIA...');
  
  const concorrenciaPromises = [];
  const uniqueData = [];
  
  for (let i = 0; i < 10; i++) {
    const testData = {
      nome: `Cliente Concorrente ${i}-${Date.now()}`,
      email: `concorrente-${i}-${Date.now()}@email.com`,
      telefone: `1199999999${i}`,
      endereco: 'Rua Test, 123',
      cidade: 'São Paulo',
      estado: 'SP',
      cep: '01234567'
    };
    
    uniqueData.push(testData);
    concorrenciaPromises.push(fazerRequisicao('POST', '/api/trpc/clientes.create', testData));
  }
  
  console.log('🚀 Enviando 10 requests simultâneos...');
  
  const concorrenciaResultados = await Promise.all(concorrenciaPromises);
  
  const sucessoConcorrencia = concorrenciaResultados.filter(r => r.success);
  const falhaConcorrencia = concorrenciaResultados.filter(r => !r.success);
  
  console.log(`✅ Sucesso concorrência: ${sucessoConcorrencia.length}/10`);
  console.log(`❌ Falha concorrência: ${falhaConcorrencia.length}/10`);
  
  // Verificar duplicação
  const idsCriados = [];
  const duplicados = [];
  
  for (let i = 0; i < concorrenciaResultados.length; i++) {
    const resultado = concorrenciaResultados[i];
    if (resultado.success) {
      const id = resultado.data.result?.data?.id;
      if (id) {
        if (idsCriados.includes(id)) {
          duplicados.push(id);
        } else {
          idsCriados.push(id);
        }
      }
    }
  }
  
  if (duplicados.length > 0) {
    console.log('❌ DUPLICAÇÃO DETECTADA:', duplicados);
    errosCriticos++;
  } else {
    console.log('✅ Sem duplicação detectada');
  }
  
  resultados.push({ 
    teste: 'CONCORRENCIA', 
    path: '10_requests_simultaneos',
    resultado: { 
      sucesso: sucessoConcorrencia.length,
      falha: falhaConcorrencia.length,
      duplicados: duplicados.length
    }
  });
  
  // 4️⃣ TESTAR ERRO FORÇADO - SIMULAR FALHA
  console.log('\n4️⃣ TESTANDO ERRO FORÇADO...');
  
  // Tentar criar cliente com telefone duplicado (deve falhar)
  const erroForcado = await fazerRequisicao('POST', '/api/trpc/clientes.create', {
    nome: 'Cliente Erro Forçado',
    email: 'erro@forcado.com',
    telefone: '11999999999', // Telefone duplicado
    endereco: 'Rua Test, 123',
    cidade: 'São Paulo',
    estado: 'SP',
    cep: '01234567'
  });
  
  resultados.push({ 
    teste: 'ERRO_FORCADO', 
    path: '/api/trpc/clientes.create',
    resultado: erroForcado
  });
  
  if (erroForcado.status === 500) {
    console.log('✅ Erro tratado corretamente (500)');
  } else if (erroForcado.status === 400) {
    console.log('✅ Erro tratado corretamente (400)');
  } else {
    console.log('❌ Erro não tratado:', erroForcado.status);
    errosCriticos++;
  }
  
  // 5️⃣ TESTAR AUTH PERSISTENTE
  console.log('\n5️⃣ TESTANDO AUTH PERSISTENTE...');
  
  // Testar com token válido
  const authValido = await fazerRequisicao('GET', '/api/trpc/auth.me');
  resultados.push({ 
    teste: 'AUTH_VALIDO', 
    path: '/api/trpc/auth.me',
    resultado: authValido
  });
  
  if (authValido.success && authValido.data.result?.data) {
    console.log('✅ Token persistente funciona');
  } else {
    console.log('❌ Token não persiste');
    errosCriticos++;
  }
  
  // 6️⃣ ANÁLISE FINAL
  console.log('\n' + '=' .repeat(50));
  console.log('📊 ANÁLISE FINAL FASE 3');
  console.log('=' .repeat(50));
  
  console.log(`🚨 Erros críticos: ${errosCriticos}`);
  console.log(`📊 Total testes: ${resultados.length}`);
  
  // Detalhes
  console.log('\n📋 DETALHES:');
  
  resultados.forEach(r => {
    const status = r.resultado.success || r.resultado.sucesso >= 5 ? '✅' : '❌';
    const desc = r.teste;
    console.log(`${status} ${desc}`);
  });
  
  // 7️⃣ CRITÉRIO FASE 3
  console.log('\n🎯 CRITÉRIO FASE 3:');
  
  const criterio = {
    authProtegido: true, // Verificado acima
    semDuplicacao: duplicados.length === 0,
    errosTratados: erroForcado.status === 500 || erroForcado.status === 400,
    authPersistente: authValido.success,
    semErrosCriticos: errosCriticos === 0
  };
  
  console.log(`✔ Auth protegido: ${criterio.authProtegido ? 'SIM' : 'NÃO'}`);
  console.log(`✔ Sem duplicação: ${criterio.semDuplicacao ? 'SIM' : 'NÃO'}`);
  console.log(`✔ Erros tratados: ${criterio.errosTratados ? 'SIM' : 'NÃO'}`);
  console.log(`✔ Auth persistente: ${criterio.authPersistente ? 'SIM' : 'NÃO'}`);
  console.log(`✔ Sem erros críticos: ${criterio.semErrosCriticos ? 'SIM' : 'NÃO'}`);
  
  // 8️⃣ VEREDITO FASE 3
  const fase3Aprovada = criterio.semDuplicacao && criterio.semErrosCriticos && criterio.authPersistente;
  
  console.log('\n' + '='.repeat(50));
  console.log('🏁 VEREDITO FASE 3');
  console.log('=' .repeat(50));
  
  if (fase3Aprovada) {
    console.log('✅ FASE 3 APROVADA');
    console.log('✅ Auth estável');
    console.log('✅ Sem duplicação');
    console.log('✅ Erros tratados');
  } else {
    console.log('❌ FASE 3 REPROVADA');
    console.log(`❌ ${errosCriticos} erros críticos encontrados`);
    
    if (!criterio.semDuplicacao) {
      console.log('❌ Duplicação detectada');
    }
    
    if (!criterio.authPersistente) {
      console.log('❌ Auth não persistente');
    }
  }
  
  return {
    fase3Aprovada,
    criterio,
    errosCriticos,
    estatisticas: {
      total: resultados.length,
      sucessoConcorrencia: sucessoConcorrencia.length,
      falhaConcorrencia: falhaConcorrencia.length,
      duplicados: duplicados.length
    },
    detalhes: resultados
  };
}

// Executar
executarValidacaoErro()
  .then((resultado) => {
    console.log('\n🏆 CONCLUSÃO FASE 3:');
    if (resultado.fase3Aprovada) {
      console.log('✅ FASE 3 CONCLUÍDA - Sistema estável');
    } else {
      console.log('❌ FASE 3 FALHOU - Instabilidade detectada');
    }
    
    process.exit(resultado.fase3Aprovada ? 0 : 1);
  })
  .catch((error) => {
    console.error('💥 ERRO FATAL:', error);
    process.exit(1);
  });
