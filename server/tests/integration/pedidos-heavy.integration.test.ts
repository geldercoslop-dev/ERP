/**
 * Integração pesada + segurança + erros + stress leve (pedidos via orders.service).
 * Exige MySQL (DATABASE_URL). Sem DB: suíte ignorada.
 */

import { describe, expect } from "vitest";
import { nanoid } from "nanoid";
import {
  afterAllWithServiceContext,
  beforeAllWithServiceContext,
  itWithServiceContext,
} from "./service-context-harness.js";
import { type ServiceActor, ADMIN_ACTOR } from "../../_core/service-actor.js";
import * as clientesService from "../../services/clientes.service.js";
import {
  createPedidoSafe,
  deletePedido,
  getPedidoByIdForActor,
  getPedidoWithItensForActor,
  listPedidosTrpcPage,
  updatePedido,
  assertPedidoMutableByActor,
  PedidoAccessError,
} from "../../services/orders.service.js";
import {
  createPedidosHeavyTestUser,
  createPedidosHeavyTestVendedor,
  cleanupPedidosHeavyTestData,
} from "../../services/system-test.service.js";

const TENANT = 998;

// Flag para ativar testes de integração com banco real
const INTEGRATION_DB_READY = true;

let userAId = 0;
let userBId = 0;
let vendedorAId = 0;
let vendedorBId = 0;
let clienteAId = 0;
let clienteBId = 0;
let phoneA = "";
let phoneB = "";

let actorA: ServiceActor = { role: "vendedor", userId: 0, vendedorId: 0 };
let actorB: ServiceActor = { role: "vendedor", userId: 0, vendedorId: 0 };
const actorAdmin: ServiceActor = { role: "admin", userId: 1 };

const pedidosCriados = new Set<number>();

describe.skipIf(!INTEGRATION_DB_READY)("PEDIDOS — integração pesada + segurança + stress", () => {
  beforeAllWithServiceContext(async () => {
    const sfx = nanoid(8).replace(/[^0-9a-z]/gi, "h");
    // Suffix do telefone só dígitos: letras do nanoid colapsam no normalizeTelefone
    // e podem colidir com resíduos de runs abortadas (dedupe por telefone no tenant).
    const phoneSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-6);
    phoneA = `21998${phoneSuffix}`;
    phoneB = `21997${phoneSuffix}`;

    const userA = await createPedidosHeavyTestUser(TENANT, `heavy-a-${sfx}`, "Heavy A");
    userAId = userA.userId;
    const userB = await createPedidosHeavyTestUser(TENANT, `heavy-b-${sfx}`, "Heavy B");
    userBId = userB.userId;

    const vendedorA = await createPedidosHeavyTestVendedor(TENANT, userAId, `VHeavyA ${sfx}`);
    vendedorAId = vendedorA.vendedorId;
    const vendedorB = await createPedidosHeavyTestVendedor(TENANT, userBId, `VHeavyB ${sfx}`);
    vendedorBId = vendedorB.vendedorId;

    actorA = { role: "vendedor", userId: userAId, vendedorId: vendedorAId };
    actorB = { role: "vendedor", userId: userBId, vendedorId: vendedorBId };

    const clienteAResult = await clientesService.createCliente(TENANT, {
      nome: "Cliente Heavy A",
      telefone: phoneA,
      userId: userAId,
      vendedorIdPrincipal: vendedorAId,
    });
    // createCliente retorna { success, data?: { id } }
    expect(clienteAResult.success, clienteAResult.error).toBe(true);
    expect(clienteAResult.data?.id).toBeGreaterThan(0);
    clienteAId = clienteAResult.data?.id ?? 0;

    const clienteBResult = await clientesService.createCliente(TENANT, {
      nome: "Cliente Heavy B",
      telefone: phoneB,
      userId: userBId,
      vendedorIdPrincipal: vendedorBId,
    });
    expect(clienteBResult.success, clienteBResult.error).toBe(true);
    expect(clienteBResult.data?.id).toBeGreaterThan(0);
    clienteBId = clienteBResult.data?.id ?? 0;
  });

  afterAllWithServiceContext(async () => {
    await cleanupPedidosHeavyTestData(TENANT, {
      pedidoIds: [...pedidosCriados],
      clienteIds: [clienteAId, clienteBId],
      vendedorIds: [vendedorAId, vendedorBId],
      userIds: [userAId, userBId],
    });
  });

  let pedidosFluxo: number[] = [];

  itWithServiceContext("integração: 10 creates → list → detalhe → update → delete", async () => {
    const ids: number[] = [];
    for (let i = 0; i < 10; i++) {
      const q = i + 1;
      const vu = 10 + i;
      const sub = String(q * vu);
      const r = await createPedidoSafe(TENANT, {
        vendedorId: vendedorAId,
        clienteId: clienteAId,
        clienteNome: "Cliente Heavy A",
        clienteTelefone: phoneA,
        subtotal: sub,
        desconto: "0",
        frete: "0",
        total: sub,
        itens: [
          {
            tipo: "LIVRE",
            descricao: `Item fluxo ${i}`,
            quantidade: q,
            valorUnitario: vu,
            custo: 1,
          },
        ],
      }, actorA);
      expect(r.success).toBe(true);
      expect(r.pedidoId).toBeGreaterThan(0);
      ids.push(r.pedidoId);
      pedidosCriados.add(r.pedidoId);
    }
    pedidosFluxo = ids;

    const page = await listPedidosTrpcPage(TENANT, actorA, { page: 1, pageSize: 100 });
    const idSet = new Set(page.items.map((x) => x.id));
    for (const id of ids) {
      expect(idSet.has(id)).toBe(true);
    }

    const det = await getPedidoWithItensForActor(TENANT, actorA, ids[0]);
    expect(det).not.toBeNull();
    expect(det!.pedido.id).toBe(ids[0]);
    expect(det!.itens.length).toBeGreaterThan(0);

    for (const idx of [0, 1, 2]) {
      await updatePedido(TENANT, actorA, ids[idx], { observacoes: `batch-upd-${idx}` });
    }

    await deletePedido(TENANT, actorA, ids[8]);
    await deletePedido(TENANT, actorA, ids[9]);
    pedidosCriados.delete(ids[8]);
    pedidosCriados.delete(ids[9]);

    const page2 = await listPedidosTrpcPage(TENANT, actorA, { page: 1, pageSize: 100 });
    const idSet2 = new Set(page2.items.map((x) => x.id));
    expect(idSet2.has(ids[8])).toBe(false);
    expect(idSet2.has(ids[9])).toBe(false);
    for (const idx of [0, 1, 2, 3, 4, 5, 6, 7]) {
      expect(idSet2.has(ids[idx])).toBe(true);
    }
  });

  itWithServiceContext("segurança: B não vê pedido de A; ID inexistente; sem vazamento", async () => {
    const alvo = pedidosFluxo[0];
    expect(alvo).toBeGreaterThan(0);

    expect(await getPedidoByIdForActor(TENANT, actorB, alvo)).toBeNull();

    await expect(assertPedidoMutableByActor(TENANT, actorB, alvo)).rejects.toSatisfy(
      (e: unknown) => e instanceof PedidoAccessError && e.code === "FORBIDDEN"
    );

    expect(await getPedidoByIdForActor(TENANT, actorA, 2_147_000_001)).toBeNull();

    try {
      await assertPedidoMutableByActor(TENANT, actorB, alvo);
    } catch (e: unknown) {
      const s = String(e instanceof Error ? e.message : e);
      expect(s).not.toMatch(/Cliente Heavy A/i);
      expect(s).not.toContain(String(clienteAId));
    }
  });

  itWithServiceContext("erros: payload inválido → exceção controlada", async () => {
    await expect(
      createPedidoSafe(TENANT, {
        vendedorId: vendedorAId,
        clienteId: clienteAId,
        subtotal: "1",
        desconto: "0",
        frete: "0",
        total: "1",
        itens: [],
      }, ADMIN_ACTOR)
    ).rejects.toThrow(/pelo menos um item|item/i);

    await expect(
      createPedidoSafe(TENANT, {
        vendedorId: vendedorAId,
        subtotal: "1",
        desconto: "0",
        frete: "0",
        total: "1",
        itens: [{ tipo: "LIVRE", descricao: "x", quantidade: 1, valorUnitario: 1, custo: 0 }],
      } as Parameters<typeof createPedidoSafe>[1], ADMIN_ACTOR)
    ).rejects.toThrow(/clienteId|Cliente não encontrado|obrigatório/i);

    await expect(
      createPedidoSafe(TENANT, {
        vendedorId: vendedorAId,
        clienteId: clienteAId,
        clienteNome: "Cliente Heavy A",
        clienteTelefone: phoneA,
        subtotal: "0",
        desconto: "0",
        frete: "0",
        total: "0",
        itens: [
          {
            tipo: "LIVRE",
            descricao: "bad qty",
            quantidade: 0,
            valorUnitario: 1,
            custo: 0,
          },
        ],
      }, actorA)
    ).rejects.toThrow(/Quantidade|quantidade|inválid/i);
  });

  itWithServiceContext("stress leve: 35× (create + list + update)", async () => {
    let lastId = 0;
    for (let i = 0; i < 35; i++) {
      const sub = String(50 + i);
      const cr = await createPedidoSafe(TENANT, {
        vendedorId: vendedorAId,
        clienteId: clienteAId,
        clienteNome: "Cliente Heavy A",
        clienteTelefone: phoneA,
        subtotal: sub,
        desconto: "0",
        frete: "0",
        total: sub,
        itens: [
          {
            tipo: "LIVRE",
            descricao: `stress ${i}`,
            quantidade: 1,
            valorUnitario: 50 + i,
            custo: 1,
          },
        ],
      }, actorA);
      expect(cr.success).toBe(true);
      lastId = cr.pedidoId;
      pedidosCriados.add(lastId);

      const pg = await listPedidosTrpcPage(TENANT, actorA, { page: 1, pageSize: 50 });
      expect(pg.items.length).toBeGreaterThan(0);

      await updatePedido(TENANT, actorA, lastId, { observacoes: `s-${i}` });
    }
    expect(lastId).toBeGreaterThan(0);
  });

  itWithServiceContext("admin: acesso a pedido existente", async () => {
    const anyId = [...pedidosCriados][0];
    if (!anyId) return;
    const p = await getPedidoByIdForActor(TENANT, actorAdmin, anyId);
    expect(p).not.toBeNull();
  });
});
