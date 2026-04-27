#!/usr/bin/env node

/**
 * BLINDAGEM - Detector de "as unknown as"
 * 
 * Este script falha o build se encontrar "as unknown as" no código
 * Uso: node scripts/check-no-unknown-casts.mjs
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVER_DIR = join(__dirname, '..');

const PATTERNS_TO_CHECK = [
  'as unknown as',
  'as any as',
  '<unknown> as',
  'as <unknown>'
];

const EXCLUDED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt'
];

const EXCLUDED_FILES = [
  '*.test.ts',
  '*.test.js',
  '*.spec.ts',
  '*.spec.js',
  '*.broken.ts',
  '*.broken.js'
];

/**
 * Verifica se um arquivo deve ser excluído da verificação
 */
function shouldExcludeFile(filePath) {
  const fileName = filePath.toLowerCase();
  
  // Verificar extensões excluídas
  for (const pattern of EXCLUDED_FILES) {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    if (regex.test(fileName)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Verifica se um diretório deve ser excluído
 */
function shouldExcludeDir(dirName) {
  return EXCLUDED_DIRS.includes(dirName);
}

/**
 * Busca recursivamente por arquivos TypeScript
 */
function findTsFiles(dir, files = []) {
  const items = readdirSync(dir);
  
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      if (!shouldExcludeDir(item)) {
        findTsFiles(fullPath, files);
      }
    } else if (stat.isFile() && extname(item) === '.ts') {
      if (!shouldExcludeFile(fullPath)) {
        files.push(fullPath);
      }
    }
  }
  
  return files;
}

/**
 * Verifica se um arquivo contém padrões proibidos
 */
function checkFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const violations = [];
    
    for (const pattern of PATTERNS_TO_CHECK) {
      const regex = new RegExp(pattern, 'gi');
      let match;
      
      while ((match = regex.exec(content)) !== null) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        const lineContent = lines[lineNumber - 1]?.trim() || '';
        
        violations.push({
          pattern,
          line: lineNumber,
          content: lineContent,
          filePath: filePath.replace(SERVER_DIR, '').replace(/\\/g, '/')
        });
      }
    }
    
    return violations;
  } catch (error) {
    console.error(`Erro ao ler arquivo ${filePath}:`, error.message);
    return [];
  }
}

/**
 * Função principal
 */
function main() {
  console.log('=== BLINDAGEM - Detector de "as unknown as" ===');
  console.log('Verificando arquivos TypeScript...');
  
  const tsFiles = findTsFiles(SERVER_DIR);
  console.log(`Encontrados ${tsFiles.length} arquivos TypeScript para verificar`);
  
  let totalViolations = 0;
  const violationsByFile = {};
  
  for (const file of tsFiles) {
    const violations = checkFile(file);
    
    if (violations.length > 0) {
      violationsByFile[file] = violations;
      totalViolations += violations.length;
    }
  }
  
  if (totalViolations === 0) {
    console.log('=== RESULTADO: LIMPO ===');
    console.log('Nenhum "as unknown as" encontrado nos arquivos verificados.');
    console.log('Baseline protegido contra regressão.');
    process.exit(0);
  } else {
    console.log('\n=== RESULTADO: FALHA ===');
    console.log(`Encontrados ${totalViolations} ocorrências de casts perigosos:`);
    console.log('');
    
    for (const [filePath, violations] of Object.entries(violationsByFile)) {
      const relativePath = filePath.replace(SERVER_DIR, '').replace(/\\/g, '/');
      console.log(`\nArquivo: ${relativePath}`);
      
      for (const violation of violations) {
        console.log(`  Linha ${violation.line}: ${violation.pattern}`);
        console.log(`  Conteúdo: ${violation.content}`);
      }
    }
    
    console.log('\n=== AÇÃO NECESSÁRIA ===');
    console.log('Corrija as ocorrências acima antes de continuar.');
    console.log('Use type guards em vez de casts duplos.');
    console.log('Consulte a documentação do padrão em docs/typescript-patterns.md');
    
    process.exit(1);
  }
}

// Executar verificação
main();
