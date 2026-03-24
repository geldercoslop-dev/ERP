/**
 * HARD TEST: carga concorrente + SIGINT (equivale a CTRL+C) com servidor ouvindo.
 *
 * Uso (na raiz do repo):
 *   pnpm run test:hard-shutdown
 *
 * Requer: .env com DATABASE_URL (e demais vars do boot). Define porta isolada via TEST_SERVER_PORT (default 30997).
 *
 * Shutdown: por padrão usa GET /api/__hard-test/shutdown (HARD_TEST_HTTP_SHUTDOWN=1), porque no Windows
 * `child.kill(SIGINT/SIGTERM)` pode matar o subprocesso antes do encerramento assíncrono completar.
 * Para forçar só sinal POSIX: HARD_TEST_USE_OS_SIGNAL=1.
 *
 * Não usa `tsx watch` — um único processo Node para o sinal fechar HTTP/DB de forma determinística.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const testPort = process.env.TEST_SERVER_PORT || "30997";
/** Primeiro boot com Vite pode levar vários minutos. */
const bootTimeoutMs = Number(process.env.HARD_TEST_BOOT_TIMEOUT_MS || "300000");

const requiredInOutput = [
  "[SHUTDOWN] signal:", // ex.: signal: SIGINT | HTTP_TEST_SHUTDOWN
  "[SHUTDOWN] HTTP server closed",
  "[SHUTDOWN] DB closed",
];

function parsePortFromBootLog(chunk) {
  const m = String(chunk).match(/localhost:(\d+)\//);
  return m ? m[1] : null;
}

async function waitForHealth(getPort, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "";
  let ticks = 0;
  while (Date.now() < deadline) {
    if (child.exitCode != null || child.signalCode != null) {
      throw new Error(
        `processo filho saiu antes do health (code=${child.exitCode} signal=${child.signalCode})`
      );
    }
    const port = typeof getPort === "function" ? getPort() : getPort;
    const hosts = ["127.0.0.1", "localhost"];
    for (const host of hosts) {
      const baseUrl = `http://${host}:${port}`;
      try {
        const r = await fetch(`${baseUrl}/api/trpc/health.ping`, {
          signal: AbortSignal.timeout(8000),
        });
        if (r.ok) return baseUrl;
        lastErr = `${baseUrl} → HTTP ${r.status}`;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
      }
    }
    ticks++;
    if (ticks % 40 === 0) {
      console.log(
        `[hard-test] ainda aguardando health (porta ${typeof getPort === "function" ? getPort() : getPort})…`
      );
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Servidor não respondeu em ${timeoutMs}ms: ${lastErr}`);
}

async function waveConcurrent(baseUrl, n) {
  const settled = await Promise.allSettled(
    Array.from({ length: n }, (_, i) =>
      fetch(`${baseUrl}/api/trpc/health.ping?w=${i}`, {
        signal: AbortSignal.timeout(15000),
      }).then((res) => res.status)
    )
  );
  return settled.map((r) =>
    r.status === "fulfilled" ? r.value : -1
  );
}

async function readPortFromGeneratedFile() {
  try {
    const p = path.join(root, "server", "_core", "port.ts");
    const t = readFileSync(p, "utf8");
    const m = t.match(/PORT = (\d+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function main() {
  console.log("[hard-test] root:", root);
  console.log("[hard-test] TEST_SERVER_PORT:", testPort);
  console.log("[hard-test] ENABLE_GRACEFUL_SHUTDOWN=true (obrigatório em dev)");

  const shutdownSecret =
    process.env.HARD_TEST_SHUTDOWN_SECRET || "erp-hard-test-local-secret";

  const env = {
    ...process.env,
    NODE_ENV: "development",
    ENABLE_GRACEFUL_SHUTDOWN: "true",
    PORT: testPort,
    HARD_TEST_HTTP_SHUTDOWN:
      process.env.HARD_TEST_USE_OS_SIGNAL === "1" ? "0" : "1",
    HARD_TEST_SHUTDOWN_SECRET: shutdownSecret,
    RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX || "50000",
    RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS || "60000",
  };

  const bundleEntry = path.join(root, "dist", "server", "_core", "index.js");
  const useBundle =
    process.env.HARD_TEST_BUNDLE === "1" && existsSync(bundleEntry);

  let child;
  if (useBundle) {
    console.log("[hard-test] modo HARD_TEST_BUNDLE=1 →", bundleEntry);
    child = spawn(process.execPath, [bundleEntry], {
      cwd: root,
      env: {
        ...env,
        NODE_ENV: process.env.HARD_TEST_NODE_ENV || "production",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } else {
    const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
    /** `--import` e entry relativos ao `cwd` — paths absolutos `C:\...` quebram o loader ESM no Windows. */
    child = spawn(process.execPath, [tsxCli, "--import", "./instrument.ts", "server/_core/index.ts"], {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  let combined = "";
  let detectedPort = testPort;

  const append = (buf) => {
    const s = buf.toString();
    combined += s;
    process.stdout.write(s);
    const p = parsePortFromBootLog(s);
    if (p) detectedPort = p;
  };

  child.stdout?.on("data", append);
  child.stderr?.on("data", append);

  const exitPromise = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });

  let baseUrl;
  try {
    baseUrl = await waitForHealth(() => detectedPort, bootTimeoutMs, child);
    console.log("[hard-test] health OK em", baseUrl);
  } catch (e) {
    child.kill("SIGINT");
    await new Promise((r) => setTimeout(r, 2000));
    console.error("[hard-test] servidor de teste não subiu na porta", testPort);
    console.error(combined.slice(-8000));
    throw e;
  }

  console.log("\n[hard-test] stress: 5 ondas × 25 requests concorrentes…");
  const stress = (async () => {
    try {
      for (let w = 0; w < 5; w++) {
        const statuses = await waveConcurrent(baseUrl, 25);
        const bad = statuses.filter((s) => s !== 200 && s !== -1);
        if (bad.length) {
          console.warn("[hard-test] onda", w, "status != 200:", bad.slice(0, 5));
        }
      }
      for (let i = 0; i < 40; i++) {
        void fetch(`${baseUrl}/api/trpc/health.ping?loop=${i}`, {
          signal: AbortSignal.timeout(15000),
        }).catch(() => {});
      }
    } catch (e) {
      console.warn(
        "[hard-test] stress encerrado (normal se coincidir com shutdown):",
        e instanceof Error ? e.message : e
      );
    }
  })();

  await new Promise((r) => setTimeout(r, 600));

  if (process.env.HARD_TEST_USE_OS_SIGNAL === "1") {
    const stopSignal = process.platform === "win32" ? "SIGTERM" : "SIGINT";
    console.log(`\n[hard-test] HARD_TEST_USE_OS_SIGNAL=1 → ${stopSignal}`);
    child.kill(stopSignal);
  } else {
    const u = new URL("/api/__hard-test/shutdown", baseUrl);
    u.searchParams.set("secret", shutdownSecret);
    console.log("\n[hard-test] disparando shutdown via HTTP (recomendado no Windows)…");
    const sr = await fetch(u, { signal: AbortSignal.timeout(15000) });
    console.log("[hard-test] resposta shutdown HTTP:", sr.status);
    if (!sr.ok) {
      console.warn("[hard-test] fallback: SIGTERM no filho");
      child.kill("SIGTERM");
    }
  }

  const outcome = await Promise.race([
    exitPromise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout: processo não saiu em 90s")), 90_000)
    ),
  ]);

  await stress.catch(() => {});

  console.log("\n[hard-test] exit:", outcome);

  const missing = requiredInOutput.filter((line) => !combined.includes(line));
  if (missing.length) {
    console.error("\n[hard-test] FALHA — logs obrigatórios ausentes:");
    missing.forEach((m) => console.error("  -", m));
    process.exitCode = 1;
    return;
  }

  if (combined.includes("[SHUTDOWN] Redis closed")) {
    console.log("[hard-test] Redis também fechou (globalThis.redis).");
  } else {
    console.warn(
      "[hard-test] aviso: [SHUTDOWN] Redis closed não apareceu (Redis opcional / não conectado)."
    );
  }

  console.log("\n[hard-test] OK — shutdown completo validado no stdout/stderr.");
}

main().catch((err) => {
  console.error("[hard-test] erro fatal:", err);
  process.exitCode = 1;
});
