#!/usr/bin/env node
import http from 'http';
import { writeFileSync, appendFileSync } from 'fs';
import path from 'path';

const REPORT_FILE = path.join(process.cwd(), 'LOAD-TEST-REPORT.txt');
const SERVER_URL = 'http://localhost:3001';

// Limpar relatório anterior
writeFileSync(REPORT_FILE, '');

function log(message) {
  console.log(message);
  appendFileSync(REPORT_FILE, message + '\n');
}

function makeRequest(url) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const latency = Date.now() - startTime;
        resolve({
          status: res.statusCode,
          latency,
          success: res.statusCode === 200,
        });
      });
    });

    req.on('error', () => {
      const latency = Date.now() - startTime;
      resolve({
        status: 0,
        latency,
        success: false,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const latency = Date.now() - startTime;
      resolve({
        status: 0,
        latency,
        success: false,
      });
    });

    req.end();
  });
}

async function runPhase(label, requestsPerSecond, phaseDuration = 10) {
  log('\n' + '═'.repeat(70));
  log(`🔥 FASE: ${label}`);
  log(`📊 Requisições/s alvo: ${requestsPerSecond} | Duração: ${phaseDuration}s`);
  log('═'.repeat(70));

  const endpoints = ['/api/health', '/api/auth/status', '/api/items'];
  const results = {
    total: 0,
    success: 0,
    errors: 0,
    latencies: [],
    statusCodes: {},
  };

  const startTime = Date.now();
  let requestCount = 0;
  const interval = (1000 / requestsPerSecond);

  log(`\n⏳ Executando requisições...`);

  return new Promise((resolve) => {
    const timer = setInterval(async () => {
      if (Date.now() - startTime > phaseDuration * 1000) {
        clearInterval(timer);
        
        // Calcular estatísticas
        results.latencies.sort((a, b) => a - b);
        const p50 = results.latencies[Math.floor(results.latencies.length * 0.50)];
        const p95 = results.latencies[Math.floor(results.latencies.length * 0.95)];
        const p99 = results.latencies[Math.floor(results.latencies.length * 0.99)];
        const avgLatency = results.latencies.reduce((a, b) => a + b, 0) / results.latencies.length;

        log(`\n✅ Resultados da Fase:`);
        log(`   Total de requisições: ${results.total}`);
        log(`   Sucesso: ${results.success}`);
        log(`   Erros: ${results.errors}`);
        log(`   Taxa de sucesso: ${((results.success / results.total) * 100).toFixed(2)}%`);
        log(`   Latência Média: ${avgLatency.toFixed(2)}ms`);
        log(`   Latência P50: ${p50 || 0}ms`);
        log(`   Latência P95: ${p95 || 0}ms`);
        log(`   Latência P99: ${p99 || 0}ms`);
        log(`   Estatuses: ${JSON.stringify(results.statusCodes)}`);

        resolve({
          total: results.total,
          success: results.success,
          errors: results.errors,
          avgLatency,
          p95,
          p99,
        });
        return;
      }

      // Fazer uma requisição
      const endpoint = endpoints[requestCount % endpoints.length];
      const url = SERVER_URL + endpoint;
      const result = await makeRequest(url);

      results.total++;
      results.latencies.push(result.latency);
      
      if (result.success) {
        results.success++;
      } else {
        results.errors++;
      }

      if (!results.statusCodes[result.status]) {
        results.statusCodes[result.status] = 0;
      }
      results.statusCodes[result.status]++;

      requestCount++;

      // Mostrar progresso a cada 100 requisições
      if (requestCount % 100 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const actualRps = requestCount / elapsed;
        process.stdout.write(`\r   ${requestCount} requisições | ${actualRps.toFixed(0)} req/s real | Erros: ${results.errors}`);
      }
    }, interval);
  });
}

async function main() {
  log('╔═══════════════════════════════════════════════════════════════════╗');
  log('║           LOAD TEST REPORT - FASE A FASE v2                      ║');
  log('║           Estabilidade do Servidor localhost:3001                  ║');
  log('╚═══════════════════════════════════════════════════════════════════╝');
  log(`\nTimestamp: ${new Date().toISOString()}`);
  log(`Server URL: ${SERVER_URL}`);
  log(`Endpoints testados: /api/health, /api/auth/status, /api/items`);

  const allResults = {};

  try {
    // Fase 1: 100 req/s
    allResults.phase1 = await runPhase('BAIXA CARGA (100 req/s)', 100, 10);

    // Fase 2: 500 req/s
    allResults.phase2 = await runPhase('MÉDIA CARGA (500 req/s)', 500, 10);

    // Fase 3: 1000 req/s
    allResults.phase3 = await runPhase('ALTA CARGA (1000 req/s)', 1000, 10);

    // Resumo
    log('\n' + '═'.repeat(70));
    log('📈 RESUMO EXECUTIVO - BEFORE HARDENING');
    log('═'.repeat(70));

    log('\n1️⃣  FASE 1 (100 req/s):');
    log(`   Total: ${allResults.phase1.total} | Sucesso: ${allResults.phase1.success} | Erros: ${allResults.phase1.errors}`);
    log(`   Latência P95: ${allResults.phase1.p95?.toFixed(2) || 'N/A'}ms`);
    log(`   Taxa de Sucesso: ${((allResults.phase1.success/allResults.phase1.total)*100).toFixed(2)}%`);

    log('\n2️⃣  FASE 2 (500 req/s):');
    log(`   Total: ${allResults.phase2.total} | Sucesso: ${allResults.phase2.success} | Erros: ${allResults.phase2.errors}`);
    log(`   Latência P95: ${allResults.phase2.p95?.toFixed(2) || 'N/A'}ms`);
    log(`   Taxa de Sucesso: ${((allResults.phase2.success/allResults.phase2.total)*100).toFixed(2)}%`);

    log('\n3️⃣  FASE 3 (1000 req/s):');
    log(`   Total: ${allResults.phase3.total} | Sucesso: ${allResults.phase3.success} | Erros: ${allResults.phase3.errors}`);
    log(`   Latência P95: ${allResults.phase3.p95?.toFixed(2) || 'N/A'}ms`);
    log(`   Taxa de Sucesso: ${((allResults.phase3.success/allResults.phase3.total)*100).toFixed(2)}%`);

    // Análise
    log('\n📊 ANÁLISE PRÉ-HARDENING:');
    const totalErrors = allResults.phase1.errors + allResults.phase2.errors + allResults.phase3.errors;
    
    if (totalErrors === 0) {
      log('✅ NENHUM ERRO - SERVIDOR ESTÁVEL');
    } else {
      log(`⚠️  Total de erros: ${totalErrors}`);
    }

    const avgP95 = (allResults.phase1.p95 + allResults.phase2.p95 + allResults.phase3.p95) / 3;
    log(`⏱️  Latência P95 média: ${avgP95.toFixed(2)}ms`);

    log('\n' + '═'.repeat(70));
    log(`✅ Teste PRÉ-HARDENING concluído: ${new Date().toISOString()}`);
    log('═'.repeat(70));
  } catch (error) {
    log(`\n❌ ERRO DURANTE TESTE:`);
    log(error.message);
    process.exit(1);
  }

  process.exit(0);
}

main();
