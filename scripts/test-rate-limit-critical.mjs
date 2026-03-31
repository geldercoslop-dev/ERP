#!/usr/bin/env node
import fs from "fs";

const BASE_URL = "http://localhost:3000";

function envValue(name) {
  if (process.env[name]) return process.env[name];
  try {
    const files = [".env", ".env.development", ".env.local"];
    for (const file of files) {
      if (!fs.existsSync(file)) continue;
      const line = fs
        .readFileSync(file, "utf8")
        .split(/\r?\n/)
        .find((l) => l.startsWith(`${name}=`));
      if (line) return line.slice(name.length + 1).trim();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

const APP_SECRET = envValue("APP_SECRET") || envValue("VITE_APP_SECRET");
const jar = {};

function updateCookie(res) {
  const headers = res.headers;
  const lines = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : (headers.get("set-cookie") ? [headers.get("set-cookie")] : []);
  for (const cookieLine of lines) {
    if (!cookieLine) continue;
    const firstPair = cookieLine.split(";")[0];
    const idx = firstPair.indexOf("=");
    if (idx <= 0) continue;
    const k = firstPair.slice(0, idx).trim();
    const v = firstPair.slice(idx + 1).trim();
    jar[k] = v;
  }
}

function cookieHeader() {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function call(path, method = "POST", body = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const headers = {
      "User-Agent": "critical-rate-limit-test/1.0",
      "Content-Type": "application/json",
      ...(cookieHeader() ? { Cookie: cookieHeader() } : {}),
    };

    const init = {
      method,
      headers,
      signal: controller.signal,
    };

    if (method !== "GET" && method !== "HEAD") {
      init.body = JSON.stringify(body);
    }

    const res = await fetch(`${BASE_URL}${path}`, init);

    updateCookie(res);
    const text = await res.text();
    return { status: res.status, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function runBurst(path, total, csrfToken) {
  const statuses = [];
  for (let i = 0; i < total; i += 1) {
    const headersBody = {
      json: { n: i },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
          "User-Agent": "critical-rate-limit-test/1.0",
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
          ...(APP_SECRET ? { "x-app-secret": APP_SECRET } : {}),
          ...(cookieHeader() ? { Cookie: cookieHeader() } : {}),
        },
        body: JSON.stringify(headersBody),
        signal: controller.signal,
      });
      updateCookie(res);
      statuses.push(res.status);
      await res.text();
    } catch {
      statuses.push(0);
    } finally {
      clearTimeout(timeout);
    }
  }
  return statuses;
}

function summary(label, statuses) {
  const grouped = statuses.reduce((acc, code) => {
    acc[code] = (acc[code] || 0) + 1;
    return acc;
  }, {});
  console.log(`${label}: ${JSON.stringify(grouped)}`);
}

(async () => {
  const csrfRes = await call("/api/csrf-token", "GET");
  if (csrfRes.status !== 200) {
    console.log(`csrf_failed:${csrfRes.status}`);
    process.exit(1);
  }
  const csrf = JSON.parse(csrfRes.text).csrfToken;

  const financeiro = await runBurst("/api/trpc/financeiro.fake", 55, csrf);
  const leo = await runBurst("/api/trpc/leo.fake", 25, csrf);

  summary("financeiro", financeiro);
  summary("leo", leo);

  const fin429 = financeiro.filter((s) => s === 429).length;
  const leo429 = leo.filter((s) => s === 429).length;
  console.log(`fin429=${fin429};leo429=${leo429}`);
  process.exit(fin429 > 0 || leo429 > 0 ? 0 : 2);
})();
