#!/usr/bin/env node

/**
 * BLINDAGEM - Verificação de Lint
 * 
 * Este script executa ESLint com regras de blindagem
 * Uso: node scripts/lint-check.mjs
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVER_DIR = join(__dirname, '..');

function main() {
  console.log('=== BLINDAGEM - Verificação de Lint ===');
  console.log('Executando ESLint com regras de proteção...');
  
  try {
    // Executar ESLint no diretório server
    const result = execSync('npx eslint . --ext .ts --max-warnings 0', {
      cwd: SERVER_DIR,
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    
    console.log('=== RESULTADO: LIMPO ===');
    console.log('Nenhuma violação de lint encontrada.');
    console.log('Proteção contra regressão ativa.');
    
  } catch (error) {
    console.log('=== RESULTADO: FALHA ===');
    console.log('Violacões de lint encontradas:');
    console.log('');
    console.log(error.stdout);
    console.log('');
    console.log('=== AÇÃO NECESSÁRIA ===');
    console.log('Corrija as violações acima antes de continuar.');
    console.log('Use type guards em vez de casts duplos.');
    console.log('Consulte a documentação em docs/typescript-patterns.md');
    
    process.exit(1);
  }
}

main();
