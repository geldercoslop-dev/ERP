/**
 * Node ESM exige extensão .js em importações relativas.
 * Ajusta apenas shared/types e dist/shared/types (sem alterar .ts).
 */
import fs from "node:fs";
import path from "node:path";

const dirs = [
  path.join(process.cwd(), "shared", "types"),
  path.join(process.cwd(), "dist", "shared", "types"),
];

function fixContent(c) {
  return c.replace(/from\s+["'](\.\/[^"']+)["']/g, (m, spec) => {
    if (
      spec.endsWith(".js") ||
      spec.endsWith(".json") ||
      spec.endsWith(".mjs") ||
      spec.endsWith(".cjs")
    ) {
      return m;
    }
    return `from "${spec}.js"`;
  });
}

let files = 0;
for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  for (const n of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!n.isFile() || !n.name.endsWith(".js")) continue;
    const f = path.join(dir, n.name);
    const c = fs.readFileSync(f, "utf8");
    const next = fixContent(c);
    if (next !== c) {
      fs.writeFileSync(f, next);
      files++;
    }
  }
}
console.log(`[fix-shared-types-esm-imports] ${files} ficheiro(s) atualizado(s)`);
