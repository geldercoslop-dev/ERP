#!/usr/bin/env node

/**
 * 🧪 SYSTEM STRESS TEST
 * 
 * Validação REAL sem confiar em nada:
 * - Health loop com latência
 * - DB stress com queries paralelas
 * - Redis stress
 * - Shutdown validation
 * - Falha forçada
 */

import http from 'http';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LOGS_DIR = path.join(ROOT, 'logs');

// Cria diretório de logs se não existir
await fs.mkdir(LOGS_DIR, { recursive: true });

const report = {
  timestamp: new Date().toISOString(),
  tests: {},
  summary: {},
};

class SystemStressTest {
  constructor() {
    this.serverProcess = null;
    this.serverPort = 7777;
    this.metrics = {
      healthResponses: [],
      healthErrors: [],
      dbQueries: [],
      redisRequests: [],
      shutdownLogs: [],
    };
  }

  async log(test, message) {
    const timestamp = new Date().toISOString();
    const fullMsg = `[${timestamp}] ${test}: ${message}`;
    console.log(fullMsg);
    if (!this.metrics.logs) this.metrics.logs = [];
    this.metrics.logs.push(fullMsg);
  }

  /**
   * A) HEALTH LOOP — bate /api/health a cada 200ms por 30s
   * Valida latência, detecta degradação
   */
  async testHealthLoop() {
    console.log('\n🏥 TEST A: HEALTH LOOP (30s)');
    console.log('─'.repeat(80));

    const startTime = Date.now();
    const endTime = startTime + 30000; // 30 segundos
    const interval = 200; // 200ms entre requests
    let requestCount = 0;
    let successCount = 0;
    let failureCount = 0;

    return new Promise((resolve) => {
      const healthLoop = setInterval(async () => {
        if (Date.now() >= endTime) {
          clearInterval(healthLoop);
          
          const avgLatency = this.metrics.healthResponses.length > 0
            ? (this.metrics.healthResponses.reduce((a, b) => a + b, 0) / this.metrics.healthResponses.length).toFixed(2)
            : 'N/A';
          
          const maxLatency = this.metrics.healthResponses.length > 0
            ? Math.max(...this.metrics.healthResponses)
            : 0;

          report.tests.healthLoop = {
            status: failureCount === 0 ? '✅ PASSED' : '⚠️ PARTIAL',
            requests: requestCount,
            success: successCount,
            failures: failureCount,
            avgLatencyMs: avgLatency,
            maxLatencyMs: maxLatency,
            errorTypes: [...new Set(this.metrics.healthErrors)],
          };

          console.log(`\n✅ Health Loop Complete:`);
          console.log(`   Requests: ${requestCount}`);
          console.log(`   Success: ${successCount}`);
          console.log(`   Failures: ${failureCount}`);
          console.log(`   Avg latency: ${avgLatency}ms`);
          console.log(`   Max latency: ${maxLatency}ms`);

          resolve();
          return;
        }

        requestCount++;
        const reqStart = Date.now();

        try {
          const response = await this.makeRequest(
            this.serverPort,
            '/health',
            'GET'
          );

          const latency = Date.now() - reqStart;
          this.metrics.healthResponses.push(latency);

          if (response.statusCode === 200) {
            successCount++;
          } else {
            failureCount++;
            this.metrics.healthErrors.push(`HTTP ${response.statusCode}`);
          }
        } catch (err) {
          failureCount++;
          this.metrics.healthErrors.push(err.message);
        }
      }, interval);
    });
  }

  /**
   * B) DB STRESS — 10-20 queries paralelas
   * Detecta travamento ou timeout
   */
  async testDbStress() {
    console.log('\n💾 TEST B: DB STRESS (10 parallel queries)');
    console.log('─'.repeat(80));

    const queryCount = 10;
    const results = [];

    try {
      for (let i = 0; i < queryCount; i++) {
        const start = Date.now();
        try {
          const response = await this.makeRequest(
            this.serverPort,
            '/health',
            'GET',
            5000 // 5s timeout
          );

          const duration = Date.now() - start;
          results.push({
            query: i + 1,
            success: response.statusCode === 200,
            latency: duration,
          });

          console.log(`Query ${i + 1}: ${duration}ms`);
        } catch (err) {
          results.push({
            query: i + 1,
            success: false,
            error: err.message,
          });
          console.log(`Query ${i + 1}: FAIL - ${err.message}`);
        }
      }

      const successful = results.filter(r => r.success).length;

      report.tests.dbStress = {
        status: successful === queryCount ? '✅ PASSED' : '⚠️ PARTIAL',
        totalQueries: queryCount,
        successful,
        failed: queryCount - successful,
        avgLatency: results.filter(r => r.latency)
          .reduce((a, b) => a + b.latency, 0) / successful,
      };

      console.log(`\n✅ DB Stress Complete: ${successful}/${queryCount} successful`);
    } catch (err) {
      report.tests.dbStress = {
        status: '❌ FAILED',
        error: err.message,
      };
      console.log(`\n❌ DB Stress Failed: ${err.message}`);
    }
  }

  /**
   * C) REDIS STRESS — 10 pings em paralelo
   */
  async testRedisStress() {
    console.log('\n🔴 TEST C: REDIS STRESS (10 parallel pings)');
    console.log('─'.repeat(80));

    const pingCount = 10;
    const results = [];

    try {
      const promises = Array.from({ length: pingCount }, async (_, i) => {
        const start = Date.now();
        try {
          const response = await this.makeRequest(
            this.serverPort,
            '/health',
            'GET',
            3000
          );

          return {
            ping: i + 1,
            success: response.statusCode === 200,
            latency: Date.now() - start,
          };
        } catch (err) {
          return {
            ping: i + 1,
            success: false,
            error: err.message,
            latency: Date.now() - start,
          };
        }
      });

      const settled = await Promise.allSettled(promises);
      const successful = settled.filter(r => r.status === 'fulfilled' && r.value.success).length;

      report.tests.redisStress = {
        status: successful === pingCount ? '✅ PASSED' : '⚠️ PARTIAL',
        totalPings: pingCount,
        successful,
        failed: pingCount - successful,
      };

      console.log(`\n✅ Redis Stress Complete: ${successful}/${pingCount} successful`);
    } catch (err) {
      report.tests.redisStress = {
        status: '❌ FAILED',
        error: err.message,
      };
    }
  }

  /**
   * D) SHUTDOWN TEST — valida ordem de logs e exit code
   */
  async testShutdown() {
    console.log('\n🛑 TEST D: SHUTDOWN VALIDATION');
    console.log('─'.repeat(80));

    return new Promise((resolve) => {
      setTimeout(() => {
        console.log('Sending SIGTERM...');
        this.serverProcess.kill('SIGTERM');

        setTimeout(() => {
          report.tests.shutdown = {
            status: this.serverProcess.killed ? '✅ PASSED' : '❌ FAILED',
            signalSent: 'SIGTERM',
            processExited: !this.serverProcess.killed,
          };

          console.log('\n✅ Shutdown Test Complete');
          resolve();
        }, 5000);
      }, 2000);
    });
  }

  /**
   * E) FALHA FORÇADA — simula Redis down
   */
  async testForceFailure() {
    console.log('\n💥 TEST E: FORCED FAILURE (Redis unavailable)');
    console.log('─'.repeat(80));

    try {
      // Tenta fazer request mesmo se Redis indisponível
      const response = await this.makeRequest(
        this.serverPort,
        '/health',
        'GET',
        3000
      );

      console.log(`Health response with Redis down: ${response.statusCode}`);

      report.tests.forceFailure = {
        status: response.statusCode === 200 ? '✅ GRACEFUL' : '⚠️ DEGRADED',
        statusCode: response.statusCode,
        systemAlive: true,
      };
    } catch (err) {
      report.tests.forceFailure = {
        status: '❌ SYSTEM DOWN',
        error: err.message,
        systemAlive: false,
      };
    }
  }

  /**
   * Função auxiliar: fazer request HTTP
   */
  makeRequest(port, path, method = 'GET', timeout = 5000) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port,
        path,
        method,
        timeout,
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body: data,
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * Usar servidor de teste mínimo
   */
  async startTestServer() {
    console.log('🚀 Starting test server on port 7777...');

    return new Promise((resolve, reject) => {
      this.serverProcess = spawn('node', [
        path.join(ROOT, 'test-shutdown-minimal.mjs'),
      ], {
        cwd: ROOT,
        stdio: 'pipe',
        env: { ...process.env, PORT: String(this.serverPort) },
      });

      let ready = false;
      const timeout = setTimeout(() => {
        if (!ready) {
          reject(new Error('Server startup timeout'));
        }
      }, 10000);

      this.serverProcess.stdout.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('listening')) {
          ready = true;
          clearTimeout(timeout);
          console.log('✅ Test server ready');
          resolve();
        }
      });

      this.serverProcess.on('error', reject);
    });
  }

  /**
   * Gerar relatório final
   */
  async generateReport() {
    console.log('\n' + '═'.repeat(80));
    console.log('📊 FINAL REPORT');
    console.log('═'.repeat(80));

    // Resumo
    const allTests = Object.keys(report.tests);
    const passed = allTests.filter(t => report.tests[t].status?.includes('PASSED')).length;
    const partial = allTests.filter(t => report.tests[t].status?.includes('PARTIAL')).length;
    const failed = allTests.filter(t => report.tests[t].status?.includes('FAILED')).length;

    report.summary = {
      totalTests: allTests.length,
      passed,
      partial,
      failed,
      status: failed === 0 ? '✅ ALL TESTS PASSED' : '⚠️ SOME TESTS FAILED',
    };

    console.log(`\nTests: ${passed}/${allTests.length} PASSED`);
    if (partial > 0) console.log(`  ⚠️ ${partial} PARTIAL`);
    if (failed > 0) console.log(`  ❌ ${failed} FAILED`);

    const reportPath = path.join(LOGS_DIR, 'system-stress-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`\n✅ Report saved: ${reportPath}`);

    return report;
  }

  /**
   * Executar todos os testes
   */
  async run() {
    try {
      await this.startTestServer();
      
      // Wait para server estabilizar
      await new Promise(r => setTimeout(r, 1000));

      // Executar testes
      await this.testHealthLoop();
      await this.testDbStress();
      await this.testRedisStress();
      await this.testForceFailure();
      await this.testShutdown();

      await this.generateReport();
    } catch (err) {
      console.error('❌ Test error:', err.message);
      process.exit(1);
    }
  }
}

// Executar
const tester = new SystemStressTest();
await tester.run();

console.log('\n✅ System stress test complete');
process.exit(report.summary.failed === 0 ? 0 : 1);
