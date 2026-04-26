/**
 * Teste Runtime do Bootstrap Guard
 * Verifica se o Bootstrap Guard está funcionando corretamente após mudanças no schema
 */

import { runBootstrapChecks } from './bootstrap-guard.js';

async function testBootstrapGuard() {
  console.log('🔍 INICIANDO TESTE DO BOOTSTRAP GUARD\n');
  
  try {
    const result = await runBootstrapChecks();
    
    console.log('\n📊 RESULTADO DO BOOTSTRAP GUARD:');
    console.log('=====================================\n');
    
    console.log(`✅ Success: ${result.success}`);
    console.log(`\n📋 Schema vs DB Check:`);
    if (result.schemaDBCheck) {
      console.log(`  - Passed: ${result.schemaDBCheck.passed}`);
      console.log(`  - Violations: ${result.schemaDBCheck.violations.length}`);
      if (result.schemaDBCheck.violations.length > 0) {
        result.schemaDBCheck.violations.forEach(v => console.log(`    • ${v}`));
      }
      console.log(`  - Warnings: ${result.schemaDBCheck.warnings.length}`);
      if (result.schemaDBCheck.warnings.length > 0) {
        result.schemaDBCheck.warnings.forEach(w => console.log(`    • ${w}`));
      }
    }
    
    console.log(`\n📋 Schema Contract Check:`);
    if (result.schemaContractCheck) {
      console.log(`  - Passed: ${result.schemaContractCheck.passed}`);
      console.log(`  - Violations: ${result.schemaContractCheck.violations.length}`);
      if (result.schemaContractCheck.violations.length > 0) {
        result.schemaContractCheck.violations.forEach(v => console.log(`    • ${v}`));
      }
      console.log(`  - Warnings: ${result.schemaContractCheck.warnings.length}`);
      if (result.schemaContractCheck.warnings.length > 0) {
        result.schemaContractCheck.warnings.forEach(w => console.log(`    • ${w}`));
      }
    }
    
    console.log(`\n🚨 Critical Issues: ${result.criticalIssues.length}`);
    if (result.criticalIssues.length > 0) {
      result.criticalIssues.forEach(issue => console.log(`  • ${issue}`));
    }
    
    if (result.success) {
      console.log('\n✅ BOOTSTRAP GUARD PASSOU - Sistema está consistente');
      process.exit(0);
    } else {
      console.log('\n❌ BOOTSTRAP GUARD FALHOU - Sistema inconsistente');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ ERRO AO EXECUTAR BOOTSTRAP GUARD:', error);
    process.exit(1);
  }
}

testBootstrapGuard();
