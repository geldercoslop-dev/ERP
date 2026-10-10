import { describe, expect } from 'vitest';
import {
  afterAllWithServiceContext,
  beforeAllWithServiceContext,
  itWithServiceContext,
} from '../integration/service-context-harness.js';
import * as inventoryService from '../../services/inventory.service.js';
import * as clientesService from '../../services/clientes.service.js';
import * as ordersService from '../../services/orders.service.js';
import { ADMIN_ACTOR } from '../../_core/service-actor.js';
import { getDb, getInsertId } from '../../db/index.js';
import { schema } from '../../db/index.js';
import { eq, and, or } from 'drizzle-orm';

const { produtos, clientes, pedidos } = schema;

describe('Isolamento de Dados entre Tenants (Serviços)', () => {
  const TENANT_A = 1001;
  const TENANT_B = 1002;

  let produtoIdA: number;
  let clienteIdA: number;
  let pedidoIdA: number;

  // beforeAllWithServiceContext executa bootstrapServer() antes do getDb/seeds
  beforeAllWithServiceContext(async () => {
    // Limpar dados de teste anteriores se necessário (opcional para ambiente de teste isolado)
    const dbConn = await getDb();
    if (dbConn) {
      await dbConn.delete(pedidos).where(or(eq(pedidos.tenantId, TENANT_A), eq(pedidos.tenantId, TENANT_B)));
      await dbConn.delete(produtos).where(or(eq(produtos.tenantId, TENANT_A), eq(produtos.tenantId, TENANT_B)));
      await dbConn.delete(clientes).where(or(eq(clientes.tenantId, TENANT_A), eq(clientes.tenantId, TENANT_B)));
    }

    // Criar dados no TENANT_A
    // createProduto retorna {id} direto (ensureCreatedResult), não wrapper {success,data}
    const produto = await inventoryService.createProduto(TENANT_A, {
      descricao: 'Produto Tenant A',
      valorVenda: 100,
      custo: 50,
      ativo: true
    } as never);
    if (!Number.isInteger(produto.id) || produto.id <= 0) {
      throw new Error('Seed createProduto falhou: id inválido');
    }
    produtoIdA = produto.id;

    // createCliente retorna wrapper {success, data?: {id}}
    const cliente = await clientesService.createCliente(TENANT_A, {
      nome: 'Cliente Tenant A',
      telefone: '11999999999',
      email: 'clienteA@test.com'
    } as never);
    if (!cliente.success || !cliente.data) {
      throw new Error(`Seed createCliente falhou: ${cliente.error ?? 'sem data'}`);
    }
    clienteIdA = cliente.data.id;

    // Criar pedido para o cliente A no tenant A
    const dbConnPedido = await getDb();
    if (dbConnPedido) {
      const pedidoRes = await dbConnPedido.insert(pedidos).values({
        tenantId: TENANT_A,
        clienteId: clienteIdA,
        vendedorId: 1, // Mock
        status: 'GERADO',
        total: 100,
        numero: Math.floor(Math.random() * 1000000), // Número aleatório para evitar conflito de unique
        clienteNome: 'Cliente Tenant A',
        createdAt: new Date(),
        updatedAt: new Date()
      } as never);
      pedidoIdA = getInsertId(pedidoRes);
    }
  });

  afterAllWithServiceContext(async () => {
    const dbConn = await getDb();
    if (dbConn) {
      // Limpeza final
      await dbConn.delete(pedidos).where(eq(pedidos.tenantId, TENANT_A));
      await dbConn.delete(produtos).where(eq(produtos.tenantId, TENANT_A));
      await dbConn.delete(clientes).where(eq(clientes.tenantId, TENANT_A));
    }
  });

  itWithServiceContext('Tenant B não deve conseguir listar produtos do Tenant A', async () => {
    const produtosB = await inventoryService.getAllProdutos(TENANT_B);
    const encontrouA = produtosB.some(p => p.id === produtoIdA);
    expect(encontrouA).toBe(false);
  });

  itWithServiceContext('Tenant B não deve conseguir buscar produto do Tenant A por ID', async () => {
    const produto = await inventoryService.getProdutoById(TENANT_B, produtoIdA);
    expect(produto).toBeNull();
  });

  itWithServiceContext('Tenant B não deve conseguir listar clientes do Tenant A', async () => {
    // listClientes retorna wrapper {success, data?: {items,...}}
    const listaClientesB = await clientesService.listClientes(TENANT_B, ADMIN_ACTOR, { pageSize: 100 });
    expect(listaClientesB.success).toBe(true);
    const encontrouA = (listaClientesB.data?.items ?? []).some(c => c.id === clienteIdA);
    expect(encontrouA).toBe(false);
  });

  itWithServiceContext('Tenant B não deve conseguir buscar cliente do Tenant A por ID', async () => {
    // getClienteById retorna wrapper {success, data?: Cliente} — data ausente = sem acesso/inexistente
    const clienteResult = await clientesService.getClienteById(TENANT_B, ADMIN_ACTOR, clienteIdA);
    expect(clienteResult.data ?? null).toBeNull();
  });

  itWithServiceContext('Tenant B não deve conseguir buscar pedido do Tenant A por ID', async () => {
    const pedido = await ordersService.getPedidoById(TENANT_B, pedidoIdA);
    expect(pedido).toBeNull();
  });

  itWithServiceContext('Tenant B não deve conseguir listar pedidos do Tenant A', async () => {
    const { items } = await ordersService.listPedidos(TENANT_B, ADMIN_ACTOR, { pageSize: 100 });
    const encontrouA = items.some(p => p.id === pedidoIdA);
    expect(encontrouA).toBe(false);
  });
});
