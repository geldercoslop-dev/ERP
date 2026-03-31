/**
 * Após tsc com rootDir ".", a saída fica em dist/server/**.
 * Este passo copia dist/server/* para dist/ para o entry ser dist/index.js
 * e dist/_core/... (runtime ESM alinhado ao fonte em server/).
 */
import fs from "node:fs";
import path from "node:path";

const dist = path.join(process.cwd(), "dist");
const srv = path.join(dist, "server");

if (!fs.existsSync(srv)) {
  console.error("[flatten-server-dist] dist/server não existe — tsc emitiu outro layout?");
  process.exit(1);
}

for (const name of fs.readdirSync(srv)) {
  const from = path.join(srv, name);
  const to = path.join(dist, name);
  fs.cpSync(from, to, { recursive: true, force: true });
}
fs.rmSync(srv, { recursive: true, force: true });
console.log("[flatten-server-dist] dist/server/* → dist/");
