#!/usr/bin/env node

/**
 * TESTE DIRETO: BOOT VALIDATOR COM DB OFFLINE
 * Testa o boot validator diretamente sem dependências
 */

const path = require('path');
const fs = require('fs');

console.log('='.repeat(60));
console.log('TESTE DIRETO: BOOT VALIDATOR COM DB OFFLINE');
console.log('='.repeat(60));

async function testBootValidator() {
  try {
    // Simular DATABASE_URL inválido
    const originalDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'mysql://vendas:vendas123@invalid-host:3306/vendas_app';
    process.env.NODE_ENV = 'development';
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

    console.log('✓ DATABASE_URL configurado para host inválido');
    console.log('✓ Variáveis de ambiente configuradas');

    // Importar e testar boot validator
    console.log('\n🔍 Importando BootValidatorFixed...');
    
    // Import dinâmico do módulo ES
    const { fileURLToPath } = require('url');
    const { dirname } = require('path');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    
    // Usar import dinâmico para módulo ES
    const { BootValidatorFixed } = await import('./server/_core/boot-validator-fixed.js');
    
    console.log('✓ BootValidatorFixed importado');
    
    // Executar validação
    console.log('\n🚀 Executando boot validation...');
    const startTime = Date.now();
    
    const validator = new BootValidatorFixed();
    const result = await validator.validateBoot();
    
    const duration = Date.now() - startTime;
    
    console.log('\n' + '='.repeat(60));
    console.log('RESULTADO DA VALIDAÇÃO');
    console.log('='.repeat(60));
    console.log(`⏱️ Duração: ${duration}ms`);
    console.log(`📊 Checks: ${result.checks.length}`);
    console.log(`❌ Errors: ${result.errors.length}`);
    console.log(`⚠ Warnings: ${result.warnings.length}`);
    console.log(`🎯 Success: ${result.success}`);
    
    // Detalhes dos checks
    console.log('\n📋 Checks detalhados:');
    result.checks.forEach((check, index) => {
      const icon = check.status === 'pass' ? '✅' : check.status === 'fail' ? '❌' : '⚠️';
      console.log(`  ${index + 1}. ${icon} ${check.name} (${check.duration}ms) - ${check.message}`);
    });
    
    // Erros
    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }
    
    // Warnings
    if (result.warnings.length > 0) {
      console.log('\n⚠️ Warnings:');
      result.warnings.forEach((warning, index) => {
        console.log(`  ${index + 1}. ${warning}`);
      });
    }
    
    // Verificar resultado
    console.log('\n' + '='.repeat(60));
    console.log('ANÁLISE DO RESULTADO');
    console.log('='.repeat(60));
    
    if (!result.success) {
      if (result.errors.some(e => e.includes('Database') || e.includes('connection'))) {
        console.log('✅ PASSOU: Boot falhou por erro de DB (esperado)');
        console.log('✅ FAIL-FAST funcionou corretamente');
      } else {
        console.log('⚠️ FALHOU: Mas por outro motivo (não DB)');
        console.log('⚠️ Pode indicar problema no validator');
      }
    } else {
      console.log('❌ FALHOU: Boot passou com DB offline');
      console.log('❌ FAIL-FAST NÃO FUNCIONOU - BUG CRÍTICO');
    }
    
    // Verificar tempo (fail-fast deve ser rápido)
    if (duration < 10000) { // 10 segundos
      console.log('✅ Tempo adequado para fail-fast (< 10s)');
    } else {
      console.log('⚠️ Tempo excessivo (violando fail-fast)');
    }
    
    // Restaurar DATABASE_URL
    if (originalDbUrl) {
      process.env.DATABASE_URL = originalDbUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
    
    return result;
    
  } catch (error) {
    console.error('\n❌ Erro no teste:', error.message);
    console.error('Stack:', error.stack);
    return { success: false, errors: [error.message], checks: [], warnings: [] };
  }
}

// Executar teste
testBootValidator().then(result => {
  process.exit(result.success ? 0 : 1);
}).catch(error => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
