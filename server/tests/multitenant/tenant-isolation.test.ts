import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as inventoryService from '../../services/inventory.service.js';
import * as clientesService from '../../services/clientes.service.js';
import * as ordersService from '../../services/orders.service.js';
import { ADMIN_ACTOR } from '../../_core/service-actor.js';
import { getDb } from '../../db/index.js';
import { schema } from '../../db/index.js';
import { eq, and, or } from 'drizzle-orm';

const { produtos, clientes, pedidos } = schema;

describe('Isolamento de Dados entre Tenants (Serviços)', () => {
  const TENANT_A = 1001;
  const TENANT_B = 1002;

  let produtoIdA: number;
  let clienteIdA: number;
  let pedidoIdA: number;

  beforeAll(async () => {
    // Limpar dados de teste anteriores se necessário (opcional para ambiente de teste isolado)
    const db = await getDb();
    if (db) {
      await db.delete(pedidos).where(or(eq(pedidos.tenantId, TENANT_A), eq(pedidos.tenantId, TENANT_B)));
      await db.delete(produtos).where(or(eq(produtos.tenantId, TENANT_A), eq(produtos.tenantId, TENANT_B)));
      await db.delete(clientes).where(or(eq(clientes.tenantId, TENANT_A), eq(clientes.tenantId, TENANT_B)));
    }

    // Criar dados no TENANT_A
    const produto = await inventoryService.createProduto(TENANT_A, {
      descricao: 'Produto Tenant A',
      valorVenda: 100,
      custo: 50,
      ativo: true
    } as any);
    produtoIdA = produto.id;

    const cliente = await clientesService.createCliente(TENANT_A, {
      nome: 'Cliente Tenant A',
      telefone: '11999999999',
      email: 'clienteA@test.com'
    } as any);
    clienteIdA = cliente.id;

    // Criar pedido para o cliente A no tenant A
    const dbConn = await getDb();
    if (dbConn) {
      const pedidoRes = await dbConn.insert(pedidos).values({
        tenantId: TENANT_A,
        clienteId: clienteIdA,
        vendedorId: 1, // Mock
        status: 'GERADO',
        total: 100,
        numero: Math.floor(Math.random() * 1000000), // Número aleatório para evitar conflito de unique
        clienteNome: 'Cliente Tenant A',
        createdAt: new Date(),
        updatedAt: new Date()
      } as any);
      pedidoIdA = (pedidoRes[0] as any).insertId;
    }
  });

  afterAll(async () => {
    const db = await getDb();
    if (db) {
      // Limpeza final
      await db.delete(pedidos).where(eq(pedidos.tenantId, TENANT_A));
      await db.delete(produtos).where(eq(produtos.tenantId, TENANT_A));
      await db.delete(clientes).where(eq(clientes.tenantId, TENANT_A));
    }
  });

  it('Tenant B não deve conseguir listar produtos do Tenant A', async () => {
    const produtosB = await inventoryService.getAllProdutos(TENANT_B);
    const encontrouA = produtosB.some(p => p.id === produtoIdA);
    expect(encontrouA).toBe(false);
  });

  it('Tenant B não deve conseguir buscar produto do Tenant A por ID', async () => {
    const produto = await inventoryService.getProdutoById(TENANT_B, produtoIdA);
    expect(produto).toBeNull();
  });

  it('Tenant B não deve conseguir listar clientes do Tenant A', async () => {
    const { items } = await clientesService.listClientes(TENANT_B, ADMIN_ACTOR, { pageSize: 100 });
    const encontrouA = items.some(c => c.id === clienteIdA);
    expect(encontrouA).toBe(false);
  });

  it('Tenant B não deve conseguir buscar cliente do Tenant A por ID', async () => {
    const cliente = await clientesService.getClienteById(TENANT_B, ADMIN_ACTOR, clienteIdA);
    expect(cliente).toBeNull();
  });

  it('Tenant B não deve conseguir buscar pedido do Tenant A por ID', async () => {
    const pedido = await ordersService.getPedidoById(TENANT_B, pedidoIdA);
    expect(pedido).toBeNull();
  });

  it('Tenant B não deve conseguir listar pedidos do Tenant A', async () => {
    const { items } = await ordersService.listPedidos(TENANT_B, ADMIN_ACTOR, { pageSize: 100 });
    const encontrouA = items.some(p => p.id === pedidoIdA);
    expect(encontrouA).toBe(false);
  });
});
