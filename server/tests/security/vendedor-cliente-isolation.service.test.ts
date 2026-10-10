/**
 * Prova: vendedor B não lê cliente exclusivo do vendedor A (mesmo tenant).
 */
import { describe, expect } from "vitest";
import {
  afterAllWithServiceContext,
  beforeAllWithServiceContext,
  itWithServiceContext,
} from "../integration/service-context-harness.js";
import { eq, and } from "drizzle-orm";
import { getDb, getInsertId, clientes, clienteVendedores, vendedores } from "../../db/core.js";
import * as clientesService from "../../services/clientes.service.js";
import { ADMIN_ACTOR } from "../../_core/service-actor.js";

describe("Isolamento vendedor A vs B (clientes.service)", () => {
  const TENANT = 9090;
  let vendedorAId: number;
  let vendedorBId: number;
  let clienteSoloId: number;

  beforeAllWithServiceContext(async () => {
    const dbConn = await getDb();
    if (!dbConn) throw new Error("DB indisponível para teste de isolamento");

    await dbConn.delete(clientes).where(eq(clientes.tenantId, TENANT));
    await dbConn.delete(vendedores).where(eq(vendedores.tenantId, TENANT));

    const ra = await dbConn.insert(vendedores).values({
      tenantId: TENANT,
      nome: "Vendedor A Iso",
      admin: false,
      ativo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const rb = await dbConn.insert(vendedores).values({
      tenantId: TENANT,
      nome: "Vendedor B Iso",
      admin: false,
      ativo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vendedorAId = getInsertId(ra);
    vendedorBId = getInsertId(rb);

    const created = await clientesService.createCliente(TENANT, {
      nome: "Cliente Só A",
      telefone: "61999990001",
    });
    clienteSoloId = created.data?.id ?? 0;

    await dbConn.insert(clienteVendedores).values({
      tenantId: TENANT,
      clienteId: clienteSoloId,
      vendedorId: vendedorAId,
      tipo: "PRINCIPAL",
      createdAt: new Date(),
    });
  });

  afterAllWithServiceContext(async () => {
    const dbConn = await getDb();
    if (!dbConn) return;
    await dbConn.delete(clienteVendedores).where(
      and(eq(clienteVendedores.clienteId, clienteSoloId), eq(clienteVendedores.vendedorId, vendedorAId))
    );
    await dbConn.delete(clientes).where(eq(clientes.id, clienteSoloId));
    await dbConn.delete(vendedores).where(eq(vendedores.id, vendedorAId));
    await dbConn.delete(vendedores).where(eq(vendedores.id, vendedorBId));
  });

  itWithServiceContext("vendedor B: getClienteById retorna null", async () => {
    const actorB = { role: "vendedor" as const, vendedorId: vendedorBId };
    const row = await clientesService.getClienteById(TENANT, actorB, clienteSoloId);
    // getClienteById retorna { success, data? } — acesso negado vem como data: undefined
    expect(row.data ?? null).toBeNull();
  });

  itWithServiceContext("vendedor B: searchClientesByNome não retorna cliente de A", async () => {
    const actorB = { role: "vendedor" as const, vendedorId: vendedorBId };
    const found = await clientesService.searchClientesByNome(TENANT, actorB, "Cliente Só", 20);
    expect(found.data?.some((c: { id: number }) => c.id === clienteSoloId) ?? false).toBe(false);
  });

  itWithServiceContext("admin: ainda vê o cliente", async () => {
    const row = await clientesService.getClienteById(TENANT, ADMIN_ACTOR, clienteSoloId);
    expect(row.data).not.toBeNull();
    expect(row.data?.id).toBe(clienteSoloId);
  });
});
