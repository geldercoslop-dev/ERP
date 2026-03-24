import { describe, it, expect } from 'vitest';
import {
  stripForbiddenIdentityKeys,
  sanitizePlainTextInput,
} from '../../client/src/lib/security/sanitizePayload';
import {
  isAuthenticatedForRoute,
  canAccessAdminRoute,
  canAccessVendedorRoute,
} from '../../client/src/lib/security/routeGuards';
import { shouldSuppress401Redirect } from '../../client/src/lib/security/apiClient';

describe('frontend security — sanitização e guards', () => {
  it('remove tenantId, userId e role de payloads aninhados', () => {
    const raw = {
      nome: 'a',
      tenantId: 99,
      userId: 1,
      nested: { role: 'admin', ok: true },
    };
    expect(stripForbiddenIdentityKeys(raw)).toEqual({
      nome: 'a',
      nested: { ok: true },
    });
  });

  it('sanitizePlainTextInput remove caracteres de controlo e respeita maxLen', () => {
    expect(sanitizePlainTextInput('a\u0000b')).toBe('ab');
    expect(sanitizePlainTextInput(`  ${'x'.repeat(10)}  `, 5)).toBe('xxxxx');
  });

  it('isAuthenticatedForRoute: loading / denied / allowed', () => {
    expect(isAuthenticatedForRoute(true, false)).toBe('loading');
    expect(isAuthenticatedForRoute(false, false)).toBe('denied');
    expect(isAuthenticatedForRoute(false, true)).toBe('allowed');
  });

  it('canAccessAdminRoute só admin', () => {
    expect(canAccessAdminRoute('admin')).toBe(true);
    expect(canAccessAdminRoute('vendedor')).toBe(false);
    expect(canAccessAdminRoute(undefined)).toBe(false);
  });

  it('canAccessVendedorRoute admin e vendedor', () => {
    expect(canAccessVendedorRoute('vendedor')).toBe(true);
    expect(canAccessVendedorRoute('admin')).toBe(true);
    expect(canAccessVendedorRoute(undefined)).toBe(false);
  });

  it('shouldSuppress401Redirect para auth.login', () => {
    expect(shouldSuppress401Redirect('/api/trpc/auth.login?batch=1')).toBe(true);
  });
});
