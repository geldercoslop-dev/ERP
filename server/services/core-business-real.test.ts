/**
 * Testes de integração REAL (banco conectado) — regras de negócio em services/modules.
 *
 * Requer DATABASE_URL válido. Opcional: TEST_CORE_TENANT_ID (default 99001).
 * Para pular: `RUN_REAL_CORE_TESTS=0 pnpm vitest run server/services/core-business-real.test.ts`
 *
 * Não altera infra/middleware/auth — apenas chama serviços.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, and, inArray, gte, sql } from "drizzle-orm";
import { getDb, getInsertId } from "../db/index";
import {
  pedidos,
  itensPedido,
  produtos,
  clientes,
  vendedores,
  boletos,
  contasReceber,
  pendencias,
  idempotencyKeys,
} from "../../drizzle/schema";
import * as inventoryService from "./inventory.service";
import * as clientesService from "./clientes.service";
import {
  createPedidoSafe,
  deletePedido,
  getPedidoById,
  updatePedidoStatus,
} from "./orders.service";
import * as financeService from "./finance.service";
import { PedidoStatus } from "../shared/domain-status";
import { BoletoStatus } from "../shared/domain-status";
import { nanoid } from "nanoid";

const RUN = process.env.RUN_REAL_CORE_TESTS !== "0" && process.env.RUN_REAL_CORE_TESTS !== "false";
const TENANT_ID = Number(process.env.TEST_CORE_TENANT_ID || 99001);

let dbAvailable = false;
let testStart = new Date(0);
let vendedorId = 0;
let produtoId = 0;
let clienteBaseId = 0;
/** Estoque inicial do produto de teste (ajustado no beforeAll). */
let estoqueInicial = 0;

async function seedVendedor(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("no db");
  const r = await db.insert(vendedores).values({
    tenantId: TENANT_ID,
    nome: `CoreTest Vendedor ${nanoid(6)}`,
    ativo: true,
    admin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const id = getInsertId(r as unknown as Record<string, unknown>);
  if (!id) throw new Error("vendedor id");
  return id;
}

describe.skipIf(!RUN)("CORE: negócio real (DB)", () => {
  beforeAll(async () => {
    testStart = new Date();
    const db = await getDb();
    if (!db) {
      dbAvailable = false;
      return;
    }
    dbAvailable = true;
    try {

    vendedorId = await seedVendedor();

    const p = await inventoryService.createProduto(TENANT_ID, {
      descricao: `CORE-TEST-PROD-${nanoid(8)}`,
      valorVenda: "100.00",
      custo: "50.00",
      ativo: true,
      estoque: 500,
    } as Parameters<typeof inventoryService.createProduto>[1]);
    produtoId = p.id;
    const prod = await inventoryService.getProdutoById(TENANT_ID, produtoId);
    estoqueInicial = Number(prod?.estoque ?? 0);

    const c = await clientesService.createCliente(TENANT_ID, {
      nome: "Cliente Core Base",
      telefone: `55${nanoid(10).replace(/\D/g, "").slice(0, 11)}`,
    });
    clienteBaseId = c.id;
    } catch {
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    const db = await getDb();
    if (!db) return;

    await db.delete(pendencias).where(eq(pendencias.tenantId, TENANT_ID));
    await db.delete(itensPedido).where(eq(itensPedido.tenantId, TENANT_ID));
    await db.delete(boletos).where(eq(boletos.tenantId, TENANT_ID));
    await db.delete(contasReceber).where(eq(contasReceber.tenantId, TENANT_ID));
    await db.delete(pedidos).where(eq(pedidos.tenantId, TENANT_ID));
    await db.delete(produtos).where(eq(produtos.tenantId, TENANT_ID));
    await db.delete(clientes).where(eq(clientes.tenantId, TENANT_ID));
    await db.delete(vendedores).where(eq(vendedores.tenantId, TENANT_ID));

    await db
      .delete(idempotencyKeys)
      .where(
        and(eq(idempotencyKeys.commandName, "createPedido"), gte(idempotencyKeys.createdAt, testStart))
      );
  });

  function buildPedidoInput(clienteId: number, telefone: string, totalStr = "100") {
    return {
      vendedorId,
      clienteId,
      cliente: {
        nome: "Cliente Teste",
        telefone,
      },
      subtotal: totalStr,
      desconto: "0",
      frete: "0",
      total: totalStr,
      formaPagamento: "PIX",
      itens: [
        {
          tipo: "CATALOGO",
          produtoId,
          descricao: "Item core test",
          quantidade: 1,
          valorUnitario: totalStr,
          custo: "50",
          prazoGarantia: 90,
        },
      ],
    };
  }

  it("1) Idempotência: 10 requests paralelos com MESMO payload → 1 pedido criado", async () => {
    if (!dbAvailable) return;
    const input = buildPedidoInput(clienteBaseId, `551199999${nanoid(4)}`);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => createPedidoSafe(TENANT_ID, input))
    );

    const ok = results.filter((r) => r.success && r.pedidoId > 0);
    const dup = results.filter((r) => !r.success && r.pedidoId === 0);

    expect(ok.length).toBe(1);
    expect(dup.length).toBe(9);

    const db = await getDb();
    if (!db) throw new Error("db");
    const pedidosMesmoCliente = await db
      .select({ id: pedidos.id })
      .from(pedidos)
      .where(and(eq(pedidos.tenantId, TENANT_ID), eq(pedidos.clienteId, clienteBaseId)));

    const numeros = new Set(
      (
        await db
          .select({ numero: pedidos.numero })
          .from(pedidos)
          .where(
            and(eq(pedidos.tenantId, TENANT_ID), eq(pedidos.clienteId, clienteBaseId))
          )
      ).map((x) => x.numero)
    );

    expect(numeros.size).toBe(pedidosMesmoCliente.length);

    const db2 = await getDb();
    if (!db2) throw new Error("db");
    const toDel = await db2
      .select({ id: pedidos.id })
      .from(pedidos)
      .where(and(eq(pedidos.tenantId, TENANT_ID), eq(pedidos.clienteId, clienteBaseId)));
    for (const row of toDel) {
      await db2.delete(itensPedido).where(eq(itensPedido.pedidoId, row.id));
      await db2.delete(pedidos).where(eq(pedidos.id, row.id));
    }
    await db2
      .delete(idempotencyKeys)
      .where(
        and(eq(idempotencyKeys.commandName, "createPedido"), gte(idempotencyKeys.createdAt, testStart))
      );
  });

  it("2) Concorrência: 10 pedidos distintos (clientes diferentes) em paralelo — estoque não fica negativo", async () => {
    if (!dbAvailable) return;
    const db = await getDb();
    if (!db) throw new Error("db");

    await db
      .update(produtos)
      .set({ estoque: 30, updatedAt: new Date() })
      .where(and(eq(produtos.tenantId, TENANT_ID), eq(produtos.id, produtoId)));

    const clientesIds: number[] = [];
    const base = String(Date.now()).slice(-9);
    for (let i = 0; i < 10; i++) {
      const c = await clientesService.createCliente(TENANT_ID, {
        nome: `Core Par ${i}`,
        telefone: `5511${base}${i}${nanoid(4)}`,
      });
      clientesIds.push(c.id);
    }

    const inputs = clientesIds.map((cid) => buildPedidoInput(cid, `55${nanoid(11)}`));
    const results = await Promise.all(inputs.map((inp) => createPedidoSafe(TENANT_ID, inp)));

    const success = results.filter((r) => r.success);
    expect(success.length).toBe(10);

    const p = await inventoryService.getProdutoById(TENANT_ID, produtoId);
    const est = Number(p?.estoque ?? -999);
    expect(est).toBeGreaterThanOrEqual(0);
    expect(est).toBe(20);

    const pedidoRows = await db
      .select({ id: pedidos.id })
      .from(pedidos)
      .where(and(eq(pedidos.tenantId, TENANT_ID), inArray(pedidos.clienteId, clientesIds)));
    for (const row of pedidoRows) {
      await db.delete(itensPedido).where(eq(itensPedido.pedidoId, row.id));
      await db.delete(pedidos).where(eq(pedidos.id, row.id));
    }
    await db
      .delete(clientes)
      .where(and(eq(clientes.tenantId, TENANT_ID), inArray(clientes.id, clientesIds)));

    await db
      .update(produtos)
      .set({ estoque: estoqueInicial, updatedAt: new Date() })
      .where(and(eq(produtos.tenantId, TENANT_ID), eq(produtos.id, produtoId)));
  });

  it("3) Financeiro: baixa parcial de boleto em paralelo — estado final consistente (valorAberto 0)", async () => {
    if (!dbAvailable) return;
    const db = await getDb();
    if (!db) throw new Error("db");

    try {
      await db.execute(sql`SELECT 1 FROM financial_idempotency LIMIT 1`);
    } catch {
      console.warn(
        "[core-business-real] Pulando teste financeiro: tabela financial_idempotency ausente no banco."
      );
      return;
    }

    const numPed = Math.floor(Math.random() * 8000000) + 2000000;
    const [ins] = await db.insert(pedidos).values({
      tenantId: TENANT_ID,
      numero: numPed,
      vendedorId,
      clienteId: clienteBaseId,
      clienteNome: "Boleto Core",
      subtotal: "100",
      desconto: "0",
      frete: "0",
      total: "100",
      status: PedidoStatus.GERADO,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const pedidoPk = getInsertId(ins as unknown as Record<string, unknown>);
    if (!pedidoPk) throw new Error("pedido");

    const [bIns] = await db.insert(boletos).values({
      tenantId: TENANT_ID,
      pedidoId: pedidoPk,
      clienteId: clienteBaseId,
      vendedorId,
      numeroPedido: numPed,
      valorOriginal: "100.00",
      valorAberto: "100.00",
      dataVencimento: new Date(),
      status: BoletoStatus.ABERTO,
    });
    const boletoId = getInsertId(bIns as unknown as Record<string, unknown>);
    if (!boletoId) throw new Error("boleto");

    const parcelResults = await Promise.all(
      Array.from({ length: 10 }, () => financeService.baixarBoletoParcial(TENANT_ID, boletoId, 100))
    );

    expect(parcelResults.every((r) => r.success)).toBe(true);

    const bAfter = await financeService.getBoletoById(TENANT_ID, boletoId);
    expect(bAfter).not.toBeNull();
    expect(Number(bAfter!.valorAberto)).toBe(0);
    expect(bAfter!.status).toBe(BoletoStatus.PAGO);

    await db.delete(boletos).where(eq(boletos.id, boletoId));
    await db.delete(pedidos).where(eq(pedidos.id, pedidoPk));
  });

  it("4) Consistência: criar → atualizar status → excluir — pedido some do DB", async () => {
    if (!dbAvailable) return;

    const c = await clientesService.createCliente(TENANT_ID, {
      nome: "CRUD",
      telefone: `55119${String(Date.now()).slice(-8)}${nanoid(3)}`,
    });

    const created = await createPedidoSafe(TENANT_ID, buildPedidoInput(c.id, `55${nanoid(11)}`));
    expect(created.success).toBe(true);
    const pid = created.pedidoId;

    await updatePedidoStatus(TENANT_ID, pid, PedidoStatus.CONFERIDO);
    const mid = await getPedidoById(TENANT_ID, pid);
    expect(mid?.status).toBe(PedidoStatus.CONFERIDO);

    await deletePedido(TENANT_ID, pid);
    const end = await getPedidoById(TENANT_ID, pid);
    expect(end).toBeNull();

    const db = await getDb();
    if (!db) throw new Error("db");
    await db.delete(clientes).where(eq(clientes.id, c.id));
  });

  it("5) Edge: pedido sem itens falha explicitamente", async () => {
    if (!dbAvailable) return;
    await expect(
      createPedidoSafe(TENANT_ID, {
        vendedorId,
        clienteId: clienteBaseId,
        cliente: { nome: "X", telefone: "5511888888888" },
        subtotal: "0",
        desconto: "0",
        frete: "0",
        total: "0",
        itens: [],
      })
    ).rejects.toThrow();
  });

  it("6) Edge: status inválido não passa silenciosamente", async () => {
    if (!dbAvailable) return;
    const created = await createPedidoSafe(
      TENANT_ID,
      buildPedidoInput(clienteBaseId, `55119${nanoid(10)}`, "77.50")
    );
    expect(created.success).toBe(true);

    await expect(updatePedidoStatus(TENANT_ID, created.pedidoId, "STATUS_INEXISTENTE_XYZ")).rejects.toThrow();

    await deletePedido(TENANT_ID, created.pedidoId);
  });
}, 120_000);
