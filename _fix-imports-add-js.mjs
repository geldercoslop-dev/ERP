import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const root = 'C:/ERP';
const skip = new Set(['node_modules', 'dist', 'backup-fase0', 'coverage', '.git', '.pnpm-store']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// Only skip adding .js for ACTUAL file format extensions
// DO NOT skip .service, .schema, .controller, .middleware, etc. — those are NOT extensions
const knownFileExt = /\.(js|mjs|cjs|ts|tsx|jsx|json|css|scss|sass|less|svg|png|jpg|jpeg|gif|webp|html|htm|txt|md|wasm|d)$/i;

function processContent(content) {
  // Match relative import/export/dynamic-import paths without extension
  // Captures prefix (including opening quote) + relative path, lookahead on closing quote
  return content.replace(
    /((?:import|from|export\s[^'"()\r\n]*?\bfrom)\s+["']|import\s*\(\s*["'])(\.{1,2}\/[^"'\r\n]+?)(?=["'])/g,
    (match, prefix, importPath) => {
      if (knownFileExt.test(importPath)) return match; // already has a real file extension
      return prefix + importPath + '.js';
    }
  );
}

const files = walk(root);
let changed = 0;

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const updated = processContent(content);
  if (updated !== content) {
    writeFileSync(file, updated, 'utf8');
    changed++;
    const rel = file.replace('C:/ERP/', '').replace('C:\\ERP\\', '');
    console.log('Fixed:', rel);
  }
}

console.log('\nTotal files changed:', changed);
