/**
 * Teste do Architecture Guard
 * Verifica se o guard está bloqueando acesso de LEO ao DB
 */

import { assertNoDbAccess } from './architecture-guard.js';
import { InfrastructureError } from './errors/typed-errors.js';

async function testArchitectureGuard() {
  console.log('🔍 INICIANDO TESTE DO ARCHITECTURE GUARD\n');
  
  // Teste 1: Módulo permitido deve passar
  console.log('[TEST 1] Módulo permitido (services) deve passar');
  try {
    assertNoDbAccess('server/services/orders.service.ts');
    console.log('  ✅ PASS: assertNoDbAccess("services/...") funcionou');
  } catch (error) {
    console.log('  ❌ FAIL:', error);
    process.exit(1);
  }
  
  // Teste 2: Módulo LEO com acesso DB deve falhar
  console.log('\n[TEST 2] Módulo LEO com acesso DB deve falhar');
  try {
    assertNoDbAccess('server/leo/learning/leo-database-service.ts');
    console.log('  ❌ FAIL: assertNoDbAccess("leo/...database...") não lançou erro');
    process.exit(1);
  } catch (error) {
    if ((error as Error).name === 'InfrastructureError' || (error as { code?: string }).code === 'INFRASTRUCTURE_ERROR') {
      console.log('  ✅ PASS: InfrastructureError lançado corretamente');
    } else {
      console.log('  ❌ FAIL: Erro incorreto:', error);
      process.exit(1);
    }
  }
  
  console.log('\n✅ ARCHITECTURE GUARD TESTE PASSOU');
  process.exit(0);
}

testArchitectureGuard();
