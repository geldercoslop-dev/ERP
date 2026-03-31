/**
 * Prova: vendedor B não lê cliente exclusivo do vendedor A (mesmo tenant).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { getDb, getInsertId, clientes, clienteVendedores, vendedores } from "../../db/core.js";
import * as clientesService from "../../services/clientes.service.js";
import { ADMIN_ACTOR } from "../../_core/service-actor.js";

describe("Isolamento vendedor A vs B (clientes.service)", () => {
  const TENANT = 9090;
  let vendedorAId: number;
  let vendedorBId: number;
  let clienteSoloId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB indisponível para teste de isolamento");

    await db.delete(clientes).where(eq(clientes.tenantId, TENANT));
    await db.delete(vendedores).where(eq(vendedores.tenantId, TENANT));

    const ra = await db.insert(vendedores).values({
      tenantId: TENANT,
      nome: "Vendedor A Iso",
      admin: false,
      ativo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const rb = await db.insert(vendedores).values({
      tenantId: TENANT,
      nome: "Vendedor B Iso",
      admin: false,
      ativo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vendedorAId = getInsertId(ra as unknown as Record<string, unknown>);
    vendedorBId = getInsertId(rb as unknown as Record<string, unknown>);

    const created = await clientesService.createCliente(TENANT, {
      nome: "Cliente Só A",
      telefone: "61999990001",
    });
    clienteSoloId = created.id;

    await db.insert(clienteVendedores).values({
      clienteId: clienteSoloId,
      vendedorId: vendedorAId,
      tipo: "PRINCIPAL",
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(clienteVendedores).where(
      and(eq(clienteVendedores.clienteId, clienteSoloId), eq(clienteVendedores.vendedorId, vendedorAId))
    );
    await db.delete(clientes).where(eq(clientes.id, clienteSoloId));
    await db.delete(vendedores).where(eq(vendedores.id, vendedorAId));
    await db.delete(vendedores).where(eq(vendedores.id, vendedorBId));
  });

  it("vendedor B: getClienteById retorna null", async () => {
    const actorB = { role: "vendedor" as const, vendedorId: vendedorBId };
    const row = await clientesService.getClienteById(TENANT, actorB, clienteSoloId);
    expect(row).toBeNull();
  });

  it("vendedor B: searchClientesByNome não retorna cliente de A", async () => {
    const actorB = { role: "vendedor" as const, vendedorId: vendedorBId };
    const found = await clientesService.searchClientesByNome(TENANT, actorB, "Cliente Só", 20);
    expect(found.some((c) => c.id === clienteSoloId)).toBe(false);
  });

  it("admin: ainda vê o cliente", async () => {
    const row = await clientesService.getClienteById(TENANT, ADMIN_ACTOR, clienteSoloId);
    expect(row).not.toBeNull();
    expect(row?.id).toBe(clienteSoloId);
  });
});
