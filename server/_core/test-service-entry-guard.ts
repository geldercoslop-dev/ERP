/**
 * Teste do Service Entry Guard
 * Verifica se o guard está bloqueando chamadas não autorizadas
 */

import { assertServiceEntryIfEnabled, buildBootstrapInvocation, runWithServiceInvocationAsync } from './service-entry-guard.js';

async function testServiceEntryGuard() {
  console.log('🔍 INICIANDO TESTE DO SERVICE ENTRY GUARD\n');
  
  // Teste 1: Chamada sem contexto deve falhar
  console.log('[TEST 1] Chamada sem contexto deve falhar');
  try {
    assertServiceEntryIfEnabled();
    console.log('  ❌ FAIL: assertServiceEntryIfEnabled() não lançou erro');
    process.exit(1);
  } catch (error) {
    if ((error as Error).name === 'ServiceContextMissingError') {
      console.log('  ✅ PASS: ServiceContextMissingError lançado corretamente');
    } else {
      console.log('  ❌ FAIL: Erro incorreto:', error);
      process.exit(1);
    }
  }
  
  // Teste 2: Chamada com contexto bootstrap deve funcionar
  console.log('\n[TEST 2] Chamada com contexto bootstrap deve funcionar');
  try {
    await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => {
      assertServiceEntryIfEnabled();
      console.log('  ✅ PASS: assertServiceEntryIfEnabled() funcionou com contexto bootstrap');
    });
  } catch (error) {
    console.log('  ❌ FAIL:', error);
    process.exit(1);
  }
  
  console.log('\n✅ SERVICE ENTRY GUARD TESTE PASSOU');
  process.exit(0);
}

testServiceEntryGuard();
