import { describe, it, expect } from 'vitest';
import * as usersService from '../../services/users.service';
import * as inventoryService from '../../services/inventory.service';
import { getDb, schema } from '../../db/index';
import { eq, and } from 'drizzle-orm';

const { users, produtos } = schema;

describe('Validação Direta de Filtros em Serviços', () => {
  const TENANT_1 = 2001;
  const TENANT_2 = 2002;

  it('upsertUser deve respeitar o tenantId fornecido', async () => {
    const db = await getDb();
    const openId = `test-user-${Date.now()}`;
    
    // Criar no tenant 1
    await usersService.upsertUser(TENANT_1, {
      openId,
      name: 'User T1',
      email: 't1@test.com'
    } as any);

    // Verificar no tenant 1
    const user1 = await usersService.getUserByOpenId(TENANT_1, openId);
    expect(user1).toBeDefined();
    expect(user1?.tenantId).toBe(TENANT_1);

    // Verificar que NÃO existe no tenant 2
    const user2 = await usersService.getUserByOpenId(TENANT_2, openId);
    expect(user2).toBeNull();

    // Limpar
    if (db) await db.delete(users).where(eq(users.openId, openId));
  });

  it('createProduto deve vincular o tenantId corretamente', async () => {
    const db = await getDb();
    const desc = `Prod T1 ${Date.now()}`;
    
    const prod = await inventoryService.createProduto(TENANT_1, {
      descricao: desc,
      valorVenda: 50
    } as any);

    const saved = await inventoryService.getProdutoById(TENANT_1, prod.id);
    expect(saved).toBeDefined();
    expect(saved?.tenantId).toBe(TENANT_1);

    // Tentativa de buscar pelo tenant errado
    const wrongTenant = await inventoryService.getProdutoById(TENANT_2, prod.id);
    expect(wrongTenant).toBeNull();

    // Limpar
    if (db) await db.delete(produtos).where(eq(produtos.id, prod.id));
  });

  it('updateEstoqueProduto deve falhar se o produto não pertencer ao tenant', async () => {
    const db = await getDb();
    const prod = await inventoryService.createProduto(TENANT_1, {
      descricao: 'Prod T1 para Estoque',
      valorVenda: 10
    } as any);

    // Tentar atualizar estoque usando TENANT_2
    await expect(inventoryService.updateEstoqueProduto(TENANT_2, {
      id: prod.id,
      quantidade: 100
    })).rejects.toThrow('Produto não encontrado ou acesso negado');

    // Limpar
    if (db) await db.delete(produtos).where(eq(produtos.id, prod.id));
  });
}, 60_000);
