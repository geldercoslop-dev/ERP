#!/usr/bin/env node

/**
 * Gerador de Baseline para SHIELD
 * 
 * Este script gera o baseline inicial de violações existentes
 * Uso: node server/scripts/generate-baseline.mjs
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVER_DIR = join(__dirname, '..');

const PATTERNS_TO_CHECK = [
  'as unknown as',
  'as any',
  '<unknown>',
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

function shouldExcludeFile(filePath) {
  const fileName = filePath.toLowerCase();
  
  for (const pattern of EXCLUDED_FILES) {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    if (regex.test(fileName)) {
      return true;
    }
  }
  
  return false;
}

function shouldExcludeDir(dirName) {
  return EXCLUDED_DIRS.includes(dirName);
}

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

function main() {
  console.log('=== GERADOR DE BASELINE - SHIELD ===');
  console.log('Escaneando violações existentes...');
  
  const tsFiles = findTsFiles(SERVER_DIR);
  console.log(`Encontrados ${tsFiles.length} arquivos TypeScript`);
  
  let totalViolations = 0;
  const violationsByFile = {};
  
  for (const file of tsFiles) {
    const violations = checkFile(file);
    
    if (violations.length > 0) {
      violationsByFile[file] = violations;
      totalViolations += violations.length;
    }
  }
  
  // Gerar baseline estruturado
  const baseline = {
    generated: new Date().toISOString(),
    totalViolations,
    files: {},
    summary: {
      byPattern: {}
    }
  };
  
  // Organizar por arquivo e padrão
  for (const [filePath, violations] of Object.entries(violationsByFile)) {
    const relativePath = filePath.replace(SERVER_DIR, '').replace(/\\/g, '/');
    baseline.files[relativePath] = violations.map(v => ({
      line: v.line,
      pattern: v.pattern,
      content: v.content
    }));
    
    // Contar por padrão
    for (const violation of violations) {
      baseline.summary.byPattern[violation.pattern] = 
        (baseline.summary.byPattern[violation.pattern] || 0) + 1;
    }
  }
  
  // Salvar baseline
  const baselinePath = join(SERVER_DIR, 'scripts', 'unsafe-casts-baseline.json');
  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));
  
  console.log('\n=== BASELINE GERADO ===');
  console.log(`Arquivo: ${baselinePath}`);
  console.log(`Total de violações: ${totalViolations}`);
  console.log(`Arquivos afetados: ${Object.keys(baseline.files).length}`);
  
  console.log('\n=== RESUMO POR PADRÃO ===');
  for (const [pattern, count] of Object.entries(baseline.summary.byPattern)) {
    console.log(`${pattern}: ${count} ocorrências`);
  }
  
  console.log('\n=== BASELINE SALVO ===');
  console.log('Agora o SHIELD permitirá estas violações como legado.');
  console.log('Qualquer nova violação será bloqueada.');
}

main();
