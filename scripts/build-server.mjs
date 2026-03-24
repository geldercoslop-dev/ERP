/**
 * Build do servidor para produção via esbuild (transpila sem type-check).
 * Gera dist/server/_core/index.js para execução com node ou PM2.
 */
import * as esbuild from "esbuild";
import { mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outFile = join(root, "dist", "server", "_core", "index.js");

mkdirSync(dirname(outFile), { recursive: true });

const result = await esbuild.build({
  entryPoints: [join(root, "server", "_core", "index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: outFile,
  packages: "external",
  sourcemap: true,
  target: "node20",
  metafile: true,
}).catch((err) => {
  console.error("Build do servidor falhou:", err);
  process.exit(1);
});

console.log("Servidor compilado:", outFile);
if (result?.metafile) {
  const size = (result.metafile.outputs[outFile]?.bytes ?? 0) / 1024;
  console.log("Tamanho aproximado:", size.toFixed(1), "KB");
}
