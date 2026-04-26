/**
 * Teste do assertTenantId
 * Verifica se a validação de tenantId está funcionando
 */

import { assertTenantId } from './errors/assertions.js';
import { ValidationError } from './errors/typed-errors.js';

async function testAssertTenantId() {
  console.log('🔍 INICIANDO TESTE DO ASSERT TENANT ID\n');
  
  // Teste 1: tenantId válido deve passar
  console.log('[TEST 1] tenantId válido (1) deve passar');
  try {
    assertTenantId(1);
    console.log('  ✅ PASS: assertTenantId(1) funcionou');
  } catch (error) {
    console.log('  ❌ FAIL:', error);
    process.exit(1);
  }
  
  // Teste 2: tenantId válido (100) deve passar
  console.log('\n[TEST 2] tenantId válido (100) deve passar');
  try {
    assertTenantId(100);
    console.log('  ✅ PASS: assertTenantId(100) funcionou');
  } catch (error) {
    console.log('  ❌ FAIL:', error);
    process.exit(1);
  }
  
  // Teste 3: tenantId 0 deve falhar
  console.log('\n[TEST 3] tenantId 0 deve falhar');
  try {
    assertTenantId(0);
    console.log('  ❌ FAIL: assertTenantId(0) não lançou erro');
    process.exit(1);
  } catch (error) {
    if ((error as Error).name === 'ValidationError' || (error as { code?: string }).code === 'VALIDATION_ERROR') {
      console.log('  ✅ PASS: ValidationError lançado corretamente');
    } else {
      console.log('  ❌ FAIL: Erro incorreto:', error);
      process.exit(1);
    }
  }
  
  // Teste 4: tenantId negativo deve falhar
  console.log('\n[TEST 4] tenantId negativo (-1) deve falhar');
  try {
    assertTenantId(-1);
    console.log('  ❌ FAIL: assertTenantId(-1) não lançou erro');
    process.exit(1);
  } catch (error) {
    if ((error as Error).name === 'ValidationError' || (error as { code?: string }).code === 'VALIDATION_ERROR') {
      console.log('  ✅ PASS: ValidationError lançado corretamente');
    } else {
      console.log('  ❌ FAIL: Erro incorreto:', error);
      process.exit(1);
    }
  }
  
  // Teste 5: tenantId undefined deve falhar
  console.log('\n[TEST 5] tenantId undefined deve falhar');
  try {
    assertTenantId(undefined);
    console.log('  ❌ FAIL: assertTenantId(undefined) não lançou erro');
    process.exit(1);
  } catch (error) {
    if ((error as Error).name === 'ValidationError' || (error as { code?: string }).code === 'VALIDATION_ERROR') {
      console.log('  ✅ PASS: ValidationError lançado corretamente');
    } else {
      console.log('  ❌ FAIL: Erro incorreto:', error);
      process.exit(1);
    }
  }
  
  // Teste 6: tenantId string deve falhar
  console.log('\n[TEST 6] tenantId string deve falhar');
  try {
    assertTenantId('1' as unknown as number);
    console.log('  ❌ FAIL: assertTenantId("1") não lançou erro');
    process.exit(1);
  } catch (error) {
    if ((error as Error).name === 'ValidationError' || (error as { code?: string }).code === 'VALIDATION_ERROR') {
      console.log('  ✅ PASS: ValidationError lançado corretamente');
    } else {
      console.log('  ❌ FAIL: Erro incorreto:', error);
      process.exit(1);
    }
  }
  
  console.log('\n✅ ASSERT TENANT ID TESTE PASSOU');
  process.exit(0);
}

testAssertTenantId();
