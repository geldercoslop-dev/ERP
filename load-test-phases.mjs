#!/usr/bin/env node
import autocannon from 'autocannon';
import { writeFileSync, appendFileSync } from 'fs';
import path from 'path';

const REPORT_FILE = path.join(process.cwd(), 'LOAD-TEST-REPORT.txt');
const SERVER_URL = 'http://localhost:3001';
const ENDPOINTS = [
  '/api/health',
  '/api/auth/status',
  '/api/items',
];

// Limpar relatório anterior
writeFileSync(REPORT_FILE, '');

function log(message) {
  console.log(message);
  appendFileSync(REPORT_FILE, message + '\n');
}

function logJson(obj) {
  const json = JSON.stringify(obj, null, 2);
  console.log(json);
  appendFileSync(REPORT_FILE, json + '\n');
}

async function runPhase(label, requestsPerSecond, duration = 10) {
  log('\n' + '═'.repeat(70));
  log(`🔥 FASE: ${label}`);
  log(`📊 Requests/s: ${requestsPerSecond} | Duração: ${duration}s`);
  log('═'.repeat(70));

  const result = await autocannon({
    url: SERVER_URL,
    connections: Math.ceil(requestsPerSecond / 100),
    duration,
    pipelining: Math.ceil(requestsPerSecond / 50),
    requests: ENDPOINTS.map((path) => ({ path })),
    bailout: 5000,
    setupClient(client) {
      // Sem setup
    },
    callbacks: {
      onProgress(progress) {
        // Silent
      },
    },
  });

  const stats = {
    throughput: result.throughput.average,
    requests: result.requests.total,
    errors: result.errors + result.timeouts,
    latency: {
      min: result.latency.min,
      max: result.latency.max,
      mean: result.latency.mean,
      p95: result.latency.p95,
      p99: result.latency.p99,
    },
    statusCodes: result.statusCodeStats,
  };

  log(`\n✅ Resultados da Fase:`);
  logJson(stats);

  return stats;
}

async function main() {
  log('╔═══════════════════════════════════════════════════════════════════╗');
  log('║           LOAD TEST REPORT - FASE A FASE                          ║');
  log('║           Estabilidade do Servidor localhost:3001                  ║');
  log('╚═══════════════════════════════════════════════════════════════════╝');
  log(`\nTimestamp: ${new Date().toISOString()}`);
  log(`Server URL: ${SERVER_URL}`);
  log(`Endpoints testados: ${ENDPOINTS.join(', ')}`);

  const allResults = {};

  try {
    // Fase 1: 100 req/s
    allResults.phase1 = await runPhase('BAIXA CARGA (100 req/s)', 100, 15);

    // Fase 2: 500 req/s
    allResults.phase2 = await runPhase('MÉDIA CARGA (500 req/s)', 500, 15);

    // Fase 3: 1000 req/s
    allResults.phase3 = await runPhase('ALTA CARGA (1000 req/s)', 1000, 15);

    // Resumo
    log('\n' + '═'.repeat(70));
    log('📈 RESUMO EXECUTIVO');
    log('═'.repeat(70));

    log('\n1️⃣  FASE 1 (100 req/s):');
    log(`   Latência P95: ${allResults.phase1.latency.p95?.toFixed(2)}ms`);
    log(`   Erros: ${allResults.phase1.errors}`);
    log(`   Throughput: ${allResults.phase1.throughput?.toFixed(2)} req/s`);

    log('\n2️⃣  FASE 2 (500 req/s):');
    log(`   Latência P95: ${allResults.phase2.latency.p95?.toFixed(2)}ms`);
    log(`   Erros: ${allResults.phase2.errors}`);
    log(`   Throughput: ${allResults.phase2.throughput?.toFixed(2)} req/s`);

    log('\n3️⃣  FASE 3 (1000 req/s):');
    log(`   Latência P95: ${allResults.phase3.latency.p95?.toFixed(2)}ms`);
    log(`   Erros: ${allResults.phase3.errors}`);
    log(`   Throughput: ${allResults.phase3.throughput?.toFixed(2)} req/s`);

    // Análise
    log('\n📊 ANÁLISE:');
    const phase1Errors = allResults.phase1.errors;
    const phase2Errors = allResults.phase2.errors;
    const phase3Errors = allResults.phase3.errors;

    if (phase1Errors === 0 && phase2Errors === 0 && phase3Errors === 0) {
      log('✅ NENHUM ERRO EM NENHUMA FASE - SERVIDOR ESTÁVEL');
    } else {
      log(`⚠️  Erros detectados: P1=${phase1Errors}, P2=${phase2Errors}, P3=${phase3Errors}`);
    }

    const avgP95 = (allResults.phase1.latency.p95 + allResults.phase2.latency.p95 + allResults.phase3.latency.p95) / 3;
    log(`\n⏱️  Latência P95 média: ${avgP95.toFixed(2)}ms`);

    if (avgP95 < 100) {
      log('✅ EXCELENTE - P95 < 100ms');
    } else if (avgP95 < 500) {
      log('✅ BOM - P95 < 500ms');
    } else {
      log('⚠️  CRÍTICO - P95 > 500ms');
    }

    log('\n' + '═'.repeat(70));
    log(`✅ Teste concluído: ${new Date().toISOString()}`);
    log(`📄 Relatório salvo em: ${REPORT_FILE}`);
    log('═'.repeat(70));
  } catch (error) {
    log(`\n❌ ERRO DURANTE TESTE:`);
    log(error.message);
    if (error.stack) log(error.stack);
    process.exit(1);
  }
}

main();
