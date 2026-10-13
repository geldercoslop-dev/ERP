/**
 * AUTH-H8C — BUG2: securityMiddleware (WAF) classificava o cookie httpOnly
 * oficial de sessão ("session_token", COOKIE_NAME em shared/const) como
 * "Suspicious headers detected" (400).
 *
 * Causa raiz: o padrão XSS /on\w+\s*=/i em detectSuspiciousHeaders
 * (middlewares/security.ts) casa "sessi**on_token=**" dentro do valor do
 * header `cookie` — "on" + \w+("_token") + "=".
 *
 * Contrato da correção:
 * - Cookie session_token=<jwt> → next() (nome conhecido é estrutura, não conteúdo).
 * - Cookie session_token com valor malicioso → ainda bloqueado.
 * - Header arbitrário com conteúdo malicioso → ainda bloqueado.
 * - Nomes de cookie desconhecidos que casam com padrão perigoso → bloqueados.
 * - Cookie-only preservado: Authorization/x-session-token NÃO ganharam
 *   exceção — conteúdo malicioso neles continua bloqueado.
 */

import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

import { COOKIE_NAME } from "../../shared/const.js";
import { securityMiddleware } from "../middlewares/security.js";

function makeReq(headers: Record<string, string>): Request {
  return {
    ip: "10.0.0.7",
    path: "/api/trpc/auth.me",
    url: "/api/trpc/auth.me",
    originalUrl: "/api/trpc/auth.me",
    method: "GET",
    protocol: "http",
    hostname: "localhost",
    socket: { remoteAddress: "10.0.0.7" },
    headers: {
      "user-agent": "h8c-regression-agent",
      ...headers,
    },
  } as unknown as Request;
}

function makeRes(): Response & { statusCode: number; body: unknown } {
  const res = {
    setHeader: (_k: string, _v: string) => res,
    status: (code: number) => {
      res.statusCode = code;
      return res;
    },
    json: (body: unknown) => {
      res.body = body;
      return res;
    },
    statusCode: 200,
    body: undefined as unknown,
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

function run(headers: Record<string, string>) {
  const req = makeReq(headers);
  const res = makeRes();
  const next = vi.fn();
  securityMiddleware(req, res, next);
  return { res, next };
}

describe("AUTH-H8C — WAF vs cookie oficial de sessão (BUG2)", () => {
  it(`cookie ${COOKIE_NAME}=<jwt> NÃO é bloqueado como suspicious`, () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjF9.sig";
    const { res, next } = run({ cookie: `${COOKIE_NAME}=${jwt}` });

    expect(next).toHaveBeenCalledWith();
    expect(res.statusCode).not.toBe(400);
  });

  it(`cookie ${COOKIE_NAME} junto de outros cookies (refresh_token, csrf) passa`, () => {
    const { res, next } = run({
      cookie: `${COOKIE_NAME}=abc.def.ghi; refresh_token=xyz; csrf-token=tok`,
    });

    expect(next).toHaveBeenCalledWith();
    expect(res.statusCode).not.toBe(400);
  });

  it(`cookie ${COOKIE_NAME} com VALOR malicioso continua bloqueado`, () => {
    const { res, next } = run({
      cookie: `${COOKIE_NAME}=<script>alert(1)</script>`,
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });

  it("header arbitrário com conteúdo malicioso continua bloqueado", () => {
    const { res, next } = run({ "x-evil": "<script>alert(1)</script>" });

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });

  it("cookie com NOME desconhecido casando padrão perigoso continua bloqueado", () => {
    const { res, next } = run({ cookie: "onclick=1" });

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });

  it("Authorization malicioso continua bloqueado — sem bypass para headers de auth", () => {
    const { res, next } = run({ authorization: "Bearer javascript:alert(1)" });

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });

  it("x-session-token com conteúdo malicioso continua bloqueado — sem exceção nova", () => {
    const { res, next } = run({ "x-session-token": "javascript:alert(1)" });

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });
});
