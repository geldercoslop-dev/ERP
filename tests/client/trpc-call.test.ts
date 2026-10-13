import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * AUTH-H8B — contrato de wire do trpcCall com o servidor tRPC v11
 * (transformer identidade, sem superjson):
 * - request batch POST: {"0": <input>} — SEM envelope { json: ... }
 * - response batch:     [{ "result": { "data": <valor cru> } }]
 */

const { authenticatedFetchMock } = vi.hoisted(() => ({
  authenticatedFetchMock: vi.fn(),
}));

vi.mock('../../client/src/lib/security/apiClient', () => ({
  authenticatedFetch: authenticatedFetchMock,
  shouldSuppress401Redirect: () => false,
  GRS_AUTH_UNAUTHORIZED_EVENT: 'grs:auth-unauthorized',
}));

import { trpcCall, getSessionToken } from '../../client/src/lib/trpcClient';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function lastRequestBody(): Record<string, unknown> {
  const call = authenticatedFetchMock.mock.calls.at(-1);
  expect(call).toBeDefined();
  const init = call![1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe('trpcCall — envelope batch compatível com httpBatchLink (AUTH-H8B)', () => {
  beforeEach(() => {
    authenticatedFetchMock.mockReset();
  });

  it('envia input cru no slot "0" — {"0": input}, sem envelope { json }', async () => {
    authenticatedFetchMock.mockResolvedValue(
      jsonResponse([{ result: { data: { ok: true, name: 'Admin' } } }])
    );

    const result = await trpcCall('auth.login', {
      username: 'admin',
      password: 'secret',
    });

    const [url, init] = authenticatedFetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/trpc/auth.login?batch=1');
    expect(init.method).toBe('POST');

    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    // httpBatchLink: {"0": {"username": "...", "password": "..."}}
    expect(body).toEqual({ '0': { username: 'admin', password: 'secret' } });
    expect(body['0']).not.toHaveProperty('json');

    // resposta vem crua em result.data (transformer identidade)
    expect(result).toEqual({ ok: true, name: 'Admin' });
  });

  it('input null vira {"0": null} — mesmo formato do httpBatchLink', async () => {
    authenticatedFetchMock.mockResolvedValue(
      jsonResponse([{ result: { data: null } }])
    );

    await trpcCall('auth.logout', null);

    expect(lastRequestBody()).toEqual({ '0': null });
  });

  it('input undefined serializa como {} (JSON.stringify descarta o slot)', async () => {
    authenticatedFetchMock.mockResolvedValue(
      jsonResponse([{ result: { data: { id: 1 } } }])
    );

    const result = await trpcCall('auth.me');

    expect(lastRequestBody()).toEqual({});
    expect(result).toEqual({ id: 1 });
  });

  it('propaga erro tRPC do batch (BAD_REQUEST do Zod) sem mascarar', async () => {
    authenticatedFetchMock.mockResolvedValue(
      jsonResponse(
        [
          {
            error: {
              message: 'Invalid input: expected string, received undefined',
              code: -32600,
              data: { code: 'BAD_REQUEST', httpStatus: 400 },
            },
          },
        ],
        400
      )
    );

    let caught: unknown;
    try {
      await trpcCall('auth.login', { username: 'u', password: 'p' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('expected string');
    expect((caught as { code?: string }).code).toBe('BAD_REQUEST');
  });

  it('não persiste nem retorna token de sessão (cookie-only)', async () => {
    authenticatedFetchMock.mockResolvedValue(
      jsonResponse([{ result: { data: { ok: true, sessionToken: 'x' } } }])
    );

    await trpcCall('auth.login', { username: 'u', password: 'p' });

    // trpcCall nunca grava token — sessão é o cookie httpOnly do servidor.
    expect(getSessionToken()).toBeNull();
  });
});
