#!/usr/bin/env node

/**
 * BLINDAGEM - Verificação de Lint (Apenas Server)
 * 
 * Este script executa ESLint apenas no diretório server
 * Uso: node scripts/lint-check-server.mjs
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVER_DIR = join(__dirname, '..');

function main() {
  console.log('=== BLINDAGEM - Verificação de Lint (Server) ===');
  console.log('Executando ESLint com regras de proteção...');
  
  try {
    // Executar ESLint apenas no diretório server, ignorando scripts e testes
    const result = execSync('npx eslint . --ext .ts --max-warnings 0 --ignore-pattern "scripts/*" --ignore-pattern "tests/*"', {
      cwd: SERVER_DIR,
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    
    console.log('=== RESULTADO: LIMPO ===');
    console.log('Nenhuma violação de lint encontrada no server.');
    console.log('Proteção contra regressão ativa.');
    
  } catch (error) {
    console.log('=== RESULTADO: FALHA ===');
    console.log('Violacões de lint encontradas no server:');
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
