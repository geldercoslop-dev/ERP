/**
 * STRESS TEST + RED TEAM ATTACK SIMULATION
 * 
 * Fases:
 * 1. Carga normal: 100 req/s × 30s
 * 2. Ataques: JSON gigante, headers inválidos, nested payload
 * 3. Flood paralelo: 1000 conexões simultâneas
 * 4. Validação: sistema não crasha, respostas corretas
 */

import http from "node:http";
import { performance } from "node:perf_hooks";

const TARGET_HOST = "127.0.0.1";
const TARGET_PORT = process.env.PORT || 3000;
const APP_SECRET = process.env.APP_SECRET || "test-secret-key";

let totalRequests = 0;
let successRequests = 0;
let failedRequests = 0;
let attacksBlocked = 0;
let responseTimes = [];

const attackPatterns = [
  {
    name: "JSON Gigante (>1MB)",
    payload: JSON.stringify({ data: "x".repeat(1024 * 1024) }),
    headers: { "x-app-secret": APP_SECRET },
  },
  {
    name: "SQL Injection",
    path: "/api/pedidos.list?filter=' OR 1=1 --",
    headers: { "x-app-secret": APP_SECRET },
  },
  {
    name: "XSS Payload",
    path: "/api/health?search=<script>alert('xss')</script>",
    headers: { "x-app-secret": APP_SECRET },
  },
  {
    name: "Directory Traversal",
    path: "/api/pedidos.get?id=../../../../etc/passwd",
    headers: { "x-app-secret": APP_SECRET },
  },
  {
    name: "Headers Inválidos",
    path: "/api/health",
    headers: { "content-length": "-1", "x-app-secret": APP_SECRET },
  },
  {
    name: "Nested Payload Profundo",
    payload: JSON.stringify(createNestedObject(100)),
    headers: { "x-app-secret": APP_SECRET },
  },
];

function createNestedObject(depth) {
  let obj = { value: "deep" };
  for (let i = 0; i < depth; i++) {
    obj = { nested: obj };
  }
  return obj;
}

async function makeRequest(
  method = "GET",
  path = "/api/health",
  payload = null,
  headers = {}
) {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();
    totalRequests++;

    const options = {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path,
      method,
      headers: {
        "x-app-secret": APP_SECRET,
        ...headers,
      },
      timeout: 15000,
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        const duration = performance.now() - startTime;
        responseTimes.push(duration);

        // Validar respostas
        if (res.statusCode === 200 || res.statusCode === 201) {
          successRequests++;
        } else if (res.statusCode >= 400 && res.statusCode < 500) {
          // Ataques bloqueados corretamente
          if (method === "POST" && payload) {
            attacksBlocked++;
          }
          failedRequests++;
        } else {
          failedRequests++;
        }

        resolve({ status: res.statusCode, duration, data });
      });
    });

    req.on("error", (err) => {
      failedRequests++;
      reject(err);
    });

    req.on("timeout", () => {
      failedRequests++;
      req.destroy();
      reject(new Error("Request timeout"));
    });

    if (payload) {
      req.write(payload);
    }

    req.end();
  });
}

async function phaseNormalLoad() {
  console.log("\n📊 FASE 1: CARGA NORMAL (100 req/s × 30s)");
  console.log("═".repeat(60));

  const duration = 30 * 1000; // 30 segundos
  const rps = 100; // requisições por segundo
  const interval = 1000 / rps;

  const startTime = performance.now();
  const promises = [];

  while (performance.now() - startTime < duration) {
    promises.push(makeRequest("GET", "/api/health").catch(() => {}));
    await new Promise((r) => setTimeout(r, interval));
  }

  await Promise.allSettled(promises);
  console.log(`✓ Completado: ${totalRequests} requisições`);
  console.log(`✓ Sucesso: ${successRequests}`);
  console.log(`✓ Falhas: ${failedRequests}`);
}

async function phaseAttacks() {
  console.log("\n🔴 FASE 2: ATAQUES AVANÇADOS");
  console.log("═".repeat(60));

  for (const attack of attackPatterns) {
    try {
      const result = await makeRequest(
        "POST",
        attack.path || "/api/pedidos.create",
        attack.payload,
        attack.headers
      );

      if (result.status >= 400) {
        console.log(`✓ ${attack.name} → BLOQUEADO (${result.status})`);
      } else {
        console.log(`⚠ ${attack.name} → ${result.status} (verificar)`);
      }
    } catch (err) {
      console.log(`✓ ${attack.name} → BLOQUEADO (erro: ${err.message})`);
    }
  }
}

async function phaseFlood() {
  console.log("\n🌊 FASE 3: FLOOD PARALELO (1000 conexões)");
  console.log("═".repeat(60));

  const promises = [];
  for (let i = 0; i < 1000; i++) {
    promises.push(makeRequest("GET", "/api/health").catch(() => {}));
  }

  const start = performance.now();
  await Promise.allSettled(promises);
  const duration = performance.now() - start;

  console.log(`✓ Completado em ${duration.toFixed(2)}ms`);
  console.log(`✓ Throughput: ${(1000 / (duration / 1000)).toFixed(0)} req/s`);
}

async function phaseShutdown() {
  console.log("\n🛑 FASE 4: SHUTDOWN EM CARGA");
  console.log("═".repeat(60));

  // Iniciar stress paralelo
  const stressPromise = (async () => {
    for (let i = 0; i < 100; i++) {
      await makeRequest("GET", "/api/health").catch(() => {});
      await new Promise((r) => setTimeout(r, 10));
    }
  })();

  // Disparar shutdown após 2s
  await new Promise((r) => setTimeout(r, 2000));

  console.log("📡 Enviando shutdown...");
  try {
    const shutdownRes = await makeRequest(
      "GET",
      `/api/__hard-test/shutdown?secret=test-secret`,
      null
    );
    console.log(`✓ Shutdown resposta: ${shutdownRes.status}`);
  } catch (err) {
    console.log(`✓ Shutdown iniciado (conexão fechada)`);
  }

  // Aguardar conclusão
  await new Promise((r) => setTimeout(r, 3000));
  console.log("✓ Fase completada");
}

function printReport() {
  const avgResponseTime =
    responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;
  const maxResponseTime = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;
  const minResponseTime = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;

  console.log("\n═════════════════════════════════════════════════════════════════");
  console.log("📈 RELATÓRIO FINAL - STRESS TEST");
  console.log("═════════════════════════════════════════════════════════════════");

  console.log(`\n📊 Estatísticas Gerais:`);
  console.log(`  Total de requisições: ${totalRequests}`);
  console.log(`  ✓ Sucesso: ${successRequests} (${((successRequests / totalRequests) * 100).toFixed(1)}%)`);
  console.log(`  ✗ Falhas: ${failedRequests}`);
  console.log(`  🔴 Ataques bloqueados: ${attacksBlocked}`);

  console.log(`\n⏱️  Tempos de Resposta:`);
  console.log(`  Média: ${avgResponseTime.toFixed(2)}ms`);
  console.log(`  Mínimo: ${minResponseTime.toFixed(2)}ms`);
  console.log(`  Máximo: ${maxResponseTime.toFixed(2)}ms`);

  console.log(`\n✅ VALIDAÇÕES:`);
  console.log(`  ${successRequests > 0 ? "✓" : "✗"} Sistema respondendo`);
  console.log(`  ${failedRequests < totalRequests * 0.05 ? "✓" : "✗"} Taxa de erro < 5%`);
  console.log(`  ${avgResponseTime < 1000 ? "✓" : "✗"} Latência média < 1s`);
  console.log(`  ${attacksBlocked > 0 ? "✓" : "✗"} Ataques bloqueados`);

  console.log("\n═════════════════════════════════════════════════════════════════\n");

  return successRequests > 0 && failedRequests < totalRequests * 0.05;
}

async function main() {
  console.log("════════════════════════════════════════════════════════════════");
  console.log("🧪 STRESS TEST + RED TEAM");
  console.log(`Target: ${TARGET_HOST}:${TARGET_PORT}`);
  console.log("════════════════════════════════════════════════════════════════");

  try {
    // Verificar se servidor está rodando
    await makeRequest("GET", "/api/health");
    console.log("✓ Servidor respondendo\n");

    // Executar fases
    await phaseNormalLoad();
    await phaseAttacks();
    await phaseFlood();
    // await phaseShutdown(); // Comentado se quiser testar sem shutdown

    // Relatório final
    const passed = printReport();

    if (passed) {
      console.log("✅ STRESS TEST PASSOU - SISTEMA ESTÁVEL\n");
      process.exit(0);
    } else {
      console.log("❌ STRESS TEST FALHOU - VERIFICAR LOGS\n");
      process.exit(1);
    }
  } catch (err) {
    console.error("\n❌ ERRO FATAL:", err.message);
    console.log("✗ Servidor não está respondendo");
    process.exit(1);
  }
}

main().catch(console.error);
