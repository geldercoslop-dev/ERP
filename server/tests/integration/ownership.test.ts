/**
 * Integração real: ownership de clientes e pedidos (MySQL + tenant 999).
 * Gate no carregamento do módulo evita corrida entre beforeAll e testes aninhados.
 */

import { describe, expect } from "vitest";
import { eq, and, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { runAsScriptService } from "../../core/service-context.js";
import { getDb, getInsertId } from "../../db/index.js";
import {
  afterAllWithServiceContext,
  beforeAllWithServiceContext,
  itWithServiceContext,
} from "./service-context-harness.js";
import type { Cliente } from "../../db/core.js";
import type { ServiceActor } from "../../_core/service-actor.js";
import * as clientesService from "../../services/clientes.service.js";
import {
  assertPedidoMutableByActor,
  createPedidoSafe,
  getPedidoById,
  PedidoAccessError,
} from "../../services/orders.service.js";
import {
  users,
  vendedores,
  clientes,
  clienteVendedores,
  pedidos,
  pendencias,
  contasReceber,
} from "../../../drizzle/schema.ts";

const TEST_TENANT_ID = 999;

// Flag para ativar testes de integração com banco real
const INTEGRATION_DB_READY = true;

let dbConn!: NonNullable<Awaited<ReturnType<typeof getDb>>>;

let userAId = 0;
let userBId = 0;
let vendedorAId = 0;
let vendedorBId = 0;
let clienteAId = 0;
let clienteBId = 0;
let pedidoClienteAId = 0;
let pedidoClienteBId = 0;
let pedidoNumeroA = 0;
let pedidoNumeroB = 0;

let actorVendedorA: ServiceActor = { role: "vendedor", userId: 0, vendedorId: 0 };
let actorVendedorB: ServiceActor = { role: "vendedor", userId: 0, vendedorId: 0 };

const actorAdmin: ServiceActor = { role: "admin", userId: 9999 };

describe.skipIf(!INTEGRATION_DB_READY)("OWNERSHIP HARDENING - TESTE REAL", () => {
  beforeAllWithServiceContext(async () => {
    const conn = await getDb();
    if (!conn) throw new Error("Database connection failed");
    dbConn = conn;

    const suffix = nanoid(6).replace(/[^0-9a-z]/gi, "x");
    const phoneA = (`11998${suffix}`).slice(0, 11);
    const phoneB = (`11997${suffix}`).slice(0, 11);

    console.log("\n🔧 Setup: Criando cenários de teste...\n");

    const insUserA = await dbConn.insert(users).values({
      tenantId: TEST_TENANT_ID,
      openId: `own-a-${suffix}`.slice(0, 64),
      name: "User Ownership A",
      role: "user",
    });
    userAId = getInsertId(insUserA as never);
    if (!Number.isInteger(userAId) || userAId <= 0) throw new Error("Falha insert user A");

    const insUserB = await dbConn.insert(users).values({
      tenantId: TEST_TENANT_ID,
      openId: `own-b-${suffix}`.slice(0, 64),
      name: "User Ownership B",
      role: "user",
    });
    userBId = getInsertId(insUserB as never);
    if (!Number.isInteger(userBId) || userBId <= 0) throw new Error("Falha insert user B");

    const insVendA = await dbConn.insert(vendedores).values({
      tenantId: TEST_TENANT_ID,
      userId: userAId,
      nome: `Vend Own A ${suffix}`,
      ativo: true,
      admin: false,
    });
    vendedorAId = getInsertId(insVendA as never);

    const insVendB = await dbConn.insert(vendedores).values({
      tenantId: TEST_TENANT_ID,
      userId: userBId,
      nome: `Vend Own B ${suffix}`,
      ativo: true,
      admin: false,
    });
    vendedorBId = getInsertId(insVendB as never);

    actorVendedorA = { role: "vendedor", userId: userAId, vendedorId: vendedorAId };
    actorVendedorB = { role: "vendedor", userId: userBId, vendedorId: vendedorBId };

    const clienteAResult = await clientesService.createCliente(TEST_TENANT_ID, {
      nome: "Cliente A",
      telefone: phoneA,
      userId: userAId,
      vendedorIdPrincipal: vendedorAId,
    });
    clienteAId = clienteAResult.id;

    const clienteBResult = await clientesService.createCliente(TEST_TENANT_ID, {
      nome: "Cliente B",
      telefone: phoneB,
      userId: userBId,
      vendedorIdPrincipal: vendedorBId,
    });
    clienteBId = clienteBResult.id;

    const pedidoAResult = await createPedidoSafe(TEST_TENANT_ID, {
      vendedorId: vendedorAId,
      clienteId: clienteAId,
      clienteNome: "Cliente A",
      clienteTelefone: phoneA,
      subtotal: "100",
      desconto: "0",
      frete: "0",
      total: "100",
      itens: [
        {
          tipo: "LIVRE",
          descricao: "Produto A",
          quantidade: 1,
          valorUnitario: 100,
          custo: 50,
        },
      ],
    });
    if (!pedidoAResult.success || !pedidoAResult.pedidoId) {
      throw new Error("Falha createPedidoSafe A");
    }
    pedidoClienteAId = pedidoAResult.pedidoId;
    pedidoNumeroA = pedidoAResult.numero;

    const pedidoBResult = await createPedidoSafe(TEST_TENANT_ID, {
      vendedorId: vendedorBId,
      clienteId: clienteBId,
      clienteNome: "Cliente B",
      clienteTelefone: phoneB,
      subtotal: "200",
      desconto: "0",
      frete: "0",
      total: "200",
      itens: [
        {
          tipo: "LIVRE",
          descricao: "Produto B",
          quantidade: 2,
          valorUnitario: 100,
          custo: 50,
        },
      ],
    });
    if (!pedidoBResult.success || !pedidoBResult.pedidoId) {
      throw new Error("Falha createPedidoSafe B");
    }
    pedidoClienteBId = pedidoBResult.pedidoId;
    pedidoNumeroB = pedidoBResult.numero;

    console.log("\n✅ Setup concluído!\n");
  });

  itWithServiceContext("CLIENTES: Vendedor A acessa cliente A via service", async () => {
    const cliente = await clientesService.getClienteById(TEST_TENANT_ID, actorVendedorA, clienteAId);
    expect(cliente).not.toBeNull();
    expect(cliente?.id).toBe(clienteAId);
    expect(cliente?.userId).toBe(actorVendedorA.userId);
  });

  itWithServiceContext("CLIENTES: Vendedor A NÃO acessa cliente B via service", async () => {
    const cliente = await clientesService.getClienteById(TEST_TENANT_ID, actorVendedorA, clienteBId);
    expect(cliente).toBeNull();
  });

  itWithServiceContext("CLIENTES: Vendedor B acessa cliente B via service", async () => {
    const cliente = await clientesService.getClienteById(TEST_TENANT_ID, actorVendedorB, clienteBId);
    expect(cliente).not.toBeNull();
    expect(cliente?.id).toBe(clienteBId);
    expect(cliente?.userId).toBe(actorVendedorB.userId);
  });

  itWithServiceContext("CLIENTES: Vendedor B NÃO acessa cliente A via service", async () => {
    const cliente = await clientesService.getClienteById(TEST_TENANT_ID, actorVendedorB, clienteAId);
    expect(cliente).toBeNull();
  });

  itWithServiceContext("CLIENTES: Admin acessa cliente A", async () => {
    const cliente = await clientesService.getClienteById(TEST_TENANT_ID, actorAdmin, clienteAId);
    expect(cliente).not.toBeNull();
    expect(cliente?.id).toBe(clienteAId);
  });

  itWithServiceContext("CLIENTES: Admin acessa cliente B", async () => {
    const cliente = await clientesService.getClienteById(TEST_TENANT_ID, actorAdmin, clienteBId);
    expect(cliente).not.toBeNull();
    expect(cliente?.id).toBe(clienteBId);
  });

  itWithServiceContext("CLIENTES: Vendedor A lista apenas seus clientes", async () => {
    const result = await clientesService.listClientes(TEST_TENANT_ID, actorVendedorA, {});
    expect(result.items.length).toBeGreaterThan(0);
    const clienteAInList = result.items.some((c: Cliente) => c.id === clienteAId);
    expect(clienteAInList).toBe(true);
  });

  itWithServiceContext("CLIENTES: Vendedor A não pode editar cliente B", async () => {
    await expect(
      clientesService.updateCliente(TEST_TENANT_ID, actorVendedorA, clienteBId, { nome: "Cliente B Editado" })
    ).rejects.toThrow();
  });

  itWithServiceContext("CLIENTES: Vendedor A pode editar cliente A", async () => {
    const result = await clientesService.updateCliente(TEST_TENANT_ID, actorVendedorA, clienteAId, {
      nome: "Cliente A Atualizado",
    });
    expect(result.id).toBe(clienteAId);
  });

  itWithServiceContext("PEDIDOS: Vendedor A acessa pedido de cliente A", async () => {
    const pedido = await getPedidoById(TEST_TENANT_ID, pedidoClienteAId);
    expect(pedido).not.toBeNull();
    expect(pedido?.id).toBe(pedidoClienteAId);
    await expect(assertPedidoMutableByActor(TEST_TENANT_ID, actorVendedorA, pedidoClienteAId)).resolves.toBeUndefined();
  });

  itWithServiceContext("PEDIDOS: Vendedor A NÃO acessa pedido de cliente B", async () => {
    await expect(assertPedidoMutableByActor(TEST_TENANT_ID, actorVendedorA, pedidoClienteBId)).rejects.toThrow(
      /Acesso negado|FORBIDDEN/
    );
  });

  itWithServiceContext("PEDIDOS: Vendedor B acessa pedido de cliente B", async () => {
    const pedido = await getPedidoById(TEST_TENANT_ID, pedidoClienteBId);
    expect(pedido).not.toBeNull();
    await expect(assertPedidoMutableByActor(TEST_TENANT_ID, actorVendedorB, pedidoClienteBId)).resolves.toBeUndefined();
  });

  itWithServiceContext("PEDIDOS: Vendedor B NÃO acessa pedido de cliente A", async () => {
    await expect(assertPedidoMutableByActor(TEST_TENANT_ID, actorVendedorB, pedidoClienteAId)).rejects.toThrow(
      /Acesso negado|FORBIDDEN/
    );
  });

  itWithServiceContext("PEDIDOS: Admin acessa pedido de cliente A", async () => {
    await expect(assertPedidoMutableByActor(TEST_TENANT_ID, actorAdmin, pedidoClienteAId)).resolves.toBeUndefined();
  });

  itWithServiceContext("PEDIDOS: Admin acessa pedido de cliente B", async () => {
    await expect(assertPedidoMutableByActor(TEST_TENANT_ID, actorAdmin, pedidoClienteBId)).resolves.toBeUndefined();
  });

  itWithServiceContext("SEGURANÇA: getClienteById negado retorna null", async () => {
    const r = await clientesService.getClienteById(TEST_TENANT_ID, actorVendedorA, clienteBId);
    expect(r).toBeNull();
  });

  itWithServiceContext("SEGURANÇA: updateCliente negado menciona acesso", async () => {
    await expect(
      clientesService.updateCliente(TEST_TENANT_ID, actorVendedorA, clienteBId, { nome: "Teste" })
    ).rejects.toThrow(/acesso|Acesso|negado/i);
  });

  itWithServiceContext("SEGURANÇA: PedidoAccessError FORBIDDEN em pedido alheio", async () => {
    await expect(assertPedidoMutableByActor(TEST_TENANT_ID, actorVendedorA, pedidoClienteBId)).rejects.toSatisfy(
      (e: unknown) => e instanceof PedidoAccessError && e.code === "FORBIDDEN"
    );
  });

  afterAllWithServiceContext(async () => {
    console.log("\n🧹 Limpeza ownership test...\n");
    const pids = [pedidoClienteAId, pedidoClienteBId].filter((id) => Number.isInteger(id) && id > 0);
    if (pids.length === 0) return;

    try {
      await dbConn.delete(pendencias).where(inArray(pendencias.pedidoId, pids));
      const numeros = [pedidoNumeroA, pedidoNumeroB].filter((n) => Number.isInteger(n) && n > 0);
      if (numeros.length > 0) {
        await dbConn
          .delete(contasReceber)
          .where(and(eq(contasReceber.tenantId, TEST_TENANT_ID), inArray(contasReceber.pedidoNumero, numeros)));
      }
      await dbConn.delete(pedidos).where(and(eq(pedidos.tenantId, TEST_TENANT_ID), inArray(pedidos.id, pids)));
    } catch {
      // melhor esforço
    }

    const cids = [clienteAId, clienteBId].filter((id) => Number.isInteger(id) && id > 0);
    if (cids.length > 0) {
      try {
        await dbConn.delete(clienteVendedores).where(inArray(clienteVendedores.clienteId, cids));
        await dbConn.delete(clientes).where(and(eq(clientes.tenantId, TEST_TENANT_ID), inArray(clientes.id, cids)));
      } catch {
        // melhor esforço
      }
    }

    const vids = [vendedorAId, vendedorBId].filter((id) => Number.isInteger(id) && id > 0);
    if (vids.length > 0) {
      try {
        await dbConn.delete(vendedores).where(and(eq(vendedores.tenantId, TEST_TENANT_ID), inArray(vendedores.id, vids)));
      } catch {
        // melhor esforço
      }
    }

    const uids = [userAId, userBId].filter((id) => Number.isInteger(id) && id > 0);
    if (uids.length > 0) {
      try {
        await dbConn.delete(users).where(and(eq(users.tenantId, TEST_TENANT_ID), inArray(users.id, uids)));
      } catch {
        // melhor esforço
      }
    }
  });
});
