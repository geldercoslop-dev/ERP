/**
 * Teste simples do Schema Contract (não precisa de DB)
 * Verifica se o schema está consistente internamente
 */

import { generateSchemaContractReport, logSchemaContractReport } from './schema-contract.js';

async function testSchemaContract() {
  console.log('🔍 INICIANDO TESTE DO SCHEMA CONTRACT\n');
  
  try {
    const report = generateSchemaContractReport();
    
    console.log('\n📊 RESULTADO DO SCHEMA CONTRACT:');
    console.log('=====================================\n');
    
    console.log(`✅ Timestamp: ${report.timestamp}`);
    console.log(`📋 Table Count: ${Object.keys(report.tables).length}`);
    
    console.log(`\n📋 Tables:`);
    for (const [tableName, tableInfo] of Object.entries(report.tables)) {
      console.log(`  - ${tableName}: ${tableInfo.fields.length} fields`);
    }
    
    console.log(`\n🚨 Violations: ${report.violations.length}`);
    if (report.violations.length > 0) {
      report.violations.forEach(v => console.log(`  • ${v}`));
    }
    
    console.log(`\n⚠️  Warnings: ${report.warnings.length}`);
    if (report.warnings.length > 0) {
      report.warnings.forEach(w => console.log(`  • ${w}`));
    }
    
    logSchemaContractReport(report);
    
    if (report.violations.length === 0) {
      console.log('\n✅ SCHEMA CONTRACT PASSOU - Schema está consistente');
      process.exit(0);
    } else {
      console.log('\n❌ SCHEMA CONTRACT FALHOU - Schema inconsistente');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ ERRO AO EXECUTAR SCHEMA CONTRACT:', error);
    process.exit(1);
  }
}

testSchemaContract();
