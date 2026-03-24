import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.SECURITY_TEST_PORT || 31077);
const APP_SECRET = process.env.SECURITY_TEST_APP_SECRET || "sec-hard-test";
const INTERNAL_SECRET =
  process.env.SECURITY_TEST_INTERNAL_SECRET || "sec-internal-test";
const BASE = `http://127.0.0.1:${PORT}`;

function log(msg, obj) {
  if (obj === undefined) {
    console.log(`[security-test] ${msg}`);
    return;
  }
  console.log(`[security-test] ${msg}`, obj);
}

async function waitHealth(timeoutMs = 60000) {
  const end = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < end) {
    try {
      const res = await fetch(`${BASE}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return;
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    await sleep(250);
  }
  throw new Error(`health não subiu: ${last}`);
}

async function main() {
  const child = spawn(process.execPath, ["dist/server/_core/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      APP_SECRET,
      HARD_TEST_HTTP_SHUTDOWN: "1",
      HARD_TEST_SHUTDOWN_SECRET: INTERNAL_SECRET,
      RATE_LIMIT_MAX: "1000",
      RATE_LIMIT_WINDOW_MS: "60000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (d) => {
    output += d.toString();
  });
  child.stderr.on("data", (d) => {
    output += d.toString();
  });

  const done = new Promise((resolve) => {
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });

  try {
    await waitHealth();
  } catch (err) {
    log("boot-output", output.slice(-12000));
    child.kill("SIGTERM");
    throw err;
  }
  log("server online", { base: BASE });

  const results = [];

  const noSecret = await fetch(`${BASE}/api/csrf-token`, {
    headers: { "user-agent": "security-test-agent/1.0" },
  });
  results.push({
    check: "sem x-app-secret bloqueia",
    expected: 401,
    got: noSecret.status,
    ok: noSecret.status === 401,
  });

  const noUa = await fetch(`${BASE}/api/csrf-token`, {
    headers: {
      "x-app-secret": APP_SECRET,
      "user-agent": "",
    },
  });
  results.push({
    check: "user-agent vazio bloqueia",
    expected: 400,
    got: noUa.status,
    ok: noUa.status === 400,
  });

  const okReq = await fetch(`${BASE}/api/csrf-token`, {
    headers: {
      "x-app-secret": APP_SECRET,
      "user-agent": "security-test-agent/1.0",
    },
  });
  results.push({
    check: "request válida com secret+UA",
    expected: 200,
    got: okReq.status,
    ok: okReq.status === 200,
  });

  const malicious = await fetch(
    `${BASE}/api/trpc/health.ping?x=union%20select%201`,
    {
      headers: {
        "x-app-secret": APP_SECRET,
        "user-agent": "security-test-agent/1.0",
      },
    }
  );
  results.push({
    check: "payload malicioso simples bloqueado",
    expected: 400,
    got: malicious.status,
    ok: malicious.status === 400,
  });

  const xss = await fetch(
    `${BASE}/api/trpc/health.ping?x=%3Cscript%3Ealert(1)%3C%2Fscript%3E`,
    {
      headers: {
        "x-app-secret": APP_SECRET,
        "user-agent": "security-test-agent/1.0",
      },
    }
  );
  results.push({
    check: "payload XSS simples bloqueado",
    expected: 400,
    got: xss.status,
    ok: xss.status === 400,
  });

  const hugePayload = "A".repeat(1_200_000);
  const bodyLimit = await fetch(`${BASE}/api/trpc/health.ping`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-app-secret": APP_SECRET,
      "user-agent": "security-test-agent/1.0",
    },
    body: JSON.stringify({ payload: hugePayload }),
  });
  results.push({
    check: "body limit 1mb aplicado",
    expected: 413,
    got: bodyLimit.status,
    ok: bodyLimit.status === 413,
  });

  const corsBlocked = await fetch(`${BASE}/api/health`, {
    headers: {
      origin: "https://evil.example.com",
    },
  }).then((r) => ({
    status: r.status,
    acao: r.headers.get("access-control-allow-origin"),
  }));
  results.push({
    check: "CORS origem inválida bloqueada",
    expected: "sem ACAO para origem maliciosa",
    got: `status=${corsBlocked.status}, acao=${corsBlocked.acao ?? "null"}`,
    ok: corsBlocked.acao == null,
  });

  const internalNoCreds = await fetch(`${BASE}/api/__hard-test/shutdown`, {
    headers: { "user-agent": "security-test-agent/1.0" },
  });
  results.push({
    check: "endpoint interno sem credenciais bloqueado",
    expected: 401,
    got: internalNoCreds.status,
    ok: internalNoCreds.status === 401,
  });

  const rateStatuses = await Promise.all(
    Array.from({ length: 70 }, (_, i) =>
      fetch(`${BASE}/api/csrf-token?i=${i}`, {
        headers: {
          "x-app-secret": APP_SECRET,
          "user-agent": "security-test-agent/1.0",
        },
      }).then((r) => r.status)
    )
  );
  const rate429 = rateStatuses.filter((s) => s === 429).length;
  results.push({
    check: "rate limit global 60/min ativo",
    expected: ">=1 resposta 429",
    got: `${rate429} respostas 429`,
    ok: rate429 > 0,
  });

  const healthStatuses = await Promise.all(
    Array.from({ length: 70 }, () =>
      fetch(`${BASE}/api/health`).then((r) => r.status)
    )
  );
  const health429 = healthStatuses.filter((s) => s === 429).length;
  results.push({
    check: "health endpoint sem rate limit",
    expected: "0 resposta 429",
    got: `${health429} respostas 429`,
    ok: health429 === 0,
  });

  const internal = await fetch(
    `${BASE}/api/__hard-test/shutdown?secret=${encodeURIComponent(
      INTERNAL_SECRET
    )}`,
    {
      headers: {
        "x-app-secret": APP_SECRET,
        "x-shutdown-secret": INTERNAL_SECRET,
        "user-agent": "security-test-agent/1.0",
      },
    }
  );
  results.push({
    check: "endpoint interno com secret",
    expected: 202,
    got: internal.status,
    ok: internal.status === 202,
  });

  const exit = await Promise.race([
    done,
    sleep(30000).then(() => ({ code: null, signal: "timeout" })),
  ]);

  const allOk = results.every((r) => r.ok);
  log("resultados", results);
  log("exit", exit);

  if (!output.includes("[SECURITY]")) {
    log("aviso", "logs [SECURITY] não detectados no stdout capturado");
  }

  if (!allOk) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[security-test] fatal", err);
  process.exitCode = 1;
});
