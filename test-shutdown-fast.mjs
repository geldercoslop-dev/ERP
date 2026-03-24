#!/usr/bin/env node

/**
 * TESTE RÁPIDO DE SHUTDOWN - Valida que processo finaliza corretamente
 * 
 * Verificações:
 * ✓ Servidor inicia
 * ✓ Endpoint /api/__hard-test/shutdown responde 202
 * ✓ Processo finaliza com exit code 0
 * ✓ Logs contêm [SHUTDOWN_COMPLETE]
 */

import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname);
const testPort = 39997;

console.log("════════════════════════════════════════════════════════════════");
console.log("🧪 TESTE RÁPIDO DE SHUTDOWN");
console.log("════════════════════════════════════════════════════════════════");

let serverOutput = "";
let shutdownSuccess = false;
let exitCodeCorrect = false;

// Inicia servidor em processo separado
const env = {
  ...process.env,
  PORT: testPort,
  TEST_SERVER_PORT: testPort,
  HARD_TEST_HTTP_SHUTDOWN: "1",
  HARD_TEST_SHUTDOWN_SECRET: "test-secret",
  NODE_ENV: "development",
};

console.log(`\n[1] Iniciando servidor na porta ${testPort}...`);

const child = spawn("node", ["server/index.ts"], {
  cwd: root,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});

let healthCheckAttempts = 0;
const maxHealthChecks = 60; // 60 tentativas × 500ms = 30s

// Captura logs do servidor
child.stdout.on("data", (chunk) => {
  const text = String(chunk);
  serverOutput += text;
  if (text.includes("[SHUTDOWN")) {
    console.log(`[SERVER] ${text.trim()}`);
  }
});

child.stderr.on("data", (chunk) => {
  const text = String(chunk);
  serverOutput += text;
});

// Aguarda que servidor inicie
const healthCheckInterval = setInterval(async () => {
  healthCheckAttempts++;

  if (healthCheckAttempts > maxHealthChecks) {
    clearInterval(healthCheckInterval);
    console.log("\n❌ ERRO: Servidor não respondeu em 30s");
    child.kill("SIGKILL");
    process.exit(1);
  }

  try {
    const response = await fetch(`http://127.0.0.1:${testPort}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });

    if (response.ok || response.status === 200) {
      clearInterval(healthCheckInterval);
      console.log(`✓ Servidor respondendo na porta ${testPort}\n`);

      // Servidor iniciou - aguarda 1s antes de shutdown
      setTimeout(async () => {
        console.log("[2] Enviando requisição de shutdown...");
        try {
          const shutdownRes = await fetch(
            `http://127.0.0.1:${testPort}/api/__hard-test/shutdown?secret=test-secret`,
            {
              signal: AbortSignal.timeout(5000),
            }
          );

          if (shutdownRes.status === 202) {
            shutdownSuccess = true;
            console.log("✓ Endpoint respondeu com 202 Accepted");
          } else {
            console.log(`❌ ERRO: Status esperado 202, recebido ${shutdownRes.status}`);
          }
        } catch (err) {
          console.log(`❌ ERRO ao chamar shutdown: ${err.message}`);
        }
      }, 1000);
    }
  } catch {
    // Aguardando...
  }
}, 500);

// Aguarda processo finalizar
child.on("exit", (code, signal) => {
  clearInterval(healthCheckInterval);
  
  console.log(`\n[3] Processo finalizado`);
  console.log(`    Exit code: ${code}`);
  console.log(`    Signal: ${signal}`);

  if (code === 0) {
    exitCodeCorrect = true;
    console.log("✓ Exit code correto (0)");
  } else {
    console.log(`❌ ERRO: Exit code esperado 0, recebido ${code}`);
  }

  // Valida presença de logs críticos
  console.log(`\n[4] Validando logs...`);
  const hasShutdownStart = serverOutput.includes("[SHUTDOWN_START]");
  const hasShutdownComplete = serverOutput.includes("[SHUTDOWN_COMPLETE]");
  const hasCloseHTTP = serverOutput.includes("[SHUTDOWN] closing HTTP");

  console.log(`    [${hasShutdownStart ? "✓" : "✗"}] [SHUTDOWN_START] presente`);
  console.log(`    [${hasShutdownComplete ? "✓" : "✗"}] [SHUTDOWN_COMPLETE] presente`);
  console.log(`    [${hasCloseHTTP ? "✓" : "✗"}] HTTP close presente`);

  // Resultado final
  console.log("\n════════════════════════════════════════════════════════════════");
  
  const allPassed =
    shutdownSuccess && exitCodeCorrect && hasShutdownStart && hasShutdownComplete;

  if (allPassed) {
    console.log("✅ TESTE PASSOU - PROCESSO FINALIZA SEMPRE");
    console.log("════════════════════════════════════════════════════════════════\n");
    process.exit(0);
  } else {
    console.log("❌ TESTE FALHOU - Verifique itens acima");
    console.log("════════════════════════════════════════════════════════════════\n");
    process.exit(1);
  }
});

// Timeout de segurança (90s)
setTimeout(() => {
  console.log("\n❌ ERRO: Teste expirou (90s)");
  child.kill("SIGKILL");
  process.exit(1);
}, 90000);
