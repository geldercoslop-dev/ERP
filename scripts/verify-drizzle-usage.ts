/**
 * verify-drizzle-usage.ts
 *
 * Guard de arquitetura: garante que Drizzle ORM só seja acessado
 * a partir das camadas autorizadas (server/db/ e server/services/db/).
 *
 * Falha com process.exit(1) se detectar violação.
 * Uso: pnpm run verify:drizzle
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

// ===========================================================
// REGRA CENTRAL:
// - server/services/ é a camada de acesso ao banco (permitido)
// - server/db/ é a conexão (permitido)
// - BLOQUEADO: routers, leo, tools, cache, modules, routes,
//              qualquer código fora de services/ que importe drizzle
// ===========================================================
const BLOCKED_PATHS_PREFIXES = [
  "server/routers/",
  "server/routes/",
  "server/leo/",
  "server/tools/",
  "server/cache/",
  "server/modules/",
  "server/middleware/",
  "server/middlewares/",
  "server/infra/",
  "server/api/",
  "server/pdf.ts",
  "server/storage.ts",
  "server/worker.ts",
];

// ===========================================================
// Diretórios varridos em busca de violações
// ===========================================================
const SCAN_DIRS = [
  path.join(ROOT, "server"),
  path.join(ROOT, "shared"),
];

// Extensões verificadas
const ALLOWED_EXTENSIONS = new Set([".ts", ".tsx"]);

// Padrões que caracterizam uso de Drizzle
const DRIZZLE_PATTERNS = [
  /from\s+['"]drizzle-orm['"]/,
  /from\s+['"]drizzle-orm\//,
  /from\s+['"][^'"]*drizzle\/schema['"]/,
  /require\(['"]drizzle-orm['"]\)/,
  /import\s*\(['"]drizzle-orm['"]\)/,
];

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (ALLOWED_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

  function isBlocked(rel: string): boolean {
    const normalized = rel.replace(/\\/g, "/");
    // Ignorar arquivos de declaração de tipos (.d.ts)
    if (normalized.endsWith(".d.ts")) return false;
    // Ignorar tests
    if (normalized.includes("/tests/") || normalized.includes(".test.ts") || normalized.includes(".spec.ts")) {
      return false;
    }
    return BLOCKED_PATHS_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  }

function main(): void {
  const violations: string[] = [];

  for (const dir of SCAN_DIRS) {
    for (const file of walk(dir)) {
      const rel = path.relative(ROOT, file).replace(/\\/g, "/");
        if (!isBlocked(rel)) continue;

        const content = fs.readFileSync(file, "utf8");
        const lines = content.split("\n");

        lines.forEach((line, idx) => {
          if (DRIZZLE_PATTERNS.some((p) => p.test(line))) {
            const trimmed = line.trimStart();
            if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
              return;
            }
            violations.push(`  ${rel}:${idx + 1}  →  ${line.trim()}`);
          }
        });
    }
  }

  if (violations.length > 0) {
    console.error("\n[verify:drizzle] FALHA — uso de Drizzle fora da camada autorizada:\n");
    for (const v of violations) {
      console.error(v);
    }
    console.error(
        `\n  Camadas bloqueadas: ${BLOCKED_PATHS_PREFIXES.join(", ")}\n` +
      "  Mova a query para server/services/db/ ou corrija o import.\n"
    );
    process.exit(1);
  }

  console.log("[verify:drizzle] OK — Drizzle confinado às camadas autorizadas.");
}

main();
