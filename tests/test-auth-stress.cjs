#!/usr/bin/env node

/**
 * TESTE DE STRESS: AUTENTICAÇÃO
 * Testa tokens expirados, inválidos e refresh sob carga
 */

const jwt = require('jsonwebtoken');
const http = require('http');
const https = require('https');

console.log('='.repeat(60));
console.log('TESTE DE STRESS: AUTENTICAÇÃO');
console.log('='.repeat(60));

// Configurações de teste
const ACCESS_SECRET = 'test-access-secret-boot';
const REFRESH_SECRET = 'test-refresh-secret-boot';

function generateTokens(userId, role = 'user', expired = false) {
  const now = Math.floor(Date.now() / 1000);
  const exp = expired ? now - 60 : now + (15 * 60); // expirado há 1 min ou 15 min
  
  const accessPayload = {
    userId,
    role,
    type: 'access',
    iat: now,
    exp
  };
  
  const refreshPayload = {
    userId,
    role,
    type: 'refresh',
    iat: now,
    exp: now + (7 * 24 * 60 * 60) // 7 dias
  };
  
  return {
    accessToken: jwt.sign(accessPayload, ACCESS_SECRET),
    refreshToken: jwt.sign(refreshPayload, REFRESH_SECRET),
    expired
  };
}

function generateInvalidToken() {
  // Token com assinatura inválida
  return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid-signature';
}

function makeRequest(path, token = null, method = 'GET') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      timeout: 5000
    };

    const client = http; // Usar HTTP para localhost
    
    const req = client.request(options, (res) => {
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

    if (method === 'POST') {
      req.write(JSON.stringify({}));
    }
    
    req.end();
  });
}

async function testValidToken() {
  console.log('\n🔍 TESTE 1: Token válido');
  
  const tokens = generateTokens(1, 'user', false);
  console.log(`   Token: ${tokens.accessToken.substring(0, 50)}...`);
  
  try {
    const response = await makeRequest('/api/system/health', tokens.accessToken);
    
    console.log(`   Status: ${response.status}`);
    
    if (response.status === 200) {
      console.log('   ✅ Token válido aceito');
    } else {
      console.log('   ❌ Token válido rejeitado');
      console.log('   Response:', response.body);
    }
    
  } catch (error) {
    console.log(`   ❌ Erro na requisição: ${error.message}`);
  }
}

async function testExpiredToken() {
  console.log('\n🔍 TESTE 2: Token expirado');
  
  const tokens = generateTokens(1, 'user', true);
  console.log(`   Token expirado: ${tokens.accessToken.substring(0, 50)}...`);
  
  try {
    const response = await makeRequest('/api/system/health', tokens.accessToken);
    
    console.log(`   Status: ${response.status}`);
    
    if (response.status === 401) {
      console.log('   ✅ Token expirado rejeitado corretamente');
      
      if (response.body.code === 'TOKEN_EXPIRED') {
        console.log('   ✅ Código de erro correto: TOKEN_EXPIRED');
      } else {
        console.log(`   ⚠️ Código inesperado: ${response.body.code}`);
      }
    } else {
      console.log('   ❌ Token expirado aceito (BUG!)');
      console.log('   Response:', response.body);
    }
    
  } catch (error) {
    console.log(`   ❌ Erro na requisição: ${error.message}`);
  }
}

async function testInvalidToken() {
  console.log('\n🔍 TESTE 3: Token inválido');
  
  const invalidToken = generateInvalidToken();
  console.log(`   Token inválido: ${invalidToken.substring(0, 50)}...`);
  
  try {
    const response = await makeRequest('/api/system/health', invalidToken);
    
    console.log(`   Status: ${response.status}`);
    
    if (response.status === 401) {
      console.log('   ✅ Token inválido rejeitado corretamente');
      
      if (response.body.code === 'TOKEN_INVALID') {
        console.log('   ✅ Código de erro correto: TOKEN_INVALID');
      } else {
        console.log(`   ⚠️ Código inesperado: ${response.body.code}`);
      }
    } else {
      console.log('   ❌ Token inválido aceito (BUG!)');
      console.log('   Response:', response.body);
    }
    
  } catch (error) {
    console.log(`   ❌ Erro na requisição: ${error.message}`);
  }
}

async function testNoToken() {
  console.log('\n🔍 TESTE 4: Sem token');
  
  try {
    const response = await makeRequest('/api/dashboard/insights', null);
    
    console.log(`   Status: ${response.status}`);
    
    if (response.status === 401) {
      console.log('   ✅ Requisição sem token rejeitada');
      
      if (response.body.code === 'TOKEN_MISSING') {
        console.log('   ✅ Código de erro correto: TOKEN_MISSING');
      } else {
        console.log(`   ⚠️ Código inesperado: ${response.body.code}`);
      }
    } else {
      console.log('   ❌ Requisição sem token aceita (BUG!)');
      console.log('   Response:', response.body);
    }
    
  } catch (error) {
    console.log(`   ❌ Erro na requisição: ${error.message}`);
  }
}

async function testRefreshToken() {
  console.log('\n🔍 TESTE 5: Refresh token');
  
  const tokens = generateTokens(1, 'user', false);
  console.log(`   Refresh token: ${tokens.refreshToken.substring(0, 50)}...`);
  
  try {
    // Testar endpoint de refresh via tRPC
    const response = await makeRequest(
      '/api/trpc/auth.refresh',
      null,
      'POST'
    );
    
    console.log(`   Status: ${response.status}`);
    
    if (response.status === 200) {
      console.log('   ✅ Endpoint de refresh acessível');
      
      if (response.body.result && response.body.result.data) {
        console.log('   ✅ Novo access token gerado');
        console.log(`   Novo token: ${response.body.result.data.accessToken?.substring(0, 30)}...`);
      } else {
        console.log('   ⚠️ Response sem novo token');
      }
    } else if (response.status === 401) {
      console.log('   ⚠️ Refresh requer autenticação');
    } else {
      console.log('   ❌ Erro inesperado');
      console.log('   Response:', response.body);
    }
    
  } catch (error) {
    console.log(`   ❌ Erro na requisição: ${error.message}`);
  }
}

async function testTokenStress() {
  console.log('\n🔍 TESTE 6: Stress de tokens');
  
  const validToken = generateTokens(1, 'user', false).accessToken;
  const expiredToken = generateTokens(2, 'user', true).accessToken;
  const invalidToken = generateInvalidToken();
  
  const testCases = [
    { name: 'Válido', token: validToken, expectedStatus: 200 },
    { name: 'Expirado', token: expiredToken, expectedStatus: 401 },
    { name: 'Inválido', token: invalidToken, expectedStatus: 401 },
    { name: 'Nulo', token: null, expectedStatus: 401 }
  ];
  
  console.log('   Executando testes em paralelo...');
  
  const promises = testCases.map(async (testCase) => {
    try {
      const start = Date.now();
      const response = await makeRequest('/api/system/health', testCase.token);
      const duration = Date.now() - start;
      
      return {
        name: testCase.name,
        status: response.status,
        expected: testCase.expectedStatus,
        duration,
        success: response.status === testCase.expectedStatus
      };
    } catch (error) {
      return {
        name: testCase.name,
        status: 'ERROR',
        expected: testCase.expectedStatus,
        error: error.message,
        success: false
      };
    }
  });
  
  const results = await Promise.all(promises);
  
  console.log('\n   Resultados:');
  results.forEach(result => {
    const icon = result.success ? '✅' : '❌';
    const duration = result.duration ? ` (${result.duration}ms)` : '';
    console.log(`   ${icon} ${result.name}: ${result.status} ${duration}`);
    
    if (!result.success && result.error) {
      console.log(`      Erro: ${result.error}`);
    }
  });
  
  const successCount = results.filter(r => r.success).length;
  console.log(`\n   Taxa de sucesso: ${successCount}/${results.length} (${Math.round(successCount/results.length*100)}%)`);
}

async function runAuthStressTests() {
  console.log('🚀 Iniciando testes de stress de autenticação...');
  
  // Verificar se servidor está online
  try {
    await makeRequest('/api/system/health');
    console.log('✅ Servidor online');
  } catch (error) {
    console.log('❌ Servidor não está online');
    console.log('💡 Inicie o servidor: pnpm run dev');
    return;
  }
  
  // Executar testes
  await testValidToken();
  await testExpiredToken();
  await testInvalidToken();
  await testNoToken();
  await testRefreshToken();
  await testTokenStress();
  
  console.log('\n' + '='.repeat(60));
  console.log('RESUMO DOS TESTES DE AUTH STRESS');
  console.log('='.repeat(60));
  
  console.log('\n📊 Status esperado:');
  console.log('✅ Token válido → 200 OK');
  console.log('✅ Token expirado → 401 com TOKEN_EXPIRED');
  console.log('✅ Token inválido → 401 com TOKEN_INVALID');
  console.log('✅ Sem token → 401 com TOKEN_MISSING');
  console.log('✅ Refresh endpoint → funcional');
  console.log('✅ Stress test → alta taxa de sucesso');
  
  console.log('\n🚨 Se algum falhar:');
  console.log('❌ Autenticação não está segura');
  console.log('❌ Sistema pode permitir acesso não autorizado');
}

runAuthStressTests();
