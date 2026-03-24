#!/usr/bin/env node

/**
 * TESTE REAL: HEALTH ENDPOINT COM DB
 * Verifica se /api/system/health realmente testa o DB
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('TESTE REAL: HEALTH ENDPOINT');
console.log('='.repeat(60));

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const body = JSON.parse(data);
          resolve({ status: res.statusCode, body });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
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

async function testHealthEndpoint() {
  try {
    console.log('🔍 Verificando se servidor está rodando...');
    
    // Testar se servidor está online
    try {
      const response = await makeRequest('/api/system/health');
      console.log('✅ Servidor está online');
      console.log(`Status: ${response.status}`);
      console.log('Response:', JSON.stringify(response.body, null, 2));
      
      // Verificar se tem informações de DB
      const health = response.body;
      if (health.database) {
        console.log('\n✅ Health endpoint inclui informações do DB');
        console.log(`DB Status: ${health.database.status}`);
        console.log(`DB Response Time: ${health.database.responseTime}ms`);
        
        if (health.database.status === 'ok') {
          console.log('✅ DB está saudável');
        } else if (health.database.status === 'error') {
          console.log('❌ DB com erro:', health.database.error);
        } else {
          console.log('⚠️ DB status desconhecido:', health.database.status);
        }
      } else {
        console.log('\n❌ Health endpoint NÃO inclui informações do DB');
        console.log('❌ Pode ser falso positivo');
      }
      
      // Verificar outras informações
      if (health.uptime) {
        console.log(`⏱️ Uptime: ${health.uptime}s`);
      }
      
      if (health.timestamp) {
        console.log(`🕐 Timestamp: ${health.timestamp}`);
      }
      
    } catch (error) {
      if (error.message.includes('ECONNREFUSED')) {
        console.log('❌ Servidor não está online');
        console.log('💡 Inicie o servidor com: pnpm run dev');
      } else {
        console.log('❌ Erro na requisição:', error.message);
      }
      return;
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('ANÁLISE DO HEALTH ENDPOINT');
    console.log('='.repeat(60));
    
    // Simular DB offline (se possível)
    console.log('\n💡 Para testar DB offline:');
    console.log('1. Pare o servidor MySQL');
    console.log('2. Faça uma requisição para /api/system/health');
    console.log('3. ESPERADO: status deve mudar para "error"');
    console.log('4. Se continuar "ok" → falso positivo');
    
    console.log('\n📝 Comandos para testar DB offline:');
    console.log('   # Parar MySQL (Windows)');
    console.log('   net stop mysql');
    console.log('   # ou');
    console.log('   sc stop mysql');
    console.log('');
    console.log('   # Testar health');
    console.log('   curl http://localhost:3001/api/system/health');
    console.log('');
    console.log('   # Restart MySQL');
    console.log('   net start mysql');
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

testHealthEndpoint();
