#!/usr/bin/env node
/**
 * TESTE DE CARGA E ESTABILIDADE
 * - 20-50 requests simultâneos
 * - Burst de 100 requests
 * - Análise de tempo e erros
 */
const http = require('http');

// Configuração
const BASE_URL = 'http://localhost:3006';
const ENDPOINTS = [
  '/api/trpc/produtos.list',
  '/api/trpc/clientes.list',
  '/api/trpc/pedidos.list',
];

let totalRequests = 0;
let successRequests = 0;
let failedRequests = 0;
let totalTime = 0;
let responseTimes = [];
let errors = {};

async function makeRequest(endpoint) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const url = BASE_URL + endpoint;
    
    const request = http.get(url, { timeout: 10000 }, (res) => {
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
  });
}

async function parallelRequests(count, label) {
  console.log(`\n📊 ${label}`);
  console.log('─'.repeat(60));
  
  const startTime = Date.now();
  const promises = [];
  
  for (let i = 0; i < count; i++) {
    const endpoint = ENDPOINTS[i % ENDPOINTS.length];
    promises.push(makeRequest(endpoint));
    
    // Mostrar progresso
    if ((i + 1) % 10 === 0) {
      process.stdout.write(`[${i + 1}/${count}] `);
    }
  }
  
  await Promise.all(promises);
  const elapsed = Date.now() - startTime;
  
  console.log(`\n✅ Concluído em ${elapsed}ms`);
  return elapsed;
}

async function runTests() {
  console.log('═'.repeat(60));
  console.log('🚀 TESTE DE CARGA E ESTABILIDADE');
  console.log('═'.repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Endpoints: ${ENDPOINTS.join(', ')}`);
  
  try {
    // TESTE 1: Carga Normal (20 requests)
    await parallelRequests(20, 'TESTE 1: Carga Normal (20 requests)');
    
    // TESTE 2: Carga Média (50 requests)
    await parallelRequests(50, 'TESTE 2: Carga Média (50 requests)');
    
    // TESTE 3: Burst (100 requests)
    await parallelRequests(100, 'TESTE 3: BURST (100 requests)');
    
    // Cálculos de métricas
    console.log('\n' + '═'.repeat(60));
    console.log('📈 MÉTRICAS FINAIS');
    console.log('═'.repeat(60));
    
    const avgTime = totalTime / totalRequests;
    const minTime = Math.min(...responseTimes);
    const maxTime = Math.max(...responseTimes);
    const successRate = ((successRequests / totalRequests) * 100).toFixed(2);
    
    // Percentis
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
    console.log('🔍 ANÁLISE');
    console.log('═'.repeat(60));
    
    let statusMsg = '✅ PASSOU';
    let issues = [];
    
    if (successRate < 95) {
      statusMsg = '⚠️  ADVERTÊNCIA';
      issues.push(`Taxa de sucesso baixa: ${successRate}%`);
    }
    
    if (failedRequests > 0) {
      issues.push(`${failedRequests} requests falharam`);
    }
    
    if (p95 > 5000) {
      issues.push(`P95 acima de 5s: ${p95}ms`);
    }
    
    if (maxTime > 10000) {
      statusMsg = '❌ FALHOU';
      issues.push(`Tempo máximo > 10s: ${maxTime}ms`);
    }
    
    console.log(`Status: ${statusMsg}`);
    if (issues.length > 0) {
      console.log('\nProblemas encontrados:');
      issues.forEach(issue => console.log(`  • ${issue}`));
    } else {
      console.log('Nenhum problema detectado!');
    }
    
    // Recomendações
    console.log('\n' + '═'.repeat(60));
    console.log('💡 RECOMENDAÇÕES');
    console.log('═'.repeat(60));
    
    if (avgTime > 1000) {
      console.log('• Tempo médio alto. Considerar otimizar queries/cache.');
    }
    if (p99 - p50 > 2000) {
      console.log('• Grande variação de latência. Há picos de lentidão.');
    }
    if (failedRequests > 10) {
      console.log('• Múltiplas falhas detectadas. Verificar logs do servidor.');
    }
    
    console.log('\n═'.repeat(60));
    
  } catch (err) {
    console.error('\n❌ ERRO CRÍTICO:', err.message);
    process.exit(1);
  }
}

// Executar
runTests();
