/**
 * Executa testes reais HTTP contra servidor em execução.
 * NÃO simula: faz requests reais para /api/*.
 *
 * Uso:
 *   pnpm exec tsx scripts/runtime-attack-suite.ts --base http://localhost:3007
 */
import { setTimeout as sleep } from "node:timers/promises";

type Result = { name: string; ok: boolean; details: Record<string, unknown> };

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

async function fetchJson(url: string, init?: RequestInit): Promise<{ status: number; headers: Headers; text: string; json?: any }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await r.text();
    let json: any;
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, headers: r.headers, text, json };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const base = argValue("--base") ?? "http://localhost:3007";
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

  const results: Result[] = [];

  // 0) sanity: server up + db ok
  const health = await fetchJson(`${base}/api/health`, { headers: { "user-agent": ua } });
  results.push({
    name: "sanity /api/health + db conectado",
    ok:
      health.status === 200 &&
      (health.json?.details?.db === "up" || health.json?.status === "ok"),
    details: {
      status: health.status,
      health: health.json,
      schemaMatch: health.json?.schemaMatch,
      xFrameOptions: health.headers.get("x-frame-options"),
      csp: health.headers.get("content-security-policy"),
    },
  });

  // 1) CSRF token
  const csrfTokenResp = await fetchJson(`${base}/api/csrf-token`, { headers: { "user-agent": ua } });
  const csrfToken = csrfTokenResp.json?.csrfToken as string | undefined;
  const setCookie = csrfTokenResp.headers.get("set-cookie") ?? "";
  const csrfCookie = setCookie.split(";")[0]; // "csrf-token=..."
  results.push({
    name: "csrf token endpoint",
    ok: csrfTokenResp.status === 200 && typeof csrfToken === "string" && csrfToken.length > 10 && csrfCookie.includes("csrf-token="),
    details: { status: csrfTokenResp.status, hasCookie: Boolean(csrfCookie), headerName: csrfTokenResp.json?.headerName },
  });

  // 2) CSRF sem token (POST)
  const csrfMissing = await fetchJson(`${base}/api/test/failure/configure`, {
    method: "POST",
    headers: { "user-agent": ua, "content-type": "application/json", cookie: csrfCookie },
    body: JSON.stringify({ enabled: true }),
  });
  results.push({
    name: "CSRF sem header (espera 403)",
    ok: csrfMissing.status === 403,
    details: { status: csrfMissing.status, body: csrfMissing.json ?? csrfMissing.text },
  });

  // 3) XSS (body) — deve bloquear via attack detection
  const xss = await fetchJson(`${base}/api/test/failure/configure`, {
    method: "POST",
    headers: {
      "user-agent": ua,
      "content-type": "application/json",
      "x-csrf-token": csrfToken ?? "",
      cookie: csrfCookie,
    },
    body: JSON.stringify({ enabled: true, note: "<script>alert(1)</script>" }),
  });
  results.push({
    name: "XSS em body (espera 400)",
    ok: xss.status === 400 && xss.json?.code === "MALICIOUS_BODY",
    details: { status: xss.status, code: xss.json?.code, message: xss.json?.message },
  });

  // 4) SQLi (payload em auth.login)
  const sqli1 = await fetchJson(`${base}/api/trpc/auth.login?batch=1`, {
    method: "POST",
    headers: { "user-agent": ua, "content-type": "application/json" },
    body: JSON.stringify({ 0: { json: { username: "' OR 1=1 --", password: "x" } } }),
  });
  results.push({
    name: "SQLi ' OR 1=1 -- (espera 400)",
    ok: sqli1.status === 400 && (sqli1.json?.code === "MALICIOUS_BODY" || sqli1.json?.code === "MALICIOUS_HEADER"),
    details: { status: sqli1.status, body: sqli1.json ?? sqli1.text },
  });

  const sqli2 = await fetchJson(`${base}/api/trpc/auth.login?batch=1`, {
    method: "POST",
    headers: { "user-agent": ua, "content-type": "application/json" },
    body: JSON.stringify({ 0: { json: { username: "' UNION SELECT 1,2,3 --", password: "x" } } }),
  });
  results.push({
    name: "SQLi UNION SELECT (espera 400)",
    ok: sqli2.status === 400,
    details: { status: sqli2.status, body: sqli2.json ?? sqli2.text },
  });

  // 5) Payload gigante (> 10MB) — flood limits devem bloquear (429)
  const big = "A".repeat(11 * 1024 * 1024);
  const bigPayload = await fetchJson(`${base}/api/test/failure/configure`, {
    method: "POST",
    headers: {
      "user-agent": ua,
      "content-type": "application/json",
      "x-csrf-token": csrfToken ?? "",
      cookie: csrfCookie,
    },
    body: JSON.stringify({ enabled: true, blob: big }),
  });
  results.push({
    name: "Payload gigante >10MB (espera 429 FLOOD)",
    ok: bigPayload.status === 429 && bigPayload.json?.code === "FLOOD_DETECTED",
    details: { status: bigPayload.status, code: bigPayload.json?.code, message: bigPayload.json?.message },
  });

  // 6) Brute force / rate limit (tenta até 429 ou 140 reqs)
  let brute429At: number | null = null;
  for (let i = 1; i <= 140; i++) {
    const r = await fetchJson(`${base}/api/trpc/auth.login?batch=1`, {
      method: "POST",
      headers: { "user-agent": ua, "content-type": "application/json" },
      body: JSON.stringify({ 0: { json: { username: `admin${i}`, password: "wrong" } } }),
    });
    if (r.status === 429) {
      brute429At = i;
      break;
    }
    // pequeno espaçamento para não travar runtime
    if (i % 20 === 0) await sleep(50);
  }
  results.push({
    name: "Brute force (rate limit) — espera 429",
    ok: brute429At !== null,
    details: { first429At: brute429At, configuredRateLimitMax: process.env.RATE_LIMIT_MAX ?? "(env não lida aqui)" },
  });

  // 7) Rate limit bypass (X-Forwarded-For). Se rate-limit respeitar XFF indevidamente, pode burlar.
  // Aqui só detectamos sinal de bypass: após já ter 429, tentar com XFF diferente e ver se volta 200/400.
  const bypassTry = await fetchJson(`${base}/api/trpc/auth.login?batch=1`, {
    method: "POST",
    headers: {
      "user-agent": ua,
      "content-type": "application/json",
      "x-forwarded-for": "1.2.3.4",
    },
    body: JSON.stringify({ 0: { json: { username: "admin", password: "wrong" } } }),
  });
  results.push({
    name: "Rate limit bypass via X-Forwarded-For (espera continuar 429)",
    ok: brute429At === null ? true : bypassTry.status === 429,
    details: { status: bypassTry.status, body: bypassTry.json ?? bypassTry.text },
  });

  // Emit report
  const blocked = results.filter((r) => r.ok).map((r) => r.name);
  const failed = results.filter((r) => !r.ok);

  console.log("\n=== ATTACK SUITE RESULTS ===");
  for (const r of results) {
    console.log(`- ${r.ok ? "OK" : "FAIL"} ${r.name}`);
    if (!r.ok) console.log("  details:", JSON.stringify(r.details));
  }

  const invadivel = failed.length > 0;
  console.log("\n=== SUMMARY ===");
  console.log("blocked_ok:", blocked.length, "/", results.length);
  console.log("invadivel:", invadivel ? "SIM" : "NÃO");

  process.exit(failed.length ? 2 : 0);
}

main().catch((e) => {
  console.error("[attack-suite] fatal:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});

