/**
 * 🔥 TESTE SIMPLICIDADE: Executar Carga Real
 * 
 * Sem dependências de ESM/require, apenas requisições reais
 * Vai direto ao ponto: quantas requisições o sistema aguenta?
 */

import axios, { AxiosError } from 'axios';
import { performance } from 'perf_hooks';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const TIMEOUT_MS = 10000;

interface RequestResult {
  timestamp: number;
  duration: number;
  successful: boolean;
  statusCode?: number;
  error?: string;
}

console.log('\n');
console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  🔥 TESTE DE CARGA REAL - Sistema Aguenta Quantas Requições?   ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log('');

// Teste 1: Health Check
console.log('1️⃣ TESTE DE CONECTIVIDADE');
console.log('═════════════════════════════════════════════');

async function testHealthCheck() {
  try {
    const start = performance.now();
    const response = await axios.get(`${BASE_URL}/health`, { timeout: TIMEOUT_MS });
    const duration = performance.now() - start;

    console.log(`✅ Server responde (${duration.toFixed(2)}ms)`);
    console.log(`   URL: ${BASE_URL}`);
    console.log(`   Status: ${response.status}`);
    return true;
  } catch (error: any) {
    console.log(`❌ Server NÃO responde`);
    console.log(`   Erro: ${error.message}`);
    console.log(`   Dica: npm run dev`);
    return false;
  }
}

// Teste 2: Carga Sequencial (10 requisições uma por uma)
async function testSequentialLoad() {
  console.log('\n2️⃣ TESTE SEQUENCIAL (10 requisições)');
  console.log('═════════════════════════════════════════════');

  const results: RequestResult[] = [];
  const endpoints = [
    { method: 'GET', path: '/health', name: 'Health check' },
    { method: 'GET', path: '/api/trpc', name: 'API endpoint' },
    { method: 'GET', path: '/api', name: 'API root' },
  ];

  for (let i = 0; i < 10; i++) {
    const endpoint = endpoints[i % endpoints.length];
    const start = performance.now();

    try {
      const response = await axios({
        method: endpoint.method as 'GET' | 'POST',
        url: `${BASE_URL}${endpoint.path}`,
        timeout: TIMEOUT_MS,
      });

      results.push({
        timestamp: Date.now(),
        duration: performance.now() - start,
        successful: response.status === 200,
        statusCode: response.status,
      });

      console.log(`[${i + 1}/10] ✅ ${endpoint.name} (${(performance.now() - start).toFixed(2)}ms)`);
    } catch (error: any) {
      results.push({
        timestamp: Date.now(),
        duration: performance.now() - start,
        successful: false,
        statusCode: error.response?.status,
        error: error.message,
      });

      console.log(`[${i + 1}/10] ❌ ${endpoint.name} - ${error.message}`);
    }
  }

  const successful = results.filter(r => r.successful).length;
  const avgDuration = results.reduce((acc, r) => acc + r.duration, 0) / results.length;
  const maxDuration = Math.max(...results.map(r => r.duration));
  const minDuration = Math.min(...results.map(r => r.duration));

  console.log('');
  console.log(`📊 Resumo Sequencial:`);
  console.log(`   ✅ Sucesso: ${successful}/10`);
  console.log(`   ⏱️  Média: ${avgDuration.toFixed(2)}ms`);
  console.log(`   ⏱️  Min: ${minDuration.toFixed(2)}ms`);
  console.log(`   ⏱️  Max: ${maxDuration.toFixed(2)}ms`);

  return { successful: successful === 10, metrics: results };
}

// Teste 3: Carga Paralela (10 requisições simultâneas)
async function testParallelLoad() {
  console.log('\n3️⃣ TESTE PARALELO (10 requisições simultâneas)');
  console.log('═════════════════════════════════════════════');

  const results: RequestResult[] = [];
  const promises = [];

  // Criar 10 requisições em paralelo
  for (let i = 0; i < 10; i++) {
    promises.push(
      (async () => {
        const start = performance.now();
        try {
          const response = await axios.get(`${BASE_URL}/health`, { timeout: TIMEOUT_MS });
          const duration = performance.now() - start;

          results.push({
            timestamp: Date.now(),
            duration,
            successful: response.status === 200,
            statusCode: response.status,
          });

          console.log(`[${i + 1}/10] ✅ (${duration.toFixed(2)}ms)`);
        } catch (error: any) {
          const duration = performance.now() - start;

          results.push({
            timestamp: Date.now(),
            duration,
            successful: false,
            statusCode: error.response?.status,
            error: error.message,
          });

          console.log(`[${i + 1}/10] ❌ ${error.message}`);
        }
      })()
    );
  }

  await Promise.all(promises);

  const successful = results.filter(r => r.successful).length;
  const avgDuration = results.reduce((acc, r) => acc + r.duration, 0) / results.length;
  const maxDuration = Math.max(...results.map(r => r.duration));
  const minDuration = Math.min(...results.map(r => r.duration));

  console.log('');
  console.log(`📊 Resumo Paralelo:`);
  console.log(`   ✅ Sucesso: ${successful}/10`);
  console.log(`   ⏱️  Média: ${avgDuration.toFixed(2)}ms`);
  console.log(`   ⏱️  Min: ${minDuration.toFixed(2)}ms`);
  console.log(`   ⏱️  Max: ${maxDuration.toFixed(2)}ms`);

  return { successful: successful === 10, metrics: results };
}

// Teste 4: Carga Pesada (50 requisições simultâneas)
async function testHeavyLoad() {
  console.log('\n4️⃣ TESTE PESADO (50 requisições simultâneas)');
  console.log('═════════════════════════════════════════════');

  const results: RequestResult[] = [];
  const promises = [];

  console.log('Enviando 50 requisições...');

  // Criar 50 requisições em paralelo
  for (let i = 0; i < 50; i++) {
    promises.push(
      (async () => {
        const start = performance.now();
        try {
          const response = await axios.get(`${BASE_URL}/health`, { timeout: TIMEOUT_MS });
          const duration = performance.now() - start;

          results.push({
            timestamp: Date.now(),
            duration,
            successful: response.status === 200,
            statusCode: response.status,
          });
        } catch (error: any) {
          const duration = performance.now() - start;

          results.push({
            timestamp: Date.now(),
            duration,
            successful: false,
            statusCode: error.response?.status,
            error: error.message,
          });
        }
      })()
    );
  }

  await Promise.all(promises);

  const successful = results.filter(r => r.successful).length;
  const failed = results.filter(r => !r.successful).length;
  const avgDuration = results.reduce((acc, r) => acc + r.duration, 0) / results.length;
  const maxDuration = Math.max(...results.map(r => r.duration));
  const minDuration = Math.min(...results.map(r => r.duration));
  const p95 = results.sort((a, b) => a.duration - b.duration)[Math.floor(results.length * 0.95)].duration;

  console.log('');
  console.log(`📊 Resumo Pesado:`);
  console.log(`   ✅ Sucesso: ${successful}/50 (${((successful / 50) * 100).toFixed(1)}%)`);
  console.log(`   ❌ Falha: ${failed}/50`);
  console.log(`   ⏱️  Média: ${avgDuration.toFixed(2)}ms`);
  console.log(`   ⏱️  Min: ${minDuration.toFixed(2)}ms`);
  console.log(`   ⏱️  Max: ${maxDuration.toFixed(2)}ms`);
  console.log(`   ⏱️  P95: ${p95.toFixed(2)}ms`);

  return { successful: successful === 50, metrics: results };
}

// MAIN
async function main() {
  try {
    // Test 1
    const healthOk = await testHealthCheck();
    if (!healthOk) {
      console.log('\n⚠️  Abortando - servidor não está acessível\n');
      process.exit(1);
    }

    // Tests 2-4
    const sequentialResult = await testSequentialLoad();
    const parallelResult = await testParallelLoad();
    const heavyResult = await testHeavyLoad();

    // RELATÓRIO FINAL
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    📊 RESUMO FINAL                             ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');

    const allTestsPassed =
      sequentialResult.successful && parallelResult.successful && heavyResult.successful;

    if (allTestsPassed) {
      console.log('✅ TODOS OS TESTES PASSARAM');
      console.log('   Sistema responde bem sob carga');
    } else {
      console.log('⚠️  ALGUNS TESTES FALHARAM');
      if (!sequentialResult.successful) console.log('   - Falha em carga sequencial');
      if (!parallelResult.successful) console.log('   - Falha em carga paralela');
      if (!heavyResult.successful) console.log('   - Falha em carga pesada');
    }

    console.log('');
    console.log('═════════════════════════════════════════════════════════════════');

    process.exit(allTestsPassed ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Erro geral:', error);
    process.exit(1);
  }
}

main();
