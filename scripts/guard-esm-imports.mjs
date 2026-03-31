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

function hasBadRelativeSpecifier(line) {
  const trimmed = line.trim();
  // ignora comentários
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return false;

  // pega from "./x" ou from "../x" (sem extensão) em import/export
  const m = trimmed.match(/\bfrom\s+["'](\.{1,2}\/[^"']+)["']/);
  if (!m) return false;
  const spec = m[1];
  if (spec.endsWith(".js") || spec.endsWith(".json") || spec.endsWith(".mjs") || spec.endsWith(".cjs")) return false;
  // permitir `./x/`? não: ESM também quebra. Então falha.
  return true;
}

async function main() {
  const root = path.join(process.cwd(), "dist");
  const files = walk(root);
  const bad = [];
  for (const f of files) {
    const c = fs.readFileSync(f, "utf8");
    const lines = c.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (hasBadRelativeSpecifier(lines[i])) {
        bad.push(`${f}:${i + 1}:${lines[i].trim()}`);
        break;
      }
    }
  }
  if (bad.length) {
    console.error("[ESM] imports relativos sem extensão detectados:");
    for (const b of bad.slice(0, 25)) console.error("[ESM] " + b);
    process.exit(1);
  }
  console.error("[ESM] ok: nenhum import relativo sem extensão em dist/");
}

main().catch((e) => {
  console.error("[ESM] fatal:", e);
  process.exit(1);
});

