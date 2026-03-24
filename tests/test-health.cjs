#!/usr/bin/env node

const http = require('http');

function checkHealth() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/',
      method: 'GET',
      timeout: 3000,
    };

    const req = http.request(options, (res) => {
      console.log(`✅ Server respondeu: Status ${res.statusCode}`);
      resolve(true);
    });

    req.on('error', (e) => {
      console.log(`❌ Erro na conexão: ${e.message}`);
      resolve(false);
    });

    req.on('timeout', () => {
      console.log(`❌ Timeout na conexão`);
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

async function main() {
  console.log('🔍 Verificando saúde do servidor...');
  const healthy = await checkHealth();
  process.exit(healthy ? 0 : 1);
}

main();
