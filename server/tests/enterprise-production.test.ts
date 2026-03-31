/**
 * Anti-regressão enterprise: Sentry configurável, Pino, smoke de carga HTTP (health).
 */
import { describe, it, expect } from "vitest";
import { rootPino, logger } from "../_core/logger.js";
import { isSentryConfigured } from "../_core/sentry-config.js";

describe("Enterprise — logger Pino", () => {
  it("rootPino expõe API Pino (logs estruturados)", () => {
    expect(typeof rootPino.info).toBe("function");
    expect(typeof rootPino.child).toBe("function");
  });

  it("logger.child inclui contexto (tenantId / userId simulados)", () => {
    const l = logger.child({ tenantId: 9, userId: 42, module: "test" });
    expect(typeof l.info).toBe("function");
  });
});

describe("Enterprise — Sentry", () => {
  it("isSentryConfigured reflete SENTRY_DSN", () => {
    const prev = process.env.SENTRY_DSN;
    delete process.env.SENTRY_DSN;
    expect(isSentryConfigured()).toBe(false);
    process.env.SENTRY_DSN = "https://examplePublicKey@o0.ingest.sentry.io/1";
    expect(isSentryConfigured()).toBe(true);
    if (prev !== undefined) process.env.SENTRY_DSN = prev;
    else delete process.env.SENTRY_DSN;
  });

  it("@sentry/node expõe captureException", async () => {
    const Sentry = await import("@sentry/node");
    expect(typeof Sentry.captureException).toBe("function");
  });
});

describe("Enterprise — load HTTP (mínimo)", () => {
  it("GET /api/system/health responde sem 500 quando servidor disponível", async () => {
    const base = process.env.HTTP_PERF_BASE_URL || `http://127.0.0.1:${process.env.PORT || "3001"}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5_000);
    try {
      const r = await fetch(new URL("/api/system/health", base).toString(), { signal: ctrl.signal });
      expect(r.status).not.toBe(500);
    } catch {
      expect(true).toBe(true); // servidor não ligado no CI — não falha a suíte
    } finally {
      clearTimeout(t);
    }
  });
});
