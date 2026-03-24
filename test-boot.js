#!/usr/bin/env node
/**
 * Teste final de boot -- Server deve iniciar mesmo com warnings TS
 */
import { spawn } from 'child_process';
import http from 'http';

console.log(`\n🚀 TESTE FINAL - Boot do Servidor ERP\n`);

const server = spawn('npm run dev', {
  cwd: process.cwd(),
  stdio: ['ignore', 'inherit', 'inherit'],
  shell: true,
  timeout: 120000,
});

// Teste HTTP
async function testHealth(port) {
  return new Promise(resolve => {
    const req = http.request({
      hostname: 'localhost',
      port,
      path: '/api/health',
      method: 'GET',
      timeout: 2000,
    }, res => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

// Tentar conexão em intervalos
let attempts = 0;
const interval = setInterval(async () => {
  attempts++;
  console.log(`[${new Date().toLocaleTimeString()}] Tentativa ${attempts}/50...`);
  
  for (const port of [3000, 3001, 3002]) {
    if (await testHealth(port)) {
      console.log(`\n✅ SUCESSO! Servidor respondendo em http://localhost:${port}/api/health\n`);
      clearInterval(interval);
      server.kill();
      process.exit(0);
    }
  }
  
  if (attempts > 50) {
    console.log(`\n❌ Servidor não respondeu após 50 tentativas (50s)\n`);
    clearInterval(interval);
    server.kill();
    process.exit(1);
  }
}, 1000);

// Timeout após 120s
setTimeout(() => {
  clearInterval(interval);
  console.log('\n⏱ Timeout de 120s atingido\n');
  server.kill();
  process.exit(1);
}, 120000);

process.on('SIGINT', () => {
  clearInterval(interval);
  server.kill();
  process.exit(1);
});
