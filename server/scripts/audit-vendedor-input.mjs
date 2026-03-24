/**
 * Auditoria estática: padrões suspeitos de vendedorId vindo de input/payload.
 * Uso: node server/scripts/audit-vendedor-input.mjs
 * Exit 1 se encontrar ocorrências em arquivos monitorados (ajuste a lista conforme o projeto).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..");

const SUSPECT = [
  /payload\.vendedorId/gi,
  /parametros\?\.vendedorId/gi,
  /parameters\?\.vendedorId/gi,
  /body\.vendedorId/gi,
  /request\.body.*vendedorId/gi,
];

const IGNORE_DIRS = new Set(["node_modules", "dist", ".git", "drizzle/meta"]);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (IGNORE_DIRS.has(name)) continue;
      walk(full, out);
    } else if (/\.(ts|tsx|mts|cts)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(serverRoot);
const hits = [];

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(serverRoot, file);
  for (const rx of SUSPECT) {
    let m;
    const copy = new RegExp(rx.source, rx.flags);
    while ((m = copy.exec(text)) !== null) {
      const line = text.slice(0, m.index).split("\n").length;
      hits.push({ file: rel, line, match: m[0] });
    }
  }
}

if (hits.length === 0) {
  console.log("audit-vendedor-input: nenhum padrão suspeito encontrado.");
  process.exit(0);
}

console.log("audit-vendedor-input: revisar manualmente (padrões suspeitos):\n");
for (const h of hits) {
  console.log(`  ${h.file}:${h.line}  (${h.match})`);
}
console.log(`\nTotal: ${hits.length} ocorrência(s).`);
process.exit(1);
