#!/usr/bin/env node
/**
 * scripts/check-bad-patterns.mjs
 * FASE 7: Bad pattern detector (executável)
 * 
 * Detecta padrões anti-pattern proibidos:
 * - @ts-ignore (deve fixar tipos)
 * - fallback tenant (tenantId ||)
 * - explicit any sem justificativa
 * 
 * Exit: 1 se violar, exit 0 se OK
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
        if (['node_modules', 'dist', '.git', '.next', '.nuxt', '.idea'].includes(entry.name)) {
          continue;
        }
        files.push(...(await findFiles(fullPath, ext)));
      } else if (extname(entry.name) === ext) {
        files.push(fullPath);
      }
    }
  } catch {
    // Ignore
  }
  
  return files;
}

async function checkFile(filePath) {
  const results = [];
  
  try {
    const content = await readFile(filePath, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach((line, idx) => {
      const lineNumber = idx + 1;
      
      // PATTERN 1: @ts-ignore (must fix types instead)
      if (/@ts-ignore/.test(line)) {
        if (!/^\s*\/\/|^\s*\*/.test(line)) {
          results.push({
            file: filePath,
            line: lineNumber,
            pattern: '@ts-ignore',
            severity: 'HIGH',
            context: line.trim()
          });
        }
      }
      
      // PATTERN 2: fallback tenant (|| with tenantId)
      if (/tenantId\s*\|\|/.test(line)) {
        if (!/^\s*\/\/|^\s*\*/.test(line)) {
          results.push({
            file: filePath,
            line: lineNumber,
            pattern: 'Fallback tenant (||)',
            severity: 'CRITICAL',
            context: line.trim()
          });
        }
      }
      
      // PATTERN 3: Explicit any without /* */ comment
      if (/:\s*any\b/.test(line)) {
        const hasComment = /\/\*\s*any\s*\*\/|any[\s]*\/\//.test(line);
        if (!hasComment && !/^\s*\/\/|^\s*\*|type \w+\s*=|interface \w+/.test(line)) {
          results.push({
            file: filePath,
            line: lineNumber,
            pattern: 'Explicit any (no justification)',
            severity: 'HIGH',
            context: line.trim()
          });
        }
      }
    });
  } catch {
    // Ignore
  }
  
  return results;
}

async function main() {
  const cwd = process.cwd();
  
  const serverFiles = await findFiles(join(cwd, 'server'), '.ts');
  const srcFiles = await findFiles(join(cwd, 'src'), '.ts');
  const allFiles = [...serverFiles, ...srcFiles];
  
  const violations = [];
  
  for (const file of allFiles) {
    const fileViolations = await checkFile(file);
    violations.push(...fileViolations);
  }
  
  if (violations.length > 0) {
    process.stdout.write('\n❌ Bad patterns VIOLATION detected:\n\n');
    
    const bySeverity = { CRITICAL: [], HIGH: [] };
    violations.forEach(v => {
      bySeverity[v.severity].push(v);
    });
    
    [...bySeverity.CRITICAL, ...bySeverity.HIGH].forEach(v => {
      const relPath = v.file.replace(cwd + '\\', '').replace(/\\/g, '/');
      process.stdout.write(`  [${v.severity}] ${relPath}:${v.line}\n`);
      process.stdout.write(`    Pattern: ${v.pattern}\n`);
      process.stdout.write(`    Contexto: ${v.context}\n\n`);
    });
    
    process.stdout.write(`\nTotal: ${violations.length} violations (${bySeverity.CRITICAL.length} CRITICAL)\n`);
    process.exit(1);
  }
  
  process.stdout.write('✅ No bad patterns detected\n');
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write('Error checking patterns: ' + String(err) + '\n');
  process.exit(1);
});
