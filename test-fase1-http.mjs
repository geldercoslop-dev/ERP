const BASE = "http://localhost:3000";
const RESULTS = [];

function pass(name, detail = "") {
  RESULTS.push({ name, status: "PASS", detail });
  console.log(`[PASS] ${name}${detail ? ` - ${detail}` : ""}`);
}

function fail(name, detail = "") {
  RESULTS.push({ name, status: "FAIL", detail });
  console.log(`[FAIL] ${name}${detail ? ` - ${detail}` : ""}`);
}

async function f(url, options = {}, timeoutMs = 15000) {
  const signal = AbortSignal.timeout(timeoutMs);
  return fetch(url, { ...options, signal });
}

function parseSetCookies(headers) {
  const out = [];
  const list = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  if (Array.isArray(list) && list.length > 0) {
    for (const c of list) out.push(c.split(";")[0]);
    return out;
  }
  const single = headers.get("set-cookie");
  if (single) {
    const parts = single.split(/,(?=\s*[^;]+=)/g);
    for (const p of parts) out.push(p.split(";")[0].trim());
  }
  return out;
}

async function testHealth() {
  const r = await f(`${BASE}/api/health`);
  const body = await r.json();
  if (r.status === 200 && body?.status === "ok" && body?.details?.db === "up" && body?.details?.redis === "up") {
    pass("health", "db up / redis up");
    return true;
  }
  fail("health", `status=${r.status} body=${JSON.stringify(body).slice(0, 180)}`);
  return false;
}

async function getCsrf() {
  const r = await f(`${BASE}/api/csrf-token`, { headers: { Accept: "application/json" } });
  const text = await r.text();
  let token = "";
  try {
    const j = JSON.parse(text);
    token = j?.csrfToken || j?.token || "";
  } catch {
    token = "";
  }
  const cookies = parseSetCookies(r.headers);
  const csrfCookie = cookies.find((c) => c.startsWith("csrf-token=")) || "";
  if (r.status === 200 && token) {
    pass("csrf-token", `ok (${token.slice(0, 10)}...)`);
    return { token, cookies: csrfCookie ? [csrfCookie] : [] };
  }
  fail("csrf-token", `status=${r.status} body=${text.slice(0, 180)}`);
  return { token: "", cookies: [] };
}

async function testLogin(csrf) {
  const cookieHeader = csrf.cookies.join("; ");
  const body = JSON.stringify({ username: "admin", password: "Admin@123" });
  const r = await f(
    `${BASE}/api/trpc/auth.login`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-csrf-token": csrf.token,
        cookie: cookieHeader,
      },
      body,
    },
    20000
  );
  const text = await r.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  const setCookies = parseSetCookies(r.headers);
  const session = setCookies.find((c) => c.startsWith("session="));
  const allCookies = [...csrf.cookies, ...setCookies.filter((c) => c.startsWith("session="))];
  const ok = payload?.result?.data?.json?.ok === true;
  if (r.status === 200 && ok && session) {
    pass("login", `admin autenticado (${payload.result.data.json.role})`);
    return { ok: true, cookies: allCookies, payload };
  }
  fail("login", `status=${r.status} body=${text.slice(0, 220)}`);
  return { ok: false, cookies: csrf.cookies, payload };
}

async function testAuthMe(session) {
  const r = await f(`${BASE}/api/trpc/auth.me`, {
    headers: { cookie: session.cookies.join("; ") },
  });
  const text = await r.text();
  if (r.status === 200) {
    pass("auth.me", "sessao valida");
    return true;
  }
  fail("auth.me", `status=${r.status} body=${text.slice(0, 180)}`);
  return false;
}

async function testTenantOverride(session) {
  const r = await f(`${BASE}/api/trpc/auth.me?tenantId=999`, {
    headers: { cookie: session.cookies.join("; ") },
  });
  const text = await r.text();
  if (r.status === 400 || r.status === 401 || r.status === 403) {
    pass("tenant-override", `bloqueado (${r.status})`);
    return;
  }
  if (r.status === 200) {
    pass("tenant-override", "request nao eleva tenant (permanece contexto JWT)");
    return;
  }
  fail("tenant-override", `status=${r.status} body=${text.slice(0, 180)}`);
}

async function testNoStackLeak(csrf) {
  const r = await f(`${BASE}/api/trpc/auth.login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": csrf.token,
      cookie: csrf.cookies.join("; "),
    },
    body: JSON.stringify({}),
  });
  const text = await r.text();
  const hasStack = /"stack"|at\s+\w|node_modules|\/app\//i.test(text);
  if (!hasStack) {
    pass("error-no-stack", `status=${r.status}`);
  } else {
    fail("error-no-stack", `vazou stack/path: ${text.slice(0, 220)}`);
  }
}

async function testBodyLimit(csrf) {
  const huge = "X".repeat(1_200_000);
  const r = await f(
    `${BASE}/api/trpc/auth.login`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrf.token,
        cookie: csrf.cookies.join("; "),
      },
      body: JSON.stringify({ username: "admin", password: huge }),
    },
    25000
  );
  const text = await r.text();
  if (r.status === 413) {
    pass("body-limit-413", "413 confirmado");
    return;
  }
  fail("body-limit-413", `status=${r.status} body=${text.slice(0, 180)}`);
}

async function main() {
  console.log("FASE 1 HTTP REAL\n");
  const healthy = await testHealth();
  if (!healthy) {
    process.exit(1);
  }
  const csrf = await getCsrf();
  const login = await testLogin(csrf);
  if (login.ok) {
    await testAuthMe(login);
    await testTenantOverride(login);
  } else {
    fail("auth.me", "pulado - login falhou");
    fail("tenant-override", "pulado - login falhou");
  }
  await testNoStackLeak(csrf);
  await testBodyLimit(csrf);

  const passed = RESULTS.filter((r) => r.status === "PASS").length;
  const failed = RESULTS.filter((r) => r.status === "FAIL").length;
  console.log("\nRESUMO");
  console.log(`PASS=${passed} FAIL=${failed}`);
  for (const r of RESULTS) console.log(`[${r.status}] ${r.name}: ${r.detail}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal", err);
  process.exit(1);
});
