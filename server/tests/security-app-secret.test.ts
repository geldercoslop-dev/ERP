/**
 * App Secret Middleware Test
 * 
 * Tests X-App-Secret validation and internal endpoint protection in isolation.
 * No DB, no Redis, no external server - uses isolated Express app.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { Express } from 'express';
import cookie from 'cookie';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';

import { createAppSecretMiddleware, createInternalEndpointProtectionMiddleware, AppSecretMiddlewareConfig } from '../security/app-secret-middleware';

function extractCookieValue(setCookie: string | null | undefined, cookieName: string): string | null {
  if (!setCookie) return null;
  const match = setCookie.match(new RegExp(`${cookieName}=([^;]+)`));
  return match?.[1] ?? null;
}

describe('App Secret Middleware', () => {
  let app: Express;
  let server: Server;
  let port: number;
  let base: string;
  let logs: Array<{ event: string; metadata: Record<string, unknown> }> = [];

  beforeAll(async () => {
    app = express();

    // Basic JSON parsing
    app.use(express.json({ limit: '5mb' }));

    // Cookie parser
    app.use((req, _res, next) => {
      const rawCookie = req.headers.cookie ?? '';
      const parsedCookies = cookie.parse(rawCookie);
      Object.defineProperty(req, 'cookies', {
        value: parsedCookies,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      next();
    });

    // Configure app secret middleware for testing
    const appSecret = 'test-app-secret-12345';
    const internalEndpointSecret = 'test-internal-secret-67890';

    const mockLogger = (event: string, req: Express.Request, metadata?: Record<string, unknown>) => {
      logs.push({ event, metadata: metadata ?? {} });
    };

    const mockGetRequestId = (req: Express.Request) => {
      return req.get('x-request-id') || 'test-request-id';
    };

    const config: AppSecretMiddlewareConfig = {
      appSecret,
      internalEndpointSecret,
      logger: mockLogger,
      getRequestId: mockGetRequestId,
    };

    // Apply middleware to all routes, not just /api prefix
    app.use(createAppSecretMiddleware(config));
    app.use(createInternalEndpointProtectionMiddleware(config));

    // Public routes
    app.get('/api/health', (_req, res) => {
      res.json({ status: 'ok' });
    });

    app.get('/api/csrf-token', (_req, res) => {
      const token = 'csrf-token-12345';
      res.setHeader('set-cookie', `csrf-token=${token}`);
      res.json({ csrfToken: token });
    });

    // Protected route
    app.post('/api/protected', (req, res) => {
      res.json({ ok: true, body: req.body ?? null });
    });
    
    app.get('/api/protected', (req, res) => {
      res.json({ ok: true, method: 'GET' });
    });

    // Internal endpoint
    app.get('/api/__hard-test/shutdown', (req, res) => {
      res.json({ ok: true, shuttingDown: false });
    });

    server = app.listen(0, '127.0.0.1');
    
    port = await new Promise<number>((resolve) => {
      const addr = server.address() as AddressInfo | null;
      if (addr && typeof addr.port === 'number') {
        return resolve(addr.port);
      }
      server.once('listening', () => {
        const addr2 = server.address() as AddressInfo | null;
        if (addr2 && typeof addr2.port === 'number') {
          resolve(addr2.port);
        }
      });
    });

    base = `http://127.0.0.1:${port}`;
  });

  afterAll(() => {
    server.close();
  });

  it('GET /api/health without x-app-secret should pass', async () => {
    logs = [];
    const response = await fetch(`${base}/api/health`, { method: 'GET' });
    
    expect(response.status).toBe(200);
    const body = await response.json() as { status: string };
    expect(body.status).toBe('ok');
    expect(logs.length).toBe(0); // Should not log for public route
  });

  it('GET /api/csrf-token without x-app-secret should pass', async () => {
    logs = [];
    const response = await fetch(`${base}/api/csrf-token`, { method: 'GET' });
    
    expect(response.status).toBe(200);
    const body = await response.json() as { csrfToken: string };
    expect(body.csrfToken).toBeTruthy();
    expect(logs.length).toBe(0); // Should not log for public route
  });

  it('POST protected route without x-app-secret should return 401', async () => {
    logs = [];
    const response = await fetch(`${base}/api/protected`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'test-agent',
      },
      body: JSON.stringify({ test: true }),
    });

    expect(response.status).toBe(401);
    const body = await response.json() as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(logs.some(l => l.event === 'x-app-secret inválido/ausente')).toBe(true);
  });

  it('POST protected route with invalid x-app-secret should return 401', async () => {
    logs = [];
    const response = await fetch(`${base}/api/protected`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'test-agent',
        'x-app-secret': 'wrong-secret',
      },
      body: JSON.stringify({ test: true }),
    });

    expect(response.status).toBe(401);
    const body = await response.json() as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(logs.some(l => l.event === 'x-app-secret inválido/ausente')).toBe(true);
  });

  it('POST protected route with correct x-app-secret should pass', async () => {
    logs = [];
    const response = await fetch(`${base}/api/protected`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'test-agent',
        'x-app-secret': 'test-app-secret-12345',
      },
      body: JSON.stringify({ test: true }),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(logs.length).toBe(0);
  });

  it('POST protected route with Bearer token should pass', async () => {
    logs = [];
    const response = await fetch(`${base}/api/protected`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'test-agent',
        'authorization': 'Bearer test-jwt-token',
      },
      body: JSON.stringify({ test: true }),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(logs.length).toBe(0);
  });

  it('GET protected route with Bearer token should pass', async () => {
    logs = [];
    const response = await fetch(`${base}/api/protected`, {
      method: 'GET',
      headers: {
        'user-agent': 'test-agent',
        'authorization': 'Bearer test-jwt-token',
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { ok: boolean; method: string };
    expect(body.ok).toBe(true);
    expect(body.method).toBe('GET');
    expect(logs.length).toBe(0);
  });

  it('POST protected route with CSRF token and Bearer token should pass', async () => {
    logs = [];
    const response = await fetch(`${base}/api/protected`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'test-agent',
        'authorization': 'Bearer test-jwt-token',
        'x-csrf-token': 'csrf-token-12345',
        cookie: 'csrf-token=csrf-token-12345',
      },
      body: JSON.stringify({ test: true }),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(logs.length).toBe(0);
  });

  it('Request without user-agent should return 400', async () => {
    logs = [];
    const response = await fetch(`${base}/api/protected`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': '',
      },
      body: JSON.stringify({ test: true }),
    });

    expect(response.status).toBe(400);
    const body = await response.json() as { error: { code: string } };
    expect(body.error.code).toBe('MISSING_USER_AGENT');
    expect(logs.some(l => l.event === 'user-agent ausente')).toBe(true);
  });

  it('Request with malicious payload should return 400', async () => {
    logs = [];
    const response = await fetch(`${base}/api/protected`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'test-agent',
        'x-app-secret': 'test-app-secret-12345',
      },
      body: JSON.stringify({ path: '../../etc/passwd' }),
    });

    expect(response.status).toBe(400);
    const body = await response.json() as { error: { code: string } };
    expect(body.error.code).toBe('SUSPICIOUS_PAYLOAD');
    expect(logs.some(l => l.event === 'payload malicioso bloqueado')).toBe(true);
  });

  it('GET /api/__hard-test/shutdown from localhost should pass (simulated)', async () => {
    logs = [];
    // Note: Express app listens on 127.0.0.1, so requests from the test are considered localhost
    // Must pass X-App-Secret check first by providing user-agent and auth
    const response = await fetch(`${base}/api/__hard-test/shutdown`, {
      method: 'GET',
      headers: {
        'user-agent': 'test-agent',
        'authorization': 'Bearer test-jwt-token',
      },
    });

    // Should pass because request is from 127.0.0.1 (localhost)
    expect(response.status).toBe(200);
    const body = await response.json() as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(logs.length).toBe(0);
  });

  it('GET /api/__hard-test/shutdown with x-shutdown-secret should pass', async () => {
    logs = [];
    const response = await fetch(`${base}/api/__hard-test/shutdown`, {
      method: 'GET',
      headers: {
        'user-agent': 'test-agent',
        'authorization': 'Bearer test-jwt-token',
        'x-shutdown-secret': 'test-internal-secret-67890',
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(logs.length).toBe(0);
  });

  it('Non-__* route should not be affected by internal endpoint middleware', async () => {
    logs = [];
    const response = await fetch(`${base}/api/health`, {
      method: 'GET',
      headers: {
        'user-agent': 'test-agent',
      },
    });

    expect(response.status).toBe(200);
    expect(logs.length).toBe(0);
  });
});
