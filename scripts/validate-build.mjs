#!/usr/bin/env node
/**
 * validate-build — verifica compilação TypeScript do servidor sem emitir arquivos.
 * Usado no pre-commit e como script standalone.
 *
 * Saída: ✔ build: OK  |  ❌ build: FAIL (lista erros)
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const child = spawn(
  "pnpm",
  ["exec", "tsc", "-p", "tsconfig.server.json", "--noEmit"],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"], shell: false }
);

let stdout = "";
let stderr = "";
child.stdout.on("data", (d) => (stdout += d.toString()));
child.stderr.on("data", (d) => (stderr += d.toString()));

child.on("close", (code) => {
  const output = (stdout + stderr).trim();
  if (code === 0) {
    console.log("✔ build: OK");
    process.exit(0);
  } else {
    console.error("❌ build: FAIL\n");
    if (output) console.error(output);
    process.exit(1);
  }
});
