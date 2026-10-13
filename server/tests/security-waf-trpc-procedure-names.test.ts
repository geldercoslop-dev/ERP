/**
 * BUG-WAF-DELETE — nomes legítimos de procedures tRPC vs WAF SUSPICIOUS_PAYLOAD.
 *
 * Bug provado no smoke real CLI-H1:
 *   POST /api/trpc/clientes.delete?batch=1 → 400 SUSPICIOUS_PAYLOAD
 * Causa: MALICIOUS_PATTERNS era aplicado a req.originalUrl inteiro, e o
 * identificador da procedure (clientes.delete) casava \bdelete\b.
 *
 * Regra correta (escopo desta missão):
 *   - O identificador /api/trpc/<proc> (charset [\w.,], incl. batch "," e
 *     sub-router ".") é removido do alvo de inspeção — nomes legítimos passam.
 *   - Query string, resto do path, body e req.query continuam escaneados:
 *     "delete"/"drop"/"union"/"select" em query/body → SUSPICIOUS_PAYLOAD.
 *   - SQLi, script injection, path traversal e comandos perigosos seguem 400.
 *
 * Isolado: Express local + cookie.parse, sem DB/Redis — mesmo padrão de
 * security-app-secret-trpc.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { Express } from 'express';
import cookie from 'cookie';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';

import { createAppSecretMiddleware, AppSecretMiddlewareConfig } from '../security/app-secret-middleware';

const CSRF = 'csrf-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SESSION = 'valid.jwt.session';

function sessionCookies(): string {
  return `session_token=${SESSION}; csrf-token=${CSRF}`;
}

describe('WAF vs nomes de procedures tRPC (BUG-WAF-DELETE)', () => {
  let app: Express;
  let server: Server;
  let base: string;
  let logs: Array<{ event: string; metadata: Record<string, unknown> }> = [];

  beforeAll(async () => {
    app = express();
    app.use(express.json({ limit: '5mb' }));

    app.use((req, _res, next) => {
      const rawCookie = req.headers.cookie ?? '';
      Object.defineProperty(req, 'cookies', {
        value: cookie.parse(rawCookie),
        writable: true,
        enumerable: true,
        configurable: true,
      });
      next();
    });

    const config: AppSecretMiddlewareConfig = {
      appSecret: 'test-app-secret-12345',
      internalEndpointSecret: 'test-internal-secret-67890',
      logger: (event, _req, metadata) => { logs.push({ event, metadata: metadata ?? {} }); },
      getRequestId: (req) => req.get('x-request-id') || 'test-request-id',
    };

    app.use(createAppSecretMiddleware(config));

    // Stubs: qualquer procedure tRPC "alcançada" responde 200 {reached:true}.
    // Registramos um fallback que prova chegada ao router, independente do nome.
    app.all('/api/trpc/*', (_req, res) => { res.json({ reached: true }); });

    server = app.listen(0, '127.0.0.1');
    const port = await new Promise<number>((resolve) => {
      const addr = server.address() as AddressInfo | null;
      if (addr && typeof addr.port === 'number') return resolve(addr.port);
      server.once('listening', () => {
        const a2 = server.address() as AddressInfo | null;
        if (a2) resolve(a2.port);
      });
    });
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(() => { server.close(); });

  async function call(method: 'GET' | 'POST', path: string, opts: { body?: unknown; headers?: Record<string, string> } = {}) {
    logs = [];
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'user-agent': 'waf-trpc-test',
        cookie: sessionCookies(),
        'x-csrf-token': CSRF,
        ...(opts.headers ?? {}),
      },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
    const body = await response.json() as { reached?: boolean; error?: { code?: string } };
    return { status: response.status, body };
  }

  // ---------- Procedures legítimas passam ----------

  it('POST /api/trpc/clientes.delete?batch=1 chega ao router (era 400)', async () => {
    const r = await call('POST', '/api/trpc/clientes.delete?batch=1', { body: { '0': { id: 1 } } });
    expect(r.status).toBe(200);
    expect(r.body.reached).toBe(true);
    expect(logs.some(l => l.event === 'payload malicioso bloqueado')).toBe(false);
  });

  it('POST /api/trpc/produtos.delete?batch=1 chega ao router', async () => {
    const r = await call('POST', '/api/trpc/produtos.delete?batch=1', { body: { '0': { id: 2 } } });
    expect(r.status).toBe(200);
    expect(r.body.reached).toBe(true);
  });

  it('POST /api/trpc/vendedores.delete?batch=1 chega ao router', async () => {
    const r = await call('POST', '/api/trpc/vendedores.delete?batch=1', { body: { '0': { id: 3 } } });
    expect(r.status).toBe(200);
    expect(r.body.reached).toBe(true);
  });

  it('GET /api/trpc/clientes.list?batch=1&input=… (normal) chega ao router', async () => {
    const input = encodeURIComponent(JSON.stringify({ '0': { page: 1, pageSize: 5 } }));
    const r = await call('GET', `/api/trpc/clientes.list?batch=1&input=${input}`);
    expect(r.status).toBe(200);
    expect(r.body.reached).toBe(true);
  });

  it('identificador com sub-router (x.y.delete) passa', async () => {
    const r = await call('POST', '/api/trpc/modulo.sub.delete?batch=1', { body: { '0': {} } });
    expect(r.status).toBe(200);
    expect(r.body.reached).toBe(true);
  });

  // ---------- Payload malicioso real segue bloqueado ----------

  it('query com delete em valor de input → 400 SUSPICIOUS_PAYLOAD', async () => {
    const input = encodeURIComponent(JSON.stringify({ '0': { term: "delete from users" } }));
    const r = await call('GET', `/api/trpc/clientes.search?batch=1&input=${input}`);
    expect(r.status).toBe(400);
    expect(r.body.error?.code).toBe('SUSPICIOUS_PAYLOAD');
    expect(logs.some(l => l.event === 'payload malicioso bloqueado')).toBe(true);
  });

  it('body com drop table → 400 SUSPICIOUS_PAYLOAD', async () => {
    const r = await call('POST', '/api/trpc/clientes.create?batch=1', {
      body: { '0': { nome: "x'; drop table clientes;--" } },
    });
    expect(r.status).toBe(400);
    expect(r.body.error?.code).toBe('SUSPICIOUS_PAYLOAD');
  });

  it('body com union select → 400 SUSPICIOUS_PAYLOAD', async () => {
    const r = await call('POST', '/api/trpc/clientes.search?batch=1', {
      body: { '0': { term: "' union select password from users" } },
    });
    expect(r.status).toBe(400);
    expect(r.body.error?.code).toBe('SUSPICIOUS_PAYLOAD');
  });

  it('body com script injection → 400 SUSPICIOUS_PAYLOAD', async () => {
    const r = await call('POST', '/api/trpc/clientes.create?batch=1', {
      body: { '0': { nome: '<script>alert(1)</script>' } },
    });
    expect(r.status).toBe(400);
    expect(r.body.error?.code).toBe('SUSPICIOUS_PAYLOAD');
  });

  it('path traversal em valor → 400 SUSPICIOUS_PAYLOAD', async () => {
    const r = await call('POST', '/api/trpc/files.download?batch=1', {
      body: { '0': { path: '../../etc/passwd' } },
    });
    expect(r.status).toBe(400);
    expect(r.body.error?.code).toBe('SUSPICIOUS_PAYLOAD');
  });

  it('resto do path após o identificador continua escaneado → 400', async () => {
    const r = await call('POST', '/api/trpc/clientes.list?batch=1&extra=drop', {
      body: { '0': {} },
    });
    expect(r.status).toBe(400);
    expect(r.body.error?.code).toBe('SUSPICIOUS_PAYLOAD');
  });

  it('segmento fora do charset do identificador (union%20select no path) → 400', async () => {
    const r = await call('POST', '/api/trpc/clientes.list%20union%20select?batch=1', {
      body: { '0': {} },
    });
    expect(r.status).toBe(400);
  });
});
