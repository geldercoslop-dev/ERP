import { describe, it, expect } from 'vitest';
import { executeLeoAction, LeoActionRequest } from '../actions/leo-actions';
import { leoErpService } from '../../services/leo-service';

const INVALID_TENANT = undefined as unknown as number;
const VALID_ACTOR = { id: 1, nome: 'Teste', role: 'vendedor', vendedorId: 1 };

function expectTenantError(err: unknown) {
  expect(err).toBeDefined();
  expect(err instanceof Error ? err.message : String(err)).toMatch(/tenantId obrigatório|tenantId is required|TENANT_REQUIRED/);
}

describe('LEO - Segurança multi-tenant', () => {
  describe('Actions principais', () => {
    it('falha ao executar consulta sem tenantId', async () => {
      const req: LeoActionRequest = { action: 'consulta' };
      await expect(
        executeLeoAction(req, { usuario: VALID_ACTOR } as any)
      ).rejects.toThrow(/tenantId obrigatório|tenantId is required|TENANT_REQUIRED/);
    });
    it('falha ao criar pedido sem tenantId', async () => {
      const req: LeoActionRequest = { action: 'operacao_erp', context: { entity: 'pedido', operation: 'criar_pedido' } };
      await expect(
        executeLeoAction(req, { usuario: VALID_ACTOR } as any, { clienteId: 1, itens: [{ produtoId: 1, quantidade: 1 }] })
      ).rejects.toThrow(/tenantId obrigatório|tenantId is required|TENANT_REQUIRED/);
    });
    it('falha ao consultar estoque sem tenantId', async () => {
      const req: LeoActionRequest = { action: 'consulta', context: { entity: 'estoque' } };
      await expect(
        executeLeoAction(req, { usuario: VALID_ACTOR } as any)
      ).rejects.toThrow(/tenantId obrigatório|tenantId is required|TENANT_REQUIRED/);
    });
  });

  describe('Services críticos', () => {
    it('falha ao chamar getClientes sem tenantId', async () => {
      await expect(
        leoErpService.getClientes(INVALID_TENANT, VALID_ACTOR)
      ).rejects.toThrow(/tenantId obrigatório|tenantId is required|TENANT_REQUIRED/);
    });
    it('falha ao chamar getPedidos sem tenantId', async () => {
      await expect(
        leoErpService.getPedidos(INVALID_TENANT, VALID_ACTOR)
      ).rejects.toThrow(/tenantId obrigatório|tenantId is required|TENANT_REQUIRED/);
    });
    it('falha ao chamar getEstoque sem tenantId', async () => {
      await expect(
        leoErpService.getEstoque(INVALID_TENANT)
      ).rejects.toThrow(/tenantId obrigatório|tenantId is required|TENANT_REQUIRED/);
    });
    it('falha ao chamar criarPedido sem tenantId', async () => {
      await expect(
        leoErpService.criarPedido(INVALID_TENANT, { clienteId: 1, itens: [{ produtoId: 1, quantidade: 1 }] }, VALID_ACTOR)
      ).rejects.toThrow(/tenantId obrigatório|tenantId is required|TENANT_REQUIRED/);
    });
    it('falha ao chamar editarPedido sem tenantId', async () => {
      await expect(
        leoErpService.editarPedido(undefined as any, { observacoes: 'teste' }, 1)
      ).rejects.toThrow(/tenantId obrigatório|tenantId is required|TENANT_REQUIRED/);
    });
    it('falha ao chamar cancelarPedido sem tenantId', async () => {
      await expect(
        leoErpService.cancelarPedido(undefined as any, 'motivo', 1)
      ).rejects.toThrow(/tenantId obrigatório|tenantId is required|TENANT_REQUIRED/);
    });
    it('falha ao chamar ajustarEstoque sem tenantId', async () => {
      await expect(
        leoErpService.ajustarEstoque(undefined as any, 1)
      ).rejects.toThrow(/tenantId obrigatório|tenantId is required|TENANT_REQUIRED/);
    });
  });
});
