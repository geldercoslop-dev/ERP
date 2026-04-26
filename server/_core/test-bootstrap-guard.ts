/**
 * Teste do Fail Hard System - Bootstrap Guard
 * 
 * Este script verifica se o sistema se protege contra acesso
 * a módulos críticos antes do bootstrap.
 */

import { getEnv } from './env.js';
import { requireDatabaseUrl } from '../config/database.js';
import { getJwtAuth } from '../security/jwt-auth.js';
import { isBootstrapped, resetBootstrapForTesting } from './bootstrap.js';

console.log('[TEST] Iniciando teste de bootstrap guard...\n');

// Teste 1: Verificar estado inicial (não bootstrapped)
console.log('[TEST 1] Estado inicial deve ser não bootstrapped');
console.log(`  isBootstrapped(): ${isBootstrapped()}`);
if (isBootstrapped() === false) {
  console.log('  ✅ PASS: Estado inicial correto\n');
} else {
  console.log('  ❌ FAIL: Estado inicial incorreto\n');
  process.exit(1);
}

// Teste 2: Tentar acessar ENV antes do bootstrap (deve falhar)
console.log('[TEST 2] Acesso a ENV antes do bootstrap deve falhar');
try {
  getEnv();
  console.log('  ❌ FAIL: getEnv() não lançou erro\n');
  process.exit(1);
} catch (error) {
  const err = error as Error;
  if (err.name === 'BootstrapNotInitializedError') {
    console.log('  ✅ PASS: getEnv() lançou BootstrapNotInitializedError\n');
  } else {
    console.log(`  ❌ FAIL: getEnv() lançou erro inesperado: ${err.name}\n`);
    process.exit(1);
  }
}

// Teste 3: Tentar acessar DB antes do bootstrap (deve falhar)
console.log('[TEST 3] Acesso a DB antes do bootstrap deve falhar');
try {
  requireDatabaseUrl();
  console.log('  ❌ FAIL: requireDatabaseUrl() não lançou erro\n');
  process.exit(1);
} catch (error) {
  const err = error as Error;
  if (err.name === 'BootstrapNotInitializedError') {
    console.log('  ✅ PASS: requireDatabaseUrl() lançou BootstrapNotInitializedError\n');
  } else {
    console.log(`  ❌ FAIL: requireDatabaseUrl() lançou erro inesperado: ${err.name}\n`);
    process.exit(1);
  }
}

// Teste 4: Tentar acessar AUTH antes do bootstrap (deve falhar)
console.log('[TEST 4] Acesso a AUTH antes do bootstrap deve falhar');
try {
  getJwtAuth().generateTokenPair({
    userId: 1,
    tenantId: 1,
    email: 'test@test.com',
    role: 'admin',
    sessionId: 'test-session'
  });
  console.log('  ❌ FAIL: getJwtAuth() não lançou erro\n');
  process.exit(1);
} catch (error) {
  const err = error as Error;
  if (err.name === 'BootstrapNotInitializedError') {
    console.log('  ✅ PASS: getJwtAuth() lançou BootstrapNotInitializedError\n');
  } else {
    console.log(`  ❌ FAIL: getJwtAuth() lançou erro inesperado: ${err.name}\n`);
    process.exit(1);
  }
}

console.log('[TEST] Todos os testes de bootstrap guard passaram! ✅');
console.log('[TEST] O fail hard system está funcionando corretamente.');
