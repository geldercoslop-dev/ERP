#!/usr/bin/env node
/**
 * Diagnóstico: roda cada etapa do build separadamente com timeout
 * Identifica qual comando está travando
 */
import { execSync } from "child_process";
import { existsSync } from "fs";

const steps = [
  { name: "build:server", cmd: "pnpm run build:server", timeout: 180000 },
  { name: "guard-esm-imports", cmd: "pnpm run guard:esm", timeout: 60000 },
];

console.log("\n📊 DIAGNÓSTICO DE BUILD HANG\n");
console.log("Rodando cada etapa com timeout...\n");

for (const step of steps) {
  process.stdout.write(`⏳ ${step.name.padEnd(35)}`);
  
  try {
    const start = Date.now();
    execSync(step.cmd, {
      stdio: "pipe",
      timeout: step.timeout,
    });
    const elapsed = Date.now() - start;
    console.log(`✅ OK (${elapsed}ms)`);
  } catch (error) {
    if (error.signal === "SIGTERM") {
      console.log(`⏹️  TIMEOUT após ${step.timeout}ms — ESTÁ TRAVANDO AQUI!`);
    } else {
      const elapsed = Date.now() - step.start;
      console.log(`❌ ERRO: ${error.message.split("\n")[0]}`);
    }
  }
}

console.log("\n✅ Diagnóstico concluído!\n");
