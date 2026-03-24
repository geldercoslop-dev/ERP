#!/usr/bin/env node

/**
 * TESTE DE GUERRA: LOAD TEST
 * 20-50 requests simultâneas para estressar o sistema
 */

const http = require('http');
const https = require('https');
const { performance } = require('perf_hooks');

console.log('='.repeat(60));
console.log('TESTE DE GUERRA: LOAD TEST');
console.log('='.repeat(60));

// Configurações
const BASE_URL = 'http://localhost:3001';
const ENDPOINTS = [
  '/api/system/health',
  '/api/dashboard/insights',
  '/api/metrics',
  '/api/trpc/auth.login'
];

const LOAD_LEVELS = [
  { name: 'LIGHT', concurrent: 20, duration: 5000 },
  { name: 'MEDIUM', concurrent: 35, duration: 8000 },
  { name: 'HEAVY', concurrent: 50, duration: 10000 }
];

function makeRequest(endpoint, requestId = 0) {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();
    
    const url = new URL(endpoint, BASE_URL);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `LoadTest-${requestId}`
      },
      timeout: 10000
    };

    if (endpoint.includes('auth.login')) {
      options.method = 'POST';
    }

    const req = client.request(options, (res) => {
      let data = '';
      
      res.on('data', chunk => data += chunk);
      
      res.on('end', () => {
        const endTime = performance.now();
        const responseTime = Math.round(endTime - startTime);
        
        try {
          const body = JSON.parse(data);
          resolve({
            status: res.statusCode,
            responseTime,
            body,
            headers: res.headers,
            endpoint,
            requestId
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            responseTime,
            body: data,
            headers: res.headers,
            endpoint,
            requestId
          });
        }
      });
    });

    req.on('error', (error) => {
      const endTime = performance.now();
      const responseTime = Math.round(endTime - startTime);
      
      reject({
        error: error.message,
        responseTime,
        endpoint,
        requestId
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const endTime = performance.now();
      const responseTime = Math.round(endTime - startTime);
      
      reject({
        error: 'Request timeout',
        responseTime,
        endpoint,
        requestId
      });
    });

    if (endpoint.includes('auth.login')) {
      req.write(JSON.stringify({
        email: 'test@example.com',
        password: 'test123'
      }));
    }
    
    req.end();
  });
}

async function runLoadTest(level) {
  console.log(`\n🚀 LOAD TEST - NÍVEL ${level.name}`);
  console.log(`📊 Concorrência: ${level.concurrent} requests`);
  console.log(`⏱️ Duração: ${level.duration}ms`);
  
  const results = [];
  const errors = [];
  const startTime = performance.now();
  
  // Gerar requests contínuas durante a duração
  const requestPromises = [];
  let requestId = 0;
  
  const interval = setInterval(() => {
    // Adicionar batch de requests simultâneas
    for (let i = 0; i < level.concurrent; i++) {
      const endpoint = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
      const promise = makeRequest(endpoint, requestId++)
        .then(result => results.push(result))
        .catch(error => errors.push(error));
      
      requestPromises.push(promise);
    }
  }, 100); // Novo batch a cada 100ms
  
  // Parar após a duração
  setTimeout(() => {
    clearInterval(interval);
  }, level.duration);
  
  // Esperar todas as requests completarem
  await Promise.allSettled(requestPromises);
  
  const endTime = performance.now();
  const totalTime = Math.round(endTime - startTime);
  
  // Análise dos resultados
  console.log(`\n📈 RESULTADOS - ${level.name}:`);
  console.log(`⏱️ Tempo total: ${totalTime}ms`);
  console.log(`📊 Requests: ${results.length} sucesso, ${errors.length} erros`);
  
  if (results.length > 0) {
    const responseTimes = results.map(r => r.responseTime);
    const avgResponseTime = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
    const minResponseTime = Math.min(...responseTimes);
    const maxResponseTime = Math.max(...responseTimes);
    
    console.log(`⚡ Response time - Média: ${avgResponseTime}ms, Min: ${minResponseTime}ms, Max: ${maxResponseTime}ms`);
    
    // Status codes
    const statusCounts = {};
    results.forEach(r => {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    });
    
    console.log(`📊 Status codes:`, statusCounts);
    
    // Verificar erros 500
    const error500 = results.filter(r => r.status >= 500).length;
    if (error500 === 0) {
      console.log('✅ Nenhum erro 500 detectado');
    } else {
      console.log(`❌ ${error500} erros 500 detectados`);
    }
    
    // Verificar duplicação
    const endpointCounts = {};
    results.forEach(r => {
      endpointCounts[r.endpoint] = (endpointCounts[r.endpoint] || 0) + 1;
    });
    
    console.log('📊 Distribuição por endpoint:', endpointCounts);
    
    // Tempo aceitável (< 2000ms)
    const slowRequests = responseTimes.filter(t => t > 2000).length;
    const slowPercentage = Math.round((slowRequests / responseTimes.length) * 100);
    
    if (slowPercentage < 10) {
      console.log('✅ Tempo de resposta aceitável');
    } else {
      console.log(`⚠️ ${slowPercentage}% das requests lentas (> 2s)`);
    }
  }
  
  if (errors.length > 0) {
    console.log(`\n❌ ERROS (${errors.length}):`);
    const errorTypes = {};
    errors.forEach(e => {
      errorTypes[e.error] = (errorTypes[e.error] || 0) + 1;
    });
    console.log('Tipos de erro:', errorTypes);
    
    // Verificar timeouts
    const timeouts = errors.filter(e => e.error.includes('timeout')).length;
    if (timeouts > 0) {
      console.log(`⚠️ ${timeouts} timeouts detectados`);
    }
    
    // Verificar ECONNREFUSED
    const connections = errors.filter(e => e.error.includes('ECONNREFUSED')).length;
    if (connections > 0) {
      console.log(`❌ ${connections} falhas de conexão (servidor sobrecarregado?)`);
    }
  }
  
  return {
    level: level.name,
    totalRequests: results.length + errors.length,
    successRequests: results.length,
    errors: errors.length,
    error500: results.filter(r => r.status >= 500).length,
    avgResponseTime: results.length > 0 ? Math.round(results.reduce((a, b) => a + b.responseTime, 0) / results.length) : 0,
    slowPercentage: results.length > 0 ? Math.round((results.filter(r => r.responseTime > 2000).length / results.length) * 100) : 0
  };
}

async function runAllLoadTests() {
  console.log('🚀 INICIANDO TESTE DE GUERRA - LOAD TEST');
  
  // Verificar se servidor está online
  try {
    await makeRequest('/api/system/health');
    console.log('✅ Servidor online');
  } catch (error) {
    console.log('❌ Servidor não está online');
    console.log('💡 Inicie o servidor: pnpm run dev');
    process.exit(1);
  }
  
  const allResults = [];
  
  // Executar testes em ordem crescente de carga
  for (const level of LOAD_LEVELS) {
    const result = await runLoadTest(level);
    allResults.push(result);
    
    // Pausa entre testes
    console.log('\n⏸️ Pausa de 3 segundos...');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  // Relatório final
  console.log('\n' + '='.repeat(60));
  console.log('RELATÓRIO FINAL - LOAD TEST');
  console.log('='.repeat(60));
  
  console.log('\n📊 RESUMO POR NÍVEL:');
  allResults.forEach(result => {
    const status = result.errors === 0 && result.error500 === 0 && result.slowPercentage < 10 ? '✅' : '❌';
    console.log(`${status} ${result.level}: ${result.successRequests}/${result.totalRequests} sucesso, ${result.errors} erros, ${result.avgResponseTime}ms avg`);
  });
  
  // Avaliação final
  const totalErrors = allResults.reduce((sum, r) => sum + r.errors, 0);
  const totalError500 = allResults.reduce((sum, r) => sum + r.error500, 0);
  const maxSlowPercentage = Math.max(...allResults.map(r => r.slowPercentage));
  const maxAvgResponseTime = Math.max(...allResults.map(r => r.avgResponseTime));
  
  console.log('\n🎯 AVALIAÇÃO FINAL:');
  
  if (totalErrors === 0 && totalError500 === 0 && maxSlowPercentage < 10 && maxAvgResponseTime < 2000) {
    console.log('✅ PASSOU - Sistema aguentou load test sem problemas');
    console.log('✅ Sem erros 500');
    console.log('✅ Sem duplicação detectada');
    console.log('✅ Tempo de resposta aceitável');
  } else {
    console.log('❌ FALHOU - Sistema apresentou problemas sob carga');
    
    if (totalError500 > 0) {
      console.log(`❌ ${totalError500} erros 500 detectados`);
    }
    
    if (totalErrors > totalError500) {
      console.log(`❌ ${totalErrors - totalError500} outros erros`);
    }
    
    if (maxSlowPercentage >= 10) {
      console.log(`❌ Até ${maxSlowPercentage}% de requests lentas`);
    }
    
    if (maxAvgResponseTime >= 2000) {
      console.log(`❌ Response time médio até ${maxAvgResponseTime}ms`);
    }
  }
  
  console.log('\n📈 MÉTRICAS DE PERFORMANCE:');
  console.log(`Total requests processadas: ${allResults.reduce((sum, r) => sum + r.totalRequests, 0)}`);
  console.log(`Taxa de sucesso: ${Math.round((allResults.reduce((sum, r) => sum + r.successRequests, 0) / allResults.reduce((sum, r) => sum + r.totalRequests, 0)) * 100)}%`);
  console.log(`Pico de concorrência: ${Math.max(...LOAD_LEVELS.map(l => l.concurrent))} requests simultâneas`);
}

runAllLoadTests().catch(console.error);
