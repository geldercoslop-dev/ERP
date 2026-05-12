/**
 * Security Rate Limit Test
 * 
 * Tests rate limiting in isolation without DB dependency.
 * Validates:
 * - Rate limit blocks excess requests
 * - X-Forwarded-For header does not bypass rate limit
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';

describe('Security Rate Limit', () => {
  let app: Express;
  let server: Server;
  let port: number;
  let base: string;

  beforeAll(async () => {
    app = express();
    app.set('trust proxy', false);

    // Configure short deterministic rate limit for testing
    // windowMs: 1000ms (1 second)
    // max: 3 requests per window
    // trustProxy defaults to false, preventing X-Forwarded-For bypass
    app.use(
      '/api',
      rateLimit({
        windowMs: 1000,
        max: 3,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'rate-limited' },
      })
    );

    // Test endpoint without auth/DB
    app.get('/api/rate-limit-test', (_req, res) => {
      res.json({ ok: true });
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

  it('blocks requests exceeding rate limit', async () => {
    const responses: number[] = [];

    // Send 5 requests (limit is 3)
    for (let i = 0; i < 5; i++) {
      const response = await fetch(`${base}/api/rate-limit-test`, { method: 'GET' });
      responses.push(response.status);
    }

    // First 3 should be 200, last 2 should be 429
    expect(responses[0]).toBe(200);
    expect(responses[1]).toBe(200);
    expect(responses[2]).toBe(200);
    expect(responses[3]).toBe(429);
    expect(responses[4]).toBe(429);
  });

  it('X-Forwarded-For header does not bypass rate limit', async () => {
    // Wait for rate limit window to reset from previous test
    await new Promise(resolve => setTimeout(resolve, 1100));

    const responses: number[] = [];

    // First, exhaust the rate limit with 3 requests
    for (let i = 0; i < 3; i++) {
      const response = await fetch(`${base}/api/rate-limit-test`, { method: 'GET' });
      responses.push(response.status);
    }

    // All first 3 should be 200
    expect(responses[0]).toBe(200);
    expect(responses[1]).toBe(200);
    expect(responses[2]).toBe(200);

    // Now try with different X-Forwarded-For header
    // This should still be blocked because trustProxy defaults to false
    const bypassResponse = await fetch(`${base}/api/rate-limit-test`, {
      method: 'GET',
      headers: {
        'X-Forwarded-For': '1.2.3.4',
      },
    });

    expect(bypassResponse.status).toBe(429);
  });
});
