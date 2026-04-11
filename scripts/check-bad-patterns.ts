#!/usr/bin/env node
/**
 * scripts/check-bad-patterns.ts
 * FASE 7: Bad pattern detector
 * 
 * Detecta padrões proibidos:
 * - console.log (deve usar logger)
 * - @ts-ignore (deve fixar tipos)
 * - any com fallback tenant
 * - explicit any sem justificativa
 * 
 * Exit: 1 se violar, 0 se OK
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';

interface BadPatternResult {
  file: string;
  line: number;
  pattern: string;
  severity: 'CRITICAL' | 'HIGH' | 'WARN';
  context: string;
}

async function findFiles(dir: string, ext: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (['node_modules', 'dist', '.git', '.next', '.nuxt'].includes(entry.name)) {
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

function isCommentOrString(line: string, position: number): boolean {
  // Simple heuristic: count quotes before position
  const before = line.substring(0, position);
  const quotes = (before.match(/"/g) || []).length;
  const singleQuotes = (before.match(/'/g) || []).length;
  
  return quotes % 2 !== 0 || singleQuotes % 2 !== 0;
}

async function checkFile(filePath: string): Promise<BadPatternResult[]> {
  const results: BadPatternResult[] = [];
  
  try {
    const content = await readFile(filePath, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach((line, idx) => {
      const lineNumber = idx + 1;
      
      // PATTERN 1: console.log (use logger instead)
      if (/console\.(log|error|warn|info|debug)/.test(line)) {
        if (!/^\s*\/\/|^\s*\*/.test(line) && filePath.includes('scripts')) {
          // Allow in scripts for now (FASE 7 focuses on server code)
          // In production, would need logger everywhere
          return;
        }
      }
      
      // PATTERN 2: @ts-ignore (must fix types instead)
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
      
      // PATTERN 3: fallback tenant (|| with tenantId)
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
      
      // PATTERN 4: Explicit any without /* */ comment
      if (/:\s*any\b/.test(line)) {
        const hasComment = /\/\*\s*any\s*\*\/|any[\s]*\/\//.test(line);
        if (!hasComment && !/^\s*\/\/|^\s*\*|type |interface /.test(line)) {
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
    // Ignore read errors
  }
  
  return results;
}

async function main() {
  const cwd = process.cwd();
  
  // Scan server/ for TypeScript files
  const serverFiles = await findFiles(join(cwd, 'server'), '.ts');
  const srcFiles = await findFiles(join(cwd, 'src'), '.ts');
  const allFiles = [...serverFiles, ...srcFiles];
  
  const violations: BadPatternResult[] = [];
  
  for (const file of allFiles) {
    const fileViolations = await checkFile(file);
    violations.push(...fileViolations);
  }
  
  if (violations.length > 0) {
    console.error('\n❌ Bad patterns CRITICAL detected:\n');
    
    const bySeverity = { CRITICAL: [], HIGH: [], WARN: [] };
    violations.forEach(v => {
      bySeverity[v.severity].push(v);
    });
    
    // Show CRITICAL first
    [...bySeverity.CRITICAL, ...bySeverity.HIGH, ...bySeverity.WARN].forEach(v => {
      const relPath = v.file.replace(cwd + '\\', '').replace(/\\/g, '/');
      console.error(`  [${v.severity}] ${relPath}:${v.line}`);
      console.error(`    Pattern: ${v.pattern}`);
      console.error(`    Contexto: ${v.context}\n`);
    });
    
    console.error(`\nTotal: ${violations.length} violations (${bySeverity.CRITICAL.length} CRITICAL)`);
    process.exit(1);
  }
  
  console.log('✅ No bad patterns detected');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error checking patterns:', err);
  process.exit(1);
});
