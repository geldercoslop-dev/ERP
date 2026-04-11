/**
 * verify-any-baseline.ts
 *
 * Fase 1 do hardening de tipos:
 * - não remove any legado
 * - bloqueia novos any em caminhos críticos de runtime
 * - compara o estado atual com um baseline versionado
 *
 * Uso:
 *   pnpm run verify:any
 *   pnpm run verify:any:baseline
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, "scripts", "guards", "any-baseline.json");
const FILE_EXTENSIONS = new Set([".ts", ".tsx"]);

const CRITICAL_PATHS = [
  "server/routes/",
  "server/routers/",
  "server/controllers/",
  "server/services/",
  "server/middleware/",
  "server/middlewares/",
  "server/leo/",
];

// Escopo com tolerância zero para novos `any`
const NO_NEW_ANY_PATHS = [
  "server/routes/",
  "server/routers/",
  "server/services/",
  "server/leo/",
];

const MATCHERS = [
  { kind: "colon-any", regex: /:\s*any(?:\s*\[\])?/g },
  { kind: "as-any", regex: /\bas\s+any(?:\s*\[\])?/g },
  { kind: "angle-any", regex: /<\s*any\s*>/g },
  {
    kind: "generic-any",
    regex: /\b(?:Array|Promise|ReadonlyArray|Map|Set|Record)\s*<[^>\n]*\bany\b[^>\n]*>/g,
  },
];

type BaselineEntry = {
  file: string;
  kind: string;
  snippet: string;
  count: number;
};

type BaselineFile = {
  version: 1;
  generatedAt: string;
  criticalPaths: string[];
  entries: BaselineEntry[];
};

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }

    if (FILE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function isCriticalFile(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  if (normalized.endsWith(".d.ts")) return false;
  if (normalized.includes("/tests/")) return false;
  if (normalized.includes(".test.")) return false;
  if (normalized.includes(".spec.")) return false;
  return CRITICAL_PATHS.some((prefix) => normalized.startsWith(prefix));
}

function normalizeSnippet(line: string): string {
  return line.trim().replace(/\s+/g, " ");
}

function shouldIgnoreLine(line: string): boolean {
  const trimmed = line.trimStart();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*") ||
    trimmed.length === 0
  );
}

function makeKey(entry: BaselineEntry): string {
  return `${entry.file}::${entry.kind}::${entry.snippet}`;
}

function totalAnyCount(entries: BaselineEntry[]): number {
  return entries.reduce((acc, entry) => acc + entry.count, 0);
}

export function collectAnyEntries(): BaselineEntry[] {
  const aggregated = new Map<string, BaselineEntry>();

  for (const criticalPath of CRITICAL_PATHS) {
    const absoluteDir = path.join(ROOT, criticalPath);
    for (const file of walk(absoluteDir)) {
      const relativePath = path.relative(ROOT, file).replace(/\\/g, "/");
      if (!isCriticalFile(relativePath)) continue;

      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
      for (const line of lines) {
        if (shouldIgnoreLine(line)) continue;

        for (const matcher of MATCHERS) {
          const matches = line.match(matcher.regex);
          if (!matches || matches.length === 0) continue;

          const entry: BaselineEntry = {
            file: relativePath,
            kind: matcher.kind,
            snippet: normalizeSnippet(line),
            count: matches.length,
          };

          const key = makeKey(entry);
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

  return [...aggregated.values()].sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.snippet.localeCompare(b.snippet);
  });
}

function readBaseline(): BaselineFile {
  if (!fs.existsSync(BASELINE_PATH)) {
    throw new Error(`Baseline ausente: ${path.relative(ROOT, BASELINE_PATH).replace(/\\/g, "/")}`);
  }

  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as BaselineFile;
}

function compareWithBaseline(currentEntries: BaselineEntry[], baselineEntries: BaselineEntry[]): string[] {
  const violations: string[] = [];
  const baselineMap = new Map<string, BaselineEntry>();

  for (const entry of baselineEntries) {
    baselineMap.set(makeKey(entry), entry);
  }

  const baselineTotal = totalAnyCount(baselineEntries);
  const currentTotal = totalAnyCount(currentEntries);
  if (currentTotal > baselineTotal) {
    violations.push(`[ANY_TOTAL_GT_BASELINE] baseline=${baselineTotal} current=${currentTotal}`);
  }

  for (const currentEntry of currentEntries) {
    const key = makeKey(currentEntry);
    const baselineEntry = baselineMap.get(key);

    if (!baselineEntry) {
      const noNewAnyArea = NO_NEW_ANY_PATHS.some((prefix) => currentEntry.file.startsWith(prefix));
      if (noNewAnyArea) {
        violations.push(
          `[ANY_NEW_HIGH_RISK] ${currentEntry.file} :: ${currentEntry.kind} :: ${currentEntry.snippet}`
        );
      } else {
        violations.push(
          `[ANY_NEW] ${currentEntry.file} :: ${currentEntry.kind} :: ${currentEntry.snippet}`
        );
      }
      continue;
    }

    if (currentEntry.count > baselineEntry.count) {
      violations.push(
        `[ANY_GROWTH] ${currentEntry.file} :: ${currentEntry.kind} :: baseline=${baselineEntry.count} current=${currentEntry.count} :: ${currentEntry.snippet}`
      );
    }
  }

  return violations;
}

function writeBaseline(entries: BaselineEntry[]): void {
  const payload: BaselineFile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    criticalPaths: [...CRITICAL_PATHS],
    entries,
  };

  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function main(): void {
  const shouldWriteBaseline = process.argv.includes("--write-baseline");
  const currentEntries = collectAnyEntries();

  if (shouldWriteBaseline) {
    writeBaseline(currentEntries);
    console.log(`[verify:any] baseline atualizado com ${currentEntries.length} entradas.`);
    return;
  }

  const baseline = readBaseline();
  const violations = compareWithBaseline(currentEntries, baseline.entries);

  if (violations.length > 0) {
    console.error("[verify:any] FALHA — novos usos de any detectados nos caminhos críticos:\n");
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    process.exit(1);
  }

  console.log(`[verify:any] OK — sem novos any nos caminhos críticos (${currentEntries.length} entradas baselined).`);
}

main();
