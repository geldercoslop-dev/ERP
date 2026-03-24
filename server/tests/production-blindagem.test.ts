/**
 * Anti-regressão: CORS policy, headers Helmet, rate limit tRPC, auditoria de domínio.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import http from "node:http";
import { securityHeadersMiddleware } from "../security/security-headers";
import { getAllowedOriginsList } from "../security/cors-policy";
import { createLeoRateLimit, trpcPathIncludesProcedure } from "../security/rate-limiting";
import type { Request } from "express";
import * as db from "../db/index";
import { auditEntityChange } from "../_core/domain-audit";

function listen(app: express.Application): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        port,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
    server.on("error", reject);
  });
}

describe("Produção — blindagem HTTP", () => {
  it("CORS: produção sem ALLOWED_ORIGINS → lista vazia (nunca *)", () => {
    const prev = process.env.NODE_ENV;
    const prevOrigins = process.env.ALLOWED_ORIGINS;
    process.env.NODE_ENV = "production";
    delete process.env.ALLOWED_ORIGINS;
    expect(getAllowedOriginsList()).toEqual([]);
    process.env.NODE_ENV = prev;
    if (prevOrigins !== undefined) process.env.ALLOWED_ORIGINS = prevOrigins;
    else delete process.env.ALLOWED_ORIGINS;
  });

  it("Helmet: resposta inclui headers XSS / frame / nosniff", async () => {
    const app = express();
    app.use(securityHeadersMiddleware());
    app.get("/t", (_req, res) => res.send("ok"));
    const { port, close } = await listen(app);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/t`);
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
      expect(r.headers.get("x-frame-options")).toMatch(/DENY|SAMEORIGIN/i);
      const xss = r.headers.get("x-xss-protection");
      expect(xss === null || xss.length > 0).toBe(true);
    } finally {
      await close();
    }
  });

  it("Rate limit LEO: após limite retorna 429 em path leo.*", async () => {
    const app = express();
    app.use("/api/trpc", (req, _res, next) => {
      (req as express.Request & { user?: { userId: number; tenantId: number } }).user = {
        userId: 1,
        tenantId: 1,
      };
      next();
    });
    app.use(
      "/api/trpc",
      createLeoRateLimit({
        windowMs: 60_000,
        max: 2,
        message: "leo cap",
      })
    );
    app.get("/api/trpc/leo.ping", (_req, res) => res.json({ ok: true }));
    const { port, close } = await listen(app);
    try {
      const url = `http://127.0.0.1:${port}/api/trpc/leo.ping`;
      const a = await fetch(url);
      const b = await fetch(url);
      const c = await fetch(url);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(c.status).toBe(429);
    } finally {
      await close();
    }
  });

  it("trpcPathIncludesProcedure detecta financeiro.* e leo.*", () => {
    const mk = (path: string): Request => ({ path } as Request);
    expect(trpcPathIncludesProcedure(mk("/financeiro.boletos.list"), "financeiro.")).toBe(true);
    expect(trpcPathIncludesProcedure(mk("/produtos.list"), "financeiro.")).toBe(false);
    expect(trpcPathIncludesProcedure(mk("/leo.perguntar"), "leo.")).toBe(true);
  });
});

describe("Produção — audit domain", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(db, "insertAuditLog").mockImplementation(async () => {});
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("auditEntityChange chama insertAuditLog com tenant e ação", async () => {
    await auditEntityChange(
      { user: { id: 10, role: "admin" } },
      7,
      "create",
      "cliente",
      99,
      { x: 1 }
    );
    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0][0];
    expect(arg.tenantId).toBe(7);
    expect(arg.action).toBe("create");
    expect(arg.entity).toBe("cliente");
    expect(arg.entityId).toBe(99);
    expect(arg.actorUserId).toBe(10);
  });
});

describe("Sentry (smoke)", () => {
  it("SDK exportado: captureException existe quando @sentry/node carrega", async () => {
    const Sentry = await import("@sentry/node");
    expect(typeof Sentry.captureException).toBe("function");
  });
});
