/**
 * AUTH-H8A — Rate limiter não derruba processo em requests anônimas /api/*.
 *
 * Regressão do bug provado em smoke: getTenantIdFromRequest lançava
 * ValidationError para requests sem user/tenant → unhandledRejection →
 * FATAL process exit (até /api/csrf-token derrubava o servidor).
 *
 * Contrato:
 * - Anônimo (sem user/tenant) → bucket por IP/rota, next() normal.
 * - Autenticado (req.user.tenantId) → bucket por tenant.
 * - keySuffix que lança → fallback IP, sem propagar exceção.
 * - Redis indisponível/erro interno → next(err), nunca throw.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

const evalCalls: string[] = [];
let redisClient: { eval: (...args: unknown[]) => Promise<unknown[]> } | null = null;

vi.mock("../infra/redis.js", () => ({
  getRedisClient: () => redisClient,
}));

import { createRedisRateLimitMiddleware } from "../security/redis-rate-limit.js";

function makeReq(over: Partial<Request> = {}): Request {
  return {
    ip: "10.0.0.7",
    path: "/api/csrf-token",
    url: "/api/csrf-token",
    originalUrl: "/api/csrf-token",
    method: "GET",
    socket: { remoteAddress: "10.0.0.7" },
    ...over,
  } as unknown as Request;
}

function makeRes(): Response {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (k: string, v: string) => {
      headers[k] = v;
    },
    status: (code: number) => {
      res.statusCode = code;
      return res;
    },
    json: (body: unknown) => {
      res.body = body;
      return res;
    },
    headers,
    statusCode: 200,
    body: undefined as unknown,
  };
  return res as unknown as Response;
}

const baseOptions = {
  name: "test-limiter",
  windowMs: 60_000,
  max: 5,
  code: "RATE_LIMITED",
  message: "rate limited",
  shouldApply: () => true,
};

beforeEach(() => {
  evalCalls.length = 0;
  redisClient = {
    eval: async (...args: unknown[]) => {
      evalCalls.push(String(args[2])); // key
      return [1, Date.now() + 60_000, 4];
    },
  };
});

describe("AUTH-H8A — rate limiter anônimo", () => {
  it("request anônima (sem user/tenant) usa bucket ip: e chama next()", async () => {
    const mw = createRedisRateLimitMiddleware(baseOptions);
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    await mw(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(evalCalls[0]).toContain("ratelimit:test-limiter:ip:10.0.0.7:/api/csrf-token");
  });

  it("request autenticada (req.user.tenantId) usa bucket tenant:", async () => {
    const mw = createRedisRateLimitMiddleware(baseOptions);
    const req = makeReq({ user: { tenantId: 94031 } } as Partial<Request>);
    const res = makeRes();
    const next = vi.fn();

    await mw(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(evalCalls[0]).toContain("ratelimit:test-limiter:tenant:94031:/api/csrf-token");
  });

  it("keySuffix que lança exceção cai para bucket ip: sem propagar erro", async () => {
    const mw = createRedisRateLimitMiddleware({
      ...baseOptions,
      keySuffix: () => {
        throw new Error("tenant required");
      },
    });
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    await mw(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(evalCalls[0]).toContain(":ip:10.0.0.7:");
  });

  it("sem Redis → next(err) fail-closed, nunca throw/unhandledRejection", async () => {
    redisClient = null;
    const mw = createRedisRateLimitMiddleware(baseOptions);
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    await mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const arg = next.mock.calls[0][0];
    expect(arg).toBeInstanceOf(Error);
    expect((arg as Error).message).toMatch(/Redis unavailable/);
  });

  it("erro interno do Redis → next(err), nunca throw", async () => {
    redisClient = {
      eval: async () => {
        throw new Error("boom redis");
      },
    };
    const mw = createRedisRateLimitMiddleware(baseOptions);
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
    errSpy.mockRestore();
  });
});
