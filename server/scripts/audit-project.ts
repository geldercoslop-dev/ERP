/**
 * Auditoria automática do projeto GRS.
 * Apenas analisa e reporta — NÃO modifica arquivos.
 * Uso: tsx server/scripts/audit-project.ts (a partir da raiz do projeto)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "../..");

// Alias: como no vite/tsconfig
const ALIAS: Record<string, string> = {
  "@": path.join(ROOT, "client", "src"),
  "@shared": path.join(ROOT, "shared"),
};

const IGNORE_DIRS = new Set(["node_modules", "dist", ".git", "build"]);
const SOURCE_EXT = [".ts", ".tsx", ".js", ".jsx"];
const ROUTES_DIR = path.join(ROOT, "server", "routes");
const ROUTER_FILE = path.join(ROOT, "server", "routers.ts");

interface AuditResult {
  deadImports: Array<{ file: string; importSpec: string; resolved: string }>;
  unusedFiles: string[];
  unregisteredRoutes: string[];
  brokenScripts: Array<{ script: string; ref: string }>;
  unusedDeps: string[];
  missingDeps: string[];
  /** Se true, schema.ts pode estar divergente das migrações (verificar com db:generate). */
  schemaVsMigrationsCheckSuggested?: boolean;
}

function normalize(p: string): string {
  return path.normalize(p).replace(/\\/g, "/");
}

function getRelativePath(fromDir: string, toFile: string): string {
  const rel = path.relative(fromDir, toFile);
  return normalize(rel).replace(/\\/g, "/");
}

function collectFiles(dir: string, baseDir: string = dir): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue;
      out.push(...collectFiles(full, baseDir));
    } else if (e.isFile()) {
      const ext = path.extname(e.name);
      if (SOURCE_EXT.includes(ext)) out.push(normalize(path.relative(baseDir, full)));
    }
  }
  return out;
}

function extractImports(content: string): Array<{ spec: string; type: "relative" | "alias" | "package" }> {
  const results: Array<{ spec: string; type: "relative" | "alias" | "package" }> = [];
  // import x from "y"; import "y"; import { a } from 'y'; import type { a } from "y"
  const re = /(?:import|export)\s+(?:[\w*{}\s,]+\s+from\s+)?["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const spec = m[1].trim();
    if (!spec) continue;
    if (spec.startsWith("@/") || spec.startsWith("@shared/")) {
      results.push({ spec, type: "alias" });
    } else if (spec.startsWith(".")) {
      results.push({ spec, type: "relative" });
    } else {
      results.push({ spec, type: "package" });
    }
  }
  // React.lazy dynamic imports
  const dynamicRe = /lazy\s*\(\s*\(\s*\)\s*=>\s*import\s*\(\s*["']([^"']+)["']\)/g;
  while ((m = dynamicRe.exec(content)) !== null) {
    const spec = m[1].trim();
    if (!spec) continue;
    if (spec.startsWith("@/") || spec.startsWith("@shared/")) {
      results.push({ spec, type: "alias" });
    } else if (spec.startsWith(".")) {
      results.push({ spec, type: "relative" });
    } else {
      results.push({ spec, type: "package" });
    }
  }
  return results;
}

function resolveImport(fromPath: string, spec: string): string | null {
  const fromDir = path.dirname(fromPath);
  if (spec.startsWith("@/")) {
    const sub = spec.slice(2);
    return path.join(ALIAS["@"], sub);
  }
  if (spec.startsWith("@shared/")) {
    const sub = spec.slice(8);
    return path.join(ALIAS["@shared"], sub);
  }
  if (spec.startsWith(".")) {
    let resolved = path.resolve(fromDir, spec);
    return resolved;
  }
  return null; // package
}

function tryResolveFile(resolvedBase: string): string | null {
  const base = path.join(ROOT, resolvedBase);
  if (fs.existsSync(base)) return normalize(path.relative(ROOT, base)).replace(/\\/g, "/");
  for (const ext of [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"]) {
    const withExt = base + (ext.startsWith("/") ? ext : ext);
    if (fs.existsSync(withExt)) return normalize(path.relative(ROOT, withExt)).replace(/\\/g, "/");
  }
  const withIndex = path.join(base, "index.ts");
  if (fs.existsSync(withIndex)) return normalize(path.relative(ROOT, withIndex)).replace(/\\/g, "/");
  return null;
}

function getPackageName(spec: string): string {
  const idx = spec.indexOf("/");
  if (idx === -1) return spec;
  if (spec.startsWith("@")) {
    const second = spec.indexOf("/", idx + 1);
    return second === -1 ? spec : spec.slice(0, second);
  }
  return spec.slice(0, idx);
}

function runAudit(): AuditResult {
  const result: AuditResult = {
    deadImports: [],
    unusedFiles: [],
    unregisteredRoutes: [],
    brokenScripts: [],
    unusedDeps: [],
    missingDeps: [],
  };

  const serverDir = path.join(ROOT, "server");
  const clientSrc = path.join(ROOT, "client", "src");
  const sharedDir = path.join(ROOT, "shared");
  const drizzleDir = path.join(ROOT, "drizzle");
  const scriptsDir = path.join(ROOT, "scripts");

  const allRelativeFiles: string[] = [];
  [serverDir, clientSrc, sharedDir, drizzleDir, scriptsDir].forEach((d) => {
    allRelativeFiles.push(...collectFiles(d, ROOT));
  });
  const rootFiles = ["vite.config.ts", "instrument.ts"];
  rootFiles.forEach((f) => {
    const full = path.join(ROOT, f);
    if (fs.existsSync(full)) allRelativeFiles.push(f.replace(/\\/g, "/"));
  });

  const allFilesSet = new Set(allRelativeFiles);
  const importedBy = new Map<string, Set<string>>();

  const packageJsonPath = path.join(ROOT, "package.json");
  let dependencies: string[] = [];
  let devDependencies: string[] = [];
  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    dependencies = Object.keys(pkg.dependencies || {});
    devDependencies = Object.keys(pkg.devDependencies || {});
  }
  const allDepsSet = new Set([...dependencies, ...devDependencies]);
  const usedPackages = new Set<string>();

  const auditScriptRel = "server/scripts/audit-project.ts";
  for (const rel of allRelativeFiles) {
    if (rel.replace(/\\/g, "/") === auditScriptRel) continue;
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    let content: string;
    try {
      content = fs.readFileSync(abs, "utf-8");
    } catch {
      continue;
    }
    const imports = extractImports(content);
    for (const { spec, type } of imports) {
      if (type === "package") {
        usedPackages.add(getPackageName(spec));
        continue;
      }
      const fromAbs = path.join(ROOT, rel);
      const resolved = resolveImport(fromAbs, spec);
      if (!resolved) continue;
      const resolvedRel = path.relative(ROOT, resolved);
      const normalizedRel = normalize(resolvedRel).replace(/\\/g, "/");
      let targetFile: string | null = null;
      if (fs.existsSync(resolved)) {
        const stat = fs.statSync(resolved);
        if (stat.isFile()) targetFile = normalizedRel;
        else targetFile = tryResolveFile(normalizedRel);
      } else {
        targetFile = tryResolveFile(normalizedRel);
      }
      if (!targetFile) {
        const withExt = [".ts", ".tsx", ".js", ".jsx"].some((ext) => {
          const p = resolved + ext;
          if (fs.existsSync(p)) {
            targetFile = normalize(path.relative(ROOT, p)).replace(/\\/g, "/");
            return true;
          }
          return false;
        });
        if (!targetFile) {
          const fromNorm = path.join(ROOT, rel);
          if (path.resolve(fromNorm) !== path.resolve(resolved)) {
            result.deadImports.push({
              file: rel,
              importSpec: spec,
              resolved: normalizedRel,
            });
          }
        }
      }
      if (targetFile) {
        if (!importedBy.has(targetFile)) importedBy.set(targetFile, new Set());
        importedBy.get(targetFile)!.add(rel);
      }
    }
  }

  const entryOrSpecial = new Set([
    "client/src/main.tsx",
    "client/src/App.tsx",
    "server/_core/index.ts",
    "server/routers.ts",
    "shared/index.ts",
    "vite.config.ts",
    "instrument.ts",
  ]);

  const routeFiles = fs.existsSync(ROUTES_DIR)
    ? fs.readdirSync(ROUTES_DIR).map((f) => "server/routes/" + f)
    : [];
  let routerContent = "";
  if (fs.existsSync(ROUTER_FILE)) routerContent = fs.readFileSync(ROUTER_FILE, "utf-8");

  for (const rel of allRelativeFiles) {
    const norm = rel.replace(/\\/g, "/");
    if (entryOrSpecial.has(norm)) continue;
    if (norm.endsWith(".test.ts") || norm.endsWith(".test.tsx")) continue;
    const importers = importedBy.get(norm);
    if (!importers || importers.size === 0) {
      if (norm.startsWith("server/scripts/")) continue;
      if (norm.startsWith("server/routes/")) continue;
      if (norm.startsWith("server/tests/")) continue;
      result.unusedFiles.push(norm);
    }
  }

  for (const r of routeFiles) {
    const baseName = path.basename(r, path.extname(r));
    const pattern = new RegExp(`routes/${baseName}|["'].*${baseName}["']`, "i");
    if (!pattern.test(routerContent)) result.unregisteredRoutes.push(r);
  }

  const NODE_BUILTINS = new Set([
    "fs", "path", "url", "http", "https", "net", "stream", "buffer", "util",
    "os", "child_process", "crypto", "events", "assert", "querystring", "node:fs", "node:path", "node:url",
  ]);

  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    const scripts = (pkg.scripts as Record<string, string>) || {};
    for (const [name, cmd] of Object.entries(scripts)) {
      const match = cmd.match(/(?:^|\s)(?:tsx|node)\s+([^\s]+)/);
      if (!match) continue;
      const ref = match[1].replace(/^\.\//, "");
      const looksLikeFile = /[\\/]/.test(ref) || /\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(ref);
      if (!looksLikeFile) continue;
      const full = path.isAbsolute(ref) ? ref : path.join(ROOT, ref);
      if (!fs.existsSync(full)) {
        result.brokenScripts.push({ script: name, ref });
      }
    }

    for (const dep of Array.from(allDepsSet)) {
      if (usedPackages.has(dep)) continue;
      if (dep === "uninstall" || dep === "add" || dep === "pnpm") continue;
      if (dep.startsWith("@types/")) continue;
      result.unusedDeps.push(dep);
    }

    const skipMissing = new Set(Array.from(NODE_BUILTINS).concat(["server", "client", "shared"]));
    for (const pkg of Array.from(usedPackages)) {
      if (allDepsSet.has(pkg)) continue;
      if (pkg.startsWith("node:")) continue;
      if (skipMissing.has(pkg)) continue;
      if (pkg.length <= 2) continue;
      result.missingDeps.push(pkg);
    }
  }

  result.schemaVsMigrationsCheckSuggested = true;
  return result;
}

function printReport(r: AuditResult): void {
  const sep = "─".repeat(60);
  console.log("\n  AUDITORIA DO PROJETO GRS\n");
  console.log(sep);

  if (r.unusedFiles.length > 0) {
    console.log("\nArquivos não usados:");
    r.unusedFiles.sort().forEach((f) => console.log("  -", f));
  } else {
    console.log("\nArquivos não usados: (nenhum)");
  }

  if (r.deadImports.length > 0) {
    console.log("\nImports quebrados (arquivo importado não existe):");
    r.deadImports.forEach(({ file, importSpec }) => console.log(`  - ${file} → "${importSpec}"`));
  } else {
    console.log("\nImports quebrados: (nenhum)");
  }

  if (r.unregisteredRoutes.length > 0) {
    console.log("\nRotas não registradas (em server/routes mas não usadas no router):");
    r.unregisteredRoutes.forEach((f) => console.log("  -", f));
  } else {
    console.log("\nRotas não registradas: (nenhum)");
  }

  if (r.brokenScripts.length > 0) {
    console.log("\nScripts npm quebrados (arquivo referenciado não existe):");
    r.brokenScripts.forEach(({ script, ref }) => console.log(`  - ${script}: ${ref}`));
  } else {
    console.log("\nScripts npm quebrados: (nenhum)");
  }

  if (r.unusedDeps.length > 0) {
    console.log("\nDependências npm não utilizadas:");
    r.unusedDeps.sort().forEach((d) => console.log("  -", d));
  } else {
    console.log("\nDependências npm não utilizadas: (nenhum)");
  }

  if (r.missingDeps.length > 0) {
    console.log("\nDependências faltando (importadas mas não no package.json):");
    r.missingDeps.sort().forEach((d) => console.log("  -", d));
  } else {
    console.log("\nDependências faltando: (nenhum)");
  }

  if (r.schemaVsMigrationsCheckSuggested) {
    console.log("\nSchema vs migrações:");
    console.log("  Rode 'npm run db:generate'. Se for criada nova migração, schema.ts está divergente das migrações.");
  }

  console.log("\n" + sep);
  console.log("  Nenhuma modificação automática foi feita.\n");
}

const result = runAudit();
printReport(result);

// Exit 1 apenas para erros críticos (quebram build ou runtime). Arquivos/deps não usados são avisos.
const hasCriticalIssues =
  result.deadImports.length > 0 ||
  result.unregisteredRoutes.length > 0 ||
  result.brokenScripts.length > 0 ||
  result.missingDeps.length > 0;
const hasWarnings = result.unusedFiles.length > 0 || result.unusedDeps.length > 0;
if (hasWarnings && !hasCriticalIssues) {
  console.log("  (Avisos: arquivos ou dependências não usados — revisar quando conveniente.)\n");
}
process.exit(hasCriticalIssues ? 1 : 0);
