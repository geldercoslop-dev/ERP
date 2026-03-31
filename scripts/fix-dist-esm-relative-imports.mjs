/**
 * Pós-build: Node ESM exige extensão em import/export relativos.
 * Corrige todos os `.js` em `dist/` adicionando `.js` quando necessário.
 */
import fs from "node:fs";
import path from "node:path";

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.isFile() && e.name.endsWith(".js")) acc.push(p);
  }
  return acc;
}

function needsExt(spec) {
  return !(
    spec.endsWith(".js") ||
    spec.endsWith(".json") ||
    spec.endsWith(".mjs") ||
    spec.endsWith(".cjs") ||
    spec.endsWith(".node")
  );
}

function fixLine(line) {
  // Import ... from '...'
  line = line.replace(/\bfrom\s+["'](\.{1,2}\/[^"']+)["']/g, (m, spec) => {
    if (!needsExt(spec)) return m;
    return m.replace(spec, `${spec}.js`);
  });
  // Dynamic import('...')
  line = line.replace(/\bimport\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g, (m, spec) => {
    if (!needsExt(spec)) return m;
    return m.replace(spec, `${spec}.js`);
  });
  return line;
}

let updated = 0;
const root = path.join(process.cwd(), "dist");
for (const f of walk(root)) {
  const c = fs.readFileSync(f, "utf8");
  const lines = c.split(/\r?\n/);
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    const next = fixLine(lines[i]);
    if (next !== lines[i]) {
      lines[i] = next;
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(f, lines.join("\n"));
    updated++;
  }
}
console.log(`[fix-dist-esm-relative-imports] ${updated} ficheiro(s) atualizado(s)`);

