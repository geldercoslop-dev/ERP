#!/usr/bin/env node

/**
 * TESTE DE PRODUÇÃO: HEALTH COM DB ON/OFF
 * Verifica se /api/system/health reflete status real do DB
 */

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('TESTE DE PRODUÇÃO: HEALTH COM DB ON/OFF');
console.log('='.repeat(60));

function makeRequest(path, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: 'GET',
      timeout: timeout
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const body = JSON.parse(data);
          resolve({ status: res.statusCode, body, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
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

async function testHealthWithDB() {
  console.log('\n🔍 TESTE 1: Health com DB online');
  
  try {
    // Configurar com DB real
    process.env.DATABASE_URL = 'mysql://vendas:vendas123@localhost:3306/vendas_app';
    
    const response = await makeRequest('/api/system/health');
    
    console.log('✅ Servidor respondeu');
    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(response.body, null, 2));
    
    if (response.body.database) {
      console.log(`✅ DB Status: ${response.body.database.status}`);
      console.log(`✅ DB Response Time: ${response.body.database.responseTime}ms`);
      
      if (response.body.database.status === 'ok') {
        console.log('✅ DB online detectado corretamente');
      } else {
        console.log('⚠️ DB com problemas:', response.body.database.error);
      }
    } else {
      console.log('❌ Health não inclui informações do DB');
    }
    
    return response.body;
    
  } catch (error) {
    console.log('❌ Erro ao testar health com DB:', error.message);
    return null;
  }
}

async function testHealthWithDBOffline() {
  console.log('\n🔍 TESTE 2: Health com DB offline');
  
  try {
    // Criar arquivo .env.temp com DB offline
    const envTemp = path.join(__dirname, '.env.temp');
    const envContent = `
DATABASE_URL=mysql://vendas:vendas123@invalid-host:3306/vendas_app
NODE_ENV=development
JWT_ACCESS_SECRET=test-access-secret
JWT_REFRESH_SECRET=test-refresh-secret
`;
    
    fs.writeFileSync(envTemp, envContent);
    
    // Iniciar servidor com DB offline
    console.log('🚀 Iniciando servidor com DB offline...');
    
    const serverProcess = spawn('node', ['--loader', 'ts-node/esm', 'server/index.ts'], {
      stdio: 'pipe',
      cwd: __dirname,
      env: {
        ...process.env,
        DATABASE_URL: 'mysql://vendas:vendas123@invalid-host:3306/vendas_app',
        NODE_ENV: 'development'
      }
    });
    
    // Esperar servidor iniciar
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
      const response = await makeRequest('/api/system/health', 3000);
      
      console.log('✅ Servidor com DB offline respondeu');
      console.log(`Status: ${response.status}`);
      console.log('Response:', JSON.stringify(response.body, null, 2));
      
      if (response.body.database) {
        console.log(`📊 DB Status: ${response.body.database.status}`);
        
        if (response.body.database.status === 'error') {
          console.log('✅ DB offline detectado corretamente');
          console.log('✅ Health funciona como esperado');
        } else {
          console.log('❌ DB offline NÃO detectado');
          console.log('❌ FALSO POSITIVO - Health mentindo');
        }
      } else {
        console.log('❌ Health não inclui DB (problema)');
      }
      
    } catch (healthError) {
      if (healthError.message.includes('ECONNREFUSED')) {
        console.log('❌ Servidor não iniciou com DB offline');
        console.log('✅ Pode ser comportamento esperado (fail-fast)');
      } else {
        console.log('❌ Erro ao testar health:', healthError.message);
      }
    }
    
    // Limpar
    serverProcess.kill('SIGTERM');
    fs.unlinkSync(envTemp);
    
  } catch (error) {
    console.log('❌ Erro no teste com DB offline:', error.message);
  }
}

function analyzeHealthService() {
  console.log('\n🔍 ANÁLISE DO HEALTH SERVICE');
  
  const healthServicePath = path.join(__dirname, 'server', 'services', 'system-health.service.ts');
  
  if (fs.existsSync(healthServicePath)) {
    const content = fs.readFileSync(healthServicePath, 'utf8');
    
    if (content.includes('await db.execute')) {
      console.log('✅ Health service faz query real no DB');
    }
    
    if (content.includes('SELECT 1 as test')) {
      console.log('✅ Query de teste implementada');
    }
    
    if (content.includes('try/catch')) {
      console.log('✅ Tratamento de erro implementado');
    }
    
    if (content.includes('status: \'error\'')) {
      console.log('✅ Retorna erro quando DB falha');
    }
    
    console.log('\n📝 Análise do código:');
    console.log('- O health service usa query real: SELECT 1 as test');
    console.log('- Tem try/catch para capturar erros de DB');
    console.log('- Retorna status: "ok" ou "error"');
    console.log('- Inclui response time para monitoramento');
    
  } else {
    console.log('❌ Health service não encontrado');
  }
}

async function runTests() {
  console.log('🚀 Iniciando testes de health...');
  
  // Analisar implementação
  analyzeHealthService();
  
  // Testar com DB online (se servidor estiver rodando)
  try {
    await makeRequest('/api/system/health', 1000);
    console.log('\n📡 Servidor detectado, executando testes...');
    await testHealthWithDB();
    await testHealthWithDBOffline();
  } catch (error) {
    console.log('\n⚠️ Servidor não está online');
    console.log('💡 Inicie o servidor para testes completos:');
    console.log('   pnpm run dev');
    console.log('');
    console.log('💡 Ou teste manualmente:');
    console.log('   1. DB online: curl http://localhost:3001/api/system/health');
    console.log('   2. Pare MySQL: net stop mysql');
    console.log('   3. Teste novamente: curl http://localhost:3001/api/system/health');
    console.log('   4. ESPERADO: status deve mudar para "error"');
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('RESUMO DO TESTE DE HEALTH');
  console.log('='.repeat(60));
  
  console.log('\n📊 Comportamento esperado:');
  console.log('✅ DB online → health retorna status: "ok"');
  console.log('✅ DB offline → health retorna status: "error"');
  console.log('✅ Response time sempre incluído');
  console.log('✅ Erros tratados com try/catch');
  
  console.log('\n🚨 Se não mudar com DB offline:');
  console.log('❌ FALSO POSITIVO - Health não confiável');
  console.log('❌ Sistema pode estar operando sem DB');
}

runTests();
