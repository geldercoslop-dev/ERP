#!/usr/bin/env node
/**
 * check-architecture.ts
 * FASE 4: Detector de violação arquitetural
 * 
 * Detecta padrões perigosos:
 * - DEFAULT_TENANT_ID (nunca deve existir)
 * - TEST_TENANT_ID fora de /test/ ou *.test.ts
 * - SEED_TENANT_ID fora de /seed/ ou seed scripts
 * 
 * Exit: 1 se violar, 0 se OK
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';

interface ArchCheckResult {
  file: string;
  line: number;
  pattern: string;
  context: string;
}

async function findFiles(dir: string, ext: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      // Skip directories
      if (entry.isDirectory()) {
        // Skip node_modules, dist, .git, etc
        if (['node_modules', 'dist', '.git', '.next', '.nuxt'].includes(entry.name)) {
          continue;
        }
        files.push(...(await findFiles(fullPath, ext)));
      } else if (extname(entry.name) === ext) {
        files.push(fullPath);
      }
    }
  } catch {
    // Ignore errors (permission denied, etc)
  }
  
  return files;
}

function isTestContext(filePath: string): boolean {
  return filePath.includes('/test') || 
         filePath.includes('\\test') ||
         filePath.endsWith('.test.ts') ||
         filePath.endsWith('.spec.ts');
}

function isSeedContext(filePath: string): boolean {
  return filePath.includes('seed') || filePath.includes('Seed') || filePath.includes('SEED');
}

async function checkFile(filePath: string): Promise<ArchCheckResult[]> {
  const results: ArchCheckResult[] = [];
  
  try {
    const content = await readFile(filePath, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach((line, idx) => {
      const lineNumber = idx + 1;
      
      // Pattern 1: DEFAULT_TENANT_ID (totally forbidden)
      if (/DEFAULT_TENANT_ID/.test(line)) {
        // Skip comments and type definitions
        if (!/^\s*\/\/|^\s*\*|type|interface/.test(line)) {
          results.push({
            file: filePath,
            line: lineNumber,
            pattern: 'DEFAULT_TENANT_ID',
            context: line.trim()
          });
        }
      }
      
      // Pattern 2: TEST_TENANT_ID outside test context
      if (/TEST_TENANT_ID/.test(line) && !isTestContext(filePath)) {
        if (!/^\s*\/\/|^\s*\*|type|interface/.test(line)) {
          results.push({
            file: filePath,
            line: lineNumber,
            pattern: 'TEST_TENANT_ID (fora de /test)',
            context: line.trim()
          });
        }
      }
      
      // Pattern 3: SEED_TENANT_ID outside seed context
      if (/SEED_TENANT_ID/.test(line) && !isSeedContext(filePath)) {
        if (!/^\s*\/\/|^\s*\*|type|interface/.test(line)) {
          results.push({
            file: filePath,
            line: lineNumber,
            pattern: 'SEED_TENANT_ID (fora de seed)',
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
  
  // Scan server/ and src/ for TypeScript files
  const serverFiles = await findFiles(join(cwd, 'server'), '.ts');
  const srcFiles = await findFiles(join(cwd, 'src'), '.ts');
  const allFiles = [...serverFiles, ...srcFiles];
  
  const violations: ArchCheckResult[] = [];
  
  for (const file of allFiles) {
    const fileViolations = await checkFile(file);
    violations.push(...fileViolations);
  }
  
  if (violations.length > 0) {
    console.error('❌ Violações arquiteturais detectadas:\n');
    
    violations.forEach(v => {
      const relPath = v.file.replace(cwd + '\\', '').replace(/\\/g, '/');
      console.error(`  ${relPath}:${v.line}`);
      console.error(`    Pattern: ${v.pattern}`);
      console.error(`    Contexto: ${v.context}\n`);
    });
    
    console.error(`\nTotal de violações: ${violations.length}`);
    process.exit(1);
  }
  
  console.log('✅ Nenhuma violação arquitetural detectada');
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro ao verificar arquitetura:', err);
  process.exit(1);
});
