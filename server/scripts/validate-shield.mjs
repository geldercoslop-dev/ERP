#!/usr/bin/env node

/**
 * BLINDAGEM - Validação Final da Proteção
 * 
 * Este script executa todas as verificações de blindagem
 * Uso: node scripts/validate-shield.mjs
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVER_DIR = join(__dirname, '..');

function runCommand(command, description) {
  console.log(`\n=== ${description} ===`);
  try {
    const result = execSync(command, {
      cwd: SERVER_DIR,
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    console.log('Status: PASS');
    return true;
  } catch (error) {
    console.log('Status: FAIL');
    console.log(error.stdout);
    return false;
  }
}

function runCommandWithOutput(command, description) {
  console.log(`\n=== ${description} ===`);
  try {
    const result = execSync(command, {
      cwd: SERVER_DIR,
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    console.log('Status: PASS');
    return { passed: true, output: result };
  } catch (error) {
    console.log('Status: FAIL');
    console.log(error.stdout);
    return { passed: false, output: error.stdout };
  }
}

function main() {
  console.log('=== BLINDAGEM - VALIDAÇÃO FINAL DA PROTEÇÃO ===');
  console.log('Executando todas as verificações de segurança...');
  
  const checks = [
    {
      command: 'npx tsc --noEmit -p tsconfig.server.json',
      description: 'TypeScript Compilation Check'
    },
    {
      command: 'node scripts/check-no-unsafe-casts.mjs',
      description: 'Unsafe Casts Detection (com Baseline)'
    },
    {
      command: 'node scripts/lint-check-server.mjs',
      description: 'ESLint Rules Check'
    }
  ];
  
  let allPassed = true;
  let castCheckResult = null;
  
  for (const check of checks) {
    const result = runCommandWithOutput(check.command, check.description);
    
    if (!result.passed) {
      allPassed = false;
      
      // Guardar resultado do check de casts para análise
      if (check.description.includes('Casts Detection')) {
        castCheckResult = result;
      }
    }
  }
  
  console.log('\n=== RESULTADO FINAL ===');
  
  if (allPassed) {
    console.log('Status: SHIELD ATIVO');
    console.log('Todas as verificações passaram com sucesso.');
    console.log('Baseline protegido contra regressão de tipos.');
    console.log('');
    console.log('Proteções ativas:');
    console.log('  1. TypeScript compilation: OK');
    console.log('  2. Unsafe casts detection (baseline): OK');
    console.log('  3. ESLint rules: OK');
    console.log('  4. Documentation: docs/type-safety-rules.md');
    console.log('');
    console.log('O sistema está seguro contra novas violações de type safety.');
    console.log('Legado existente protegido pelo baseline.');
    process.exit(0);
  } else {
    console.log('Status: SHIELD COMPROMETIDO');
    
    // Análise específica para casts
    if (castCheckResult) {
      const output = castCheckResult.output;
      
      if (output.includes('Novas violações (bloqueadas): 0')) {
        console.log('\nATENÇÃO: Casts detectados mas são apenas legado existente.');
        console.log('Isso é normal - o baseline está protegendo violações antigas.');
        console.log('Apenas NOVAS violações bloqueiam o build.');
        
        // Verificar se há outros erros além de casts
        if (output.includes('TypeScript Compilation Check') && 
            output.includes('Status: FAIL')) {
          console.log('\nERROS CRÍTICOS DETECTADOS:');
          console.log('  - TypeScript compilation: FALHOU');
          console.log('  - Isso precisa ser corrigido imediatamente.');
        }
      } else {
        console.log('\nNOVAS VIOLAÇÕES DETECTADAS:');
        console.log('  - Casts perigosos introduzidos recentemente');
        console.log('  - Isso bloqueia o build por segurança');
      }
    }
    
    console.log('\nAções necessárias:');
    console.log('  1. Corrigir erros de TypeScript (se houver)');
    console.log('  2. Remover NOVAS violações de casts');
    console.log('  3. Corrigir violações de ESLint');
    console.log('  4. Consultar docs/type-safety-rules.md');
    console.log('\nPara atualizar baseline (se necessário):');
    console.log('  node scripts/generate-baseline.mjs');
    console.log('\nPara verificar apenas casts:');
    console.log('  npm run shield:casts');
    
    process.exit(1);
  }
}

main();
