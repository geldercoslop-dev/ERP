#!/usr/bin/env node
/**
 * scripts/check-leo-imports.mjs
 * Validação crítica: LEO não pode acessar DB fora da camada de services.
 *
 * Bloqueia:
 * - import direto de DB
 * - import indireto (cadeia de imports chegando em DB)
 * - imports de camadas proibidas fora de services
 *
 * Exit: 1 se houver qualquer violação.
 */

import { readFile, readdir, writeFile, mkdir, access } from 'node:fs/promises';
import { join, extname, dirname, resolve } from 'node:path';

const IMPORT_RE = /(?:import\s+[^'"\n]+from\s+|import\s*\(\s*|require\s*\()\s*["']([^"']+)["']/g;
const RE_EXPORT_RE = /export\s+(?:\*\s+from|\{[^}]+\}\s+from)\s*["']([^"']+)["']/g;

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

function rel(filePath) {
  const cwd = normalizePath(process.cwd());
  const normalized = normalizePath(filePath);
  return normalized.startsWith(`${cwd}/`) ? normalized.slice(cwd.length + 1) : normalized;
}

function looksLikeForbiddenDbTarget(pathLike) {
  return /(^|[\\/])db([\\/]|$)/.test(pathLike) ||
    /[\\/]_core[\\/]database/.test(pathLike) ||
    /[\\/]config[\\/]database/.test(pathLike) ||
    /[\\/]modules[\\/]safe-/.test(pathLike) ||
    /tenant-db-map/.test(pathLike);
}

function extractImports(content) {
  const imports = [];
  let match;
  while ((match = IMPORT_RE.exec(content)) !== null) {
    imports.push(match[1]);
  }
  while ((match = RE_EXPORT_RE.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

async function resolveImportTarget(filePath, importPath) {
  if (!importPath.startsWith('.')) {
    return null;
  }

  const base = dirname(filePath);
  const abs = resolve(base, importPath);
  const candidates = [
    abs,
    `${abs}.ts`,
    `${abs}.js`,
    join(abs, 'index.ts'),
    join(abs, 'index.js'),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // tentar próximo
    }
  }

  return null;
}

async function findLeoFiles(dir) {
  const files = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', 'dist', '.git'].includes(entry.name)) {
          continue;
        }
        files.push(...(await findLeoFiles(fullPath)));
      } else if (extname(entry.name) === '.ts' || extname(entry.name) === '.js') {
        if (fullPath.includes('/leo/') || fullPath.includes('\\leo\\')) {
          files.push(fullPath);
        }
      }
    }
  } catch {
    // Ignore
  }
  return files;
}

async function checkLeoFile(filePath) {
  const results = [];
  try {
    const content = await readFile(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      if (!/import\s*\(/.test(line)) {
        return;
      }

      // Ignora métodos chamados "import(...)" em classe/objeto.
      if (/^\s*(?:public\s+|private\s+|protected\s+|static\s+|async\s+)*import\s*\(/.test(line)) {
        return;
      }

      // Considera apenas uso em expressão: await/return/atribuição/call-site.
      if (!/(await\s+import\s*\(|return\s+import\s*\(|=\s*import\s*\(|\(\s*import\s*\()/.test(line)) {
        return;
      }

      const exprMatch = line.match(/import\s*\(([^)]+)\)/);
      const expr = exprMatch?.[1]?.trim() ?? '';
      const isLiteral = /^['"][^'"]+['"]$/.test(expr);
      if (!isLiteral) {
        results.push({
          file: filePath,
          line: idx + 1,
          violation: 'Dynamic import não literal em LEO (proibido por blindagem)',
          code: line.trim(),
        });
      }
    });
    
    lines.forEach((line, idx) => {
      const lineNumber = idx + 1;
      
      // Check for forbidden DB imports
      const forbidden = [
        /from\s+["'].*[\\/]db([\\/]|["'])/,
        /require\s*\(\s*["'].*[\\/]db([\\/]|["'])/,
        /from\s+["'].*[\\/]_core[\\/]database/,
        /from\s+["'].*[\\/]config[\\/]database/,
        /from\s+["'].*[\\/]modules[\\/]safe-/,
      ];

      const isComment = /^\s*\/\/|^\s*\*/.test(line);
      const isTypeOnly = /import\s+type\s+|import\s*{[^}]*type/.test(line);
      const allowService = /from\s+["'].*[\\/]services[\\/]/.test(line);
      const allowLeo = /from\s+["'].*[\\/]leo[\\/]/.test(line);
      const allowSchemaTypeOnly = isTypeOnly && /schema/.test(line);
      
      if (!isComment && !isTypeOnly) {
        for (const pattern of forbidden) {
          if (pattern.test(line)) {
            if (!allowService && !allowLeo && !allowSchemaTypeOnly) {
              results.push({
                file: filePath,
                line: lineNumber,
                violation: 'Import proibido para LEO (acesso potencial a DB fora de services)',
                code: line.trim()
              });
            }
          }
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
  const leoDir = join(cwd, 'server', 'leo');
  
  const leoFiles = await findLeoFiles(leoDir);
  const graph = new Map();
  const fileContent = new Map();

  for (const file of leoFiles) {
    const content = await readFile(file, 'utf8');
    fileContent.set(file, content);
  }

  for (const [file, content] of fileContent.entries()) {
    const imports = extractImports(content);
    const resolvedDeps = [];
    for (const imp of imports) {
      const target = await resolveImportTarget(file, imp);
      if (target) resolvedDeps.push(target);
    }
    graph.set(file, resolvedDeps);
  }
  
  const violations = [];
  for (const file of leoFiles) {
    const fileViolations = await checkLeoFile(file);
    violations.push(...fileViolations);
  }

  for (const startFile of leoFiles) {
    const stack = [{ file: startFile, chain: [startFile] }];
    const visited = new Set();

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      if (visited.has(current.file)) continue;
      visited.add(current.file);

      const deps = graph.get(current.file) ?? [];
      for (const dep of deps) {
        const depRel = rel(dep);
        if (looksLikeForbiddenDbTarget(depRel)) {
          violations.push({
            file: startFile,
            line: 1,
            violation: `Fluxo indireto proibido LEO -> DB: ${current.chain.map(rel).join(' -> ')} -> ${depRel}`,
            code: depRel,
          });
          continue;
        }
        if (!visited.has(dep)) {
          stack.push({ file: dep, chain: [...current.chain, dep] });
        }
      }
    }
  }

  const allBlockedChain = violations
    .filter((v) => v.violation.includes('Fluxo indireto proibido'))
    .map((v) => `${rel(v.file)} | ${v.violation}`);

  const evidenceDir = join(cwd, 'audit-evidence');
  await mkdir(evidenceDir, { recursive: true });
  const blockedFiles = Array.from(new Set(violations.map((v) => rel(v.file)))).sort();
  await writeFile(
    join(evidenceDir, 'leo-imports-blocked-files.txt'),
    [
      '=== LEO IMPORTS BLOQUEADOS ===',
      ...blockedFiles,
      '',
      `TOTAL_BLOCKED=${blockedFiles.length}`,
    ].join('\n'),
    'utf8'
  );

  await writeFile(
    join(evidenceDir, 'leo-imports-blocked-chains.txt'),
    [
      '=== CADEIAS INDIRETAS BLOQUEADAS LEO -> DB ===',
      ...allBlockedChain,
      '',
      `TOTAL_CHAINS=${allBlockedChain.length}`,
    ].join('\n'),
    'utf8'
  );
  
  if (violations.length > 0) {
    process.stdout.write('\n🚨 LEO IMPORT VIOLATIONS DETECTED\n\n');
    
    violations.forEach(v => {
      const relPath = rel(v.file);
      process.stdout.write(`  ${relPath}:${v.line}\n`);
      process.stdout.write(`  ❌ ${v.violation}\n`);
      process.stdout.write(`  Code: ${v.code}\n\n`);
    });
    
    process.stdout.write(`Total: ${violations.length} LEO import violations\n`);
    process.exit(1);
  }
  
  process.stdout.write('✅ LEO imports check PASSED\n');
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write('ERROR: ' + String(err) + '\n');
  process.exit(1);
});
