#!/usr/bin/env node
/**
 * TESTE DE CARGA COM AUTENTICAÇÃO
 * 1. Faz login para obter token
 * 2. Roda testes com token válido
 * 3. Analisa métricas de carga
 */
const http = require('http');

const BASE_URL = 'http://localhost:3006';
const ENDPOINTS = [
  '/api/trpc/produtos.list',
  '/api/trpc/clientes.list',
  '/api/trpc/pedidos.list',
];

let authToken = null;
let totalRequests = 0;
let successRequests = 0;
let failedRequests = 0;
let totalTime = 0;
let responseTimes = [];
let errors = {};

/**
 * Fazer login e obter token
 */
async function login() {
  return new Promise((resolve) => {
    console.log('\n🔐 Fazendo login...\n');
    
    const loginData = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'auth.loginLocal',
      params: {
        openId: 'vendedor001',
        password: 'teste123',
      }
    });

    const options = {
      hostname: 'localhost',
      port: 3006,
      path: '/api/trpc',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': loginData.length,
      },
      timeout: 10000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.result?.data?.sessionToken) {
            authToken = result.result.data.sessionToken;
            console.log(`✅ Login bem-sucedido!`);
            console.log(`   Token: ${authToken.substring(0, 20)}...`);
            resolve(true);
          } else {
            console.error(`❌ Erro no login:`, result);
            resolve(false);
          }
        } catch (e) {
          console.error(`❌ Erro ao parsear resposta:`, e.message);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.error(`❌ Erro de conexão:`, err.message);
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      console.error(`❌ Timeout no login`);
      resolve(false);
    });

    req.write(loginData);
    req.end();
  });
}

/**
 * Fazer request com autenticação
 */
async function makeAuthenticatedRequest(endpoint) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const url = BASE_URL + endpoint;
    
    const options = {
      hostname: 'localhost',
      port: 3006,
      path: endpoint,
      method: 'GET',
      headers: {
        'Cookie': `sessionToken=${authToken}`,
        'X-Session-Token': authToken,
      },
      timeout: 10000
    };

    const request = http.request(options, (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        const elapsed = Date.now() - startTime;
        responseTimes.push(elapsed);
        totalTime += elapsed;
        totalRequests++;
        
        if (res.statusCode >= 200 && res.statusCode < 300) {
          successRequests++;
        } else {
          failedRequests++;
          const key = `${res.statusCode}`;
          errors[key] = (errors[key] || 0) + 1;
        }
        
        resolve({ success: true, status: res.statusCode, time: elapsed });
      });
    });
    
    request.on('error', (err) => {
      const elapsed = Date.now() - startTime;
      failedRequests++;
      totalRequests++;
      responseTimes.push(elapsed);
      totalTime += elapsed;
      
      const errKey = err.code || 'UNKNOWN';
      errors[errKey] = (errors[errKey] || 0) + 1;
      
      resolve({ success: false, error: err.message, time: elapsed });
    });
    
    request.on('timeout', () => {
      request.destroy();
      failedRequests++;
      totalRequests++;
      const elapsed = Date.now() - startTime;
      responseTimes.push(elapsed);
      errors['TIMEOUT'] = (errors['TIMEOUT'] || 0) + 1;
    });
    
    request.end();
  });
}

/**
 * Rodar requests em paralelo
 */
async function parallelRequests(count, label) {
  console.log(`\n📊 ${label}`);
  console.log('─'.repeat(60));
  
  const startTime = Date.now();
  const promises = [];
  
  for (let i = 0; i < count; i++) {
    const endpoint = ENDPOINTS[i % ENDPOINTS.length];
    promises.push(makeAuthenticatedRequest(endpoint));
    
    if ((i + 1) % 10 === 0) {
      process.stdout.write(`[${i + 1}/${count}] `);
    }
  }
  
  await Promise.all(promises);
  const elapsed = Date.now() - startTime;
  
  console.log(`\n✅ Concluído em ${elapsed}ms`);
  return elapsed;
}

/**
 * Main
 */
async function runTests() {
  console.log('═'.repeat(60));
  console.log('🚀 TESTE DE CARGA COM AUTENTICAÇÃO');
  console.log('═'.repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  
  // Login
  const loginOk = await login();
  if (!loginOk || !authToken) {
    console.error('\n❌ Não foi possível fazer login. Abortando testes.');
    process.exit(1);
  }
  
  try {
    // TESTE 1
    await parallelRequests(20, 'TESTE 1: Carga Normal (20 requests)');
    
    // TESTE 2
    await parallelRequests(50, 'TESTE 2: Carga Média (50 requests)');
    
    // TESTE 3
    await parallelRequests(100, 'TESTE 3: BURST (100 requests)');
    
    // Métricas
    console.log('\n' + '═'.repeat(60));
    console.log('📈 MÉTRICAS FINAIS');
    console.log('═'.repeat(60));
    
    const avgTime = totalTime / totalRequests;
    const minTime = Math.min(...responseTimes);
    const maxTime = Math.max(...responseTimes);
    const successRate = ((successRequests / totalRequests) * 100).toFixed(2);
    
    responseTimes.sort((a, b) => a - b);
    const p50 = responseTimes[Math.floor(responseTimes.length * 0.5)];
    const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)];
    const p99 = responseTimes[Math.floor(responseTimes.length * 0.99)];
    
    console.log(`\n📊 RESUMO GERAL:`);
    console.log(`  Total de requests: ${totalRequests}`);
    console.log(`  Sucesso: ${successRequests} (${successRate}%)`);
    console.log(`  Falhas: ${failedRequests}`);
    
    console.log(`\n⏱️  TEMPO DE RESPOSTA:`);
    console.log(`  Mínimo: ${minTime}ms`);
    console.log(`  Máximo: ${maxTime}ms`);
    console.log(`  Médio: ${avgTime.toFixed(2)}ms`);
    console.log(`  P50: ${p50}ms`);
    console.log(`  P95: ${p95}ms`);
    console.log(`  P99: ${p99}ms`);
    
    if (Object.keys(errors).length > 0) {
      console.log(`\n❌ ERROS ENCONTRADOS:`);
      for (const [key, count] of Object.entries(errors)) {
        console.log(`  ${key}: ${count}x`);
      }
    }
    
    // Análise
    console.log('\n' + '═'.repeat(60));
    console.log('🔍 ANÁLISE DE LIMITE DO SISTEMA');
    console.log('═'.repeat(60));
    
    let statusMsg = '✅ PASSOU';
    let issues = [];
    
    if (successRate < 95) {
      statusMsg = '⚠️  ADVERTÊNCIA';
      issues.push(`Taxa de sucesso abaixo de 95%: ${successRate}%`);
    }
    
    if (failedRequests > 5) {
      issues.push(`${failedRequests} requests falharam`);
    }
    
    if (p95 > 3000) {
      statusMsg = '❌ LIMITE ATINGIDO';
      issues.push(`P95 acima de 3s: ${p95}ms (gargalo identificado)`);
    }
    
    if (maxTime > 8000) {
      statusMsg = '❌ RISCO CRÍTICO';
      issues.push(`Tempo máximo > 8s: ${maxTime}ms (sistema pode travar)`);
    }
    
    console.log(`\nStatus: ${statusMsg}`);
    
    if (issues.length > 0) {
      console.log('\n⚠️  Problemas encontrados:');
      issues.forEach(issue => console.log(`  • ${issue}`));
    } else {
      console.log('\n✅ Sistema mantém performance estável sob carga!');
    }
    
    // Recomendações
    console.log('\n' + '═'.repeat(60));
    console.log('💡 RECOMENDAÇÕES TÉCNICAS');
    console.log('═'.repeat(60));
    
    if (avgTime > 1500) {
      console.log('• Tempo médio elevado (>1.5s). Otimizar queries SQL.');
      console.log('  → Adicionar índices em tabelas frequentes');
      console.log('  → Implementar cache em camada de aplicação');
      console.log('  → Usar Redis para sessões/dados frequentes');
    }
    
    if (p99 - p50 > 2000) {
      console.log('\n• Variação alta entre P50 e P99. Há picos de lentidão.');
      console.log('  → Identificar queries lentas com EXPLAIN');
      console.log('  → Aumentar pool de conexões MySQL');
      console.log('  → Implementar connection pooling');
    }
    
    if (failedRequests > 10) {
      console.log('\n• Taxa de erro acima da tolerância.');
      console.log('  → Verificar logs do servidor');
      console.log('  → Aumentar limites de memória');
      console.log('  → Revisar configuração de rate limit');
    }
    
    console.log(`\n• Limite estimado do sistema:\n   ${Math.floor(totalRequests / (totalTime / 1000))} requests/segundo`);
    
    console.log('\n═'.repeat(60));
    
  } catch (err) {
    console.error('\n❌ ERRO CRÍTICO:', err.message);
    process.exit(1);
  }
}

runTests();
