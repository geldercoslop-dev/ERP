#!/usr/bin/env node

/**
 * TESTE REAL: AUTENTICAÇÃO JWT
 * Testa tokens expirados, inválidos e refresh
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

console.log('='.repeat(60));
console.log('TESTE REAL: AUTENTICAÇÃO JWT');
console.log('='.repeat(60));

// Configurações de teste
const ACCESS_SECRET = 'test-access-secret-boot';
const REFRESH_SECRET = 'test-refresh-secret-boot';

function generateTokens(userId, role = 'user') {
  const accessPayload = {
    userId,
    role,
    type: 'access',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (15 * 60) // 15 minutos
  };
  
  const refreshPayload = {
    userId,
    role,
    type: 'refresh',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 dias
  };
  
  return {
    accessToken: jwt.sign(accessPayload, ACCESS_SECRET),
    refreshToken: jwt.sign(refreshPayload, REFRESH_SECRET)
  };
}

function generateExpiredToken(userId, role = 'user') {
  const payload = {
    userId,
    role,
    type: 'access',
    iat: Math.floor(Date.now() / 1000) - (16 * 60), // 16 minutos atrás
    exp: Math.floor(Date.now() / 1000) - (1 * 60) // expirou há 1 minuto
  };
  
  return jwt.sign(payload, ACCESS_SECRET);
}

function generateInvalidToken() {
  // Token com assinatura inválida
  return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid-signature';
}

function testTokenValidation() {
  console.log('\n🔍 Testando validação de tokens...');
  
  // 1. Token válido
  console.log('\n1. TOKEN VÁLIDO:');
  const validTokens = generateTokens(1, 'user');
  console.log(`   Access Token: ${validTokens.accessToken.substring(0, 50)}...`);
  
  try {
    const decoded = jwt.verify(validTokens.accessToken, ACCESS_SECRET);
    console.log('   ✅ Token válido decodificado');
    console.log(`   User ID: ${decoded.userId}, Role: ${decoded.role}`);
  } catch (error) {
    console.log('   ❌ Erro ao decodificar token válido:', error.message);
  }
  
  // 2. Token expirado
  console.log('\n2. TOKEN EXPIRADO:');
  const expiredToken = generateExpiredToken(1, 'user');
  console.log(`   Expired Token: ${expiredToken.substring(0, 50)}...`);
  
  try {
    const decoded = jwt.verify(expiredToken, ACCESS_SECRET);
    console.log('   ❌ Token expirado foi aceito (BUG!)');
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      console.log('   ✅ Token expirado rejeitado corretamente');
    } else {
      console.log('   ⚠️ Erro diferente:', error.message);
    }
  }
  
  // 3. Token inválido
  console.log('\n3. TOKEN INVÁLIDO:');
  const invalidToken = generateInvalidToken();
  console.log(`   Invalid Token: ${invalidToken.substring(0, 50)}...`);
  
  try {
    const decoded = jwt.verify(invalidToken, ACCESS_SECRET);
    console.log('   ❌ Token inválido foi aceito (BUG!)');
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      console.log('   ✅ Token inválido rejeitado corretamente');
    } else {
      console.log('   ⚠️ Erro diferente:', error.message);
    }
  }
  
  // 4. Refresh token
  console.log('\n4. REFRESH TOKEN:');
  console.log(`   Refresh Token: ${validTokens.refreshToken.substring(0, 50)}...`);
  
  try {
    const decoded = jwt.verify(validTokens.refreshToken, REFRESH_SECRET);
    console.log('   ✅ Refresh token válido decodificado');
    console.log(`   User ID: ${decoded.userId}, Role: ${decoded.role}`);
  } catch (error) {
    console.log('   ❌ Erro ao decodificar refresh token:', error.message);
  }
}

function testMiddlewareIntegration() {
  console.log('\n🔍 Testando integração com middleware...');
  
  // Verificar se o middleware de auth existe
  const fs = require('fs');
  const path = require('path');
  
  const middlewarePath = path.join(__dirname, 'server', 'middlewares', 'jwt-auth-middleware.ts');
  
  if (fs.existsSync(middlewarePath)) {
    console.log('   ✅ Middleware JWT encontrado');
    
    // Ler conteúdo para verificar implementação
    const content = fs.readFileSync(middlewarePath, 'utf8');
    
    if (content.includes('TokenExpiredError')) {
      console.log('   ✅ Middleware trata TokenExpiredError');
    } else {
      console.log('   ⚠️ Middleware pode não tratar TokenExpiredError');
    }
    
    if (content.includes('JsonWebTokenError')) {
      console.log('   ✅ Middleware trata JsonWebTokenError');
    } else {
      console.log('   ⚠️ Middleware pode não tratar JsonWebTokenError');
    }
    
    if (content.includes('verify')) {
      console.log('   ✅ Middleware usa jwt.verify');
    } else {
      console.log('   ❌ Middleware não usa jwt.verify');
    }
  } else {
    console.log('   ❌ Middleware JWT não encontrado');
  }
}

function testAuthEndpoints() {
  console.log('\n🔍 Verificando endpoints de auth...');
  
  // Verificar se há endpoints de auth
  const fs = require('fs');
  const path = require('path');
  
  const routersPath = path.join(__dirname, 'server', 'routers');
  
  if (fs.existsSync(routersPath)) {
    const authRouter = path.join(routersPath, 'smart-auth.ts');
    
    if (fs.existsSync(authRouter)) {
      console.log('   ✅ Router de auth encontrado');
      
      const content = fs.readFileSync(authRouter, 'utf8');
      
      if (content.includes('login')) {
        console.log('   ✅ Endpoint login implementado');
      }
      
      if (content.includes('refresh')) {
        console.log('   ✅ Endpoint refresh implementado');
      }
      
      if (content.includes('logout')) {
        console.log('   ✅ Endpoint logout implementado');
      }
    } else {
      console.log('   ❌ Router de auth não encontrado');
    }
  }
}

// Executar testes
console.log('🚀 Iniciando testes de autenticação...');

testTokenValidation();
testMiddlewareIntegration();
testAuthEndpoints();

console.log('\n' + '='.repeat(60));
console.log('RESUMO DOS TESTES DE AUTH');
console.log('='.repeat(60));

console.log('\n💡 Para testes completos com servidor:');
console.log('1. Inicie o servidor: pnpm run dev');
console.log('2. Faça login: curl -X POST http://localhost:3001/api/trpc/auth.login -d {...}');
console.log('3. Teste com token expirado: espere 15 minutos e use o access token');
console.log('4. Teste com token inválido: modifique o token e use');
console.log('5. Teste refresh: use o refresh token para obter novo access');

console.log('\n📝 Comandos úteis:');
console.log('   # Gerar token expirado manualmente');
console.log('   node -e "console.log(require(\'jsonwebtoken\').sign({userId:1,exp:Date.now()/1000-60},\'secret\'))"');
console.log('');
console.log('   # Verificar token');
console.log('   node -e "console.log(require(\'jsonwebtoken\').verify(\'TOKEN\',\'secret\'))"');
