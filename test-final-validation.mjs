#!/usr/bin/env node

/**
 * TESTE FINAL COMPLETO
 * RED TEAM + SRE Validation:
 * - Stress test completo
 * - Monitoramento em tempo real
 * - Validação de logs
 * - Shutdown em carga
 */

import { spawn } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname);

console.log("════════════════════════════════════════════════════════════════");
console.log("🧪 TESTE FINAL COMPLETO - RED TEAM + SRE");
console.log("════════════════════════════════════════════════════════════════\n");

const testResults = {
  stressTest: false,
  healthMetrics: false,
  logsStructured: false,
  shutdownStable: false,
};

async function runStressTest() {
  console.log("📊 [1] Executando stress test...");
  
  return new Promise((resolve) => {
    const child = spawn("node", ["server/scripts/stress-test.mjs"], {
      cwd: root,
      env: {
        ...process.env,
        PORT: 3000,
      },
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
      process.stdout.write(chunk);
    });

    child.stderr.on("data", (chunk) => {
      output += String(chunk);
      process.stderr.write(chunk);
    });

    child.on("exit", (code) => {
      testResults.stressTest = code === 0;
      console.log(`   ${code === 0 ? "✅" : "❌"} Stress test ${code === 0 ? "PASSOU" : "FALHOU"}\n`);
      resolve();
    });
  });
}

async function validateHealthMetrics() {
  console.log("💚 [2] Validando métricas de health...");
  
  try {
    const response = await fetch("http://127.0.0.1:3000/api/health", {
      timeout: 5000,
    });
    
    const data = await response.json();
    
    const hasStatus = "status" in data;
    const hasTimestamp = "timestamp" in data;
    const hasMetrics = "metrics" in data;
    const hasDetails = "details" in data;
    
    if (hasStatus && hasMetrics && hasDetails) {
      console.log(`   ✓ Status: ${data.status}`);
      console.log(`   ✓ Memory: ${(data.metrics.memory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   ✓ Uptime: ${data.metrics.uptime.toFixed(2)}s`);
      console.log(`   ✓ HTTP: ${data.details.http}`);
      console.log(`   ✓ DB: ${data.details.db}`);
      console.log(`   ✓ Redis: ${data.details.redis}`);
      
      testResults.healthMetrics = true;
      console.log(`   ✅ Métricas OK\n`);
    } else {
      console.log(`   ❌ Métricas incompletas\n`);
    }
  } catch (err) {
    console.log(`   ❌ ERRO: ${err.message}\n`);
  }
}

async function validateLogs() {
  console.log("📝 [3] Validando estrutura de logs...");
  
  const logsDir = path.join(root, "logs");
  const requiredLogs = ["SECURITY.log", "ERROR.log", "ACCESS.log"];
  
  let logsValid = true;
  
  for (const logFile of requiredLogs) {
    const logPath = path.join(logsDir, logFile);
    const exists = existsSync(logPath);
    console.log(`   ${exists ? "✓" : "✗"} ${logFile} ${exists ? "existe" : "não encontrado"}`);
    logsValid = logsValid && exists;
  }
  
  testResults.logsStructured = logsValid;
  console.log(`   ${logsValid ? "✅" : "❌"} Logs ${logsValid ? "estruturados" : "incompletos"}\n`);
}

async function checkAlerts() {
  console.log("🚨 [4] Verificando alertas...");
  
  try {
    const response = await fetch("http://127.0.0.1:3000/api/metrics/current", {
      timeout: 5000,
    });
    
    if (response.ok) {
      const data = await response.json();
      const alerts = data.alerts || [];
      
      console.log(`   Alertas ativos: ${alerts.length}`);
      
      for (const alert of alerts) {
        console.log(`   ⚠️  [${alert.level}] ${alert.message}`);
      }
      
      console.log(`   ✅ Alertas funcionando\n`);
    } else {
      console.log(`   ⚠️  Endpoint /api/metrics/current não disponível\n`);
    }
  } catch (err) {
    console.log(`   ⚠️  Não foi possível verificar alertas: ${err.message}\n`);
  }
}

async function main() {
  try {
    // Verificar se servidor está rodando
    const healthCheck = await fetch("http://127.0.0.1:3000/api/health", {
      timeout: 5000,
    }).catch(() => null);
    
    if (!healthCheck) {
      console.log("❌ ERRO: Servidor não está respondendo em http://127.0.0.1:3000");
      console.log("   Inicie o servidor antes de rodar os testes\n");
      process.exit(1);
    }
    
    console.log("✓ Servidor respondendo\n");
    
    // Executar testes
    await runStressTest();
    await validateHealthMetrics();
    await validateLogs();
    await checkAlerts();
    
    // Relatório final
    console.log("═════════════════════════════════════════════════════════════════");
    console.log("📋 RESULTADO FINAL");
    console.log("═════════════════════════════════════════════════════════════════\n");
    
    const allPassed = Object.values(testResults).every((v) => v);
    
    console.log(`${testResults.stressTest ? "✅" : "❌"} Stress test`);
    console.log(`${testResults.healthMetrics ? "✅" : "❌"} Health com métricas avançadas`);
    console.log(`${testResults.logsStructured ? "✅" : "❌"} Logs estruturados (SECURITY/ERROR/ACCESS)`);
    console.log(`${testResults.shutdownStable ? "⏭️ " : "⏭️ "} Shutdown em carga (manual)`);
    
    console.log("\n═════════════════════════════════════════════════════════════════\n");
    
    if (allPassed) {
      console.log("✅ TESTES PASSARAM - SISTEMA ESTÁ ESTÁVEL\n");
      process.exit(0);
    } else {
      console.log("⚠️  ALGUNS TESTES FALHARAM - VERIFICAR\n");
      process.exit(1);
    }
  } catch (err) {
    console.error("❌ ERRO FATAL:", err.message);
    process.exit(1);
  }
}

main().catch(console.error);
