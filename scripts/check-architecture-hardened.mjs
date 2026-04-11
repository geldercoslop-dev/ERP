#!/usr/bin/env node
/**
 * scripts/check-architecture-hardened.mjs
 * Hardening crítico de arquitetura multi-tenant.
 *
 * Bloqueia bypass em:
 * - entry points de services sem tenantId
 * - fallback indireto de tenant/default wrappers
 * - tenant arbitrário (sem validação de contexto)
 * - imports indiretos de DB a partir de LEO
 * - uso mascarado de DEFAULT/TEST/SEED
 *
 * Exit: 1 se houver violação crítica, 0 se clean.
 */

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join, extname, dirname, resolve } from 'node:path';
import { access } from 'node:fs/promises';

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
    // Ignore errors
  }
  
  return files;
}

const SOURCE_ROOTS = ['server', 'src'];
const SERVICE_ENTRY_FILE = /[\\/]server[\\/]services[\\/].+\.(ts|js)$/;
const LEO_ENTRY_FILE = /[\\/]server[\\/]leo[\\/].+\.(ts|js)$/;
const IMPORT_RE = /(?:import\s+[^'"\n]+from\s+|import\s*\(\s*|require\s*\()\s*["']([^"']+)["']/g;
const RE_EXPORT_RE = /export\s+(?:\*\s+from|\{[^}]+\}\s+from)\s*["']([^"']+)["']/g;
const EXPORTED_FN_RE = /export\s+(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/g;
const EXPORTED_CONST_FN_RE = /export\s+const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/g;
const EXPORTED_CLASS_METHOD_RE = /export\s+class\s+([A-Za-z_][A-Za-z0-9_]*)[\s\S]*?\{([\s\S]*)\}$/g;
const CLASS_METHOD_RE = /(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:async\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*\{/g;

const TENANT_FALLBACK_PATTERNS = [
  /tenantId\s*\|\|\s*([1-9]\d*|"[^"]+"|'[^']+')/,
  /tenantId\s*\?\?\s*([1-9]\d*|"[^"]+"|'[^']+')/,
  /\b(DEFAULT_TENANT_ID|TEST_TENANT_ID|SEED_TENANT_ID)\b/,
  /process\.env\.(DEFAULT_TENANT_ID|TEST_TENANT_ID|SEED_TENANT_ID|TENANT_ID)/,
  /function\s+\w+\s*\([^)]*tenantId\s*=\s*([1-9]\d*)/,
  /=>\s*\([^)]*tenantId\s*=\s*([1-9]\d*)/,
];

const VALIDATION_HINTS = [
  /assertTenant\s*\(\s*tenantId/,
  /assertTenantSource\s*\(\s*tenantId/,
  /validateTenantAccess\s*\(\s*tenantId/,
  /assertRequiredId\s*\(\s*tenantId/,
  /requireTenantId\s*\(\s*tenantId/,
  /if\s*\(\s*!\s*tenantId\s*\)/,
  /if\s*\(\s*!Number\.isInteger\(\s*tenantId\s*\)\s*\|\|\s*tenantId\s*<=\s*0\s*\)/,
  /if\s*\(\s*tenantId\s*<=\s*0\s*\)/,
  /throw\s+new\s+Error\([^)]*tenantId/i,
];

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

function isIgnoredPath(filePath) {
  const normalized = normalizePath(filePath).toLowerCase();
  return normalized.includes('/node_modules/') ||
    normalized.includes('/dist/') ||
    normalized.includes('/.git/') ||
    normalized.endsWith('.d.ts') ||
    normalized.includes('/tests/') ||
    normalized.includes('/test/');
}

function isServiceEntry(filePath) {
  return SERVICE_ENTRY_FILE.test(filePath) && !isIgnoredPath(filePath);
}

function isLeoFile(filePath) {
  return LEO_ENTRY_FILE.test(filePath) && !isIgnoredPath(filePath);
}

function getRelativePath(absPath) {
  const normalized = normalizePath(absPath);
  const cwd = normalizePath(process.cwd());
  return normalized.startsWith(`${cwd}/`) ? normalized.slice(cwd.length + 1) : normalized;
}

function looksLikeDbPath(importPath) {
  return /(^|[\\/])db([\\/]|$)/.test(importPath) || /server[\\/]core[\\/]tenant-db-map/.test(importPath);
}

function looksLikeTenantDefaultWrapper(lines, idx) {
  const windowText = lines.slice(idx, idx + 16).join('\n');
  if (!/(function\s+\w*tenant\w*|const\s+\w*tenant\w*\s*=|export\s+function\s+\w*tenant\w*)/i.test(lines[idx])) {
    return false;
  }
  return /process\.env\.(DEFAULT_TENANT_ID|TENANT_ID)|tenantId\s*\|\||tenantId\s*\?\?|return\s+[1-9]\d*\s*;/.test(windowText);
}

function hasTenantParam(paramList) {
  return /(^|,|\s)tenantId\s*:/.test(paramList) || /(^|,|\s)tenantId\s*=/.test(paramList);
}

function tenantParamIsOptional(paramList) {
  return /(^|,|\s)tenantId\s*\?:/.test(paramList);
}

function hasEarlyTenantValidation(lines, startLineIndex) {
  const windowText = lines.slice(startLineIndex, Math.min(lines.length, startLineIndex + 35)).join('\n');
  const hasHint = VALIDATION_HINTS.some((re) => re.test(windowText));
  const hasAssertTenant = /assertTenant\s*\(\s*tenantId/.test(windowText);
  return hasHint && hasAssertTenant;
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
      // tenta próximo candidato
    }
  }

  return null;
}

function extractImports(content) {
  const imports = [];
  let match;
  while ((match = IMPORT_RE.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

function extractReExports(content) {
  const exports = [];
  let match;
  while ((match = RE_EXPORT_RE.exec(content)) !== null) {
    exports.push(match[1]);
  }
  return exports;
}

async function buildImportGraph(files, contentByFile) {
  const graph = new Map();
  for (const file of files) {
    const content = contentByFile.get(file) ?? '';
    const imports = [...extractImports(content), ...extractReExports(content)];
    const resolved = [];
    for (const importPath of imports) {
      const target = await resolveImportTarget(file, importPath);
      if (target) {
        resolved.push(target);
      }
    }
    graph.set(file, resolved);
  }
  return graph;
}

function detectLeoIndirectDbAccess(files, graph) {
  const violations = [];

  for (const entry of files) {
    if (!isLeoFile(entry)) {
      continue;
    }

    const stack = [{ file: entry, chain: [entry] }];
    const visited = new Set();

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        continue;
      }

      if (visited.has(current.file)) {
        continue;
      }
      visited.add(current.file);

      const deps = graph.get(current.file) ?? [];
      for (const dep of deps) {
        const depRel = getRelativePath(dep);
        if (looksLikeDbPath(depRel)) {
          violations.push({
            file: getRelativePath(entry),
            line: 1,
            severity: 'CRITICAL',
            msg: `LEO com acesso indireto a DB detectado via cadeia: ${current.chain.map(getRelativePath).join(' -> ')} -> ${depRel}`,
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

  return violations;
}

function isTestContext(filePath) {
  return filePath.includes('/test') ||
    filePath.includes('\\test') ||
    filePath.endsWith('.test.ts') ||
    filePath.endsWith('.spec.ts');
}

function isSeedContext(filePath) {
  const lower = filePath.toLowerCase();
  return lower.includes('seed');
}

async function main() {
  const tsFiles = [];
  const jsFiles = [];
  for (const root of SOURCE_ROOTS) {
    tsFiles.push(...(await findFiles(root, '.ts')));
    jsFiles.push(...(await findFiles(root, '.js')));
  }

  const files = [...tsFiles, ...jsFiles].map((p) => resolve(p));
  const filtered = files.filter((f) => !isIgnoredPath(f));

  /** @type {Array<{file:string,line:number,severity:'CRITICAL'|'HIGH'|'MEDIUM',msg:string,code:string}>} */
  const violations = [];
  /** @type {Array<{file:string,line:number,name:string}>} */
  const validatedServices = [];
  const validatedServiceSet = new Set();
  const allServiceEntrypoints = [];
  const contentByFile = new Map();

  for (const file of filtered) {
    try {
      const content = await readFile(file, 'utf-8');
      contentByFile.set(file, content);
      const lines = content.split('\n');

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        for (const re of TENANT_FALLBACK_PATTERNS) {
          if (re.test(line)) {
            const tag = /TEST_TENANT_ID/.test(line) ? 'TEST' : /SEED_TENANT_ID/.test(line) ? 'SEED' : null;
            if (tag === 'TEST' && isTestContext(file)) continue;
            if (tag === 'SEED' && isSeedContext(file)) continue;

            violations.push({
              file: getRelativePath(file),
              line: lineNum + 1,
              severity: 'CRITICAL',
              msg: 'Fallback/default de tenant detectado (bypass proibido)',
              code: line.trim().slice(0, 140),
            });
          }
        }

        if (looksLikeTenantDefaultWrapper(lines, lineNum)) {
          violations.push({
            file: getRelativePath(file),
            line: lineNum + 1,
            severity: 'CRITICAL',
            msg: 'Wrapper/helper retornando tenant default detectado',
            code: line.trim().slice(0, 140),
          });
        }
      }

      if (isServiceEntry(file)) {
        let match;
        while ((match = EXPORTED_FN_RE.exec(content)) !== null) {
          const fnName = match[1];
          const params = match[2] ?? '';
          const start = content.slice(0, match.index).split('\n').length - 1;

          allServiceEntrypoints.push({ file: getRelativePath(file), line: start + 1, name: fnName, params });

          if (tenantParamIsOptional(params)) {
            violations.push({
              file: getRelativePath(file),
              line: start + 1,
              severity: 'CRITICAL',
              msg: `Entry point com tenantId opcional (proibido): ${fnName}`,
              code: `export function ${fnName}(${params})`,
            });
            continue;
          }

          if (!hasTenantParam(params)) {
            violations.push({
              file: getRelativePath(file),
              line: start + 1,
              severity: 'CRITICAL',
              msg: `Entry point de service sem tenantId obrigatório: ${fnName}`,
              code: `export function ${fnName}(${params})`,
            });
            continue;
          }

          if (!hasEarlyTenantValidation(lines, start)) {
            violations.push({
              file: getRelativePath(file),
              line: start + 1,
              severity: 'CRITICAL',
              msg: `Entry point com tenantId sem validação de contexto: ${fnName}`,
              code: `export function ${fnName}(${params})`,
            });
          } else {
            const key = `${getRelativePath(file)}:${fnName}:${start + 1}`;
            if (!validatedServiceSet.has(key)) {
              validatedServiceSet.add(key);
              validatedServices.push({
                file: getRelativePath(file),
                line: start + 1,
                name: fnName,
              });
            }
          }
        }

        let constMatch;
        while ((constMatch = EXPORTED_CONST_FN_RE.exec(content)) !== null) {
          const fnName = constMatch[1];
          const params = constMatch[2] ?? '';
          const start = content.slice(0, constMatch.index).split('\n').length - 1;

          allServiceEntrypoints.push({ file: getRelativePath(file), line: start + 1, name: fnName, params });

          if (tenantParamIsOptional(params)) {
            violations.push({
              file: getRelativePath(file),
              line: start + 1,
              severity: 'CRITICAL',
              msg: `Entry point com tenantId opcional (proibido): ${fnName}`,
              code: `export const ${fnName} = (${params}) => ...`,
            });
            continue;
          }

          if (!hasTenantParam(params)) {
            violations.push({
              file: getRelativePath(file),
              line: start + 1,
              severity: 'CRITICAL',
              msg: `Entry point de service sem tenantId obrigatório: ${fnName}`,
              code: `export const ${fnName} = (${params}) => ...`,
            });
            continue;
          }

          if (!hasEarlyTenantValidation(lines, start)) {
            violations.push({
              file: getRelativePath(file),
              line: start + 1,
              severity: 'CRITICAL',
              msg: `Entry point com tenantId sem validação de contexto: ${fnName}`,
              code: `export const ${fnName} = (${params}) => ...`,
            });
          } else {
            const key = `${getRelativePath(file)}:${fnName}:${start + 1}`;
            if (!validatedServiceSet.has(key)) {
              validatedServiceSet.add(key);
              validatedServices.push({
                file: getRelativePath(file),
                line: start + 1,
                name: fnName,
              });
            }
          }
        }

        let classMatch;
        while ((classMatch = EXPORTED_CLASS_METHOD_RE.exec(content)) !== null) {
          const className = classMatch[1];
          const classBody = classMatch[2] ?? '';
          let methodMatch;
          while ((methodMatch = CLASS_METHOD_RE.exec(classBody)) !== null) {
            const methodName = methodMatch[1];
            const params = methodMatch[2] ?? '';
            const beforeMethod = content.slice(0, classMatch.index + methodMatch.index);
            const start = beforeMethod.split('\n').length - 1;
            const fullName = `${className}.${methodName}`;

            allServiceEntrypoints.push({ file: getRelativePath(file), line: start + 1, name: fullName, params });

            if (tenantParamIsOptional(params)) {
              violations.push({
                file: getRelativePath(file),
                line: start + 1,
                severity: 'CRITICAL',
                msg: `Entry point com tenantId opcional (proibido): ${fullName}`,
                code: `${fullName}(${params})`,
              });
              continue;
            }

            if (!hasTenantParam(params)) {
              violations.push({
                file: getRelativePath(file),
                line: start + 1,
                severity: 'CRITICAL',
                msg: `Entry point de service sem tenantId obrigatório: ${fullName}`,
                code: `${fullName}(${params})`,
              });
              continue;
            }

            if (!hasEarlyTenantValidation(lines, start)) {
              violations.push({
                file: getRelativePath(file),
                line: start + 1,
                severity: 'CRITICAL',
                msg: `Entry point com tenantId sem assertTenant: ${fullName}`,
                code: `${fullName}(${params})`,
              });
            } else {
              const key = `${getRelativePath(file)}:${fullName}:${start + 1}`;
              if (!validatedServiceSet.has(key)) {
                validatedServiceSet.add(key);
                validatedServices.push({ file: getRelativePath(file), line: start + 1, name: fullName });
              }
            }
          }
        }
      }
    } catch (err) {
      // Continue on read errors
    }
  }

  const graph = await buildImportGraph(filtered, contentByFile);
  violations.push(...detectLeoIndirectDbAccess(filtered, graph));

  const evidenceDir = join(process.cwd(), 'audit-evidence');
  await mkdir(evidenceDir, { recursive: true });

  const blockedFiles = Array.from(new Set(violations.map((v) => v.file))).sort();

  await writeFile(
    join(evidenceDir, 'hardening-services-entrypoints-all.txt'),
    [
      '=== TODOS OS ENTRY POINTS DE SERVICES ===',
      ...allServiceEntrypoints
        .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
        .map((s) => `${s.file}:${s.line}: ${s.name}(${s.params})`),
      '',
      `TOTAL_ENTRYPOINTS=${allServiceEntrypoints.length}`,
    ].join('\n'),
    'utf8'
  );

  await writeFile(
    join(evidenceDir, 'hardening-services-validated.txt'),
    [
      '=== SERVICE ENTRY POINTS VALIDADOS ===',
      ...validatedServices
        .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
        .map((s) => `${s.file}:${s.line}: ${s.name}`),
      '',
      `TOTAL_VALIDATED=${validatedServices.length}`,
    ].join('\n'),
    'utf8'
  );

  await writeFile(
    join(evidenceDir, 'hardening-services-missing-assertTenant.txt'),
    [
      '=== ENTRY POINTS SEM ASSERTTENANT ===',
      ...violations
        .filter((v) => v.msg.includes('Entry point'))
        .map((v) => `${v.file}:${v.line}: ${v.msg}`),
      '',
      `TOTAL_MISSING=${violations.filter((v) => v.msg.includes('Entry point')).length}`,
    ].join('\n'),
    'utf8'
  );

  await writeFile(
    join(evidenceDir, 'hardening-blocked-files.txt'),
    [
      '=== ARQUIVOS BLOQUEADOS ===',
      ...blockedFiles,
      '',
      `TOTAL_BLOCKED=${blockedFiles.length}`,
    ].join('\n'),
    'utf8'
  );

  await writeFile(
    join(evidenceDir, 'hardening-errors-sample.txt'),
    [
      '=== EXEMPLOS DE ERRO DISPARANDO ===',
      ...violations.slice(0, 50).map((v) => `${v.severity} ${v.file}:${v.line} | ${v.msg} | ${v.code}`),
      '',
      `TOTAL_ERRORS=${violations.length}`,
    ].join('\n'),
    'utf8'
  );

  if (violations.length === 0) {
    console.log('✅ Architecture hardening PASSED');
    process.exit(0);
  }

  // Group by severity
  const critical = violations.filter(v => v.severity === 'CRITICAL');
  const high = violations.filter(v => v.severity === 'HIGH');
  const medium = violations.filter(v => v.severity === 'MEDIUM');

  if (critical.length > 0) {
    console.error(`\n🛑 CRITICAL violations (${critical.length}):`);
    critical.forEach(v => {
      console.error(`  [${v.line}] ${v.file}: ${v.msg}`);
      console.error(`      ${v.code}`);
    });
  }

  if (high.length > 0) {
    console.error(`\n⚠️  HIGH violations (${high.length}):`);
    high.slice(0, 10).forEach(v => {
      console.error(`  [${v.line}] ${v.file}: ${v.msg}`);
    });
    if (high.length > 10) console.error(`  ... and ${high.length - 10} more`);
  }

  if (medium.length > 0) {
    console.error(`\nℹ️  MEDIUM (info only, ${medium.length}):`);
    medium.slice(0, 5).forEach(v => {
      console.error(`  [${v.line}] ${v.file}: ${v.msg}`);
    });
    if (medium.length > 5) console.error(`  ... and ${medium.length - 5} more`);
  }

  console.error(`\n📊 Total: ${violations.length} violations (${critical.length} CRITICAL, ${high.length} HIGH, ${medium.length} MEDIUM)`);
  process.exit(1);
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
