/**
 * P28D3 — setVendedorPrincipal: troca administrativa do vendedor principal
 * de um cliente existente. Prova real de persistência:
 * - despromove o PRINCIPAL antigo para SECUNDARIO (preserva histórico)
 * - promove/upserta o novo vínculo como PRINCIPAL
 * - invariante: no máx. 1 PRINCIPAL por cliente
 * - bloqueia cross-tenant (cliente e vendedor)
 * - preserva createdAt de vínculo existente na promoção
 *
 * Nota de acesso: a procedure clientes.setVendedorPrincipal é adminProcedure
 * no router — vendedor comum não tem caminho para acionar a troca (gate tRPC).
 */
import { describe, expect } from "vitest";
import { eq, and } from "drizzle-orm";
import {
  afterAllWithServiceContext,
  beforeAllWithServiceContext,
  itWithServiceContext,
} from "./integration/service-context-harness.js";
import { ensureTenantExists } from "./integration/helpers/tenant.helper.js";
import { getDb, getInsertId, clientes, clienteVendedores, vendedores } from "../db/core.js";
import * as clientesService from "../services/clientes.service.js";

const TENANT = 9092;
const TENANT_B = 9093;

describe("P28D3 — troca de vendedor principal de cliente existente", () => {
  let vendAId = 0;
  let vendBId = 0;
  let vendXId = 0; // vendedor de outro tenant
  let clienteId = 0; // cliente com PRINCIPAL A → será trocado para B
  let cliente2Id = 0; // cliente com vínculo SECUNDARIO A → A será promovido
  let clienteBId = 0; // cliente de outro tenant

  beforeAllWithServiceContext(async () => {
    const dbConn = await getDb();
    if (!dbConn) throw new Error("DB indisponível para teste P28D3");
    await ensureTenantExists(dbConn, TENANT);
    await ensureTenantExists(dbConn, TENANT_B);

    // Limpeza de restos de execuções anteriores (FK-safe: vínculos → clientes → vendedores)
    await dbConn.delete(clienteVendedores).where(eq(clienteVendedores.tenantId, TENANT));
    await dbConn.delete(clienteVendedores).where(eq(clienteVendedores.tenantId, TENANT_B));
    // clientes/vendedores têm cascade em clienteVendedores; removemos só os dados de teste por nome
    await dbConn.delete(clientes).where(and(eq(clientes.tenantId, TENANT), eq(clientes.nome, "Cliente P28D3 Swap")));
    await dbConn.delete(clientes).where(and(eq(clientes.tenantId, TENANT), eq(clientes.nome, "Cliente P28D3 Sec")));
    await dbConn.delete(clientes).where(and(eq(clientes.tenantId, TENANT_B), eq(clientes.nome, "Cliente P28D3 B")));
    await dbConn.delete(vendedores).where(and(eq(vendedores.tenantId, TENANT), eq(vendedores.nome, "Vend P28D3 A")));
    await dbConn.delete(vendedores).where(and(eq(vendedores.tenantId, TENANT), eq(vendedores.nome, "Vend P28D3 B")));
    await dbConn.delete(vendedores).where(and(eq(vendedores.tenantId, TENANT_B), eq(vendedores.nome, "Vend P28D3 X")));

    const insA = await dbConn.insert(vendedores).values({
      tenantId: TENANT,
      nome: "Vend P28D3 A",
      ativo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vendAId = getInsertId(insA as never);
    const insB = await dbConn.insert(vendedores).values({
      tenantId: TENANT,
      nome: "Vend P28D3 B",
      ativo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vendBId = getInsertId(insB as never);
    const insX = await dbConn.insert(vendedores).values({
      tenantId: TENANT_B,
      nome: "Vend P28D3 X",
      ativo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vendXId = getInsertId(insX as never);
    if (!vendAId || !vendBId || !vendXId) throw new Error("Falha insert vendedores P28D3");

    const c1 = await clientesService.createCliente(TENANT, { nome: "Cliente P28D3 Swap", telefone: "61997000001" });
    clienteId = c1.data?.id ?? 0;
    const c2 = await clientesService.createCliente(TENANT, { nome: "Cliente P28D3 Sec", telefone: "61997000002" });
    cliente2Id = c2.data?.id ?? 0;
    const cB = await clientesService.createCliente(TENANT_B, { nome: "Cliente P28D3 B", telefone: "61997000003" });
    clienteBId = cB.data?.id ?? 0;
    if (!clienteId || !cliente2Id || !clienteBId) throw new Error("Falha create clientes P28D3");

    // Vínculos iniciais: cliente -> A PRINCIPAL; cliente2 -> A SECUNDARIO
    await dbConn.insert(clienteVendedores).values({
      tenantId: TENANT,
      clienteId,
      vendedorId: vendAId,
      tipo: "PRINCIPAL",
      createdAt: new Date("2024-01-01T00:00:00Z"),
    });
    await dbConn.insert(clienteVendedores).values({
      tenantId: TENANT,
      clienteId: cliente2Id,
      vendedorId: vendAId,
      tipo: "SECUNDARIO",
      createdAt: new Date("2024-02-02T00:00:00Z"),
    });
    // Vínculo do outro tenant (sentinela para prova de isolamento)
    await dbConn.insert(clienteVendedores).values({
      tenantId: TENANT_B,
      clienteId: clienteBId,
      vendedorId: vendXId,
      tipo: "PRINCIPAL",
      createdAt: new Date("2024-03-03T00:00:00Z"),
    });
  });

  afterAllWithServiceContext(async () => {
    const dbConn = await getDb();
    if (!dbConn) return;
    await dbConn.delete(clienteVendedores).where(eq(clienteVendedores.tenantId, TENANT));
    await dbConn.delete(clienteVendedores).where(eq(clienteVendedores.tenantId, TENANT_B));
    await dbConn.delete(clientes).where(and(eq(clientes.tenantId, TENANT), eq(clientes.nome, "Cliente P28D3 Swap")));
    await dbConn.delete(clientes).where(and(eq(clientes.tenantId, TENANT), eq(clientes.nome, "Cliente P28D3 Sec")));
    await dbConn.delete(clientes).where(and(eq(clientes.tenantId, TENANT_B), eq(clientes.nome, "Cliente P28D3 B")));
    await dbConn.delete(vendedores).where(and(eq(vendedores.tenantId, TENANT), eq(vendedores.nome, "Vend P28D3 A")));
    await dbConn.delete(vendedores).where(and(eq(vendedores.tenantId, TENANT), eq(vendedores.nome, "Vend P28D3 B")));
    await dbConn.delete(vendedores).where(and(eq(vendedores.tenantId, TENANT_B), eq(vendedores.nome, "Vend P28D3 X")));
  });

  itWithServiceContext("idempotente: redefinir o mesmo principal não cria segundo PRINCIPAL", async () => {
    const res = await clientesService.setVendedorPrincipal(TENANT, clienteId, vendAId);
    expect(res.success).toBe(true);

    const dbConn = await getDb();
    const links = await dbConn!.select().from(clienteVendedores)
      .where(and(eq(clienteVendedores.tenantId, TENANT), eq(clienteVendedores.clienteId, clienteId)));
    expect(links.length).toBe(1);
    expect(links[0].vendedorId).toBe(vendAId);
    expect(links[0].tipo).toBe("PRINCIPAL");
    // createdAt do vínculo existente não foi reescrito
    expect(new Date(links[0].createdAt).getTime()).toBe(new Date("2024-01-01T00:00:00Z").getTime());
  });

  itWithServiceContext("troca A→B: antigo vira SECUNDARIO e novo vira PRINCIPAL (histórico preservado)", async () => {
    const res = await clientesService.setVendedorPrincipal(TENANT, clienteId, vendBId);
    expect(res.success).toBe(true);

    const dbConn = await getDb();
    const links = await dbConn!.select().from(clienteVendedores)
      .where(and(eq(clienteVendedores.tenantId, TENANT), eq(clienteVendedores.clienteId, clienteId)));
    expect(links.length).toBe(2);

    const principal = links.filter((l) => l.tipo === "PRINCIPAL");
    expect(principal.length).toBe(1); // invariante: exatamente 1 PRINCIPAL
    expect(principal[0].vendedorId).toBe(vendBId);

    const antigo = links.find((l) => l.vendedorId === vendAId);
    expect(antigo?.tipo).toBe("SECUNDARIO"); // histórico preservado, não deletado
    expect(new Date(antigo!.createdAt).getTime()).toBe(new Date("2024-01-01T00:00:00Z").getTime());
  });

  itWithServiceContext("promover SECUNDARIO existente: upsert sem duplicar vínculo", async () => {
    const res = await clientesService.setVendedorPrincipal(TENANT, cliente2Id, vendAId);
    expect(res.success).toBe(true);

    const dbConn = await getDb();
    const links = await dbConn!.select().from(clienteVendedores)
      .where(and(eq(clienteVendedores.tenantId, TENANT), eq(clienteVendedores.clienteId, cliente2Id)));
    expect(links.length).toBe(1); // sem duplicata (unique cliente+vendedor)
    expect(links[0].tipo).toBe("PRINCIPAL");
    expect(links[0].vendedorId).toBe(vendAId);
    expect(new Date(links[0].createdAt).getTime()).toBe(new Date("2024-02-02T00:00:00Z").getTime());
  });

  itWithServiceContext("getVendedorPrincipalDoCliente confirma o novo principal", async () => {
    const res = await clientesService.getVendedorPrincipalDoCliente(TENANT, clienteId);
    expect(res.success).toBe(true);
    expect(res.data?.vendedorId).toBe(vendBId);
    expect(res.data?.vendedorNome).toBe("Vend P28D3 B");
  });

  itWithServiceContext("vendedor de outro tenant é rejeitado", async () => {
    const res = await clientesService.setVendedorPrincipal(TENANT, clienteId, vendXId);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/vendedor/i);

    // Estado inalterado: B continua PRINCIPAL, nenhum vínculo com X criado
    const dbConn = await getDb();
    const links = await dbConn!.select().from(clienteVendedores)
      .where(and(eq(clienteVendedores.tenantId, TENANT), eq(clienteVendedores.clienteId, clienteId)));
    expect(links.filter((l) => l.tipo === "PRINCIPAL").length).toBe(1);
    expect(links.some((l) => l.vendedorId === vendXId)).toBe(false);
  });

  itWithServiceContext("cliente de outro tenant é rejeitado e vínculos do outro tenant intactos", async () => {
    const res = await clientesService.setVendedorPrincipal(TENANT, clienteBId, vendAId);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/cliente/i);

    // Sentinela do tenant B intacta
    const dbConn = await getDb();
    const linksB = await dbConn!.select().from(clienteVendedores)
      .where(and(eq(clienteVendedores.tenantId, TENANT_B), eq(clienteVendedores.clienteId, clienteBId)));
    expect(linksB.length).toBe(1);
    expect(linksB[0].vendedorId).toBe(vendXId);
    expect(linksB[0].tipo).toBe("PRINCIPAL");
  });

  itWithServiceContext("cross-tenant inverso: vendedor de A não pode virar principal no tenant B", async () => {
    const res = await clientesService.setVendedorPrincipal(TENANT_B, clienteBId, vendAId);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/vendedor/i);
  });

  itWithServiceContext("ids inválidos são rejeitados", async () => {
    expect((await clientesService.setVendedorPrincipal(0, clienteId, vendAId)).success).toBe(false);
    expect((await clientesService.setVendedorPrincipal(TENANT, 0, vendAId)).success).toBe(false);
    expect((await clientesService.setVendedorPrincipal(TENANT, clienteId, 0)).success).toBe(false);
  });
});
