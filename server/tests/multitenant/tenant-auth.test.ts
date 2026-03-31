import { describe, it, expect } from 'vitest';
import { requireTenant, enforceAuth, validateOwnership } from '../../_core/tenant.js';
import { TRPCError } from '@trpc/server';

describe('Autenticação e Autorização por Tenant', () => {
  const VALID_TENANT_ID = 1;
  const INVALID_TENANT_ID = 2;

  describe('requireTenant', () => {
    it('deve retornar tenantId quando presente no contexto', async () => {
      const ctx = { tenantId: VALID_TENANT_ID } as any;
      const result = await requireTenant(ctx);
      expect(result).toBe(VALID_TENANT_ID);
    });

    it('deve lançar TRPCError UNAUTHORIZED quando tenantId estiver ausente', async () => {
      const ctx = { tenantId: null } as any;
      await expect(requireTenant(ctx)).rejects.toThrow(TRPCError);
      await expect(requireTenant(ctx)).rejects.toMatchObject({
        code: 'UNAUTHORIZED'
      });
    });
  });

  describe('enforceAuth', () => {
    it('deve retornar user e tenantId quando ambos estão presentes', async () => {
      const user = { id: 100, role: 'user' };
      const ctx = { user, tenantId: VALID_TENANT_ID } as any;
      const result = await enforceAuth(ctx);
      expect(result).toEqual({ user, tenantId: VALID_TENANT_ID });
    });

    it('deve lançar UNAUTHORIZED se o usuário não estiver autenticado', async () => {
      const ctx = { user: null, tenantId: VALID_TENANT_ID } as any;
      await expect(enforceAuth(ctx)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        message: 'User is not authenticated'
      });
    });

    it('deve lançar UNAUTHORIZED se o tenantId estiver ausente mesmo com usuário', async () => {
      const ctx = { user: { id: 1 }, tenantId: null } as any;
      await expect(enforceAuth(ctx)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        message: 'User does not belong to any tenant'
      });
    });
  });

  describe('validateOwnership', () => {
    it('deve permitir acesso se os tenantIds forem iguais', async () => {
      await expect(validateOwnership(VALID_TENANT_ID, VALID_TENANT_ID)).resolves.not.toThrow();
    });

    it('deve negar acesso (FORBIDDEN) se os tenantIds forem diferentes', async () => {
      await expect(validateOwnership(VALID_TENANT_ID, INVALID_TENANT_ID)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Access denied: Resource does not belong to your tenant'
      });
    });

    it('deve negar acesso se o tenantId do recurso for null/undefined', async () => {
      await expect(validateOwnership(null, VALID_TENANT_ID)).rejects.toMatchObject({
        code: 'FORBIDDEN'
      });
    });
  });
});
