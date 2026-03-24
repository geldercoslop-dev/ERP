#!/usr/bin/env node

/**
 * TESTE DE GRACEFUL SHUTDOWN VIA HTTP
 * Inicia servidor + faz request HTTP para shutdown
 */

import { spawn } from 'child_process';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('='.repeat(80));
console.log('🔴 TEST: GRACEFUL SHUTDOWN VIA ENDPOINT');
console.log('='.repeat(80));
console.log('');

const PORT = 4000;
const child = spawn('node', ['--import', 'tsx', 'server/_core/index.ts'], {
  cwd: __dirname,
  stdio: 'pipe',
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(PORT),
    SHUTDOWN_FORCE_EXIT_MS: '15000',
    DATABASE_URL: process.env.DATABASE_URL || 'mysql://root:@localhost/test_erp',
    HARD_TEST_HTTP_SHUTDOWN: '1', // habilita endpoint de shutdown
  },
});

const startTime = Date.now();
let serverReady = false;
const logs = [];

child.stdout.on('data', (data) => {
  const msg = data.toString().trim();
  if (!msg) return;
  
  logs.push(msg);
  console.log(`[SRV] ${msg}`);
  
  if (msg.includes('listening') || msg.includes('3000') || msg.includes('4000')) {
    serverReady = true;
    console.log('✅ Server ready!');
    setTimeout(() => {
      console.log('');
      console.log('🔴 Chamando POST /api/shutdown...');
      triggerShutdown();
    }, 1500);
  }
  
  if (msg.includes('[SHUTDOWN] DONE')) {
    setTimeout(() => {
      console.log('');
      console.log('✅ Verificado: SHUTDOWN COMPLETO');
      process.exit(0);
    }, 500);
  }
});

child.stderr.on('data', (data) => {
  console.log(`[ERR] ${data}`);
  logs.push(data.toString());
});

function triggerShutdown() {
  const options = {
    hostname: 'localhost',
    port: PORT,
    path: '/api/shutdown',
    method: 'POST',
    timeout: 5000,
  };

  const req = http.request(options, (res) => {
    console.log(`HTTP ${res.statusCode}`);
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      console.log('Response:', body);
    });
  });

  req.on('error', (err) => {
    console.log('Request error:', err.message);
  });

  req.setTimeout(5000, () => req.destroy());
  req.write(JSON.stringify({ signal: 'HTTP_SHUTDOWN' }));
  req.end();
}

setTimeout(() => {
  console.error('❌ Timeout 60s');
  child.kill('SIGKILL');
  process.exit(1);
}, 60000);

process.on('exit', () => {
  child.kill();
});
