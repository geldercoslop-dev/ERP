#!/usr/bin/env node

const BASE_URL = 'http://localhost:3000';
const APP_SECRET = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

async function testAuth() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TESTE 1 — AUTH (sem token)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const response1 = await fetch(`${BASE_URL}/api/clientes`);
  console.log(`Status: ${response1.status}`);
  console.log(`Esperado: 401\n`);
  
  return response1.status === 401 ? '✔ PASSOU' : '❌ FALHOU';
}

async function testLogin() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TESTE 2 — LOGIN');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    const response = await fetch(`${BASE_URL}/api/trpc/auth.login?batch=1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Secret': APP_SECRET,
      },
      body: JSON.stringify({
        0: {
          json: {
            username: 'admin',
            password: 'admin123',
          }
        }
      })
    });
    
    const text = await response.text();
    console.log(`Status HTTP: ${response.status}`);
    console.log(`Response: ${text}\n`);
    
    if (response.ok) {
      try {
        const data = JSON.parse(text);
        const result = data?.[0]?.result?.data?.json;
        
        if (result?.ok && result?.sessionToken) {
          console.log(`✔ Login PASSOU`);
          console.log(`Usuário: ${result.name}`);
          console.log(`Role: ${result.role}`);
          console.log(`Token: ${result.sessionToken}\n`);
          
          // Salvar token para próximos testes
          return result.sessionToken;
        }
      } catch (e) {
        console.log(`Erro ao parsear JSON: ${e.message}`);
      }
    }
    
    console.log(`❌ Login FALHOU\n`);
    return null;
  } catch (error) {
    console.log(`❌ Erro na requisição: ${error.message}\n`);
    return null;
  }
}

async function testRequestWithToken(token) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TESTE 3 — REQUEST COM TOKEN');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const response = await fetch(`${BASE_URL}/api/clientes`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-tenant-id': '1',
      'X-App-Secret': APP_SECRET,
    }
  });
  
  console.log(`Status: ${response.status}`);
  console.log(`Esperado: 200\n`);
  
  if (response.ok) {
    const data = await response.json();
    console.log(`Dados: ${JSON.stringify(data).substring(0, 100)}...\n`);
    return '✔ PASSOU' ;
  }
  
  return '❌ FALHOU';
}

async function testSecurityBreak(token) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TESTE 4 — QUEBRA DE SEGURANÇA');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('Tentando acessar tenant 999 com token do tenant 1\n');
  
  const response = await fetch(`${BASE_URL}/api/clientes`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-tenant-id': '999',
      'X-App-Secret': APP_SECRET,
    }
  });
  
  console.log(`Status: ${response.status}`);
  console.log(`Esperado: 403 ou 401\n`);
  
  if (response.status === 403 || response.status === 401) {
    console.log(`✔ SEGURANÇA OK - Acesso bloqueado\n`);
    return '✔ PASSOU';
  } else if (response.ok) {
    console.log(`❌ FALHA CRÍTICA - Dados retornados!\n`);
    const data = await response.json();
    console.log(`Dados: ${JSON.stringify(data)}\n`);
    return '❌ FALHOU CRITICAMENTE';
  }
  
  return '❌ FALHOU';
}

async function runTests() {
  try {
    const test1 = await testAuth();
    console.log(`RESULTADO TESTE 1: ${test1}`);
    
    const token = await testLogin();
    if (token) {
      const test3 = await testRequestWithToken(token);
      console.log(`RESULTADO TESTE 3: ${test3}`);
      
      const test4 = await testSecurityBreak(token);
      console.log(`RESULTADO TESTE 4: ${test4}`);
    } else {
      console.log(`RESULTADO TESTE 2: ❌ FALHOU`);
      console.log(`Impossível executar testes 3 e 4\n`);
    }
    
  } catch (error) {
    console.error('Erro:', error);
  }
}

runTests();
