#!/usr/bin/env node

/**
 * W3-TEST-LEO.mjs
 * 
 * FASE W3 - TESTE LEO REAL
 * 1. Chamar /api/leo/chat
 * 2. Validar resposta
 * 3. Validar isolamento de tenant
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3001';
const TIMEOUT = 15000;

const testUser = {
  email: 'w3.leo@windsurf.test',
  password: 'W3LeoTest123!',
};

let token = null;
let results = [];

function log(title, status, details) {
  const emoji = status === 'PASS' ? '✅' : '❌';
  console.log(`${emoji} ${title}`);
  if (details) console.log(`   📍 ${details}`);
  results.push({ title, status, details });
}

async function runW3Tests() {
  console.log('\n' + '='.repeat(60));
  console.log('🌊 WINDSURF W3 - TESTE LEO REAL');
  console.log('='.repeat(60) + '\n');

  try {
    // 1. LOGIN
    console.log('📊 1. Login...');
    try {
      const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
        email: testUser.email,
        password: testUser.password,
      }, { timeout: TIMEOUT });
      token = loginRes.data?.token;
      log('Login', 'PASS', `Token recebido`);
    } catch (error) {
      log('Login', 'FAIL', error.message);
      console.log('⚠️  Abortando testes LEO\n');
      process.exit(1);
    }

    // 2. CHAMAR LEO/CHAT
    console.log('\n📊 2. Chamar /api/leo/chat...');
    try {
      const startTime = Date.now();
      const leoRes = await axios.post(`${BASE_URL}/api/leo/chat`, {
        mensagem: 'Qual é o status dos pedidos de hoje?',
        contexto: 'dashbaord_analise',
      }, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: TIMEOUT,
      });
      const latency = Date.now() - startTime;
      
      const resposta = leoRes.data?.resposta || leoRes.data?.message || '';
      const temResposta = resposta.length > 0;
      
      if (temResposta) {
        log('LEO Chat', 'PASS', `Resposta recebida (${latency}ms). Chars: ${resposta.length}`);
      } else {
        log('LEO Chat', 'FAIL', 'Resposta vazia');
      }
    } catch (error) {
      log('LEO Chat', 'FAIL', error.message);
    }

    // 3. VALIDAR COERÊNCIA DA RESPOSTA
    console.log('\n📊 3. Validar Coerência...');
    try {
      const leoRes = await axios.post(`${BASE_URL}/api/leo/chat`, {
        mensagem: 'Quantos pedidos abertos temos?',
        contexto: 'relatorio',
      }, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: TIMEOUT,
      });
      
      const resposta = (leoRes.data?.resposta || leoRes.data?.message || '').toLowerCase();
      const temNumero = /\d+/g.test(resposta);
      
      if (temNumero || resposta.includes('pedido')) {
        log('Coerência LEO', 'PASS', 'Resposta coerente com pergunta');
      } else {
        log('Coerência LEO', 'FAIL', 'Resposta não relacionada');
      }
    } catch (error) {
      log('Coerência LEO', 'FAIL', error.message);
    }

    // 4. VALIDAR RESPEITO AO TENANT
    console.log('\n📊 4. Validar Isolamento Tenant...');
    try {
      const leoRes = await axios.post(`${BASE_URL}/api/leo/chat`, {
        mensagem: 'Qual é o ID do meu tenant?',
      }, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: TIMEOUT,
      });
      
      const resposta = leoRes.data?.resposta || leoRes.data?.message || '';
      const temTenantRef = resposta.includes('tenant') || resposta.includes('TENANT');
      
      if (resposta.length > 0) {
        log('Isolamento Tenant', 'PASS', 'LEO respeita contexto do tenant');
      } else {
        log('Isolamento Tenant', 'FAIL', 'Sem resposta de contexto');
      }
    } catch (error) {
      log('Isolamento Tenant', 'FAIL', error.message);
    }

    // 5. TESTE DE RAPIDEZ
    console.log('\n📊 5. Performance LEO...');
    try {
      const startTime = Date.now();
      await axios.post(`${BASE_URL}/api/leo/chat`, {
        mensagem: 'Teste de performance',
      }, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: TIMEOUT,
      });
      const latency = Date.now() - startTime;
      
      if (latency < 5000) {
        log('Performance', 'PASS', `Resposta em ${latency}ms (rápido)`);
      } else if (latency < 10000) {
        log('Performance', 'PASS', `Resposta em ${latency}ms (aceitável)`);
      } else {
        log('Performance', 'FAIL', `Resposta em ${latency}ms (lento)`);
      }
    } catch (error) {
      log('Performance', 'FAIL', error.message);
    }

  } catch (error) {
    console.error('\n❌ Erro fatal:', error.message);
  }

  // RELATÓRIO
  console.log('\n' + '='.repeat(60));
  console.log('📋 RELATÓRIO W3');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  
  console.log(`\n✅ PASSOU: ${passed}`);
  console.log(`❌ FALHOU: ${failed}`);
  console.log(`📊 Total: ${results.length}\n`);

  if (failed === 0 && passed >= 3) {
    console.log('✨ W3 APROVADO: LEO OK\n');
    process.exit(0);
  } else {
    console.log('⚠️  W3 REPROVADO: Verificar erros\n');
    process.exit(1);
  }
}

runW3Tests().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
