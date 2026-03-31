#!/usr/bin/env node
import fs from "fs";

const BASE_URL = "http://localhost:3000";

function readEnvValue(name) {
  if (process.env[name]) return process.env[name];
  try {
    const raw = fs.readFileSync(".env.development", "utf8");
    const line = raw
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim() : undefined;
  } catch {
    return undefined;
  }
}

const APP_SECRET = readEnvValue("APP_SECRET") || readEnvValue("VITE_APP_SECRET");

/** @type {Record<string, string>} */
const jar = {};

function updateCookies(response) {
  const headers = response.headers;
  const setCookies =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : (() => {
          const single = headers.get("set-cookie");
          return single ? [single] : [];
        })();

  for (const cookieLine of setCookies) {
    const firstPair = cookieLine.split(";")[0];
    const eq = firstPair.indexOf("=");
    if (eq <= 0) continue;
    const name = firstPair.slice(0, eq).trim();
    const value = firstPair.slice(eq + 1).trim();
    jar[name] = value;
  }
}

function cookieHeader() {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function call(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const cookie = cookieHeader();
  if (cookie) headers.set("Cookie", cookie);
  if (!headers.has("User-Agent")) headers.set("User-Agent", "rate-limit-tester/1.0");

  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body,
  });

  updateCookies(res);
  const text = await res.text();
  return { status: res.status, text };
}

async function getCsrf() {
  const r = await call("/api/csrf-token", { method: "GET" });
  if (r.status !== 200) {
    throw new Error(`csrf-token failed: ${r.status}`);
  }
  const parsed = JSON.parse(r.text);
  if (!parsed.csrfToken) {
    throw new Error("csrfToken missing in response");
  }
  return parsed.csrfToken;
}

async function burstLogin(csrfToken) {
  const statuses = [];
  for (let i = 0; i < 12; i += 1) {
    const payload = JSON.stringify({
      json: {
        username: "admin",
        password: `wrong-${i}`,
      },
    });

    const r = await call("/api/trpc/auth.login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: payload,
    });

    if (i === 0) {
      console.log(`first_login_body=${r.text.slice(0, 180)}`);
    }

    statuses.push(r.status);
  }
  return statuses;
}

async function burstPath(path, csrfToken, total) {
  const statuses = [];
  for (let i = 0; i < total; i += 1) {
    const r = await call(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
        ...(APP_SECRET ? { "x-app-secret": APP_SECRET } : {}),
      },
      body: JSON.stringify({ json: { test: i } }),
    });
    statuses.push(r.status);
  }
  return statuses;
}

function summarize(label, statuses) {
  const counts = new Map();
  for (const s of statuses) {
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  const grouped = Array.from(counts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([code, qty]) => `${code}:${qty}`)
    .join(", ");
  console.log(`${label} -> ${grouped}`);
}

(async () => {
  try {
    console.log("[1/5] Getting CSRF token...");
    const csrf = await getCsrf();
    console.log(`[OK] CSRF token obtained (${csrf.slice(0, 12)}...)`);
    console.log(`[INFO] cookie_keys=${Object.keys(jar).join(",")}`);
    console.log(`[INFO] app_secret_loaded=${APP_SECRET ? "yes" : "no"}`);

    console.log("[2/5] Login burst (12 attempts) ...");
    const loginStatuses = await burstLogin(csrf);
    summarize("login", loginStatuses);

    const blockedLogin = loginStatuses.filter((s) => s === 429).length;
    console.log(`login blocked responses: ${blockedLogin}`);

    console.log("[3/5] Waiting 65s for login window reset...");
    await new Promise((resolve) => setTimeout(resolve, 65_000));

    const postWait = await call("/api/trpc/auth.login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrf,
      },
      body: JSON.stringify({ json: { username: "admin", password: "wrong-post-wait" } }),
    });
    console.log(`post-wait login status: ${postWait.status}`);

    console.log("[4/5] Financeiro burst (55 requests)...");
    const financeiroStatuses = await burstPath("/api/trpc/financeiro.fake", csrf, 55);
    summarize("financeiro", financeiroStatuses);

    console.log("[5/5] LEO burst (25 requests)...");
    const leoStatuses = await burstPath("/api/trpc/leo.fake", csrf, 25);
    summarize("leo", leoStatuses);

    const financeiroBlocked = financeiroStatuses.filter((s) => s === 429).length;
    const leoBlocked = leoStatuses.filter((s) => s === 429).length;

    console.log("\n=== RESULT ===");
    console.log(`login_429=${blockedLogin}`);
    console.log(`financeiro_429=${financeiroBlocked}`);
    console.log(`leo_429=${leoBlocked}`);

    if (blockedLogin > 0 && financeiroBlocked > 0 && leoBlocked > 0) {
      console.log("STATUS: OK");
      process.exit(0);
    }

    console.log("STATUS: NAO_OK");
    process.exit(2);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ERROR: ${message}`);
    process.exit(1);
  }
})();
