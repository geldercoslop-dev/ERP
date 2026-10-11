/**
 * Anti-regressão: CORS policy, headers Helmet, rate limit tRPC, auditoria de domínio.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import express from "express";
import { securityHeadersMiddleware } from "../security/security-headers.js";
import { getAllowedOriginsList } from "../security/cors-policy.js";
import { createLeoRateLimit, trpcPathIncludesProcedure } from "../security/rate-limiting.js";
import type { Request } from "express";
import { AuditLogService } from "../services/audit-log.service.js";
import { auditEntityChange } from "../_core/domain-audit.js";
import {
  beforeAllWithServiceContext,
  itWithServiceContext,
} from "./integration/service-context-harness.js";

function listen(app: express.Application): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
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
  // Bootstrap necessário: createLeoRateLimit usa Redis via getRedisClient(),
  // que exige bootstrapServer() completado (bootstrap gate).
  beforeAllWithServiceContext(async () => {});

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

  itWithServiceContext("Rate limit LEO: após limite retorna 429 em path leo.*", async () => {
    // tenantId único por RUN (hoisted fora do middleware): a chave Redis é
    // tenant:{id}:ratelimit:leo:{ip}:{endpoint} e persiste por windowMs;
    // runs consecutivos com tenant fixo herdavam o contador esgotado.
    const runTenantId = 100_000 + (Date.now() % 899_999);
    const app = express();
    app.use("/api/trpc", (req, _res, next) => {
      (req as express.Request & { user?: { userId: number; tenantId: number } }).user = {
        userId: 1,
        tenantId: runTenantId,
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
  let spy: MockInstance<typeof AuditLogService.logAction>;

  beforeEach(() => {
    // insertAuditLog foi removido de db/index; o contrato atual é
    // auditEntityChange -> logAuditAction -> AuditLogService.logAction(payload).
    spy = vi
      .spyOn(AuditLogService, "logAction")
      .mockImplementation(async () => ({ success: true }));
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("auditEntityChange chama AuditLogService.logAction com tenant e ação", async () => {
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
    // entityId é stringificado por domain-audit (String(entityId)).
    expect(arg.entityId).toBe("99");
    expect(arg.actorUserId).toBe(10);
  });
});

describe("Sentry (smoke)", () => {
  it("SDK exportado: captureException existe quando @sentry/node carrega", async () => {
    const Sentry = await import("@sentry/node");
    expect(typeof Sentry.captureException).toBe("function");
  });
});
