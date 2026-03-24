#!/usr/bin/env node

/**
 * W1-TEST-MULTITENANT.mjs
 * 
 * FASE W1 - TESTE MULTI-TENANT CRÍTICO
 * 
 * Cria 2 usuários em tenants diferentes
 * e valida isolamento de dados críticos
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3001';
const TIMEOUT = 10000;

// Usuários de teste
const userA = {
  email: 'testuser.a@windsurf.test',
  password: 'TestPass123!@#',
  tenantName: 'TENANT_A',
};

const userB = {
  email: 'testuser.b@windsurf.test',
  password: 'TestPass456!@#',
  tenantName: 'TENANT_B',
};

let tokenA = null;
let tokenB = null;
let results = [];

function logTest(title, status, details) {
  const emoji = status === 'PASS' ? '✅' : '❌';
  console.log(`${emoji} ${title}`);
  if (details) {
    console.log(`   📍 ${details}`);
  }
  results.push({ title, status, details });
}

async function login(user) {
  try {
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: user.email,
      password: user.password,
    }, { timeout: TIMEOUT });

    if (response.data?.token) {
      return response.data.token;
    }
    throw new Error('Sem token na resposta');
  } catch (error) {
    throw new Error(`Login falhou: ${error.message}`);
  }
}

async function createPedido(token, tenantId, data) {
  try {
    const response = await axios.post(`${BASE_URL}/api/pedidos`, data, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: TIMEOUT,
    });
    return response.data;
  } catch (error) {
    throw new Error(`Criar pedido falhou: ${error.message}`);
  }
}

async function listPedidos(token) {
  try {
    const response = await axios.get(`${BASE_URL}/api/pedidos`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: TIMEOUT,
    });
    return response.data.pedidos || [];
  } catch (error) {
    throw new Error(`Listar pedidos falhou: ${error.message}`);
  }
}

async function getDashboard(token) {
  try {
    const response = await axios.get(`${BASE_URL}/api/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: TIMEOUT,
    });
    return response.data;
  } catch (error) {
    throw new Error(`Dashboard falhou: ${error.message}`);
  }
}

async function runW1Tests() {
  console.log('\n' + '='.repeat(60));
  console.log('🌊 WINDSURF W1 - TESTE MULTI-TENANT');
  console.log('='.repeat(60) + '\n');

  try {
    // 1. LOGIN USER A
    console.log('📊 1. Login User A (Tenant A)...');
    try {
      tokenA = await login(userA);
      logTest('User A login', 'PASS', `Token obtido: ${tokenA?.substring(0, 20)}...`);
    } catch (error) {
      logTest('User A login', 'FAIL', error.message);
      console.log('⚠️  Continuando com tests locais...\n');
    }

    // 2. LOGIN USER B
    console.log('\n📊 2. Login User B (Tenant B)...');
    try {
      tokenB = await login(userB);
      logTest('User B login', 'PASS', `Token obtido: ${tokenB?.substring(0, 20)}...`);
    } catch (error) {
      logTest('User B login', 'FAIL', error.message);
      console.log('⚠️  Continuando com tests locais...\n');
    }

    // 3. CRIAR PEDIDO TENANT A
    if (tokenA) {
      console.log('\n📊 3. Criar Pedido em Tenant A...');
      try {
        const pedidoA = await createPedido(tokenA, 'TENANT_A', {
          tipo: 'VENDA',
          valor: 1500.00,
          descricao: 'Pedido teste W1 - Tenant A',
        });
        logTest('Criar pedido Tenant A', 'PASS', `Pedido ID: ${pedidoA?.id}`);
      } catch (error) {
        logTest('Criar pedido Tenant A', 'FAIL', error.message);
      }
    }

    // 4. CRIAR PEDIDO TENANT B
    if (tokenB) {
      console.log('\n📊 4. Criar Pedido em Tenant B...');
      try {
        const pedidoB = await createPedido(tokenB, 'TENANT_B', {
          tipo: 'VENDA',
          valor: 2500.00,
          descricao: 'Pedido teste W1 - Tenant B',
        });
        logTest('Criar pedido Tenant B', 'PASS', `Pedido ID: ${pedidoB?.id}`);
      } catch (error) {
        logTest('Criar pedido Tenant B', 'FAIL', error.message);
      }
    }

    // 5. VALIDAR ISOLAMENTO - USER A NÃO VÊ PEDIDOS B
    if (tokenA && tokenB) {
      console.log('\n📊 5. Validar Isolamento (User A não vê Tenant B)...');
      try {
        const pedidosA = await listPedidos(tokenA);
        const temPedidoB = pedidosA.some(p => p.descricao?.includes('Tenant B'));
        
        if (!temPedidoB) {
          logTest('Isolamento A/B', 'PASS', 'User A não vê pedidos de Tenant B ✓');
        } else {
          logTest('Isolamento A/B', 'FAIL', '⚠️  VAZAMENTO: User A vê pedidos de Tenant B');
        }
      } catch (error) {
        logTest('Isolamento A/B', 'FAIL', error.message);
      }
    }

    // 6. VALIDAR ISOLAMENTO - USER B NÃO VÊ PEDIDOS A
    if (tokenB && tokenA) {
      console.log('\n📊 6. Validar Isolamento (User B não vê Tenant A)...');
      try {
        const pedidosB = await listPedidos(tokenB);
        const temPedidoA = pedidosB.some(p => p.descricao?.includes('Tenant A'));
        
        if (!temPedidoA) {
          logTest('Isolamento B/A', 'PASS', 'User B não vê pedidos de Tenant A ✓');
        } else {
          logTest('Isolamento B/A', 'FAIL', '⚠️  VAZAMENTO: User B vê pedidos de Tenant A');
        }
      } catch (error) {
        logTest('Isolamento B/A', 'FAIL', error.message);
      }
    }

    // 7. DASHBOARD USER A
    if (tokenA) {
      console.log('\n📊 7. Dashboard User A...');
      try {
        const dashA = await getDashboard(tokenA);
        logTest('Dashboard A', 'PASS', `Dados recebidos (${Object.keys(dashA).length} campos)`);
      } catch (error) {
        logTest('Dashboard A', 'FAIL', error.message);
      }
    }

    // 8. DASHBOARD USER B
    if (tokenB) {
      console.log('\n📊 8. Dashboard User B...');
      try {
        const dashB = await getDashboard(tokenB);
        logTest('Dashboard B', 'PASS', `Dados recebidos (${Object.keys(dashB).length} campos)`);
      } catch (error) {
        logTest('Dashboard B', 'FAIL', error.message);
      }
    }

  } catch (error) {
    console.error('\n❌ Erro fatal:', error.message);
  }

  // RELATÓRIO
  console.log('\n' + '='.repeat(60));
  console.log('📋 RELATÓRIO W1');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  
  console.log(`\n✅ PASSOU: ${passed}`);
  console.log(`❌ FALHOU: ${failed}`);
  console.log(`📊 Total: ${results.length}\n`);

  if (failed === 0 && passed > 3) {
    console.log('✨ W1 APROVADO: Multi-tenant isolamento OK\n');
    process.exit(0);
  } else {
    console.log('⚠️  W1 REPROVADO: Verificar erros acima\n');
    process.exit(1);
  }
}

runW1Tests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
