/**
 * Integração pesada + segurança + erros + stress leve (pedidos via orders.service).
 * Exige MySQL (DATABASE_URL). Sem DB: suíte ignorada.
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
import type { ServiceActor } from "../../_core/service-actor.js";
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
  users,
  vendedores,
  clientes,
  clienteVendedores,
  pedidos,
  pendencias,
  contasReceber,
} from "../../../drizzle/schema.ts";

const TENANT = 998;

let DB_LIVE = false;
try {
  DB_LIVE = !!(await getDb());
} catch {
  DB_LIVE = false;
}
if (!DB_LIVE) {
  console.warn("\n[pedidos-heavy] MySQL indisponível — suíte ignorada.\n");
}

let db!: NonNullable<Awaited<ReturnType<typeof getDb>>>;

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
    const conn = await getDb();
    if (!conn) throw new Error("Sem conexão DB");
    db = conn;

    const sfx = nanoid(8).replace(/[^0-9a-z]/gi, "h");
    phoneA = (`21998${sfx}`).slice(0, 11);
    phoneB = (`21997${sfx}`).slice(0, 11);

    userAId = getInsertId(
      await db.insert(users).values({
        tenantId: TENANT,
        openId: `heavy-a-${sfx}`.slice(0, 64),
        name: "Heavy A",
        role: "user",
      }) as never
    );
    userBId = getInsertId(
      await db.insert(users).values({
        tenantId: TENANT,
        openId: `heavy-b-${sfx}`.slice(0, 64),
        name: "Heavy B",
        role: "user",
      }) as never
    );

    vendedorAId = getInsertId(
      await db.insert(vendedores).values({
        tenantId: TENANT,
        userId: userAId,
        nome: `VHeavyA ${sfx}`,
        ativo: true,
        admin: false,
      }) as never
    );
    vendedorBId = getInsertId(
      await db.insert(vendedores).values({
        tenantId: TENANT,
        userId: userBId,
        nome: `VHeavyB ${sfx}`,
        ativo: true,
        admin: false,
      }) as never
    );

    actorA = { role: "vendedor", userId: userAId, vendedorId: vendedorAId };
    actorB = { role: "vendedor", userId: userBId, vendedorId: vendedorBId };

    clienteAId = (
      await clientesService.createCliente(TENANT, {
        nome: "Cliente Heavy A",
        telefone: phoneA,
        userId: userAId,
        vendedorIdPrincipal: vendedorAId,
      })
    ).id;
    clienteBId = (
      await clientesService.createCliente(TENANT, {
        nome: "Cliente Heavy B",
        telefone: phoneB,
        userId: userBId,
        vendedorIdPrincipal: vendedorBId,
      })
    ).id;
  });

  afterAll(async () => {
    const pids = [...pedidosCriados].filter((id) => id > 0);
    if (pids.length === 0) return;
    try {
      const numerosRows = await db
        .select({ numero: pedidos.numero })
        .from(pedidos)
        .where(and(eq(pedidos.tenantId, TENANT), inArray(pedidos.id, pids)));
      const numeros = numerosRows.map((r) => r.numero).filter((n) => n > 0);

      await db.delete(pendencias).where(inArray(pendencias.pedidoId, pids));
      if (numeros.length > 0) {
        await db
          .delete(contasReceber)
          .where(and(eq(contasReceber.tenantId, TENANT), inArray(contasReceber.pedidoNumero, numeros)));
      }
      await db.delete(pedidos).where(and(eq(pedidos.tenantId, TENANT), inArray(pedidos.id, pids)));
    } catch {
      /* melhor esforço */
    }

    try {
      await db.delete(clienteVendedores).where(inArray(clienteVendedores.clienteId, [clienteAId, clienteBId]));
      await db
        .delete(clientes)
        .where(and(eq(clientes.tenantId, TENANT), inArray(clientes.id, [clienteAId, clienteBId])));
      await db
        .delete(vendedores)
        .where(and(eq(vendedores.tenantId, TENANT), inArray(vendedores.id, [vendedorAId, vendedorBId])));
      await db.delete(users).where(and(eq(users.tenantId, TENANT), inArray(users.id, [userAId, userBId])));
    } catch {
      /* melhor esforço */
    }
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
      });
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

  it("erros: payload inválido → exceção controlada", async () => {
    await expect(
      createPedidoSafe(TENANT, {
        vendedorId: vendedorAId,
        clienteId: clienteAId,
        subtotal: "1",
        desconto: "0",
        frete: "0",
        total: "1",
        itens: [],
      })
    ).rejects.toThrow(/pelo menos um item|item/i);

    await expect(
      createPedidoSafe(TENANT, {
        vendedorId: vendedorAId,
        subtotal: "1",
        desconto: "0",
        frete: "0",
        total: "1",
        itens: [{ tipo: "LIVRE", descricao: "x", quantidade: 1, valorUnitario: 1, custo: 0 }],
      } as Parameters<typeof createPedidoSafe>[1])
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
      })
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
      });
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
