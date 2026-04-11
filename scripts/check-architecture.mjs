#!/usr/bin/env node
/**
 * scripts/check-architecture.mjs
 * FASE 4: Detector de violação arquitetural (versão executável)
 * 
 * Detecta padrões perigosos em tempo real:
 * - DEFAULT_TENANT_ID (nunca deve existir)
 * - TEST_TENANT_ID fora de /test/ ou *.test.ts
 * - SEED_TENANT_ID fora de /seed/ ou seed scripts
 * 
 * Uso: node scripts/check-architecture.mjs
 * Exit: 1 se violar, 0 se OK
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';

async function findFiles(dir, ext) {
  const files = [];
  
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip unwanted directories
        if (['node_modules', 'dist', '.git', '.next', '.nuxt', '.idea'].includes(entry.name)) {
          continue;
        }
        files.push(...(await findFiles(fullPath, ext)));
      } else if (extname(entry.name) === ext) {
        files.push(fullPath);
      }
    }
  } catch {
    // Ignore errors
  }
  
  return files;
}

function isTestContext(filePath) {
  return filePath.includes('/test') || 
         filePath.includes('\\test') ||
         filePath.endsWith('.test.ts') ||
         filePath.endsWith('.spec.ts') ||
         filePath.endsWith('.test.js') ||
         filePath.endsWith('.spec.js');
}

function isSeedContext(filePath) {
  const lower = filePath.toLowerCase();
  return lower.includes('seed') || filePath.includes('Seed') || filePath.includes('SEED');
}

async function checkFile(filePath) {
  const results = [];
  
  try {
    const content = await readFile(filePath, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach((line, idx) => {
      const lineNumber = idx + 1;
      
      // PATTERN 1: DEFAULT_TENANT_ID (completely forbidden)
      if (/DEFAULT_TENANT_ID/.test(line)) {
        if (!/^\s*\/\/|^\s*\*|type\s|interface\s/.test(line)) {
          results.push({
            file: filePath,
            line: lineNumber,
            pattern: 'DEFAULT_TENANT_ID',
            severity: 'CRITICAL',
            context: line.trim()
          });
        }
      }
      
      // PATTERN 2: TEST_TENANT_ID outside test context
      if (/TEST_TENANT_ID/.test(line) && !isTestContext(filePath)) {
        if (!/^\s*\/\/|^\s*\*|type\s|interface\s/.test(line)) {
          results.push({
            file: filePath,
            line: lineNumber,
            pattern: 'TEST_TENANT_ID (outside /test)',
            severity: 'HIGH',
            context: line.trim()
          });
        }
      }
      
      // PATTERN 3: SEED_TENANT_ID outside seed context
      if (/SEED_TENANT_ID/.test(line) && !isSeedContext(filePath)) {
        if (!/^\s*\/\/|^\s*\*|type\s|interface\s/.test(line)) {
          results.push({
            file: filePath,
            line: lineNumber,
            pattern: 'SEED_TENANT_ID (outside seed)',
            severity: 'HIGH',
            context: line.trim()
          });
        }
      }
    });
  } catch {
    // Ignore read errors
  }
  
  return results;
}

async function main() {
  const cwd = process.cwd();
  
  // Scan server/ and src/ for TypeScript/JavaScript files
  const serverFiles = await findFiles(join(cwd, 'server'), '.ts');
  const srcFiles = await findFiles(join(cwd, 'src'), '.ts');
  const serverJsFiles = await findFiles(join(cwd, 'server'), '.js');
  const srcJsFiles = await findFiles(join(cwd, 'src'), '.js');
  
  const allFiles = [...serverFiles, ...srcFiles, ...serverJsFiles, ...srcJsFiles];
  
  const violations = [];
  
  for (const file of allFiles) {
    const fileViolations = await checkFile(file);
    violations.push(...fileViolations);
  }
  
  if (violations.length > 0) {
    process.stdout.write('\n❌ Violações arquiteturais CRÍTICAS detectadas:\n\n');
    
    const bySeverity = { CRITICAL: [], HIGH: [] };
    violations.forEach(v => {
      bySeverity[v.severity].push(v);
    });
    
    // Show CRITICAL first
    [...bySeverity.CRITICAL, ...bySeverity.HIGH].forEach(v => {
      const relPath = v.file.replace(cwd + '\\', '').replace(/\\/g, '/');
      process.stdout.write(`  [${v.severity}] ${relPath}:${v.line}\n`);
      process.stdout.write(`    Pattern: ${v.pattern}\n`);
      process.stdout.write(`    Contexto: ${v.context}\n\n`);
    });
    
    process.stdout.write(`\nTotal: ${violations.length} violações (${bySeverity.CRITICAL.length} CRÍTICAS)\n`);
    process.exit(1);
  }
  
  process.stdout.write('✅ Nenhuma violação arquitetural detectada\n');
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write('Erro ao verificar arquitetura: ' + String(err) + '\n');
  process.exit(1);
});
