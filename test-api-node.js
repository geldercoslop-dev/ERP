#!/usr/bin/env node

/**
 * ERP API TESTS - Node.js Script
 * 
 * Tests all API endpoints with real HTTP requests
 * Validates complete CRUD flow
 */

import axios from 'axios';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TENANT_ID = process.env.TENANT_ID || '1';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInRlbmFudElkIjoxLCJpYXQiOjE3MjQ0MjQ4MDAwLCJleHAiOjE3MjQ0MjQ4MDAwfQ.test';

// Create axios instance with default headers
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'x-tenant-id': TENANT_ID,
    'Authorization': `Bearer ${AUTH_TOKEN}`
  }
});

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  details: []
};

/**
 * Helper function to run tests
 */
async function runTest(testName, testFn) {
  testResults.total++;
  console.log(`\n🧪 Running: ${testName}`);
  
  try {
    const result = await testFn();
    console.log(`✅ PASSED: ${testName}`);
    console.log(`   Response:`, JSON.stringify(result.data, null, 2));
    testResults.passed++;
    testResults.details.push({ test: testName, status: 'PASSED', data: result.data });
    return true;
  } catch (error) {
    console.log(`❌ FAILED: ${testName}`);
    console.log(`   Error:`, error.response?.data || error.message);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
    }
    testResults.failed++;
    testResults.details.push({ 
      test: testName, 
      status: 'FAILED', 
      error: error.response?.data || error.message,
      status_code: error.response?.status
    });
    return false;
  }
}

/**
 * Test 1: Create Client
 */
async function testCreateClient() {
  const clientData = {
    nome: "Cliente Teste Node",
    email: "cliente.node@teste.com",
    telefone: "(11) 99999-9999",
    endereco: "Rua Teste, 123",
    cidade: "São Paulo",
    estado: "SP",
    cep: "01234-567"
  };
  
  return await api.post('/clients', clientData);
}

/**
 * Test 2: List Clients
 */
async function testListClients() {
  return await api.get('/clients?page=1&limit=10');
}

/**
 * Test 3: Get Client by ID
 */
async function testGetClient() {
  return await api.get('/clients/1');
}

/**
 * Test 4: Update Client
 */
async function testUpdateClient() {
  const updateData = {
    nome: "Cliente Atualizado Node",
    telefone: "(11) 88888-8888"
  };
  
  return await api.put('/clients/1', updateData);
}

/**
 * Test 5: Create Order
 */
async function testCreateOrder() {
  const orderData = {
    clienteNome: "Cliente Pedido Node",
    formaPagamento: "dinheiro",
    entradaValor: 100.00,
    itens: [
      {
        produtoId: 1,
        quantidade: 2,
        valorUnitario: 50.00,
        total: 100.00,
        descricao: "Produto Teste 1"
      }
    ]
  };
  
  return await api.post('/orders', orderData);
}

/**
 * Test 6: List Orders
 */
async function testListOrders() {
  return await api.get('/orders?page=1&limit=10');
}

/**
 * Test 7: Get Order by ID
 */
async function testGetOrder() {
  return await api.get('/orders/1');
}

/**
 * Test 8: Update Order Status
 */
async function testUpdateOrderStatus() {
  const statusData = {
    status: "confirmado",
    motivo: "Confirmação do pedido"
  };
  
  return await api.post('/orders/1/status', statusData);
}

/**
 * Test 9: Create Payment
 */
async function testCreatePayment() {
  const paymentData = {
    tipo: "receita",
    valor: 100.00,
    pedidoId: 1,
    formaPagamento: "dinheiro",
    descricao: "Pagamento do pedido #1",
    dataVencimento: "2024-12-31"
  };
  
  return await api.post('/payments', paymentData);
}

/**
 * Test 10: List Payments
 */
async function testListPayments() {
  return await api.get('/payments?page=1&limit=10');
}

/**
 * Test 11: Get Payment by ID
 */
async function testGetPayment() {
  return await api.get('/payments/1');
}

/**
 * Test 12: Cancel Payment
 */
async function testCancelPayment() {
  const cancelData = {
    motivo: "Cancelamento por teste"
  };
  
  return await api.post('/payments/1/cancel', cancelData);
}

/**
 * Test 13: Reconcile Payment
 */
async function testReconcilePayment() {
  const reconcileData = {
    valorConciliado: 100.00,
    dataConciliacao: "2024-12-30",
    observacoes: "Pagamento conciliado com sucesso"
  };
  
  return await api.post('/payments/1/reconcile', reconcileData);
}

/**
 * Test 14: Error Handling - Invalid Auth
 */
async function testInvalidAuth() {
  const invalidApi = axios.create({
    baseURL: BASE_URL,
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': TENANT_ID,
      'Authorization': 'Bearer invalid-token'
    }
  });
  
  return await invalidApi.get('/clients');
}

/**
 * Test 15: Error Handling - Missing Tenant
 */
async function testMissingTenant() {
  const noTenantApi = axios.create({
    baseURL: BASE_URL,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`
    }
  });
  
  return await noTenantApi.get('/clients');
}

/**
 * Test 16: Error Handling - Validation Error
 */
async function testValidationError() {
  const invalidData = {
    nome: "",
    email: "invalid-email"
  };
  
  return await api.post('/clients', invalidData);
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('🚀 Starting ERP API Tests');
  console.log(`📡 Base URL: ${BASE_URL}`);
  console.log(`🏢 Tenant ID: ${TENANT_ID}`);
  console.log('=' .repeat(60));

  // Run all tests
  await runTest('Create Client', testCreateClient);
  await runTest('List Clients', testListClients);
  await runTest('Get Client by ID', testGetClient);
  await runTest('Update Client', testUpdateClient);
  await runTest('Create Order', testCreateOrder);
  await runTest('List Orders', testListOrders);
  await runTest('Get Order by ID', testGetOrder);
  await runTest('Update Order Status', testUpdateOrderStatus);
  await runTest('Create Payment', testCreatePayment);
  await runTest('List Payments', testListPayments);
  await runTest('Get Payment by ID', testGetPayment);
  await runTest('Cancel Payment', testCancelPayment);
  await runTest('Reconcile Payment', testReconcilePayment);
  await runTest('Error Handling - Invalid Auth', testInvalidAuth);
  await runTest('Error Handling - Missing Tenant', testMissingTenant);
  await runTest('Error Handling - Validation Error', testValidationError);

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${testResults.total}`);
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📈 Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);

  // Print failed tests details
  if (testResults.failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    testResults.details
      .filter(test => test.status === 'FAILED')
      .forEach(test => {
        console.log(`   • ${test.test}`);
        console.log(`     Error: ${test.error}`);
        if (test.status_code) {
          console.log(`     Status: ${test.status_code}`);
        }
      });
  }

  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run tests
if (require.main === module) {
  runAllTests();
}

export {
  runAllTests,
  testCreateClient,
  testListClients,
  testCreateOrder,
  testCreatePayment
};
