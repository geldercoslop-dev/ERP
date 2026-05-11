/**
 * Security Middleware Stack Test
 * 
 * Tests security middleware stack in isolation without DB dependency.
 * Validates:
 * - CSRF token endpoint
 * - CSRF invalid block
 * - Malicious header block
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import cookie from 'cookie';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';

import { completeSecurityMiddleware } from '../security/security-headers';
import { attackDetectionMiddleware } from '../security/attack-detection';
import { CSRFProtection } from '../security/csrf-protection';
import { requestLoggerMiddleware } from '../middleware/request-logger';

function extractCookieValue(setCookie: string | null | undefined, cookieName: string): string | null {
  if (!setCookie) return null;
  const match = setCookie.match(new RegExp(`${cookieName}=([^;]+)`));
  return match?.[1] ?? null;
}

describe('Security Middleware Stack', () => {
  let app: Express;
  let server: Server;
  let port: number;
  let base: string;

  beforeAll(async () => {
    app = express();

    // Basic JSON parsing
    app.use(express.json({ limit: '5mb' }));

    // Stack /api: rate limit -> security headers -> attack detection -> csrf -> logger -> routes
    app.use(
      '/api',
      rateLimit({
        windowMs: 60 * 1000,
        max: 20,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'rate-limited' },
      })
    );

    app.use('/api', (req, _res, next) => {
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

    app.use('/api', ...completeSecurityMiddleware());
    app.use('/api', attackDetectionMiddleware());

    app.get('/api/csrf-token', CSRFProtection.csrfTokenEndpoint());
    app.use('/api', CSRFProtection.csrfProtection());

    // Logger only after CSRF (as required by order)
    app.use('/api', requestLoggerMiddleware());

    // Test endpoint without auth/DB
    app.post('/api/test/failure/configure', (req, res) => {
      res.json({ ok: true, body: req.body ?? null });
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

  it('GET /api/csrf-token returns token and security headers', async () => {
    const response = await fetch(`${base}/api/csrf-token`, { method: 'GET' });
    
    expect(response.status).toBe(200);
    
    const setCookie = response.headers.get('set-cookie');
    const csrfToken = extractCookieValue(setCookie, 'csrf-token');
    const xFrame = response.headers.get('x-frame-options');

    const body = await response.json() as { csrfToken?: string };
    const tokenFromBody = body?.csrfToken;
    const tokenUsed = csrfToken ?? tokenFromBody ?? '';

    expect(tokenUsed).toBeTruthy();
    expect(tokenUsed.length).toBeGreaterThan(0);
    expect(xFrame).toBeTruthy();
  });

  it('POST with invalid CSRF token returns 403', async () => {
    // First, get CSRF token
    const tokenResponse = await fetch(`${base}/api/csrf-token`, { method: 'GET' });
    const setCookie = tokenResponse.headers.get('set-cookie');
    const cookieHeader = setCookie?.split(';')[0] ?? '';

    const response = await fetch(`${base}/api/test/failure/configure`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': 'invalid-token',
        cookie: cookieHeader,
      },
      body: JSON.stringify({ enabled: true, failureRate: 0.0, failureType: '500' }),
    });

    expect(response.status).toBe(403);
  });

  it('POST with valid CSRF and malicious header returns 400', async () => {
    // First, get CSRF token
    const tokenResponse = await fetch(`${base}/api/csrf-token`, { method: 'GET' });
    const setCookie = tokenResponse.headers.get('set-cookie');
    const csrfToken = extractCookieValue(setCookie, 'csrf-token');
    const body = await tokenResponse.json() as { csrfToken?: string };
    const tokenFromBody = body?.csrfToken;
    const tokenUsed = csrfToken ?? tokenFromBody ?? '';

    expect(tokenUsed).toBeTruthy();

    const cookieHeader = setCookie?.split(';')[0] ?? '';

    const response = await fetch(`${base}/api/test/failure/configure`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': tokenUsed,
        cookie: cookieHeader,
        'x-test': '<script>alert(1)</script>',
      },
      body: JSON.stringify({ enabled: true, failureRate: 0.0, failureType: '500' }),
    });

    expect(response.status).toBe(400);
  });
});
