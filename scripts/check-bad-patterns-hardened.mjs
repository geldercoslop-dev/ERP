#!/usr/bin/env node
/**
 * scripts/check-bad-patterns-hardened.mjs
 * Hardening de padrões perigosos de tipo.
 *
 * Detecta:
 * - as any / any[] / <any>
 * - casts inseguros em cadeia (as unknown as T)
 * - uso incorreto de unknown (property access sem narrowing)
 * - bypass de type system via comentários ts-ignore
 *
 * Exit: 1 se houver violação, 0 se clean.
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

    const isComment = (line) => /^\s*\/\/|^\s*\*/.test(line);
    const hasUnknownGuardNearby = (idx) => {
      const windowText = lines.slice(Math.max(0, idx - 4), Math.min(lines.length, idx + 5)).join('\n');
      return /typeof\s+\w+\s*===\s*['"][^'"]+['"]|\bin\s*\(|Array\.isArray\(|instanceof\s+|is[A-Z]\w*\s*\(/.test(windowText);
    };

    lines.forEach((line, idx) => {
      const lineNumber = idx + 1;

      if (/@ts-ignore|@ts-nocheck|@ts-expect-error/.test(line)) {
        results.push({
          file: filePath,
          line: lineNumber,
          pattern: '@ts-ignore/@ts-nocheck/@ts-expect-error',
          severity: 'CRITICAL',
          msg: 'Bypass de type checking detectado'
        });
      }

      if (/\bas\s+any\b|<\s*any\s*>|:\s*any(\[])?\b/.test(line) && !isComment(line)) {
        results.push({
          file: filePath,
          line: lineNumber,
          pattern: 'Uso explícito de any',
          severity: 'CRITICAL',
          msg: 'Uso de any detectado (as any/any[]/: any)'
        });
      }

      if (/\bas\s+unknown\s+as\s+\w+/.test(line) && !isComment(line)) {
        results.push({
          file: filePath,
          line: lineNumber,
          pattern: 'Double cast via unknown',
          severity: 'CRITICAL',
          msg: 'Cast inseguro em cadeia (as unknown as T) detectado'
        });
      }

      if (/\bcatch\s*\(\s*\w+\s*:\s*any\s*\)/.test(line)) {
        results.push({
          file: filePath,
          line: lineNumber,
          pattern: 'catch(error: any)',
          severity: 'HIGH',
          msg: 'Use unknown + narrowing em catch, não any'
        });
      }

      if (/\.(map|filter|reduce|forEach|flatMap|some|every|find)\s*\(\s*\([^)]*:\s*unknown\b/.test(line) && !hasUnknownGuardNearby(idx)) {
        results.push({
          file: filePath,
          line: lineNumber,
          pattern: 'unknown sem narrowing em callback',
          severity: 'HIGH',
          msg: 'unknown usado sem narrowing/type guard em callback'
        });
      }

      if (/\b\w+\s*:\s*unknown\b/.test(line) && /\b\w+\.[A-Za-z_]/.test(line) && !hasUnknownGuardNearby(idx)) {
        results.push({
          file: filePath,
          line: lineNumber,
          pattern: 'property access em unknown sem narrowing',
          severity: 'HIGH',
          msg: 'Acesso a propriedade em unknown sem guard detectado'
        });
      }

      if (/\([^)]*\bas\s+unknown\b[^)]*\)\s*\./.test(line) && !isComment(line)) {
        results.push({
          file: filePath,
          line: lineNumber,
          pattern: 'unknown cast + acesso direto',
          severity: 'HIGH',
          msg: 'unknown convertido e usado sem validação intermediária'
        });
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
    process.stdout.write('\n' + '='.repeat(70) + '\n');
    process.stdout.write('❌ BAD PATTERNS HARDENED VALIDATION FAILED\n');
    process.stdout.write('='.repeat(70) + '\n\n');
    
    const bySeverity = { CRITICAL: [], HIGH: [] };
    violations.forEach(v => {
      bySeverity[v.severity].push(v);
    });
    
    if (bySeverity.CRITICAL.length > 0) {
      process.stdout.write('🔴 CRITICAL (Type bypass):\n\n');
      bySeverity.CRITICAL.forEach(v => {
        const relPath = v.file.replace(cwd + '\\', '').replace(/\\/g, '/');
        process.stdout.write(`  ${relPath}:${v.line}\n`);
        process.stdout.write(`  ⚠️  ${v.msg}\n\n`);
      });
    }
    
    if (bySeverity.HIGH.length > 0) {
      process.stdout.write('🟠 HIGH (Silent bypass):\n\n');
      bySeverity.HIGH.forEach(v => {
        const relPath = v.file.replace(cwd + '\\', '').replace(/\\/g, '/');
        process.stdout.write(`  ${relPath}:${v.line}\n`);
        process.stdout.write(`  ⚠️  ${v.msg}\n\n`);
      });
    }
    
    process.stdout.write(`\n📊 Total: ${violations.length} patterns\n`);
    process.stdout.write(`   ${bySeverity.CRITICAL.length} CRITICAL\n`);
    process.stdout.write(`   ${bySeverity.HIGH.length} HIGH\n`);
    process.stdout.write('\n');
    process.exit(1);
  }
  
  process.stdout.write('✅ Bad patterns check PASSED - zero violations\n');
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write('FATAL ERROR: ' + String(err) + '\n');
  process.exit(1);
});
