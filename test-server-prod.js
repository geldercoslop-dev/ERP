#!/usr/bin/env node
/**
 * Script para testar servidor na porta 3000 (padrão)
 */
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const PORTS = [3000, 3001, 3002];  // Testar múltiplas portas
let SERVER_PORT = 3000;

console.log(`🚀 TESTE DE BOOT - Servidor ERP`);
console.log(`═════════════════════════════════════════════════\n`);

const server = spawn('npm run dev', {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true,
  timeout: 60000,
});

let foundPort = false;
let startTime = Date.now();

// Capture saída
server.stdout.on('data', (data) => {
  const output = data.toString();
  process.stdout.write(output);
  
  // Detectar porta a partir da saída
  const match = output.match(/http:\/\/localhost:(\d+)/);
  if (match && !foundPort) {
    SERVER_PORT = parseInt(match[1]);
    foundPort = true;
    console.log(`\n✅ Detectada porta: ${SERVER_PORT}`);
  }
});

server.stderr.on('data', (data) => {
  process.stderr.write(data);
});

// Tester
async function testPort(port) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: port,
      path: '/api/health',
      method: 'GET',
      timeout: 2000,
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => { resolve(res.statusCode === 200); });
    });
    req.on('error', () => { resolve(false); });
    req.end();
  });
}

async function waitForServer() {
  let attempts = 0;
  const maxAttempts = 60; // 60 segundos
  
  while (attempts < maxAttempts) {
    // Testar porta detectada (se encontrada)
    if (foundPort) {
      if (await testPort(SERVER_PORT)) {
        return true;
      }
    } else {
      // Testar portas padrão
      for (const port of PORTS) {
        if (await testPort(port)) {
          SERVER_PORT = port;
          return true;
        }
      }
    }
    
    attempts++;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return false;
}

// Aguardar boot
const testPromise = waitForServer();

const timeout = setTimeout(() => {
  console.log('\n⏱ Timeout: Servidor não respondeu em 60s');
  server.kill();
  process.exit(1);
}, 60000);

testPromise.then(success => {
  clearTimeout(timeout);
  
  if (success) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n✅ SUCESSO! Servidor respondendo em http://localhost:${SERVER_PORT}/api/health`);
    console.log(`   Tempo de boot: ${elapsed}s`);
    
    // Manter servidor rodando por mais 3 segundos para testes
    setTimeout(() => {
      server.kill();
      console.log('\n✅ Teste finalizado com SUCESSO!');
      process.exit(0);
    }, 3000);
  } else {
    console.log('\n❌ FALHA: Servidor não respondeu no /api/health');
    server.kill();
    process.exit(1);
  }
});

process.on('SIGINT', () => {
  clearTimeout(timeout);
  server.kill();
  process.exit(1);
});
