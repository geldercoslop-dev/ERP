#!/usr/bin/env tsx
/**
 * 🔥 TESTES REAIS - Sem filtro, sem mentira
 * 
 * Executa:
 * 1. Verificação do sistema
 * 2. Testes de performance
 * 3. Testes de concorrência
 * 4. Testes de carga
 * 5. Testes de tracing
 * 6. Testes de resiliência
 * 
 * Reporta honestamente o que passa e o que quebra
 */

import { execSync, spawn } from 'child_process';
import * as os from 'os';
import axios from 'axios';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  duration: number;
  message: string;
  error?: string;
  data?: any;
}

const results: TestResult[] = [];
const startTime = Date.now();

// ============================================================
// FASE 0: System Health Check
// ============================================================

async function checkSystemHealth(): Promise<TestResult> {
  const start = Date.now();
  try {
    console.log('\n📋 FASE 0: VERIFICAÇÃO DO SISTEMA');
    console.log('═════════════════════════════════════════════');

    // Check Node.js
    const nodeVersion = process.version;
    console.log(`✓ Node.js: ${nodeVersion}`);

    // Check memory
    const meminfo = os.totalmem() / 1024 / 1024 / 1024;
    const freemem = os.freemem() / 1024 / 1024 / 1024;
    console.log(`✓ Memory: ${freemem.toFixed(2)}GB / ${meminfo.toFixed(2)}GB free`);

    // Check CPU cores
    const cpus = os.cpus().length;
    console.log(`✓ CPU Cores: ${cpus}`);

    // Check MySQL connection
    let mysqlOk = false;
    try {
      execSync('npm run test:db', { stdio: 'pipe' });
      mysqlOk = true;
      console.log('✓ MySQL: Conectado');
    } catch (e) {
      console.log('✗ MySQL: ERRO DE CONEXÃO');
    }

    // Check if server is running
    let serverRunning = false;
    try {
      const response = await axios.get('http://localhost:3001/health', { timeout: 2000 });
      serverRunning = response.status === 200;
      console.log('✓ Server (http://localhost:3001): Rodando');
    } catch (e) {
      console.log(`⚠ Server: NÃO ESTÁ RODANDO em localhost:3001`);
      console.log(`  Hint: npm run dev`);
    }

    console.log('');

    if (!serverRunning) {
      return {
        name: 'System Health',
        status: 'SKIP',
        duration: Date.now() - start,
        message: 'Server não está rodando. Inicie com: npm run dev',
      };
    }

    return {
      name: 'System Health',
      status: 'PASS',
      duration: Date.now() - start,
      message: 'Sistema OK',
      data: { mysqlOk, serverRunning },
    };
  } catch (error: any) {
    return {
      name: 'System Health',
      status: 'FAIL',
      duration: Date.now() - start,
      message: error.message,
      error: error.stack,
    };
  }
}

// ============================================================
// FASE 1: Teste de Concorrência
// ============================================================

async function runConcurrencyTest(): Promise<TestResult> {
  const start = Date.now();
  try {
    console.log('🧪 FASE 1: TESTE DE CONCORRÊNCIA');
    console.log('═════════════════════════════════════════════');

    const result = execSync('npx tsx tests/performance/concurrency-test.ts', {
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    console.log(result);

    return {
      name: 'Concurrency Test',
      status: 'PASS',
      duration: Date.now() - start,
      message: 'Concorrência OK',
      data: result,
    };
  } catch (error: any) {
    console.log(`❌ ERRO: ${error.message}\n`);
    return {
      name: 'Concurrency Test',
      status: 'FAIL',
      duration: Date.now() - start,
      message: error.message,
      error: error.stdout || error.stderr,
    };
  }
}

// ============================================================
// FASE 2: Teste de Carga
// ============================================================

async function runLoadTest(): Promise<TestResult> {
  const start = Date.now();
  try {
    console.log('🔥 FASE 2: TESTE DE CARGA (500 req/s)');
    console.log('═════════════════════════════════════════════');

    const result = execSync('npx tsx tests/performance/load-test.ts', {
      encoding: 'utf-8',
      timeout: 120000,
      stdio: 'pipe',
    });

    console.log(result);

    return {
      name: 'Load Test',
      status: 'PASS',
      duration: Date.now() - start,
      message: 'Load test OK',
      data: result,
    };
  } catch (error: any) {
    console.log(`⚠ LOAD TEST FALHOU\n`);
    return {
      name: 'Load Test',
      status: 'FAIL',
      duration: Date.now() - start,
      message: error.message,
      error: error.stdout || error.stderr,
    };
  }
}

// ============================================================
// FASE 3: Teste de Tracing
// ============================================================

async function runTracingTest(): Promise<TestResult> {
  const start = Date.now();
  try {
    console.log('🔍 FASE 3: TESTE DE TRACING');
    console.log('═════════════════════════════════════════════');

    const result = execSync('npx tsx tests/performance/tracing-test.ts', {
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    console.log(result);

    return {
      name: 'Tracing Test',
      status: 'PASS',
      duration: Date.now() - start,
      message: 'Tracing OK',
      data: result,
    };
  } catch (error: any) {
    console.log(`⚠ TRACING TEST FALHOU\n`);
    return {
      name: 'Tracing Test',
      status: 'FAIL',
      duration: Date.now() - start,
      message: error.message,
      error: error.stdout || error.stderr,
    };
  }
}

// ============================================================
// FASE 4: Teste de Resiliência
// ============================================================

async function runResilienceTest(): Promise<TestResult> {
  const start = Date.now();
  try {
    console.log('💪 FASE 4: TESTE DE RESILIÊNCIA');
    console.log('═════════════════════════════════════════════');

    const result = execSync('npx tsx tests/performance/resilience-test.ts', {
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    console.log(result);

    return {
      name: 'Resilience Test',
      status: 'PASS',
      duration: Date.now() - start,
      message: 'Resiliência OK',
      data: result,
    };
  } catch (error: any) {
    console.log(`⚠ RESILIENCE TEST FALHOU\n`);
    return {
      name: 'Resilience Test',
      status: 'FAIL',
      duration: Date.now() - start,
      message: error.message,
      error: error.stdout || error.stderr,
    };
  }
}

// ============================================================
// FASE 5: Teste Manual de Clique Rápido
// ============================================================

async function runManualClickTest(): Promise<TestResult> {
  const start = Date.now();
  try {
    console.log('🖱️ FASE 5: TESTE MANUAL (Clique Rápido 10x)');
    console.log('═════════════════════════════════════════════');

    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';

    // Simular 10 cliques rápidos (criar 10 pedidos simultâneos)
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        axios.post(`${baseUrl}/api/trpc/pedidos.create`, {
          datos: {
            numero: Math.floor(Math.random() * 100000),
            clienteId: 1,
            clienteNome: 'Cliente Teste',
            vendedorId: 1,
            total: 1000,
            status: 'GERADO',
          },
        })
      );
    }

    const responses = await Promise.allSettled(promises);
    const successful = responses.filter(r => r.status === 'fulfilled').length;
    const failed = responses.filter(r => r.status === 'rejected').length;

    console.log(`✓ Enviados: 10 requisições simultâneas`);
    console.log(`✓ Sucesso: ${successful}`);
    console.log(`✗ Falha: ${failed}`);
    console.log('');

    return {
      name: 'Manual Click Test',
      status: failed === 0 ? 'PASS' : 'FAIL',
      duration: Date.now() - start,
      message: `${successful}/10 cliques sucessosos`,
      data: { successful, failed },
    };
  } catch (error: any) {
    return {
      name: 'Manual Click Test',
      status: 'FAIL',
      duration: Date.now() - start,
      message: error.message,
      error: error.response?.data || error.message,
    };
  }
}

// ============================================================
// RELATÓRIO FINAL
// ============================================================

async function generateFinalReport() {
  const totalDuration = Date.now() - startTime;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;

  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    📊 RELATÓRIO FINAL (HONESTO)                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  console.log('📈 RESUMO:');
  console.log(`  ✅ Passaram: ${passed}`);
  console.log(`  ❌ Falharam: ${failed}`);
  console.log(`  ⊘ Pulados: ${skipped}`);
  console.log(`  ⏱️  Tempo total: ${(totalDuration / 1000).toFixed(2)}s`);
  console.log('');

  console.log('DETALHES POR TESTE:');
  results.forEach((result, i) => {
    const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⊘';
    console.log(`\n${icon} [${i + 1}] ${result.name}`);
    console.log(`   Status: ${result.status}`);
    console.log(`   Mensagem: ${result.message}`);
    console.log(`   Duração: ${result.duration}ms`);
    if (result.error) {
      console.log(`   Erro: ${result.error.substring(0, 200)}`);
    }
  });

  console.log('');
  console.log('═════════════════════════════════════════════════════════════════');

  // Análise de limites
  console.log('\n🔍 ANÁLISE DE LIMITES DO SISTEMA:');
  console.log('');

  const failedTests = results.filter(r => r.status === 'FAIL');

  if (failedTests.length === 0) {
    console.log('✅ SISTEMA ROBUSTO');
    console.log('   Sistema passou em TODOS os testes');
    console.log('   Pronto para produção com alta confiabilidade');
  } else {
    console.log('⚠️  PONTOS FRÁGEIS IDENTIFICADOS:');
    failedTests.forEach((test, i) => {
      console.log(`   ${i + 1}. ${test.name}: ${test.message}`);
    });
  }

  console.log('');

  // Grade final
  const grade =
    failed === 0
      ? 'A+ (Excelente)'
      : failed === 1
        ? 'A (Muito Bom)'
        : failed <= 2
          ? 'B (Bom)'
          : failed <= 3
            ? 'C (Aceitável)'
            : 'D (Precisa Urgente)'

  console.log(`┌─ GRADE FINAL: ${grade} ────────────────────────────────┐`);
  console.log('└────────────────────────────────────────────────────────┘');
  console.log('');

  // Próximos passos
  if (failed > 0) {
    console.log('🔧 PRÓXIMOS PASSOS:');
    console.log('   1. Revisar erros acima');
    console.log('   2. Executar testes individuais para debugar');
    console.log('   3. Corrigir issues críticas');
    console.log('   4. Re-executar suite');
  }

  console.log('');
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('✨ FIM DOS TESTES REAIS');
  console.log('═════════════════════════════════════════════════════════════════');

  return {
    passed,
    failed,
    skipped,
    grade,
    totalDuration,
    results,
  };
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║        🔥 EXECUÇÃO REAL DE TESTES - SEM FILTRO                ║');
  console.log('║                                                                ║');
  console.log('║  Vamos testar TUDO: performance, carga, resiliência, tracing   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  // Fase 0: Health check
  const healthResult = await checkSystemHealth();
  results.push(healthResult);

  if (healthResult.status === 'SKIP') {
    console.log('\n⚠️  SERVIDOR NÃO ESTÁ RODANDO');
    console.log('   Inicie com: npm run dev');
    console.log('   Depois execute novamente este script\n');
    process.exit(1);
  }

  // Fase 1: Concorrência
  const concurrencyResult = await runConcurrencyTest();
  results.push(concurrencyResult);

  // Fase 2: Carga
  const loadResult = await runLoadTest();
  results.push(loadResult);

  // Fase 3: Tracing
  const tracingResult = await runTracingTest();
  results.push(tracingResult);

  // Fase 4: Resiliência
  const resilienceResult = await runResilienceTest();
  results.push(resilienceResult);

  // Fase 5: Manual click test
  const manualResult = await runManualClickTest();
  results.push(manualResult);

  // Relatório final
  const finalReport = await generateFinalReport();

  // Exit code
  process.exit(finalReport.failed > 0 ? 1 : 0);
}

// Executar
main().catch(err => {
  console.error('❌ ERRO CRÍTICO:', err);
  process.exit(1);
});
