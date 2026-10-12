/**
 * Testes de integração REAL (banco conectado) — regras de negócio em services/modules.
 *
 * Requer DATABASE_URL válido. Opcional: TEST_CORE_TENANT_ID (default 99001).
 * Para pular: `RUN_REAL_CORE_TESTS=0 pnpm vitest run server/services/core-business-real.test.ts`
 *
 * Não altera infra/middleware/auth — apenas chama serviços.
 */
import { describe, expect } from "vitest";
import { eq, and, inArray, gte, sql } from "drizzle-orm";
import { getDb, getInsertId } from "../db/index.js";
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
} from "../../drizzle/schema.js";
import * as inventoryService from "./inventory.service.js";
import * as clientesService from "./clientes.service.js";
import {
  createPedidoSafe,
  deletePedido,
  getPedidoById,
  updatePedidoStatus,
} from "./orders.service.js";
import * as financeService from "./finance.service.js";
import { PedidoStatus } from "../shared/domain-status.js";
import { BoletoStatus } from "../shared/domain-status.js";
import { nanoid } from "nanoid";
import { ADMIN_ACTOR } from "../_core/service-actor.js";
import { ValidationError } from "../_core/errors/app-error.js";
import {
  beforeAllWithServiceContext,
  afterAllWithServiceContext,
  itWithServiceContext,
} from "../tests/integration/service-context-harness.js";
import { ensureTenantExists } from "../tests/integration/helpers/tenant.helper.js";

const RUN = process.env.RUN_REAL_CORE_TESTS !== "0" && process.env.RUN_REAL_CORE_TESTS !== "false";
const TENANT_ID = Number(process.env.TEST_CORE_TENANT_ID || 99001);

let testStart = new Date(0);
let vendedorId = 0;
let produtoId = 0;
let clienteBaseId = 0;
/** Estoque inicial do produto de teste (ajustado no beforeAll). */
let estoqueInicial = 0;

async function seedVendedor(): Promise<number> {
  const db = await getDb();
  if (!db) throw new ValidationError("no db");
  const r = await db.insert(vendedores).values({
    tenantId: TENANT_ID,
    nome: `CoreTest Vendedor ${nanoid(6)}`,
    ativo: true,
    admin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const id = getInsertId(r);
  if (!id) throw new ValidationError("vendedor id");
  return id;
}

describe.skipIf(!RUN)("CORE: negócio real (DB)", () => {
  beforeAllWithServiceContext(async () => {
    testStart = new Date();

    const db = await getDb();
    if (!db) throw new ValidationError("no db");
    await ensureTenantExists(db, TENANT_ID);

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
    expect(c.success, c.error).toBe(true);
    const cId = c.data?.id ?? 0;
    expect(cId).toBeGreaterThan(0);
    clienteBaseId = cId;
  });

  afterAllWithServiceContext(async () => {
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

  itWithServiceContext("1) Idempotência: 10 requests paralelos com MESMO payload → 1 pedido criado", async () => {

    const input = buildPedidoInput(clienteBaseId, `551199999${nanoid(4)}`);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => createPedidoSafe(TENANT_ID, input, ADMIN_ACTOR, vendedorId))
    );

    const ok = results.filter((r) => r.success && r.pedidoId > 0);
    const dup = results.filter((r) => !r.success && r.pedidoId === 0);

    expect(ok.length).toBe(1);
    expect(dup.length).toBe(9);

    const db = await getDb();
    if (!db) throw new ValidationError("db");
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
    if (!db2) throw new ValidationError("db");
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

  itWithServiceContext("2) Concorrência: 10 pedidos distintos (clientes diferentes) em paralelo — estoque não fica negativo", async () => {

    const db = await getDb();
    if (!db) throw new ValidationError("db");

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
      expect(c.success, c.error).toBe(true);
      const cId = c.data?.id ?? 0;
      expect(cId).toBeGreaterThan(0);
      clientesIds.push(cId);
    }
    
    const inputs = clientesIds.map((cid) => buildPedidoInput(cid, `55${nanoid(11)}`));
    const results = await Promise.all(inputs.map((inp) => createPedidoSafe(TENANT_ID, inp, ADMIN_ACTOR, vendedorId)));

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

  itWithServiceContext("3) Financeiro: baixa parcial de boleto em paralelo — estado final consistente (valorAberto 0)", async () => {

    const db = await getDb();
    if (!db) throw new ValidationError("db");

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
    const pedidoPk = getInsertId(ins);
    if (!pedidoPk) throw new ValidationError("pedido");

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
    const boletoId = getInsertId(bIns);
    if (!boletoId) throw new ValidationError("boleto");

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

  itWithServiceContext("4) Consistência: criar → atualizar status → excluir — pedido some do DB", async () => {


    const c = await clientesService.createCliente(TENANT_ID, {
      nome: "CRUD",
      telefone: `55119${String(Date.now()).slice(-8)}${nanoid(3)}`,
    });
    expect(c.success, c.error).toBe(true);
    const cId = c.data?.id ?? 0;
    expect(cId).toBeGreaterThan(0);

    const created = await createPedidoSafe(TENANT_ID, buildPedidoInput(cId, `55${nanoid(11)}`), ADMIN_ACTOR, vendedorId);
    expect(created.success).toBe(true);
    const pid = created.pedidoId;

    await updatePedidoStatus(TENANT_ID, pid, PedidoStatus.CONFERIDO);
    const mid = await getPedidoById(TENANT_ID, pid);
    expect(mid?.status).toBe(PedidoStatus.CONFERIDO);

    await deletePedido(TENANT_ID, ADMIN_ACTOR, pid);
    const end = await getPedidoById(TENANT_ID, pid);
    expect(end).toBeNull();

    const db = await getDb();
    if (!db) throw new ValidationError("db");
    await db.delete(clientes).where(eq(clientes.id, cId));
  });

  itWithServiceContext("5) Edge: pedido sem itens falha explicitamente", async () => {

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
      }, ADMIN_ACTOR)
    ).rejects.toThrow();
  });

  itWithServiceContext("6) Edge: status inválido não passa silenciosamente", async () => {

    const created = await createPedidoSafe(
      TENANT_ID,
      buildPedidoInput(clienteBaseId, `55119${nanoid(10)}`, "77.50"),
      ADMIN_ACTOR,
      vendedorId
    );
    expect(created.success).toBe(true);

    await expect(updatePedidoStatus(TENANT_ID, created.pedidoId, "STATUS_INEXISTENTE_XYZ")).rejects.toThrow();

    await deletePedido(TENANT_ID, ADMIN_ACTOR, created.pedidoId);
  });
}, 120_000);
