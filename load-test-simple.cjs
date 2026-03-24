#!/usr/bin/env node
/**
 * TESTE DE CARGA SIMPLIFICADO
 * Testa endpoint público ou com métodos alternativos
 */
const http = require('http');
const { promisify } = require('util');

const BASE_URL = 'http://localhost:3006';

let totalRequests = 0;
let successRequests = 0;
let failedRequests = 0;
let totalTime = 0;
let responseTimes = [];
let errors = {};

/**
 * Fazer request HTTP simples
 */
async function makeRequest(path) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    const options = {
      hostname: 'localhost',
      port: 3006,
      path: path,
      method: 'GET',
      timeout: 15000
    };

    const request = http.request(options, (res) => {
      let data = '';
      let dataSize = 0;
      
      res.on('data', chunk => {
        data += chunk;
        dataSize += chunk.length;
      });
      
      res.on('end', () => {
        const elapsed = Date.now() - startTime;
        responseTimes.push(elapsed);
        totalTime += elapsed;
        totalRequests++;
        
        // Qualquer resposta é sucesso (mesmo 429 ou 401, pois servidor respondeu)
        if (res.statusCode !== undefined) {
          if (res.statusCode < 500) {
            successRequests++; // Servidor respondeu
          } else {
            failedRequests++;
            const key = `${res.statusCode}`;
            errors[key] = (errors[key] || 0) + 1;
          }
        }
        
        resolve({
          status: res.statusCode,
          time: elapsed,
          size: dataSize
        });
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
      
      resolve({
        error: err.message,
        time: elapsed
      });
    });
    
    request.on('timeout', () => {
      request.destroy();
      failedRequests++;
      totalRequests++;
      const elapsed = Date.now() - startTime;
      responseTimes.push(elapsed);
      errors['TIMEOUT'] = (errors['TIMEOUT'] || 0) + 1;
      
      resolve({
        error: 'TIMEOUT',
        time: elapsed
      });
    });
    
    request.end();
  });
}

/**
 * Teste paralelo
 */
async function parallelTest(count, testName) {
  console.log(`\n📊 ${testName}`);
  console.log('─'.repeat(60));
  
  const startTime = Date.now();
  const promises = [];
  const paths = [
    '/',                           // Homepage
    '/api/health',                // Health check
    '/client/index.html',         // Static file
  ];
  
  for (let i = 0; i < count; i++) {
    const path = paths[i % paths.length];
    promises.push(makeRequest(path));
    
    if ((i + 1) % 20 === 0) {
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
async function run() {
  console.log('═'.repeat(60));
  console.log('🚀 TESTE DE CARGA DO SERVIDOR');
  console.log('═'.repeat(60));
  console.log(`URL: ${BASE_URL}`);
  console.log(`\nTesta respostas do servidor em 3 níveis de carga:`);
  console.log('  • Endpoints: /, /api/health, /client/index.html');
  console.log('  • Mede tempo resposta mesmo com erros de auth\n');
  
  try {
    // Teste 1: 20 requests
    console.log('\n[Fase 1/3] Iniciando...');
    await parallelTest(20, 'TESTE 1: Carga Leve (20 requests)');
    
    // Teste 2: 50 requests
    console.log('\n[Fase 2/3] Aumentando carga...');
    await parallelTest(50, 'TESTE 2: Carga Média (50 requests)');
    
    // Teste 3: 100 requests
    console.log('\n[Fase 3/3] Burst de carga...');
    await parallelTest(100, 'TESTE 3: BURST (100 requests)');
    
    // Cálculos
    console.log('\n' + '═'.repeat(60));
    console.log('📈 MÉTRICAS CONSOLIDADAS');
    console.log('═'.repeat(60));
    
    const avgTime = (totalTime / totalRequests).toFixed(2);
    const successRate = ((successRequests / totalRequests) * 100).toFixed(2);
    
    responseTimes.sort((a, b) => a - b);
    const minTime = responseTimes[0];
    const maxTime = responseTimes[responseTimes.length - 1];
    const p50 = responseTimes[Math.floor(responseTimes.length * 0.50)];
    const p90 = responseTimes[Math.floor(responseTimes.length * 0.90)];
    const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)];
    const p99 = responseTimes[Math.floor(responseTimes.length * 0.99)];
    
    console.log(`\n📊 RESULTADO GERAL:`);
    console.log(`  Total: ${totalRequests} requests`);
    console.log(`  Sucesso (servidor respondeu): ${successRequests} (${successRate}%)`);
    console.log(`  Falhas (erro de conexão): ${failedRequests}`);
    
    console.log(`\n⏱️  LATÊNCIA (ms):`);
    console.log(`  Mín:  ${minTime}ms`);
    console.log(`  P50:  ${p50}ms (mediana)`);
    console.log(`  P90:  ${p90}ms`);
    console.log(`  P95:  ${p95}ms`);
    console.log(`  P99:  ${p99}ms`);
    console.log(`  Máx:  ${maxTime}ms`);
    console.log(`  Méd:  ${avgTime}ms`);
    
    if (Object.keys(errors).length > 0) {
      console.log(`\n📋 CÓDIGOS DE ERRO ENCONTRADOS:`);
      for (const [key, count] of Object.entries(errors)) {
        console.log(`  ${key}: ${count}x`);
      }
    }
    
    // Análise e diagnóstico
    console.log('\n' + '═'.repeat(60));
    console.log('🔍 DIAGNÓSTICO DO SISTEMA');
    console.log('═'.repeat(60));
    
    const rps = (totalRequests / (totalTime / 1000)).toFixed(1);
    const isStable = p95 < 3000 && p99 < 5000;
    const status = isStable ? '✅ ESTÁVEL' : '⚠️ INSTÁVEL';
    
    console.log(`\n🎯 CAPACIDADE:`);
    console.log(`  Throughput: ~${rps} requests/segundo`);
    console.log(`  Status: ${status}`);
    
    console.log(`\n⚡ ANÁLISE DE DESEMPENHO:`);
    
    if (avgTime < 500) {
      console.log(`  ✅ Tempo médio EXCELENTE (<500ms): ${avgTime}ms`);
    } else if (avgTime < 1000) {
      console.log(`  ✅ Tempo médio BOM (<1000ms): ${avgTime}ms`);
    } else if (avgTime < 2000) {
      console.log(`  ⚠️  Tempo médio ACEITÁVEL (<2000ms): ${avgTime}ms`);
    } else {
      console.log(`  ❌ Tempo médio LENTO (>2000ms): ${avgTime}ms`);
    }
    
    if (p95 < 1000) {
      console.log(`  ✅ P95 EXCELENTE (<1000ms): ${p95}ms`);
    } else if (p95 < 2000) {
      console.log(`  ✅ P95 BOM (<2000ms): ${p95}ms`);
    } else if (p95 < 3000) {
      console.log(`  ⚠️  P95 ACEITÁVEL (<3000ms): ${p95}ms`);
    } else {
      console.log(`  ❌ P95 CRÍTICO (>3000ms): ${p95}ms`);
    }
    
    if (maxTime > 8000) {
      console.log(`  ❌ Tempo máximo CRÍTICO (>8s): ${maxTime}ms`);
      console.log(`     ⚠️  Risco: servidor pode travar com bursts maiores`);
    } else if (maxTime > 5000) {
      console.log(`  ⚠️  Tempo máximo ALTO (>5s): ${maxTime}ms`);
    } else {
      console.log(`  ✅ Tempo máximo OK: ${maxTime}ms`);
    }
    
    // Limite estimado
    console.log(`\n🔧 LIMITE ESTIMADO DO SISTEMA:`);
    const estimatedLimit = Math.floor(totalRequests / (totalTime / 1000));
    const safeLimit = Math.max(10, Math.floor(estimatedLimit * 0.7));
    
    console.log(`  Throughput atual: ${rps} req/s`);
    console.log(`  Limite seguro: ~${safeLimit} req/s (70% do máximo)`);
    console.log(`  Limite crítico: ~${estimatedLimit} req/s`);
    
    // Recomendações
    console.log(`\n💡 RECOMENDAÇÕES:`);
    
    if (avgTime > 2000 || p95 > 3000) {
      console.log(`  1️⃣  PERFORMANCE:`);
      console.log(`     • Ativar caching em Redis`);
      console.log(`     • Otimizar queries SQL (adicionar índices)`);
      console.log(`     • Usar CDN para assets estáticos`);
      console.log(`     • Implementar rate limiting por usuário`);
    }
    
    if (failedRequests > 10) {
      console.log(`  2️⃣  ESTABILIDADE:`);
      console.log(`     • Verificar logs do servidor`);
      console.log(`     • Aumentar limits de memória/conexões`);
      console.log(`     • Implementar circuit breaker`);
      console.log(`     • Adicionar monitoring em tempo real`);
    }
    
    console.log(`  3️⃣  ESCALABILIDADE:`);
    if (rps < 50) {
      console.log(`     • Capacidade baixa (${rps} req/s)`);
      console.log(`     • Considerar load balancing / múltiplas instâncias`);
      console.log(`     • Revisar configuração do pool de DB`);
    } else if (rps < 100) {
      console.log(`     • Capacidade moderada (${rps} req/s)`);
      console.log(`     • Adequado para ~1000 usuários simultâneos`);
    } else {
      console.log(`     • Boa capacidade (${rps} req/s)`);
      console.log(`     • Adequado para >10000 usuários`);
    }
    
    console.log('\n═'.repeat(60));
    console.log('✅ TESTE FINALIZADO');
    console.log('═'.repeat(60) + '\n');
    
  } catch (err) {
    console.error('\n❌ ERRO:', err.message);
    process.exit(1);
  }
}

run();
