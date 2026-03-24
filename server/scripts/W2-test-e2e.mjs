#!/usr/bin/env node

/**
 * W2-TEST-E2E.mjs
 * 
 * FASE W2 - TESTE E2E COMPLETO
 * Fluxo:
 * 1. Login
 * 2. Criar pedido
 * 3. Consultar pedido
 * 4. Editar pedido
 * 5. Validar persistência
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3001';
const TIMEOUT = 10000;

const testUser = {
  email: 'w2.test@windsurf.test',
  password: 'W2TestPass123!',
};

let token = null;
let createdPedidoId = null;
let results = [];

function log(title, status, details) {
  const emoji = status === 'PASS' ? '✅' : '❌';
  console.log(`${emoji} ${title}`);
  if (details) console.log(`   📍 ${details}`);
  results.push({ title, status, details });
}

async function runW2Tests() {
  console.log('\n' + '='.repeat(60));
  console.log('🌊 WINDSURF W2 - TESTE E2E ERP');
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
      log('Login', 'PASS', `Token: ${token?.substring(0, 15)}...`);
    } catch (error) {
      log('Login', 'FAIL', error.message);
      console.log('⚠️  Abortando testes E2E\n');
      process.exit(1);
    }

    // 2. CRIAR PEDIDO
    console.log('\n📊 2. Criar Pedido...');
    try {
      const createRes = await axios.post(`${BASE_URL}/api/pedidos`, {
        tipo: 'VENDA',
        valor: 3500.50,
        descricao: 'Teste E2E W2',
        cliente_id: 1,
      }, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: TIMEOUT,
      });
      createdPedidoId = createRes.data?.id;
      log('Criar Pedido', 'PASS', `Pedido ID: ${createdPedidoId}`);
    } catch (error) {
      log('Criar Pedido', 'FAIL', error.message);
    }

    // 3. CONSULTAR PEDIDO
    if (createdPedidoId) {
      console.log('\n📊 3. Consultar Pedido...');
      try {
        const getRes = await axios.get(`${BASE_URL}/api/pedidos/${createdPedidoId}`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: TIMEOUT,
        });
        
        const pedido = getRes.data?.pedido || getRes.data;
        log('Consultar Pedido', 'PASS', `Status: ${pedido?.status || 'ativo'}`);
      } catch (error) {
        log('Consultar Pedido', 'FAIL', error.message);
      }
    }

    // 4. EDITAR PEDIDO
    if (createdPedidoId) {
      console.log('\n📊 4. Editar Pedido...');
      try {
        const updateRes = await axios.patch(`${BASE_URL}/api/pedidos/${createdPedidoId}`, {
          valor: 4000.00,
          descricao: 'Teste E2E W2 - Editado',
        }, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: TIMEOUT,
        });
        log('Editar Pedido', 'PASS', `Novo valor: 4000.00`);
      } catch (error) {
        log('Editar Pedido', 'FAIL', error.message);
      }
    }

    // 5. VERIFICAR PERSISTÊNCIA
    if (createdPedidoId) {
      console.log('\n📊 5. Validar Persistência...');
      try {
        const getFinalRes = await axios.get(`${BASE_URL}/api/pedidos/${createdPedidoId}`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: TIMEOUT,
        });
        
        const pedido = getFinalRes.data?.pedido || getFinalRes.data;
        const valorCorreto = Math.abs((pedido?.valor || 0) - 4000.00) < 0.01;
        const descricaoCerta = pedido?.descricao?.includes('Editado');
        
        if (valorCorreto && descricaoCerta) {
          log('Persistência', 'PASS', 'Dados persisted corretamente');
        } else {
          log('Persistência', 'FAIL', 'Dados não persisted corretamente');
        }
      } catch (error) {
        log('Persistência', 'FAIL', error.message);
      }
    }

    // 6. LISTAR TODOS OS PEDIDOS
    console.log('\n📊 6. Listar Todos Pedidos...');
    try {
      const listRes = await axios.get(`${BASE_URL}/api/pedidos`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: TIMEOUT,
      });
      const count = listRes.data?.pedidos?.length || 0;
      log('Listar Pedidos', 'PASS', `Total: ${count} pedidos`);
    } catch (error) {
      log('Listar Pedidos', 'FAIL', error.message);
    }

  } catch (error) {
    console.error('\n❌ Erro fatal:', error.message);
  }

  // RELATÓRIO
  console.log('\n' + '='.repeat(60));
  console.log('📋 RELATÓRIO W2');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  
  console.log(`\n✅ PASSOU: ${passed}`);
  console.log(`❌ FALHOU: ${failed}`);
  console.log(`📊 Total: ${results.length}\n`);

  if (failed === 0 && passed >= 5) {
    console.log('✨ W2 APROVADO: E2E OK\n');
    process.exit(0);
  } else {
    console.log('⚠️  W2 REPROVADO: Verificar erros\n');
    process.exit(1);
  }
}

runW2Tests().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
