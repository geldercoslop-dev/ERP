#!/usr/bin/env node
/**
 * TESTE DE STRESS DO DATABASE - 20 CONEXÕES SIMULTÂNEAS
 * ⚙️ DevOps + DB Engineer
 * 
 * Valida:
 * ✔ Pool pode lidar com 20 conexões simultâneas
 * ✔ Não há ECONNRESET ou ETIMEDOUT
 * ✔ Query latency sob load
 * ✔ Pool stability
 */

const mysql = require('mysql2/promise');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

function log(color, label, msg = '') {
  const time = new Date().toLocaleTimeString();
  console.log(`${colors[color]}[${time}] ${label}${colors.reset} ${msg}`);
}

async function main() {
  log('bright', '═══════════════════════════════════════════════════════════════');
  log('bright', '🔥 TESTE DE STRESS - 20 CONEXÕES SIMULTÂNEAS');
  log('bright', '═══════════════════════════════════════════════════════════════');

  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'vendas',
    password: process.env.DB_PASSWORD || 'vendas123',
    database: process.env.DB_NAME || 'vendas_app',
    waitForConnections: true,
    connectionLimit: 50,  // Pool com 50 conexões
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 30000,
    connectTimeout: 10000,
    debug: false,
  };

  try {
    log('cyan', '▶ FASE 1: Criar Pool com 50 conexões');
    const pool = mysql.createPool(config);
    log('green', '  ✔ Pool criado');

    // Logger de erros do pool
    let poolErrors = [];
    (pool).on?.("error", (err) => {
      poolErrors.push({
        code: err.code,
        message: err.message,
        time: new Date().toISOString(),
      });
      console.error(`[Pool Error] ${err.code}: ${err.message}`);
    });

    // Teste 1: Teste simples de conexão
    log('cyan', '\n▶ FASE 2: Teste Simples (1 conexão)');
    const startSimple = Date.now();
    const conn1 = await pool.getConnection();
    const [result1] = await conn1.query('SELECT 1 as _test');
    conn1.release();
    const simpleTime = Date.now() - startSimple;
    log('green', `  ✔ Conexão + Query: ${simpleTime}ms`);

    // Teste 2: 5 conexões sequenciais
    log('cyan', '\n▶ FASE 3: 5 Conexões Sequenciais');
    const start5 = Date.now();
    let errors5 = 0;
    for (let i = 0; i < 5; i++) {
      try {
        const c = await pool.getConnection();
        const [r] = await c.query('SELECT ? as id', [i]);
        c.release();
      } catch (e) {
        errors5++;
        log('red', `  ✗ Connection ${i} failed: ${(e).message}`);
      }
    }
    const time5 = Date.now() - start5;
    log('green', `  ✔ 5 conexões em ${time5}ms (erros: ${errors5})`);

    // Teste 3: 20 conexões SIMULTÂNEAS
    log('cyan', '\n▶ FASE 4: 20 CONEXÕES SIMULTÂNEAS (⚡ STRESS)');
    const start20 = Date.now();
    let errors20 = 0;
    let slowQueries = 0;
    const latencies20 = [];

    const promise20 = await Promise.allSettled(
      Array(20).fill(0).map(async (_, i) => {
        const qStart = Date.now();
        try {
          const c = await pool.getConnection();
          const [r] = await c.query(
            'SELECT ? as id, DATABASE() as db, SLEEP(0.05)',
            [i]
          );
          c.release();
          
          const qTime = Date.now() - qStart;
          latencies20.push(qTime);
          
          if (qTime > 1000) {
            slowQueries++;
          }
          
          return { success: true, id: i, time: qTime };
        } catch (err) {
          errors20++;
          const qTime = Date.now() - qStart;
          latencies20.push(qTime);
          
          const e = err;
          return { 
            success: false, 
            id: i, 
            error: e.code,
            message: e.message,
            time: qTime 
          };
        }
      })
    );

    const time20 = Date.now() - start20;
    const successCount = promise20.filter((r) => r.status === 'fulfilled' && (r.value).success).length;
    const successRate = ((successCount / 20) * 100).toFixed(2);

    log('green', `  ✔ 20 conexões em ${time20}ms`);
    log('green', `  ✔ Taxa de sucesso: ${successCount}/20 (${successRate}%)`);
    
    if (errors20 > 0) {
      log('red', `  ✗ Erros: ${errors20}`);
    }
    
    if (slowQueries > 0) {
      log('yellow', `  ⚠️  Queries lentas (>1s): ${slowQueries}`);
    }

    // Teste 4: 50 conexões SIMULTÂNEAS (LIMITE DO POOL)
    log('cyan', '\n▶ FASE 5: 50 CONEXÕES SIMULTÂNEAS (⚡⚡ MÁXIMO STRESS)');
    const start50 = Date.now();
    let errors50 = 0;
    let slowQueries50 = 0;
    const latencies50 = [];

    const promises50 = await Promise.allSettled(
      Array(50).fill(0).map(async (_, i) => {
        const qStart = Date.now();
        try {
          const c = await pool.getConnection();
          const [r] = await c.query(
            'SELECT ? as id, SLEEP(0.02)',
            [i]
          );
          c.release();
          
          const qTime = Date.now() - qStart;
          latencies50.push(qTime);
          
          if (qTime > 1000) {
            slowQueries50++;
          }
          
          return { success: true, id: i, time: qTime };
        } catch (err) {
          errors50++;
          const qTime = Date.now() - qStart;
          latencies50.push(qTime);
          
          const e = err;
          log('red', `  ✗ Conn ${i}: ${e.code} - ${e.message}`);
          
          return { 
            success: false, 
            id: i, 
            error: e.code,
            message: e.message,
            time: qTime 
          };
        }
      })
    );

    const time50 = Date.now() - start50;
    const successCount50 = promises50.filter((r) => r.status === 'fulfilled' && (r.value).success).length;
    const successRate50 = ((successCount50 / 50) * 100).toFixed(2);

    log('green', `  ✔ 50 conexões em ${time50}ms`);
    log('green', `  ✔ Taxa de sucesso: ${successCount50}/50 (${successRate50}%)`);
    
    if (errors50 > 0) {
      log('red', `  ✗ Erros: ${errors50}`);
    }
    
    if (slowQueries50 > 0) {
      log('yellow', `  ⚠️  Queries lentas (>1s): ${slowQueries50}`);
    }

    // ANÁLISE DE LATÊNCIA
    log('cyan', '\n▶ FASE 6: Análise de Latência');
    
    const calcStats = (arr) => {
      const sorted = arr.sort((a, b) => a - b);
      return {
        min: sorted[0],
        max: sorted[sorted.length - 1],
        avg: (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2),
        p50: sorted[Math.floor(sorted.length * 0.5)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        p99: sorted[Math.floor(sorted.length * 0.99)],
      };
    };

    const stats20 = calcStats(latencies20);
    const stats50 = calcStats(latencies50);

    log('green', '  📊 Latência 20 conexões:');
    log('green', `    Min: ${stats20.min}ms, Max: ${stats20.max}ms, Avg: ${stats20.avg}ms`);
    log('green', `    P50: ${stats20.p50}ms, P95: ${stats20.p95}ms, P99: ${stats20.p99}ms`);

    log('green', '  📊 Latência 50 conexões:');
    log('green', `    Min: ${stats50.min}ms, Max: ${stats50.max}ms, Avg: ${stats50.avg}ms`);
    log('green', `    P50: ${stats50.p50}ms, P95: ${stats50.p95}ms, P99: ${stats50.p99}ms`);

    // CLEANUP
    await pool.end();

    // RELATÓRIO FINAL
    log('bright', '\n═══════════════════════════════════════════════════════════════');
    
    const allGood = errors20 === 0 && errors50 === 0 && slowQueries === 0 && slowQueries50 === 0;
    
    if (allGood) {
      log('green', '✅ TESTE DE STRESS PASSOU COM SUCESSO');
    } else {
      log('yellow', '⚠️  TESTE CONCLUÍDO COM AVISOS');
    }
    
    log('bright', '═══════════════════════════════════════════════════════════════');
    log('bright', 'RESUMO:');
    log('green', `  • Pool Size: 50 conexões`);
    log('green', `  • 20 conexões simultâneas: ${successCount}/20 ✔ (${successRate}%)`);
    log('green', `  • 50 conexões simultâneas: ${successCount50}/50 ✔ (${successRate50}%)`);
    log('green', `  • Total stress tests: ${successCount + successCount50}/70 ✔`);
    log('green', `  • Pool errors: ${poolErrors.length}`);
    
    if (slowQueries === 0 && slowQueries50 === 0) {
      log('green', `  • Queries lentas: 0 ✔`);
    } else {
      log('yellow', `  • Queries lentas: ${slowQueries + slowQueries50}`);
    }
    
    log('bright', '═══════════════════════════════════════════════════════════════\n');

    if (allGood) {
      process.exit(0);
    } else {
      process.exit(1);
    }

  } catch (error) {
    log('red', '❌ ERRO CRÍTICO:');
    log('red', '', (error).message);
    process.exit(1);
  }
}

main();
