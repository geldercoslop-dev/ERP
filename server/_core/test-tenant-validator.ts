/**
 * Teste do validateTenantAccess
 * Verifica se a validação de tenant está funcionando
 */

import { validateTenantAccess } from './tenant-validator.js';
import { InfrastructureError } from './errors/typed-errors.js';
import type { ServiceActor } from './service-actor.js';
import { buildBootstrapInvocation, runWithServiceInvocationAsync } from './service-entry-guard.js';

async function testTenantValidator() {
  console.log('🔍 INICIANDO TESTE DO TENANT VALIDATOR\n');
  
  const validActor: ServiceActor = {
    role: 'admin',
    userId: 1,
  };
  
  const validVendedorActor: ServiceActor = {
    role: 'vendedor',
    userId: 1,
    vendedorId: 1,
  };
  
  // Teste 1: tenantId válido + actor válido deve passar
  console.log('[TEST 1] tenantId válido + actor admin deve passar');
  try {
    await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => {
      const result = validateTenantAccess(1, validActor);
      console.log('  ✅ PASS: validateTenantAccess(1, admin) funcionou');
      console.log('    Result:', result);
    });
  } catch (error) {
    console.log('  ❌ FAIL:', error);
    process.exit(1);
  }
  
  // Teste 2: tenantId válido + actor vendedor válido deve passar
  console.log('\n[TEST 2] tenantId válido + actor vendedor deve passar');
  try {
    await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => {
      const result = validateTenantAccess(1, validVendedorActor);
      console.log('  ✅ PASS: validateTenantAccess(1, vendedor) funcionou');
      console.log('    Result:', result);
    });
  } catch (error) {
    console.log('  ❌ FAIL:', error);
    process.exit(1);
  }
  
  // Teste 3: tenantId 0 deve falhar
  console.log('\n[TEST 3] tenantId 0 deve falhar');
  try {
    await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => {
      validateTenantAccess(0, validActor);
      console.log('  ❌ FAIL: validateTenantAccess(0, admin) não lançou erro');
      process.exit(1);
    });
  } catch (error) {
    if ((error as Error).name === 'InfrastructureError' || (error as { code?: string }).code === 'INFRASTRUCTURE_ERROR') {
      console.log('  ✅ PASS: InfrastructureError lançado corretamente');
    } else {
      console.log('  ❌ FAIL: Erro incorreto:', error);
      process.exit(1);
    }
  }
  
  // Teste 4: tenantId undefined deve falhar
  console.log('\n[TEST 4] tenantId undefined deve falhar');
  try {
    await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => {
      validateTenantAccess(undefined, validActor);
      console.log('  ❌ FAIL: validateTenantAccess(undefined, admin) não lançou erro');
      process.exit(1);
    });
  } catch (error) {
    if ((error as Error).name === 'InfrastructureError' || (error as { code?: string }).code === 'INFRASTRUCTURE_ERROR') {
      console.log('  ✅ PASS: InfrastructureError lançado corretamente');
    } else {
      console.log('  ❌ FAIL: Erro incorreto:', error);
      process.exit(1);
    }
  }
  
  // Teste 5: actor undefined deve falhar
  console.log('\n[TEST 5] actor undefined deve falhar');
  try {
    await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => {
      validateTenantAccess(1, undefined);
      console.log('  ❌ FAIL: validateTenantAccess(1, undefined) não lançou erro');
      process.exit(1);
    });
  } catch (error) {
    if ((error as Error).name === 'InfrastructureError' || (error as { code?: string }).code === 'INFRASTRUCTURE_ERROR') {
      console.log('  ✅ PASS: InfrastructureError lançado corretamente');
    } else {
      console.log('  ❌ FAIL: Erro incorreto:', error);
      process.exit(1);
    }
  }
  
  // Teste 6: vendedor sem vendedorId deve falhar
  console.log('\n[TEST 6] vendedor sem vendedorId deve falhar');
  try {
    await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => {
      const invalidVendedor: ServiceActor = {
        role: 'vendedor',
        userId: 1,
      };
      validateTenantAccess(1, invalidVendedor);
      console.log('  ❌ FAIL: validateTenantAccess(1, vendedor sem vendedorId) não lançou erro');
      process.exit(1);
    });
  } catch (error) {
    if ((error as Error).name === 'InfrastructureError' || (error as { code?: string }).code === 'INFRASTRUCTURE_ERROR') {
      console.log('  ✅ PASS: InfrastructureError lançado corretamente');
    } else {
      console.log('  ❌ FAIL: Erro incorreto:', error);
      process.exit(1);
    }
  }
  
  console.log('\n✅ TENANT VALIDATOR TESTE PASSOU');
  process.exit(0);
}

testTenantValidator();
