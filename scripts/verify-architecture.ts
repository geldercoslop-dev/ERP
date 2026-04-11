import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

const ROOT = process.cwd();
const LEO_DIR = path.join(ROOT, 'server', 'leo');
const MIGRATIONS_DIR = path.join(ROOT, 'drizzle', 'migrations');
const META_DIR = path.join(ROOT, 'drizzle', 'meta');
const ANY_BASELINE_PATH = path.join(ROOT, 'scripts', 'guards', 'any-baseline.json');
const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const drizzleBlockedPrefixes = [
  'server/routers/',
  'server/routes/',
  'server/leo/',
  'server/tools/',
  'server/cache/',
  'server/modules/',
  'server/middleware/',
  'server/middlewares/',
  'server/infra/',
  'server/api/',
  'server/pdf.ts',
  'server/storage.ts',
  'server/worker.ts',
];
const drizzlePatterns = [
  /from\s+['"]drizzle-orm['"]/, 
  /from\s+['"]drizzle-orm\//,
  /from\s+['"][^'"]*drizzle\/schema['"]/, 
  /require\(['"]drizzle-orm['"]\)/,
  /import\s*\(['"]drizzle-orm['"]\)/,
];
const anyCriticalPaths = [
  'server/routes/',
  'server/routers/',
  'server/controllers/',
  'server/services/',
  'server/middleware/',
  'server/middlewares/',
  'server/leo/',
];
const noNewAnyPaths = [
  'server/routes/',
  'server/routers/',
  'server/services/',
  'server/leo/',
];
const anyMatchers = [
  { kind: 'colon-any', regex: /:\s*any(?:\s*\[\])?/g },
  { kind: 'as-any', regex: /\bas\s+any(?:\s*\[\])?/g },
  { kind: 'angle-any', regex: /<\s*any\s*>/g },
  { kind: 'generic-any', regex: /\b(?:Array|Promise|ReadonlyArray|Map|Set|Record)\s*<[^>\n]*\bany\b[^>\n]*>/g },
];

type BaselineEntry = {
  file: string;
  kind: string;
  snippet: string;
  count: number;
};

type BaselineFile = {
  version: number;
  generatedAt: string;
  criticalPaths: string[];
  entries: BaselineEntry[];
};

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
    if (allowedExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
}

function scanLeoForForbiddenPatterns(errors: string[]): void {
  const files = walk(LEO_DIR);
  const importSpecifiers = [
    /\b(?:import|export)\s+[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/gi,
    /\bimport\s*['"]([^'"]+)['"]/gi,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/gi,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gi,
  ];
  const runtimeChecks = [
    { regex: /\bdb\s*\.\s*execute\s*\(/gi, label: 'execute sql em leo/' },
    { regex: /\bsql\s*`/gi, label: 'sql tagged template em leo/' },
    { regex: /\bdrizzle\b/gi, label: 'drizzle em leo/' },
  ];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const specs: string[] = [];

    for (const re of importSpecifiers) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(content)) !== null) {
        specs.push(match[1].toLowerCase());
      }
    }

    const hasForbiddenDbImport = specs.some((spec) =>
      /(^|[\/._-])db([\/._-]|$)/i.test(spec) || /(^|[\/._-])drizzle([\/._-]|$)/i.test(spec)
    );

    if (hasForbiddenDbImport) {
      errors.push(`[ARCH] import db/drizzle em leo/: ${rel}`);
    }

    for (const check of runtimeChecks) {
      check.regex.lastIndex = 0;
      if (check.regex.test(content)) {
        errors.push(`[ARCH] ${check.label}: ${rel}`);
      }
    }
  }
}

function scanDrizzleBoundaries(errors: string[]): void {
  const serverDir = path.join(ROOT, 'server');
  for (const file of walk(serverDir)) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    if (rel.endsWith('.d.ts')) continue;
    if (rel.includes('/tests/') || rel.includes('.test.') || rel.includes('.spec.')) continue;
    if (!drizzleBlockedPrefixes.some((prefix) => rel.startsWith(prefix))) continue;

    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (isCommentLine(line)) return;
      if (drizzlePatterns.some((pattern) => pattern.test(line))) {
        errors.push(`[DRIZZLE] ${rel}:${index + 1} :: ${line.trim()}`);
      }
    });
  }
}

function normalizeSnippet(line: string): string {
  return line.trim().replace(/\s+/g, ' ');
}

function makeAnyKey(entry: BaselineEntry): string {
  return `${entry.file}::${entry.kind}::${entry.snippet}`;
}

function totalAnyCount(entries: BaselineEntry[]): number {
  return entries.reduce((acc, entry) => acc + entry.count, 0);
}

function collectAnyEntries(): BaselineEntry[] {
  const aggregated = new Map<string, BaselineEntry>();

  for (const criticalPath of anyCriticalPaths) {
    const dir = path.join(ROOT, criticalPath);
    for (const file of walk(dir)) {
      const rel = path.relative(ROOT, file).replace(/\\/g, '/');
      if (rel.endsWith('.d.ts')) continue;
      if (rel.includes('/tests/') || rel.includes('.test.') || rel.includes('.spec.')) continue;

      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        if (isCommentLine(line) || line.trim().length === 0) continue;

        for (const matcher of anyMatchers) {
          const matches = line.match(matcher.regex);
          if (!matches || matches.length === 0) continue;

          const entry: BaselineEntry = {
            file: rel,
            kind: matcher.kind,
            snippet: normalizeSnippet(line),
            count: matches.length,
          };

          const key = makeAnyKey(entry);
          const existing = aggregated.get(key);
          if (existing) {
            existing.count += entry.count;
          } else {
            aggregated.set(key, entry);
          }
        }
      }
    }
  }

  return [...aggregated.values()];
}

function validateAnyBaseline(errors: string[]): void {
  if (!fs.existsSync(ANY_BASELINE_PATH)) {
    errors.push('[ANY] baseline ausente em scripts/guards/any-baseline.json');
    return;
  }

  const baseline = JSON.parse(fs.readFileSync(ANY_BASELINE_PATH, 'utf8')) as BaselineFile;
  const baselineMap = new Map<string, BaselineEntry>();
  for (const entry of baseline.entries) {
    baselineMap.set(makeAnyKey(entry), entry);
  }

  const currentEntries = collectAnyEntries();

  const baselineTotal = totalAnyCount(baseline.entries);
  const currentTotal = totalAnyCount(currentEntries);
  if (currentTotal > baselineTotal) {
    errors.push(`[ANY_TOTAL_GT_BASELINE] baseline=${baselineTotal} current=${currentTotal}`);
  }

  for (const entry of currentEntries) {
    const baselineEntry = baselineMap.get(makeAnyKey(entry));
    if (!baselineEntry) {
      const noNewAnyArea = noNewAnyPaths.some((prefix) => entry.file.startsWith(prefix));
      if (noNewAnyArea) {
        errors.push(`[ANY_NEW_HIGH_RISK] ${entry.file} :: ${entry.kind} :: ${entry.snippet}`);
      } else {
        errors.push(`[ANY_NEW] ${entry.file} :: ${entry.kind} :: ${entry.snippet}`);
      }
      continue;
    }
    if (entry.count > baselineEntry.count) {
      errors.push(`[ANY_GROWTH] ${entry.file} :: ${entry.kind} :: baseline=${baselineEntry.count} current=${entry.count} :: ${entry.snippet}`);
    }
  }
}

function assertSecretLength(errors: string[], key: string): void {
  const value = process.env[key] || '';
  if (value.length < 128) {
    errors.push(`[ENV_FATAL] ${key} < 128 chars`);
  }
}

function validateEnv(errors: string[]): void {
  assertSecretLength(errors, 'APP_SECRET');
  assertSecretLength(errors, 'JWT_ACCESS_SECRET');
  assertSecretLength(errors, 'JWT_REFRESH_SECRET');
}

function validateInitMigration(errors: string[]): void {
  const hasInitInMigrations = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR).some((name) => !name.startsWith('.') && /init|0000/i.test(name))
    : false;
  const hasInitInMeta = fs.existsSync(META_DIR)
    ? fs.readdirSync(META_DIR).some((name) => /0000|init/i.test(name))
    : false;

  if (!hasInitInMigrations && !hasInitInMeta) {
    errors.push('[MIGRATION] migration init ausente (drizzle/migrations ou drizzle/meta)');
  }
}

function validateHealthWithoutServices(errors: string[]): void {
  const healthFiles = [
    path.join(ROOT, 'server', 'routers', 'health.ts'),
    path.join(ROOT, 'server', '_core', 'health-router.ts'),
  ];
  const importRegex = /\b(?:import|export)\s+[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/gi;

  for (const file of healthFiles) {
    if (!fs.existsSync(file)) continue;
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');
    let match: RegExpExecArray | null;
    importRegex.lastIndex = 0;
    while ((match = importRegex.exec(content)) !== null) {
      const spec = match[1];
      if (spec.includes('/services/') || spec.startsWith('../services/') || spec.startsWith('./services/')) {
        errors.push(`[HEALTH] rota de health não deve importar services: ${rel} -> ${spec}`);
      }
    }
  }
}

// ENDURECIMENTO FINAL: BLOQUEIO DE ACESSO DIRETO AO DB FORA DE SERVICES
const forbiddenPatterns = [
  /\bdb\s*\./g,
  /drizzle/gi,
  /mysql/gi,
  /execute\s*\(/g,
  /query\s*\(/g,
  /sql`/g,
];
const forbiddenDirs = [
  'server/leo/',
  'server/tools/',
  'server/routes/',
  'server/controllers/',
  'server/middlewares/',
];
function scanForbiddenDbAccess(errors: string[]): void {
  for (const dir of forbiddenDirs) {
    const absDir = path.join(ROOT, dir);
    for (const file of walk(absDir)) {
      const rel = path.relative(ROOT, file).replace(/\\/g, '/');
      if (rel.includes('/services/')) continue; // PERMITIDO APENAS EM SERVICES
      if (rel.endsWith('.d.ts') || rel.includes('/tests/') || rel.includes('.test.') || rel.includes('.spec.')) continue;
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split(/\r?\n/);
      lines.forEach((line, idx) => {
        if (isCommentLine(line)) return;
        for (const pattern of forbiddenPatterns) {
          pattern.lastIndex = 0;
          if (pattern.test(line)) {
            errors.push(`[ARCH_VIOLATION] Direct DB access outside SERVICES: ${rel}:${idx + 1} :: ${line.trim()}`);
          }
        }
      });
    }
  }
}

function main(): void {
  const errors: string[] = [];

  scanForbiddenDbAccess(errors);
  scanLeoForForbiddenPatterns(errors);
  scanDrizzleBoundaries(errors);
  validateAnyBaseline(errors);
  validateEnv(errors);
  validateInitMigration(errors);
  validateHealthWithoutServices(errors);

  if (errors.length > 0) {
    for (const err of errors) {
      if (err.includes('[ARCH_VIOLATION]')) {
        console.error(err);
      }
    }
    process.exit(1);
  }

  console.log('[verify:arch] OK - sem violações de arquitetura');
}

main();