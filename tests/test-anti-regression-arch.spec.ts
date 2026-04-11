import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const forbiddenDirs = [
  'server/leo/',
  'server/tools/',
  'server/routes/',
  'server/controllers/',
  'server/middlewares/',
];
const forbiddenPatterns = [
  /\bdb\s*\./g,
  /drizzle/gi,
  /mysql/gi,
  /execute\s*\(/g,
  /query\s*\(/g,
  /sql`/g,
];

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (fullPath.endsWith('.ts') || fullPath.endsWith('.js') || fullPath.endsWith('.mjs') || fullPath.endsWith('.cjs')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('ARCH_VIOLATION_TEST: DB somente via SERVICES', () => {
  it('não deve haver acesso direto ao DB fora de SERVICES', () => {
    const violations: string[] = [];
    for (const dir of forbiddenDirs) {
      const absDir = path.join(ROOT, dir);
      for (const file of walk(absDir)) {
        const rel = path.relative(ROOT, file).replace(/\\/g, '/');
        if (rel.includes('/services/')) continue;
        if (rel.endsWith('.d.ts') || rel.includes('/tests/') || rel.includes('.test.') || rel.includes('.spec.')) continue;
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split(/\r?\n/);
        lines.forEach((line, idx) => {
          forbiddenPatterns.forEach((pattern) => {
            pattern.lastIndex = 0;
            if (pattern.test(line)) {
              violations.push(`[ARCH_VIOLATION_TEST] Direct DB access outside SERVICES: ${rel}:${idx + 1} :: ${line.trim()}`);
            }
          });
        });
      }
    }
    if (violations.length > 0) {
      throw new Error(violations.join('\n'));
    }
    expect(violations.length).toBe(0);
  });
});
