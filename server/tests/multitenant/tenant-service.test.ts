import { describe, expect } from 'vitest';
import {
  beforeAllWithServiceContext,
  itWithServiceContext,
} from '../integration/service-context-harness.js';
import * as usersService from '../../services/users.service.js';
import * as inventoryService from '../../services/inventory.service.js';
import { getDb, schema } from '../../db/index.js';
import { eq, and } from 'drizzle-orm';

const { users, produtos } = schema;

describe('Validação Direta de Filtros em Serviços', () => {
  const TENANT_1 = 2001;
  const TENANT_2 = 2002;

  // Bootstrap + contexto ALS obrigatórios: getDb/services falham sem bootstrapServer()
  beforeAllWithServiceContext(async () => {});

  itWithServiceContext('upsertUser deve respeitar o tenantId fornecido', async () => {
    const dbConn = await getDb();
    const openId = `test-user-${Date.now()}`;
    
    // Criar no tenant 1
    await usersService.upsertUser(TENANT_1, {
      openId,
      name: 'User T1',
      email: 't1@test.com'
    } as never);

    // Verificar no tenant 1
    const user1 = await usersService.getUserByOpenId(TENANT_1, openId);
    expect(user1).toBeDefined();
    expect(user1?.tenantId).toBe(TENANT_1);

    // Verificar que NÃO existe no tenant 2
    const user2 = await usersService.getUserByOpenId(TENANT_2, openId);
    expect(user2).toBeNull();

    // Limpar
    if (dbConn) await dbConn.delete(users).where(eq(users.openId, openId));
  });

  itWithServiceContext('createProduto deve vincular o tenantId corretamente', async () => {
    const dbConn = await getDb();
    const desc = `Prod T1 ${Date.now()}`;
    
    const prod = await inventoryService.createProduto(TENANT_1, {
      descricao: desc,
      valorVenda: 50
    } as never);

    const saved = await inventoryService.getProdutoById(TENANT_1, prod.id);
    expect(saved).toBeDefined();
    expect(saved?.tenantId).toBe(TENANT_1);

    // Tentativa de buscar pelo tenant errado
    const wrongTenant = await inventoryService.getProdutoById(TENANT_2, prod.id);
    expect(wrongTenant).toBeNull();

    // Limpar
    if (dbConn) await dbConn.delete(produtos).where(eq(produtos.id, prod.id));
  });

  itWithServiceContext('updateEstoqueProduto deve falhar se o produto não pertencer ao tenant', async () => {
    const dbConn = await getDb();
    const prod = await inventoryService.createProduto(TENANT_1, {
      descricao: 'Prod T1 para Estoque',
      valorVenda: 10
    } as never);

    // Tentar atualizar estoque usando TENANT_2
    await expect(inventoryService.updateEstoqueProduto(TENANT_2, {
      id: prod.id,
      quantidade: 100
    })).rejects.toThrow('Produto não encontrado ou acesso negado');

    // Limpar
    if (dbConn) await dbConn.delete(produtos).where(eq(produtos.id, prod.id));
  });
}, 60_000);
