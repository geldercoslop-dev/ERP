#!/usr/bin/env node

/**
 * TESTE DIRETO: BOOT VALIDATOR
 * Testa o boot validator diretamente sem compilação
 */

const path = require('path');
const { createRequire } = require('module');

console.log('='.repeat(60));
console.log('TESTE DIRETO: BOOT VALIDATOR');
console.log('='.repeat(60));

async function testBootValidatorDirect() {
  try {
    // Configurar ambiente para teste
    process.env.DATABASE_URL = 'mysql://vendas:vendas123@invalid-host:3306/vendas_app';
    process.env.NODE_ENV = 'production';
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    
    console.log('✓ Ambiente configurado com DB offline');
    
    // Carregar tsx para executar TypeScript
    const { execSync } = require('child_process');
    
    try {
      // Tentar executar o boot validator com tsx
      console.log('\n🔍 Executando boot validator com tsx...');
      
      const result = execSync('npx tsx server/_core/boot-validator-fixed.ts', {
        cwd: __dirname,
        stdio: 'pipe',
        timeout: 10000,
        env: {
          ...process.env,
          DATABASE_URL: 'mysql://vendas:vendas123@invalid-host:3306/vendas_app',
          NODE_ENV: 'production'
        }
      });
      
      console.log('✅ Boot validator executado');
      console.log('Output:', result.toString());
      
    } catch (error) {
      const output = error.stdout ? error.stdout.toString() : '';
      const stderr = error.stderr ? error.stderr.toString() : '';
      
      console.log('❌ Boot validator falhou (esperado)');
      console.log('Exit code:', error.status);
      
      if (output) console.log('STDOUT:', output);
      if (stderr) console.log('STDERR:', stderr);
      
      // Verificar se falhou por DB
      if (output.includes('Database') || 
          stderr.includes('Database') ||
          output.includes('ECONNREFUSED') ||
          stderr.includes('ECONNREFUSED') ||
          output.includes('ENOTFOUND') ||
          stderr.includes('ENOTFOUND')) {
        console.log('✅ Falha por DB detectada');
      }
    }
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

testBootValidatorDirect();
