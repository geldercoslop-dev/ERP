#!/usr/bin/env node
/**
 * Script para testar servidor com mais tempo e debug
 */
import { spawn } from 'child_process';
import http from 'http';

const PORT = process.env.PORT || 3001;
const HEALTH_URL = `http://localhost:${PORT}/health`;

console.log(`🚀 Teste Detalhado de Boot`);
console.log(`═════════════════════════════════════════════════\n`);
console.log(`Porta: ${PORT}\nURL: ${HEALTH_URL}\n`);

const server = spawn('npm', ['run', 'dev'], {
  cwd: process.cwd(),
  stdio: 'pipe',
  shell: false,
  timeout: 60000,
});

let serverOutput = '';
let serverReady = false;

// Capture output
server.stdout.on('data', (data) => {
  const output = data.toString();
  serverOutput += output;
  
  // Check se servidor iniciou
  if (output.includes('listening') || output.includes('running') || output.includes('port')) {
    serverReady = true;
    console.log('✅ Servidor iniciou!');
  }
  
  // Print output
  process.stdout.write(output);
});

server.stderr.on('data', (data) => {
  const output = data.toString();
  serverOutput += output;
  process.stderr.write(output);
});

// Tester função
async function testConnection(attempt = 1) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: '/health',
      method: 'GET',
      timeout: 3000,
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          success: res.statusCode === 200,
          statusCode: res.statusCode,
          response: data.substring(0, 200),
        });
      });
    });
    
    req.on('error', (err) => {
      resolve({
        success: false,
        error: err.message,
        attempt,
      });
    });
    
    req.end();
  });
}

// Tester loop
let attempts = 0;
const tester = setInterval(async () => {
  attempts++;
  console.log(`\n🔍 Tentativa ${attempts}: Testando /health...`);
  
  const result = await testConnection(attempts);
  
  if (result.success) {
    console.log(`✅ SUCESSO na tentativa ${attempts}!`);
    console.log(`   Status: ${result.statusCode}`);
    console.log(`   Response: ${result.response}`);
    clearInterval(tester);
    server.kill();
    console.log('\n✅ Teste concluído com SUCESSO!');
    process.exit(0);
  } else {
    console.log(`❌ Falha: ${result.error}`);
  }
  
  if (attempts > 20) {
    console.log('\n❌ Excedeu tentativas máximas');
    clearInterval(tester);
    server.kill();
    process.exit(1);
  }
}, 1500);

setTimeout(() => {
  clearInterval(tester);
  server.kill();
  console.log('\n⏱ Timeout: Servidor não iniciou em tempo');
  process.exit(1);
}, 60000);

process.on('SIGINT', () => {
  clearInterval(tester);
  server.kill();
  process.exit(1);
});
