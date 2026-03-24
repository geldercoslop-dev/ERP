#!/usr/bin/env node
/**
 * Script para testar servidor
 * 1. Iniciar npm run dev
 * 2. Esperar 10 segundos
 * 3. Testar /health endpoint
 * 4. Relatar resultado
 */
import { spawn } from 'child_process';
import http from 'http';
import https from 'https';

const PORT = process.env.PORT || 3001;
const HEALTH_URL = `http://localhost:${PORT}/health`;

console.log(`\n🚀 Teste de Boot do Servidor`);
console.log(`═══════════════════════════════════`);
console.log(`Porta: ${PORT}`);
console.log(`Health URL: ${HEALTH_URL}`);
console.log(`\n`);

// Iniciar servidor
const server = spawn('npm', ['run', 'dev'], {
  cwd: process.cwd(),
  stdio: 'pipe',
  shell: true,
});

let serverOutput = '';
let errorOccurred = false;

server.stdout.on('data', (data) => {
  const output = data.toString();
  serverOutput += output;
  // Print primeiro 1000 chars
  if (serverOutput.length <= 1000) {
    process.stdout.write(output);
  }
});

server.stderr.on('data', (data) => {
  const output = data.toString();
  serverOutput += output;
  if (serverOutput.length <= 1000) {
    process.stderr.write(output);
  }
});

async function testHealth() {
  return new Promise((resolve) => {
    http.get(HEALTH_URL, { timeout: 5000 }, (res) => {
      resolve({
        success: res.statusCode === 200,
        statusCode: res.statusCode,
      });
    }).on('error', (err) => {
      resolve({
        success: false,
        error: err.message,
      });
    });
  });
}

// Esperar 12 segundos e testar
setTimeout(async () => {
  console.log('\n\n📊 Testando /health endpoint...');
  const result = await testHealth();
  
  if (result.success) {
    console.log('✅ SUCESSO: Servidor respondeu com 200 OK');
  } else {
    console.log(`❌ FALHA: ${result.error || `Status ${result.statusCode}`}`);
  }
  
  // Mostrar log do servidor
  console.log('\n📋 Log do servidor (primeiras 1000 chars):');
  console.log('═══════════════════════════════════');
  console.log(serverOutput.substring(0, 1000));
  if (serverOutput.length > 1000) {
    console.log(`... (${serverOutput.length} chars total, truncado)`);
  }
  
  // Encerrar
  server.kill();
  if (result.success) {
    console.log('\n✅ Servidor está funcional!');
    process.exit(0);
  } else {
    console.log('\n❌ Servidor não está respondendo');
    process.exit(1);
  }
}, 12000);

process.on('SIGINT', () => {
  console.log('\n\nInterrompido pelo usuário');
  server.kill();
  process.exit(1);
});
