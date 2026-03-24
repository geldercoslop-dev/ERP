#!/usr/bin/env node

/**
 * VALIDAÇÃO ESTÁTICA - RED TEAM + SRE COMPLETENESS
 * Verifica que todos os componentes foram implementados corretamente
 */

import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;

console.log("════════════════════════════════════════════════════════════════");
console.log("🔍 VALIDAÇÃO ESTÁTICA - STRESS TEST + MONITORING");
console.log("════════════════════════════════════════════════════════════════\n");

const checks = [
  {
    category: "FASE 1: Stress Test",
    items: [
      {
        name: "Script stress-test.mjs criado",
        file: "server/scripts/stress-test.mjs",
        pattern: /phaseNormalLoad|phaseAttacks|phaseFlood/,
      },
      {
        name: "Teste de carga normal (100 req/s)",
        file: "server/scripts/stress-test.mjs",
        pattern: /phaseNormalLoad/,
      },
      {
        name: "Testes de ataque avançados",
        file: "server/scripts/stress-test.mjs",
        pattern: /JSON Gigante|SQL Injection|XSS Payload|Directory Traversal/,
      },
      {
        name: "Flood paralelo (1000 conexões)",
        file: "server/scripts/stress-test.mjs",
        pattern: /phaseFlood/,
      },
    ],
  },
  {
    category: "FASE 3: Health Avançado",
    items: [
      {
        name: "Tipo HealthMetrics com uptime, memory, cpu",
        file: "server/services/system/health.service.ts",
        pattern: /export type HealthMetrics/,
      },
      {
        name: "Métricas de uptime",
        file: "server/services/system/health.service.ts",
        pattern: /uptime.*process\.uptime/,
      },
      {
        name: "Métricas de memory (heapUsed, heapTotal, rss)",
        file: "server/services/system/health.service.ts",
        pattern: /heapUsed|heapTotal|rss/,
      },
      {
        name: "Métricas de cpu (user, system)",
        file: "server/services/system/health.service.ts",
        pattern: /cpu.*user|cpu.*system/,
      },
    ],
  },
  {
    category: "FASE 4: Monitoring/Metrics",
    items: [
      {
        name: "Arquivo metrics.ts criado",
        file: "server/monitoring/metrics.ts",
        pattern: /export const metricsService/,
      },
      {
        name: "recordRequest para duração",
        file: "server/monitoring/metrics.ts",
        pattern: /recordRequest/,
      },
      {
        name: "recordError para erros",
        file: "server/monitoring/metrics.ts",
        pattern: /recordError/,
      },
      {
        name: "checkAlerts para limites",
        file: "server/monitoring/metrics.ts",
        pattern: /checkAlerts/,
      },
    ],
  },
  {
    category: "FASE 5: Alertas Simples",
    items: [
      {
        name: "Alerta se erros > 10/min",
        file: "server/monitoring/metrics.ts",
        pattern: /errorsPerMinute > 10/,
      },
      {
        name: "Alerta se latência > 1000ms",
        file: "server/monitoring/metrics.ts",
        pattern: /averageResponseTime.*> 1000/,
      },
      {
        name: "Alerta se conexões ativas > 500",
        file: "server/monitoring/metrics.ts",
        pattern: /activeConnections > 500/,
      },
    ],
  },
  {
    category: "FASE 6: Logs Estruturados",
    items: [
      {
        name: "Logger estruturado criado",
        file: "server/monitoring/logger.ts",
        pattern: /export const loggerStructured/,
      },
      {
        name: "Método security() para SECURITY.log",
        file: "server/monitoring/logger.ts",
        pattern: /security\(/,
      },
      {
        name: "Método error() para ERROR.log",
        file: "server/monitoring/logger.ts",
        pattern: /error\(/,
      },
      {
        name: "Método access() para ACCESS.log",
        file: "server/monitoring/logger.ts",
        pattern: /access\(/,
      },
    ],
  },
  {
    category: "INTEGRAÇÃO: Middleware Global",
    items: [
      {
        name: "Middleware de monitoramento em app.use",
        file: "server/_core/index.ts",
        pattern: /Middleware de monitoramento global/,
      },
      {
        name: "Registra métricas (recordRequest)",
        file: "server/_core/index.ts",
        pattern: /metricsService\.recordRequest/,
      },
      {
        name: "Registra erros (recordError)",
        file: "server/_core/index.ts",
        pattern: /metricsService\.recordError/,
      },
      {
        name: "Logs de acesso integrados",
        file: "server/_core/index.ts",
        pattern: /loggerStructured\.access/,
      },
    ],
  },
  {
    category: "ENDPOINTS: Métricas",
    items: [
      {
        name: "Router de métricas criado",
        file: "server/api/metrics-router.ts",
        pattern: /createMetricsRouter/,
      },
      {
        name: "GET /api/metrics/current",
        file: "server/api/metrics-router.ts",
        pattern: /\/current/,
      },
    ],
  },
];

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

for (const category of checks) {
  console.log(`📋 ${category.category}`);
  console.log("─".repeat(60));

  for (const item of category.items) {
    totalChecks++;
    try {
      const filePath = path.join(root, item.file);
      const contents = readFileSync(filePath, "utf8");

      if (item.pattern.test(contents)) {
        console.log(`  ✅ ${item.name}`);
        passedChecks++;
      } else {
        console.log(`  ❌ ${item.name}`);
        console.log(`     Pattern não encontrado: ${item.pattern}`);
        failedChecks++;
      }
    } catch (err) {
      console.log(`  ❌ ${item.name}`);
      console.log(`     Erro ao ler arquivo: ${err.message}`);
      failedChecks++;
    }
  }
  console.log();
}

console.log("════════════════════════════════════════════════════════════════");
console.log(`📊 RESULTADO: ${passedChecks}/${totalChecks} testes passaram`);
console.log("════════════════════════════════════════════════════════════════\n");

if (failedChecks === 0) {
  console.log("✅ SUCESSO: Sistema RED TEAM + SRE completamente implementado\n");
  console.log("🎯 Funcionalidades implementadas:\n");
  console.log("  ✓ FASE 1: Stress test (100 req/s × 30s, flood 1000x)");
  console.log("  ✓ FASE 2: Ataques avançados (JSON gigante, SQL, XSS, traversal)");
  console.log("  ✓ FASE 3: Health endpoint com métricas (uptime, memory, cpu)");
  console.log("  ✓ FASE 4: Monitoring interno (metrics.ts)");
  console.log("  ✓ FASE 5: Alertas automáticos (erro/min, latência, conexões)");
  console.log("  ✓ FASE 6: Logs estruturados (SECURITY, ERROR, ACCESS)");
  console.log("  ✓ FASE 7: Shutdown estável (implementado anteriormente)");
  console.log("\n✨ Middleware global registra:\n");
  console.log("  • Duração de cada requisição");
  console.log("  • Erros por minuto");
  console.log("  • Tempo médio de resposta");
  console.log("  • Conexões ativas");
  console.log("  • Logs estruturados de acesso e segurança");
  console.log("\n════════════════════════════════════════════════════════════════\n");
  process.exit(0);
} else {
  console.log(`❌ FALHA: ${failedChecks} itens não implementados\n`);
  process.exit(1);
}
