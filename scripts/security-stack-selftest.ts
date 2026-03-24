/**
 * Self-test controlado da stack de segurança.
 * Objetivo: validar headers de segurança, CSRF e bloqueio por attack detection
 * sem depender de MySQL/DB.
 *
 * Uso:
 *   pnpm exec tsx scripts/security-stack-selftest.ts
 */
import express from "express";
import { rateLimit } from "express-rate-limit";
import cookie from "cookie";

import { completeSecurityMiddleware } from "../server/security/security-headers";
import { attackDetectionMiddleware } from "../server/security/attack-detection";
import { CSRFProtection } from "../server/security/csrf-protection";
import { requestLoggerMiddleware } from "../server/middleware/request-logger";

function extractCookieValue(setCookie: string | null | undefined, cookieName: string) {
  if (!setCookie) return null;
  // Formato esperado: "csrf-token=VAL; Path=/; ..."
  const match = setCookie.match(new RegExp(`${cookieName}=([^;]+)`));
  return match?.[1] ?? null;
}

async function run() {
  const app = express();

  // Parsing básico (CSRF não depende do body, mas attack detection faz JSON.stringify(req.body))
  app.use(express.json({ limit: "5mb" }));

  // Stack /api: rate limit -> security headers -> attack detection -> csrf -> logger -> routes
  app.use(
    "/api",
    rateLimit({
      windowMs: 60 * 1000,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "rate-limited" },
    })
  );

  app.use("/api", (req, _res, next) => {
    const rawCookie = req.headers.cookie ?? "";
    (req as any).cookies = cookie.parse(rawCookie);
    next();
  });

  app.use("/api", ...completeSecurityMiddleware());
  app.use("/api", attackDetectionMiddleware());

  app.get("/api/csrf-token", CSRFProtection.csrfTokenEndpoint());
  app.use("/api", CSRFProtection.csrfProtection());

  // Logger apenas após CSRF (como exigido na ordem).
  app.use("/api", requestLoggerMiddleware());

  // Endpoint de teste state-changing (sem auth/DB).
  app.post("/api/test/failure/configure", (req, res) => {
    res.json({ ok: true, body: req.body ?? null });
  });

  const server = app.listen(0, "127.0.0.1");
  const port: number = await new Promise((resolve) => {
    const addr = server.address() as any | null;
    if (addr && typeof addr.port === "number") return resolve(addr.port);
    server.once("listening", () => {
      const addr2 = server.address() as any;
      resolve(addr2.port as number);
    });
  });
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1) GET csrf token + validação de headers básicos de security
    const r1 = await fetch(`${base}/api/csrf-token`, { method: "GET" });
    const setCookie = r1.headers.get("set-cookie");
    const csrfToken = extractCookieValue(setCookie, "csrf-token");
    const xFrame = r1.headers.get("x-frame-options");

    const tokenFromBody = await r1.json().then((j) => j?.csrfToken as string | undefined);
    const tokenUsed = csrfToken ?? tokenFromBody ?? "";

    console.log("[selftest] csrf-token cookie set?", Boolean(csrfToken));
    console.log("[selftest] tokenFromBody exists?", Boolean(tokenFromBody));
    console.log("[selftest] x-frame-options:", xFrame ?? "(missing)");

    if (!tokenUsed) throw new Error("Self-test: não foi possível obter csrfToken.");

    // 2) POST com CSRF inválido (deve bloquear 403)
    const badHeaders = {
      "content-type": "application/json",
      "x-csrf-token": "invalid-token",
      // Envia o cookie para que o servidor tenha expectedToken.
      cookie: setCookie?.split(";")[0] ?? "",
    } as Record<string, string>;

    const r2 = await fetch(`${base}/api/test/failure/configure`, {
      method: "POST",
      headers: badHeaders,
      body: JSON.stringify({ enabled: true, failureRate: 0.0, failureType: "500" }),
    });

    const j2 = await r2.json().catch(() => ({}));
    console.log("[selftest] invalid CSRF status:", r2.status, "body.code?", j2?.code);
    if (r2.status !== 403) {
      throw new Error(`Self-test: esperava 403 para CSRF inválido, veio ${r2.status}`);
    }

    // 3) POST com CSRF válido + header malicioso (deve bloquear 400)
    const headersOk = {
      "content-type": "application/json",
      "x-csrf-token": tokenUsed,
      cookie: setCookie?.split(";")[0] ?? "",
      "x-test": "<script>alert(1)</script>",
    } as Record<string, string>;

    const r3 = await fetch(`${base}/api/test/failure/configure`, {
      method: "POST",
      headers: headersOk,
      body: JSON.stringify({ enabled: true, failureRate: 0.0, failureType: "500" }),
    });

    const j3 = await r3.json().catch(() => ({}));
    console.log("[selftest] malicious header status:", r3.status, "code?", j3?.code);
    if (r3.status !== 400) {
      throw new Error(`Self-test: esperava 400 para header malicioso, veio ${r3.status}`);
    }

    console.log("[selftest] ✅ PASS");
  } finally {
    server.close();
  }
}

run().catch((e) => {
  console.error("[selftest] ❌ FAIL:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});

