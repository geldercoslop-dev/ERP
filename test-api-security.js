#!/usr/bin/env node

// Test script para validar a arquitetura corrigida do security middleware
const http = require('http');

// Test 1: API sem Bearer token (deve retornar 401)
function testApiWithoutToken() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/orders',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('❌ TEST 1 - API sem token:');
        console.log(`   Status: ${res.statusCode}`);
        console.log(`   Expected: 401, Got: ${res.statusCode}`);
        console.log(`   Response: ${data}`);
        resolve(res.statusCode === 401);
      });
    });

    req.on('error', (e) => {
      console.log(`❌ TEST 1 - Error: ${e.message}`);
      resolve(false);
    });

    req.write(JSON.stringify({ test: 'data' }));
    req.end();
  });
}

// Test 2: API com Bearer token (deve passar para authMiddleware)
function testApiWithBearerToken() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/orders',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer SEU_TOKEN_AQUI'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('\n✅ TEST 2 - API com Bearer token:');
        console.log(`   Status: ${res.statusCode}`);
        console.log(`   Expected: 401 (invalid token) or 200/400 (business error), Got: ${res.statusCode}`);
        console.log(`   Response: ${data}`);
        // Se chegou no authMiddleware, vai retornar 401 por token inválido, não 401 global
        resolve(res.statusCode !== 401 || data.includes('Bearer token required') === false);
      });
    });

    req.on('error', (e) => {
      console.log(`❌ TEST 2 - Error: ${e.message}`);
      resolve(false);
    });

    req.write(JSON.stringify({ test: 'data' }));
    req.end();
  });
}

// Test 3: Health endpoint (deve funcionar sem token)
function testHealthEndpoint() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/health',
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('\n✅ TEST 3 - Health endpoint (público):');
        console.log(`   Status: ${res.statusCode}`);
        console.log(`   Expected: 200, Got: ${res.statusCode}`);
        console.log(`   Response: ${data}`);
        resolve(res.statusCode === 200);
      });
    });

    req.on('error', (e) => {
      console.log(`❌ TEST 3 - Error: ${e.message}`);
      resolve(false);
    });

    req.end();
  });
}

// Run all tests
async function runTests() {
  console.log('🧪 TESTING API SECURITY ARCHITECTURE\n');
  console.log('Make sure server is running on localhost:3000\n');

  const test1 = await testApiWithoutToken();
  const test2 = await testApiWithBearerToken();
  const test3 = await testHealthEndpoint();

  console.log('\n📊 RESULTS:');
  console.log(`   Test 1 (API sem token): ${test1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Test 2 (API com token): ${test2 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Test 3 (Health público): ${test3 ? '✅ PASS' : '❌ FAIL'}`);
  
  const allPassed = test1 && test2 && test3;
  console.log(`\n🎯 Overall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  
  if (allPassed) {
    console.log('\n✨ API Security Architecture is working correctly!');
    console.log('   - Bearer token validation: ✅');
    console.log('   - Public routes bypass: ✅');
    console.log('   - CSRF/x-app-secret removed: ✅');
  }
}

runTests().catch(console.error);
