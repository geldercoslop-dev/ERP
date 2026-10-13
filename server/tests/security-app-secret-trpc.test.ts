/**
 * AUTH-H8D — POST tRPC browser cookie-only vs app-secret middleware.
 *
 * Bug provado no smoke real AUTH-H7 (pós-H8):
 *   POST /api/trpc/auth.me    → 401 antes do router ("x-app-secret inválido/ausente")
 *   POST /api/trpc/auth.logout → 401 idem
 * Causa: createAppSecretMiddleware exigia x-app-secret ou Authorization Bearer
 * para qualquer POST /api/trpc/*, mesmo com sessão cookie-only legítima.
 *
 * Regra correta (escopo desta missão):
 *   - POST /api/trpc/* com cookie de sessão oficial (session_token/session)
 *     + CSRF double-submit válido (cookie csrf-token == header x-csrf-token)
 *     → libera para o router tRPC (que valida a sessão de verdade).
 *   - Sem cookie de sessão, ou sem par CSRF válido → continua 401.
 *   - x-session-token NÃO é mecanismo aceito.
 *   - Authorization Bearer e x-app-secret seguem funcionando (server-to-server).
 *   - Endpoints internos (/api/__*) seguem protegidos.
 *
 * Isolado: Express local + cookie.parse, sem DB/Redis — mesmo padrão de
 * security-app-secret.test.ts e security-session-cookie.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { Express } from 'express';
import cookie from 'cookie';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';

import { createAppSecretMiddleware, createInternalEndpointProtectionMiddleware, AppSecretMiddlewareConfig } from '../security/app-secret-middleware';

const CSRF = 'csrf-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SESSION = 'valid.jwt.session';

function sessionCookies(): string {
  return `session_token=${SESSION}; session=${SESSION}; csrf-token=${CSRF}`;
}

describe('App Secret Middleware — POST tRPC cookie-only (AUTH-H8D)', () => {
  let app: Express;
  let server: Server;
  let port: number;
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
    app.use(createInternalEndpointProtectionMiddleware(config));

    // Stubs que provam que a request CHEGOU ao router (200 do handler).
    for (const p of ['/api/trpc/auth.me', '/api/trpc/auth.logout', '/api/trpc/auth.refresh']) {
      app.post(p, (_req, res) => { res.json({ reached: true }); });
    }
    app.post('/api/__hard-test/shutdown', (_req, res) => { res.json({ reached: true }); });

    server = app.listen(0, '127.0.0.1');
    port = await new Promise<number>((resolve) => {
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

  async function post(path: string, headers: Record<string, string>) {
    logs = [];
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'h8d-test', ...headers },
      body: JSON.stringify({ '0': null }),
    });
    const body = await response.json() as { reached?: boolean; error?: { code?: string } };
    return { status: response.status, body };
  }

  it('POST /api/trpc/auth.me com sessão cookie-only + CSRF válido chega ao router', async () => {
    const r = await post('/api/trpc/auth.me?batch=1', {
      cookie: sessionCookies(),
      'x-csrf-token': CSRF,
    });
    expect(r.status).toBe(200);
    expect(r.body.reached).toBe(true);
    expect(logs.some(l => l.event === 'x-app-secret inválido/ausente')).toBe(false);
  });

  it('POST /api/trpc/auth.logout com sessão cookie-only + CSRF válido chega ao router', async () => {
    const r = await post('/api/trpc/auth.logout?batch=1', {
      cookie: sessionCookies(),
      'x-csrf-token': CSRF,
    });
    expect(r.status).toBe(200);
    expect(r.body.reached).toBe(true);
  });

  it('POST /api/trpc/auth.refresh com sessão cookie-only + CSRF válido chega ao router', async () => {
    const r = await post('/api/trpc/auth.refresh?batch=1', {
      cookie: `session_token=${SESSION}; csrf-token=${CSRF}`,
      'x-csrf-token': CSRF,
    });
    expect(r.status).toBe(200);
    expect(r.body.reached).toBe(true);
  });

  it('POST /api/trpc/auth.me SEM cookie de sessão (só CSRF) continua 401', async () => {
    const r = await post('/api/trpc/auth.me?batch=1', {
      cookie: `csrf-token=${CSRF}`,
      'x-csrf-token': CSRF,
    });
    expect(r.status).toBe(401);
    expect(r.body.error?.code).toBe('UNAUTHORIZED');
    expect(logs.some(l => l.event === 'x-app-secret inválido/ausente')).toBe(true);
  });

  it('POST /api/trpc/auth.me com sessão mas SEM CSRF continua 401', async () => {
    const r = await post('/api/trpc/auth.me?batch=1', {
      cookie: `session_token=${SESSION}`,
    });
    expect(r.status).toBe(401);
  });

  it('POST /api/trpc/auth.me com sessão + CSRF divergente (cookie != header) continua 401', async () => {
    const r = await post('/api/trpc/auth.me?batch=1', {
      cookie: `session_token=${SESSION}; csrf-token=${CSRF}`,
      'x-csrf-token': 'csrf-token-DIVERGENTE-nao-bate',
    });
    expect(r.status).toBe(401);
  });

  it('x-session-token NÃO é mecanismo: header sozinho sem sessão/CSRF continua 401', async () => {
    const r = await post('/api/trpc/auth.me?batch=1', {
      'x-session-token': SESSION,
    });
    expect(r.status).toBe(401);
    expect(r.body.error?.code).toBe('UNAUTHORIZED');
  });

  it('Authorization Bearer continua aceito (server-to-server / outros clients)', async () => {
    const r = await post('/api/trpc/auth.me?batch=1', {
      authorization: 'Bearer server.token.here',
    });
    expect(r.status).toBe(200);
    expect(r.body.reached).toBe(true);
  });

  it('x-app-secret continua aceito (server-to-server)', async () => {
    const r = await post('/api/trpc/auth.me?batch=1', {
      'x-app-secret': 'test-app-secret-12345',
    });
    expect(r.status).toBe(200);
    expect(r.body.reached).toBe(true);
  });

  it('POST endpoint interno /api/__* sem sessão continua bloqueado no app-secret', async () => {
    const r = await post('/api/__hard-test/shutdown', {
      cookie: `csrf-token=${CSRF}`,
      'x-csrf-token': CSRF,
    });
    expect(r.status).toBe(401);
    expect(r.body.error?.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/trpc/auth.me sem user-agent continua 400 (MISSING_USER_AGENT)', async () => {
    logs = [];
    const response = await fetch(`${base}/api/trpc/auth.me?batch=1`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': '',
        cookie: sessionCookies(),
        'x-csrf-token': CSRF,
      },
      body: JSON.stringify({ '0': null }),
    });
    expect(response.status).toBe(400);
    const body = await response.json() as { error: { code: string } };
    expect(body.error.code).toBe('MISSING_USER_AGENT');
  });
});
