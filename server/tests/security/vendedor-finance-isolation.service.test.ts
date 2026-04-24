/**
 * Prova: vendedor B não vê contas a receber / resumo financeiro do vendedor A (mesmo tenant).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { getDb, getInsertId, contasReceber, vendedores } from "../../db/core.js";
import * as financeService from "../../services/finance.service.js";
import { ADMIN_ACTOR } from "../../_core/service-actor.js";
import { ContaReceberStatus } from "../../shared/domain-status.js";

describe("Isolamento financeiro vendedor A vs B (finance.service)", () => {
  const TENANT = 9191;
  let vendedorAId: number;
  let vendedorBId: number;
  let contaAId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB indisponível para teste de isolamento");

    await db.delete(contasReceber).where(eq(contasReceber.tenantId, TENANT));
    await db.delete(vendedores).where(eq(vendedores.tenantId, TENANT));

    const ra = await db.insert(vendedores).values({
      tenantId: TENANT,
      nome: "Vendedor A Fin",
      admin: false,
      ativo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const rb = await db.insert(vendedores).values({
      tenantId: TENANT,
      nome: "Vendedor B Fin",
      admin: false,
      ativo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vendedorAId = getInsertId(ra);
    vendedorBId = getInsertId(rb);

    const dv = new Date();
    dv.setDate(dv.getDate() + 10);

    const ins = await db.insert(contasReceber).values({
      tenantId: TENANT,
      clienteNome: "Cliente A",
      vendedorId: vendedorAId,
      descricao: "Conta isolamento A",
      valor: "500.00",
      dataVencimento: dv,
      status: ContaReceberStatus.PENDENTE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    contaAId = getInsertId(ins);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(contasReceber).where(and(eq(contasReceber.tenantId, TENANT), eq(contasReceber.id, contaAId)));
    await db.delete(vendedores).where(eq(vendedores.id, vendedorAId));
    await db.delete(vendedores).where(eq(vendedores.id, vendedorBId));
  });

  it("vendedor B: listContasReceber não inclui conta de A", async () => {
    const actorB = { role: "vendedor" as const, vendedorId: vendedorBId };
    const { items } = await financeService.listContasReceber(TENANT, actorB, {});
    expect(items.some((c) => c.id === contaAId)).toBe(false);
  });

  it("vendedor B: getResumoFinanceiro não soma conta de A (aReceber)", async () => {
    const actorB = { role: "vendedor" as const, vendedorId: vendedorBId };
    const r = await financeService.getResumoFinanceiro(TENANT, actorB);
    expect(r.aReceber).toBe(0);
    expect(r.aPagar).toBe(0);
  });

  it("admin: listContasReceber vê a conta", async () => {
    const { items } = await financeService.listContasReceber(TENANT, ADMIN_ACTOR, {});
    expect(items.some((c) => c.id === contaAId)).toBe(true);
  });

  it("admin: getResumoFinanceiro inclui valor da conta", async () => {
    const r = await financeService.getResumoFinanceiro(TENANT, ADMIN_ACTOR);
    expect(r.aReceber).toBeGreaterThanOrEqual(500);
  });
});
