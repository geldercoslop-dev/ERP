import fs from 'fs';
import path from 'path';

const base = 'server/leo';
const forbidden = ['drizzle', 'mysql', 'database', 'execute', 'query'];

const fileExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

function scan(dir: string): void {
  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) {
      scan(full);
      continue;
    }

    const ext = path.extname(full);
    if (!fileExtensions.has(ext)) {
      continue;
    }

    const content = fs.readFileSync(full, 'utf8');
    const specifiers: string[] = [];

    const fromImportRegex = /\b(?:import|export)\s+[\s\S]*?\bfrom\s*['\"]([^'\"]+)['\"]/g;
    const sideEffectImportRegex = /\bimport\s*['\"]([^'\"]+)['\"]/g;
    const requireRegex = /\brequire\s*\(\s*['\"]([^'\"]+)['\"]\s*\)/g;
    const dynamicImportRegex = /\bimport\s*\(\s*['\"]([^'\"]+)['\"]\s*\)/g;

    for (const regex of [fromImportRegex, sideEffectImportRegex, requireRegex, dynamicImportRegex]) {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        specifiers.push(match[1].toLowerCase());
      }
    }

    forbidden.forEach((f) => {
      const hit = specifiers.find((specifier) => {
        if (specifier.includes('/services/')) {
          return false;
        }
        return specifier.includes(f);
      });
      if (hit) {
        throw new Error(`[LEO VIOLATION] ${full} imports forbidden module reference: ${f} (${hit})`);
      }
    });
  }
}

scan(base);
console.log('[verify:leo] OK - no forbidden DB access patterns found in server/leo');
