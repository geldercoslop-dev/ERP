#!/usr/bin/env node

/**
 * W4-TEST-LOAD.mjs
 * 
 * FASE W4 - TESTE DE CARGA
 * Simula 20-50 requisições paralelas
 * em /dashboard e /leo/chat
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3001';
const TIMEOUT = 30000;

const testUser = {
  email: 'w4.load@windsurf.test',
  password: 'W4LoadTest123!',
};

let token = null;
let results = [];
let errors = [];

function log(title, status, details) {
  const emoji = status === 'PASS' ? '✅' : '❌';
  console.log(`${emoji} ${title}`);
  if (details) console.log(`   📍 ${details}`);
  results.push({ title, status, details });
}

async function runW4Tests() {
  console.log('\n' + '='.repeat(60));
  console.log('🌊 WINDSURF W4 - TESTE DE CARGA');
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
      console.log('⚠️  Abortando testes de carga\n');
      process.exit(1);
    }

    // 2. TESTE DASHBOARD (30 requisições)
    console.log('\n📊 2. Teste de Carga: /dashboard (30 requisições)...');
    try {
      const dashboardPromises = [];
      for (let i = 0; i < 30; i++) {
        dashboardPromises.push(
          axios.get(`${BASE_URL}/api/dashboard`, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: TIMEOUT,
          }).catch(err => ({ error: true, message: err.message }))
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(dashboardPromises);
      const latency = Date.now() - startTime;

      const successful = responses.filter(r => !r.error && r.status === 200).length;
      const failed = responses.filter(r => r.error).length;
      const errors500 = responses.filter(r => r.status === 500).length;

      if (failed === 0 && errors500 === 0) {
        log('Dashboard Load', 'PASS', `30 req em ${latency}ms, 100% sucesso`);
      } else {
        log('Dashboard Load', 'FAIL', `Erros: ${failed}, Status 500: ${errors500}`);
      }
    } catch (error) {
      log('Dashboard Load', 'FAIL', error.message);
    }

    // 3. TESTE LEO/CHAT (20 requisições)
    console.log('\n📊 3. Teste de Carga: /leo/chat (20 requisições)...');
    try {
      const leoPromises = [];
      for (let i = 0; i < 20; i++) {
        leoPromises.push(
          axios.post(`${BASE_URL}/api/leo/chat`, {
            mensagem: `Query teste de carga ${i}`,
          }, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: TIMEOUT,
          }).catch(err => ({ error: true, message: err.message }))
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(leoPromises);
      const latency = Date.now() - startTime;

      const successful = responses.filter(r => !r.error && r.status === 200).length;
      const failed = responses.filter(r => r.error).length;
      const errors500 = responses.filter(r => r.status === 500).length;

      if (failed === 0 && errors500 === 0) {
        log('LEO Load', 'PASS', `20 req em ${latency}ms, 100% sucesso`);
      } else {
        log('LEO Load', 'FAIL', `Erros: ${failed}, Status 500: ${errors500}`);
      }
    } catch (error) {
      log('LEO Load', 'FAIL', error.message);
    }

    // 4. TESTE MISTO (Dashboard + LEO alternado)
    console.log('\n📊 4. Teste Misto (Dashboard + LEO alternado)...');
    try {
      const mixedPromises = [];
      for (let i = 0; i < 25; i++) {
        if (i % 2 === 0) {
          mixedPromises.push(
            axios.get(`${BASE_URL}/api/dashboard`, {
              headers: { Authorization: `Bearer ${token}` },
              timeout: TIMEOUT,
            }).catch(err => ({ error: true, message: err.message }))
          );
        } else {
          mixedPromises.push(
            axios.post(`${BASE_URL}/api/leo/chat`, {
              mensagem: `Mixed test ${i}`,
            }, {
              headers: { Authorization: `Bearer ${token}` },
              timeout: TIMEOUT,
            }).catch(err => ({ error: true, message: err.message }))
          );
        }
      }

      const startTime = Date.now();
      const responses = await Promise.all(mixedPromises);
      const latency = Date.now() - startTime;

      const successful = responses.filter(r => !r.error && r.status === 200).length;
      const failed = responses.filter(r => r.error).length;
      const errors500 = responses.filter(r => r.status === 500).length;

      if (failed === 0 && errors500 === 0) {
        log('Mixed Load', 'PASS', `25 req (misto) em ${latency}ms, 100% sucesso`);
      } else {
        log('Mixed Load', 'FAIL', `Erros: ${failed}, Status 500: ${errors500}`);
      }
    } catch (error) {
      log('Mixed Load', 'FAIL', error.message);
    }

  } catch (error) {
    console.error('\n❌ Erro fatal:', error.message);
  }

  // RELATÓRIO
  console.log('\n' + '='.repeat(60));
  console.log('📋 RELATÓRIO W4');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const totalRequests = 30 + 20 + 25; // 75 total
  
  console.log(`\n✅ PASSOU: ${passed}`);
  console.log(`❌ FALHOU: ${failed}`);
  console.log(`📊 Total testes: ${results.length}`);
  console.log(`📊 Total requisições: ${totalRequests}\n`);

  if (failed === 0 && passed >= 3) {
    console.log('✨ W4 APROVADO: Sem crash, sem erro 500\n');
    process.exit(0);
  } else {
    console.log('⚠️  W4 REPROVADO: Verificar erros de carga\n');
    process.exit(1);
  }
}

runW4Tests().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
