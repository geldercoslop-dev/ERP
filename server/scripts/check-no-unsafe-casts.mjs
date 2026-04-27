#!/usr/bin/env node

/**
 * SHIELD - Detector de Casts Perigosos com Baseline
 * 
 * Este script permite legado existente mas bloqueia novas violações
 * Uso: node server/scripts/check-no-unsafe-casts.mjs
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

/**
 * Carrega baseline de violações existentes
 */
function loadBaseline() {
  try {
    const baselinePath = join(SERVER_DIR, 'scripts', 'unsafe-casts-baseline.json');
    const baselineContent = readFileSync(baselinePath, 'utf-8');
    return JSON.parse(baselineContent);
  } catch (error) {
    console.warn('Baseline não encontrado, tratando todas as violações como novas');
    return { files: {} };
  }
}

/**
 * Verifica se um arquivo deve ser excluído da verificação
 */
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
 * Compara violações com baseline
 */
function compareWithBaseline(currentViolations, baseline) {
  const legacyViolations = [];
  const newViolations = [];
  
  // Criar mapa de violações do baseline
  const baselineMap = new Map();
  for (const [filePath, violations] of Object.entries(baseline.files)) {
    for (const violation of violations) {
      const key = `${filePath}:${violation.line}:${violation.pattern}`;
      baselineMap.set(key, violation);
    }
  }
  
  // Classificar violações atuais
  for (const violation of currentViolations) {
    const key = `${violation.filePath}:${violation.line}:${violation.pattern}`;
    
    if (baselineMap.has(key)) {
      legacyViolations.push(violation);
    } else {
      newViolations.push(violation);
    }
  }
  
  return { legacyViolations, newViolations };
}

/**
 * Função principal
 */
function main() {
  console.log('=== SHIELD - Detector com Baseline ===');
  console.log('Verificando arquivos TypeScript em server/...');
  
  // Carregar baseline
  const baseline = loadBaseline();
  console.log(`Baseline carregado: ${baseline.totalViolations || 0} violações legadas`);
  
  const tsFiles = findTsFiles(SERVER_DIR);
  console.log(`Encontrados ${tsFiles.length} arquivos TypeScript para verificar`);
  
  let totalViolations = 0;
  const allViolations = [];
  
  for (const file of tsFiles) {
    const violations = checkFile(file);
    allViolations.push(...violations);
    totalViolations += violations.length;
  }
  
  // Comparar com baseline
  const { legacyViolations, newViolations } = compareWithBaseline(allViolations, baseline);
  
  console.log('\n=== ANÁLISE DE VIOLAÇÕES ===');
  console.log(`Total de violações encontradas: ${totalViolations}`);
  console.log(`Violações legadas (ignoradas): ${legacyViolations.length}`);
  console.log(`Novas violações (bloqueadas): ${newViolations.length}`);
  
  if (newViolations.length === 0) {
    console.log('\n=== RESULTADO: OK ===');
    console.log('Nenhuma nova violação detectada.');
    console.log('SHIELD ATIVO - Baseline protegido contra regressão.');
    
    if (legacyViolations.length > 0) {
      console.log(`\nLegado protegido: ${legacyViolations.length} violações existentes ignoradas.`);
    }
    
    process.exit(0);
  } else {
    console.log('\n=== RESULTADO: FALHA ===');
    console.log(`Detectadas ${newViolations.length} novas violações:`);
    console.log('');
    
    // Agrupar novas violações por arquivo
    const newViolationsByFile = {};
    for (const violation of newViolations) {
      if (!newViolationsByFile[violation.filePath]) {
        newViolationsByFile[violation.filePath] = [];
      }
      newViolationsByFile[violation.filePath].push(violation);
    }
    
    for (const [filePath, violations] of Object.entries(newViolationsByFile)) {
      console.log(`\nArquivo: ${filePath}`);
      
      for (const violation of violations) {
        console.log(`  Linha ${violation.line}: ${violation.pattern}`);
        console.log(`  Conteúdo: ${violation.content}`);
      }
    }
    
    if (legacyViolations.length > 0) {
      console.log(`\n=== LEGADO IGNORADO ===`);
      console.log(`${legacyViolations.length} violações existentes ignoradas pelo baseline.`);
    }
    
    console.log('\n=== AÇÃO NECESSÁRIA ===');
    console.log('Corrija as NOVAS violações acima antes de continuar.');
    console.log('Use type guards em vez de casts perigosos.');
    console.log('Consulte docs/type-safety-rules.md');
    console.log('\nPara atualizar baseline (se necessário):');
    console.log('  node scripts/generate-baseline.mjs');
    
    process.exit(1);
  }
}

// Executar verificação
main();
