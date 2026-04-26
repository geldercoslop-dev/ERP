/**
 * Teste do DB Access Guard
 * Verifica se o guard está bloqueando acesso direto ao DB
 */

import { assertNoDirectDbAccess } from './db-access-guard.js';
import { InfrastructureError } from './errors/typed-errors.js';

async function testDbAccessGuard() {
  console.log('🔍 INICIANDO TESTE DO DB ACCESS GUARD\n');
  
  // Teste 1: Chamada de módulo permitido deve passar
  console.log('[TEST 1] Chamada de módulo permitido (services) deve passar');
  try {
    // Simula chamada de services (não tem /leo/ ou /tools/ na stack)
    assertNoDirectDbAccess('services/orders.service.ts');
    console.log('  ✅ PASS: assertNoDirectDbAccess("services/orders.service.ts") funcionou');
  } catch (error) {
    console.log('  ❌ FAIL:', error);
    process.exit(1);
  }
  
  // Teste 2: Chamada de LEO deve falhar
  console.log('\n[TEST 2] Chamada de LEO deve falhar');
  try {
    assertNoDirectDbAccess('server\\leo\\learning\\leo-learning-engine.ts');
    console.log('  ❌ FAIL: assertNoDirectDbAccess("leo/...") não lançou erro');
    process.exit(1);
  } catch (error) {
    if ((error as Error).name === 'InfrastructureError' || (error as { code?: string }).code === 'INFRASTRUCTURE_ERROR') {
      console.log('  ✅ PASS: InfrastructureError lançado corretamente');
    } else {
      console.log('  ❌ FAIL: Erro incorreto:', error);
      process.exit(1);
    }
  }
  
  // Teste 3: Chamada de tools deve falhar
  console.log('\n[TEST 3] Chamada de tools deve falhar');
  try {
    assertNoDirectDbAccess('server\\tools\\learning-sales.tool.ts');
    console.log('  ❌ FAIL: assertNoDirectDbAccess("tools/...") não lançou erro');
    process.exit(1);
  } catch (error) {
    if ((error as Error).name === 'InfrastructureError' || (error as { code?: string }).code === 'INFRASTRUCTURE_ERROR') {
      console.log('  ✅ PASS: InfrastructureError lançado corretamente');
    } else {
      console.log('  ❌ FAIL: Erro incorreto:', error);
      process.exit(1);
    }
  }
  
  console.log('\n✅ DB ACCESS GUARD TESTE PASSOU');
  process.exit(0);
}

testDbAccessGuard();
