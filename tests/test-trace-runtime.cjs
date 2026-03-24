#!/usr/bin/env node

/**
 * TESTE REAL: TRACE ID EM REQUESTS
 * Verifica se todas as requests têm traceId
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('TESTE REAL: TRACE ID EM REQUESTS');
console.log('='.repeat(60));

function makeRequest(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: 'GET',
      headers: headers,
      timeout: 5000
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

function testTraceMiddleware() {
  console.log('\n🔍 Verificando middleware de trace...');
  
  const middlewarePath = path.join(__dirname, 'server', '_core', 'index.ts');
  
  if (fs.existsSync(middlewarePath)) {
    const content = fs.readFileSync(middlewarePath, 'utf8');
    
    if (content.includes('traceId') || content.includes('trace-id')) {
      console.log('   ✅ Middleware de trace encontrado');
    } else {
      console.log('   ❌ Middleware de trace não encontrado');
    }
    
    if (content.includes('nanoid') || content.includes('uuid')) {
      console.log('   ✅ Geração de ID único implementada');
    }
    
    if (content.includes('requestLoggerMiddleware')) {
      console.log('   ✅ Logger de requisições com trace');
    }
  }
}

function testLoggerTrace() {
  console.log('\n🔍 Verificando logger com trace...');
  
  const loggerPath = path.join(__dirname, 'server', '_core', 'logger.ts');
  
  if (fs.existsSync(loggerPath)) {
    const content = fs.readFileSync(loggerPath, 'utf8');
    
    if (content.includes('traceId')) {
      console.log('   ✅ Logger suporta traceId');
    } else {
      console.log('   ❌ Logger não suporta traceId');
    }
    
    if (content.includes('systemLogger') && content.includes('traceId')) {
      console.log('   ✅ systemLogger usa traceId');
    }
  }
}

async function testTraceInRequests() {
  console.log('\n🔍 Testando traceId em requisições...');
  
  try {
    // Testar se servidor está online
    const response = await makeRequest('/api/system/health');
    
    console.log('   ✅ Servidor online');
    console.log(`   Status: ${response.status}`);
    
    // Verificar headers de resposta
    if (response.headers['x-trace-id'] || response.headers['trace-id']) {
      const traceId = response.headers['x-trace-id'] || response.headers['trace-id'];
      console.log(`   ✅ Trace ID encontrado no header: ${traceId}`);
    } else {
      console.log('   ❌ Trace ID não encontrado nos headers');
    }
    
    // Verificar se body tem traceId
    if (response.body && typeof response.body === 'object') {
      if (response.body.traceId) {
        console.log(`   ✅ Trace ID no body: ${response.body.traceId}`);
      } else {
        console.log('   ⚠️ Trace ID não encontrado no body');
      }
    }
    
    // Testar múltiplas requisições
    console.log('\n   Testando múltiplas requisições...');
    const requests = [];
    
    for (let i = 0; i < 3; i++) {
      const res = await makeRequest('/api/system/health');
      const traceId = res.headers['x-trace-id'] || res.headers['trace-id'];
      requests.push(traceId);
    }
    
    // Verificar se traceIds são únicos
    const uniqueIds = [...new Set(requests)];
    
    if (uniqueIds.length === requests.length) {
      console.log('   ✅ Trace IDs são únicos por requisição');
    } else {
      console.log('   ❌ Trace IDs não são únicos');
    }
    
    console.log('   Trace IDs gerados:', requests);
    
  } catch (error) {
    if (error.message.includes('ECONNREFUSED')) {
      console.log('   ❌ Servidor não está online');
      console.log('   💡 Inicie o servidor com: pnpm run dev');
    } else {
      console.log('   ❌ Erro na requisição:', error.message);
    }
  }
}

function testTraceInLogs() {
  console.log('\n🔍 Verificando trace em logs...');
  
  const logFiles = [
    path.join(__dirname, 'server.log'),
    path.join(__dirname, 'logs', 'server.log'),
    path.join(__dirname, 'logs', 'app.log')
  ];
  
  let foundLogs = false;
  
  logFiles.forEach(logFile => {
    if (fs.existsSync(logFile)) {
      foundLogs = true;
      console.log(`   📁 Verificando ${logFile}...`);
      
      try {
        const content = fs.readFileSync(logFile, 'utf8');
        const lines = content.split('\n').slice(-10); // últimas 10 linhas
        
        const traceLines = lines.filter(line => 
          line.includes('traceId') || 
          line.includes('trace-id') ||
          line.includes('"traceId"')
        );
        
        if (traceLines.length > 0) {
          console.log(`   ✅ ${traceLines.length} logs com traceId encontrados`);
          traceLines.slice(0, 3).forEach(line => {
            console.log(`      ${line.substring(0, 100)}...`);
          });
        } else {
          console.log('   ⚠️ Nenhum log com traceId encontrado');
        }
      } catch (e) {
        console.log('   ⚠️ Erro ao ler arquivo de log:', e.message);
      }
    }
  });
  
  if (!foundLogs) {
    console.log('   ⚠️ Nenhum arquivo de log encontrado');
    console.log('   💡 Logs podem estar em outro local ou não configurados');
  }
}

// Executar testes
console.log('🚀 Iniciando testes de trace ID...');

testTraceMiddleware();
testLoggerTrace();
testTraceInRequests();
testTraceInLogs();

console.log('\n' + '='.repeat(60));
console.log('RESUMO DOS TESTES DE TRACE ID');
console.log('='.repeat(60));

console.log('\n📊 Status esperado:');
console.log('✅ Middleware gera traceId para cada request');
console.log('✅ Logger inclui traceId em todas as mensagens');
console.log('✅ Headers de resposta incluem traceId');
console.log('✅ Trace IDs são únicos por request');

console.log('\n💡 Para testes completos:');
console.log('1. Inicie o servidor: pnpm run dev');
console.log('2. Faça várias requisições');
console.log('3. Verifique logs para traceId');
console.log('4. Verifique headers de resposta');

console.log('\n📝 Comandos úteis:');
console.log('   # Fazer requisição e ver headers');
console.log('   curl -v http://localhost:3001/api/system/health');
console.log('');
console.log('   # Verificar logs em tempo real');
console.log('   tail -f server.log | grep traceId');
