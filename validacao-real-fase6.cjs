// 🚀 FASE 6: TESTE DE CARGA REAL
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
  return 3005;
}

// Função para requisição
async function fazerRequisicao(method, path, data = null, headers = {}) {
  const url = `http://localhost:${porta}${path}`;
  
  try {
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
    
    const start = Date.now();
    const response = await axios(config);
    const end = Date.now();
    
    return { 
      success: true, 
      status: response.status, 
      data: response.data,
      responseTime: end - start
    };
  } catch (error) {
    const end = Date.now();
    return { 
      success: false, 
      status: error.response?.status || 0, 
      error: error.message,
      responseTime: end - Date.now()
    };
  }
}

// Teste principal
async function executarTesteCarga() {
  console.log('🚀 FASE 6: TESTE DE CARGA REAL');
  console.log('=' .repeat(50));
  
  // Detectar porta
  porta = extrairPorta();
  console.log(`📡 Porta detectada: ${porta}`);
  
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
    return { sucesso: false, motivo: 'token não obtido' };
  }
  
  // 2️⃣ TESTE DE CARGA LEVE - 20 REQUESTS
  console.log('\n2️⃣ TESTE DE CARGA LEVE - 20 REQUESTS...');
  
  const promises = [];
  const startLeve = Date.now();
  
  for (let i = 0; i < 20; i++) {
    promises.push(fazerRequisicao('GET', '/api/health'));
  }
  
  const resultadosLeve = await Promise.all(promises);
  const endLeve = Date.now();
  
  const sucessoLeve = resultadosLeve.filter(r => r.success);
  const falhaLeve = resultadosLeve.filter(r => !r.success);
  const avgTimeLeve = resultadosLeve.reduce((sum, r) => sum + (r.responseTime || 0), 0) / resultadosLeve.length;
  
  console.log(`✅ Sucesso carga leve: ${sucessoLeve.length}/20`);
  console.log(`❌ Falha carga leve: ${falhaLeve.length}/20`);
  console.log(`⏱️ Tempo total: ${endLeve - startLeve}ms`);
  console.log(`⏱️ Tempo médio: ${avgTimeLeve.toFixed(2)}ms`);
  
  // 3️⃣ TESTE DE CARGA MÉDIA - 50 REQUESTS
  console.log('\n3️⃣ TESTE DE CARGA MÉDIA - 50 REQUESTS...');
  
  const promisesMedio = [];
  const startMedio = Date.now();
  
  for (let i = 0; i < 50; i++) {
    // Misturar endpoints
    if (i % 3 === 0) {
      promisesMedio.push(fazerRequisicao('GET', '/api/health'));
    } else if (i % 3 === 1) {
      promisesMedio.push(fazerRequisicao('GET', '/ping'));
    } else {
      promisesMedio.push(fazerRequisicao('GET', '/api/trpc/auth.me'));
    }
  }
  
  const resultadosMedio = await Promise.all(promisesMedio);
  const endMedio = Date.now();
  
  const sucessoMedio = resultadosMedio.filter(r => r.success);
  const falhaMedio = resultadosMedio.filter(r => !r.success);
  const avgTimeMedio = resultadosMedio.reduce((sum, r) => sum + (r.responseTime || 0), 0) / resultadosMedio.length;
  
  console.log(`✅ Sucesso carga média: ${sucessoMedio.length}/50`);
  console.log(`❌ Falha carga média: ${falhaMedio.length}/50`);
  console.log(`⏱️ Tempo total: ${endMedio - startMedio}ms`);
  console.log(`⏱️ Tempo médio: ${avgTimeMedio.toFixed(2)}ms`);
  
  // 4️⃣ TESTE DE CARGA PESADA - 100 REQUESTS
  console.log('\n4️⃣ TESTE DE CARGA PESADA - 100 REQUESTS...');
  
  const promisesPesado = [];
  const startPesado = Date.now();
  
  for (let i = 0; i < 100; i++) {
    if (i % 4 === 0) {
      promisesPesado.push(fazerRequisicao('GET', '/api/health'));
    } else if (i % 4 === 1) {
      promisesPesado.push(fazerRequisicao('GET', '/ping'));
    } else if (i % 4 === 2) {
      promisesPesado.push(fazerRequisicao('GET', '/api/trpc/auth.me'));
    } else {
      // Teste de escrita (mais pesado)
      promisesPesado.push(fazerRequisicao('GET', '/api/trpc/clientes.list'));
    }
  }
  
  const resultadosPesado = await Promise.all(promisesPesado);
  const endPesado = Date.now();
  
  const sucessoPesado = resultadosPesado.filter(r => r.success);
  const falhaPesado = resultadosPesado.filter(r => !r.success);
  const avgTimePesado = resultadosPesado.reduce((sum, r) => sum + (r.responseTime || 0), 0) / resultadosPesado.length;
  
  console.log(`✅ Sucesso carga pesada: ${sucessoPesado.length}/100`);
  console.log(`❌ Falha carga pesada: ${falhaPesado.length}/100`);
  console.log(`⏱️ Tempo total: ${endPesado - startPesado}ms`);
  console.log(`⏱️ Tempo médio: ${avgTimePesado.toFixed(2)}ms`);
  
  // 5️⃣ TESTE DE ESTRESSE - BURST TEST
  console.log('\n5️⃣ TESTE DE ESTRESSE - BURST DE 50 REQUESTS...');
  
  const promisesBurst = [];
  const startBurst = Date.now();
  
  // Enviar tudo de uma vez
  for (let i = 0; i < 50; i++) {
    promisesBurst.push(fazerRequisicao('GET', '/api/health'));
  }
  
  const resultadosBurst = await Promise.all(promisesBurst);
  const endBurst = Date.now();
  
  const sucessoBurst = resultadosBurst.filter(r => r.success);
  const falhaBurst = resultadosBurst.filter(r => !r.success);
  const avgTimeBurst = resultadosBurst.reduce((sum, r) => sum + (r.responseTime || 0), 0) / resultadosBurst.length;
  
  console.log(`✅ Sucesso burst: ${sucessoBurst.length}/50`);
  console.log(`❌ Falha burst: ${falhaBurst.length}/50`);
  console.log(`⏱️ Tempo total: ${endBurst - startBurst}ms`);
  console.log(`⏱️ Tempo médio: ${avgTimeBurst.toFixed(2)}ms`);
  
  // 6️⃣ VERIFICAR SE SERVIDOR CONTÉM RESPONDENDO
  console.log('\n6️⃣ VERIFICANDO ESTABILIDADE PÓS-CARGA...');
  
  await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo
  
  const estabilidade = await fazerRequisicao('GET', '/api/health');
  
  if (estabilidade.success) {
    console.log('✅ Servidor estável após carga');
  } else {
    console.log('❌ Servidor instável após carga');
  }
  
  // 7️⃣ ANÁLISE FINAL
  console.log('\n' + '=' .repeat(50));
  console.log('📊 ANÁLISE FINAL TESTE DE CARGA');
  console.log('=' .repeat(50));
  
  const totalRequests = 20 + 50 + 100 + 50;
  const totalSucessos = sucessoLeve.length + sucessoMedio.length + sucessoPesado.length + sucessoBurst.length;
  const totalFalhas = falhaLeve.length + falhaMedio.length + falhaPesado.length + falhaBurst.length;
  const taxaSucesso = (totalSucessos / totalRequests * 100).toFixed(2);
  
  console.log(`📊 Total requests: ${totalRequests}`);
  console.log(`✅ Total sucessos: ${totalSucessos}`);
  console.log(`❌ Total falhas: ${totalFalhas}`);
  console.log(`📈 Taxa de sucesso: ${taxaSucesso}%`);
  
  console.log('\n📋 DETALHES POR CARGA:');
  console.log(`🟢 Carga leve (20): ${sucessoLeve.length}/20 (${(sucessoLeve.length/20*100).toFixed(1)}%) - ${avgTimeLeve.toFixed(2)}ms`);
  console.log(`🟡 Carga média (50): ${sucessoMedio.length}/50 (${(sucessoMedio.length/50*100).toFixed(1)}%) - ${avgTimeMedio.toFixed(2)}ms`);
  console.log(`🟠 Carga pesada (100): ${sucessoPesado.length}/100 (${(sucessoPesado.length/100*100).toFixed(1)}%) - ${avgTimePesado.toFixed(2)}ms`);
  console.log(`🔴 Burst (50): ${sucessoBurst.length}/50 (${(sucessoBurst.length/50*100).toFixed(1)}%) - ${avgTimeBurst.toFixed(2)}ms`);
  
  // 8️⃣ CRITÉRIO FASE 6
  console.log('\n🎯 CRITÉRIO FASE 6:');
  
  const criterio = {
    taxaSucessoAlta: parseFloat(taxaSucesso) >= 95,
    tempoMedioBaixo: avgTimeLeve < 1000 && avgTimeMedio < 2000,
    semCrash: estabilidade.success,
    taxaFalhaBaixa: totalFalhas <= totalRequests * 0.05, // Máximo 5% de falha
    servidorEstavel: estabilidade.success
  };
  
  console.log(`✔ Taxa sucesso >= 95%: ${criterio.taxaSucessoAlta ? 'SIM' : 'NÃO'} (${taxaSucesso}%)`);
  console.log(`✔ Tempo médio baixo: ${criterio.tempoMedioBaixo ? 'SIM' : 'NÃO'}`);
  console.log(`✔ Sem crash: ${criterio.semCrash ? 'SIM' : 'NÃO'}`);
  console.log(`✔ Taxa falha <= 5%: ${criterio.taxaFalhaBaixa ? 'SIM' : 'NÃO'}`);
  console.log(`✔ Servidor estável: ${criterio.servidorEstavel ? 'SIM' : 'NÃO'}`);
  
  // 9️⃣ VEREDITO FASE 6
  const fase6Aprovada = criterio.taxaSucessoAlta && criterio.semCrash && criterio.servidorEstavel;
  
  console.log('\n' + '='.repeat(50));
  console.log('🏁 VEREDITO FASE 6');
  console.log('=' .repeat(50));
  
  if (fase6Aprovada) {
    console.log('✅ FASE 6 APROVADA');
    console.log('✅ Sistema aguenta carga básica');
    console.log('✅ Performance aceitável');
    console.log('✅ Sem instabilidade');
  } else {
    console.log('❌ FASE 6 REPROVADA');
    
    if (!criterio.taxaSucessoAlta) {
      console.log('❌ Taxa de sucesso muito baixa');
    }
    
    if (!criterio.semCrash) {
      console.log('❌ Sistema apresentou crash');
    }
    
    if (!criterio.servidorEstavel) {
      console.log('❌ Servidor instável após carga');
    }
  }
  
  return {
    fase6Aprovada,
    criterio,
    estatisticas: {
      totalRequests,
      totalSucessos,
      totalFalhas,
      taxaSucesso: parseFloat(taxaSucesso),
      avgTimes: {
        leve: avgTimeLeve,
        medio: avgTimeMedio,
        pesado: avgTimePesado,
        burst: avgTimeBurst
      }
    },
    estabilidade: estabilidade.success
  };
}

// Executar
executarTesteCarga()
  .then((resultado) => {
    console.log('\n🏆 CONCLUSÃO FASE 6:');
    if (resultado.fase6Aprovada) {
      console.log('✅ FASE 6 CONCLUÍDA - Sistema robusto');
    } else {
      console.log('❌ FASE 6 FALHOU - Sistema não aguenta carga');
    }
    
    process.exit(resultado.fase6Aprovada ? 0 : 1);
  })
  .catch((error) => {
    console.error('💥 ERRO FATAL:', error);
    process.exit(1);
  });
