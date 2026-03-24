#!/usr/bin/env node
/**
 * Script para testar servidor com npm via shell
 */
import { spawn } from 'child_process';
import http from 'http';

const PORT = process.env.PORT || 3001;
const HEALTH_URL = `http://localhost:${PORT}/health`;

console.log(`🚀 Teste Detalhado de Boot`);
console.log(`═════════════════════════════════════════════════\n`);

const server = spawn('npm run dev', {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true,
  timeout: 60000,
});

const timeout = setTimeout(() => {
  console.log('\n⏱ Timeout: Servidor não iniciou em 60s');
  server.kill();
  process.exit(1);
}, 60000);

// Capture toda saída
server.stdout.on('data', (data) => {
  process.stdout.write(data);
});

server.stderr.on('data', (data) => {
  process.stderr.write(data);
});

// Tester loop
async function testConnection() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: '/health',
      method: 'GET',
      timeout: 2000,
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          success: res.statusCode === 200,
          statusCode: res.statusCode,
        });
      });
    });
    
    req.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
    
    req.end();
  });
}

let attempts = 0;
const tester = setInterval(async () => {
  attempts++;
  
  const result = await testConnection();
  
   if (result.success) {
    clearTimeout(timeout);
    clearInterval(tester);
    server.kill();
    console.log('\n✅ SERVIDOR OK - /health retornou 200!');
    process.exit(0);
  }
  
  if (attempts > 40) {
    clearTimeout(timeout);
    clearInterval(tester);
    server.kill();
    console.log('\n❌ Excedeu tentativas');
    process.exit(1);
  }
}, 1000);

process.on('SIGINT', () => {
  clearTimeout(timeout);
  clearInterval(tester);
  server.kill();
  process.exit(1);
});
