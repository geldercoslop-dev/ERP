import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, getInsertId } from "../../../db/index.js";
import { ensureTenantExists } from "./tenant.helper.js";
import * as clientesService from "../../../services/clientes.service.js";
import * as skuService from "../../../services/sku.service.js";
import {
  clienteVendedores,
  clientes,
  contasReceber,
  cores,
  pendencias,
  pedidos,
  produtoSkus,
  produtos,
  users,
  vendedores,
} from "../../../../drizzle/schema.js";

type DbConn = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export interface SkuOrderScenarioOptions {
  scenarioLabel?: string;
  otherTenantId?: number;
  initialStock?: number;
}

export interface SkuOrderScenario {
  tenantId: number;
  otherTenantId: number;
  scenarioSuffix: string;
  idempotencyKeySeed: string;
  userId: number;
  vendedorId: number;
  clienteId: number;
  corId: number;
  corOtherId: number;
  produtoId: number;
  produtoOtherId: number;
  produtoOtherTenantId: number;
  skuAtivoId: number;
  skuInativoId: number;
  skuSemEstoqueId: number;
  skuOutroProdutoId: number;
  skuOutroTenantId: number;
  createdPedidoIds: number[];
  createdPedidoNumeros: number[];
}

export interface PendenciaScenarioRow {
  id: number;
  pedidoId: number;
  produtoId: number;
  skuId: number | null;
  quantidade: number;
  status: string;
}

function assertPositiveInt(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} obrigatório`);
  }
}

function parseErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildScenarioName(options?: SkuOrderScenarioOptions): string {
  const raw = (options?.scenarioLabel ?? "sku-order-flow").trim();
  if (!raw) return "sku-order-flow";
  return raw.toLowerCase().replace(/[^a-z0-9-_]/g, "-").slice(0, 24);
}

async function requireConn(): Promise<DbConn> {
  const conn = await getDb();
  if (!conn) throw new Error("Database connection failed");
  return conn;
}

export async function createSkuOrderScenario(
  tenantId: number,
  options?: SkuOrderScenarioOptions
): Promise<SkuOrderScenario> {
  assertPositiveInt(tenantId, "tenantId");
  const otherTenantId = options?.otherTenantId ?? tenantId + 1;
  assertPositiveInt(otherTenantId, "otherTenantId");

  const conn = await requireConn();
  const scenarioName = buildScenarioName(options);
  const suffix = nanoid(8).replace(/[^0-9a-z]/gi, "x");
  const initialStock = options?.initialStock ?? 100;

  // Pais em `tenants` antes de qualquer insert filho (fundação p/ FK futura)
  await ensureTenantExists(conn, tenantId);
  await ensureTenantExists(conn, otherTenantId);

  const userInsert = await conn.insert(users).values({
    tenantId,
    openId: `${scenarioName}-user-${suffix}`.slice(0, 64),
    name: `User ${scenarioName} ${suffix}`,
    role: "user",
  });
  const userId = getInsertId(userInsert);

  const vendedorInsert = await conn.insert(vendedores).values({
    tenantId,
    userId,
    nome: `Vendedor ${scenarioName} ${suffix}`,
    ativo: true,
    admin: false,
  });
  const vendedorId = getInsertId(vendedorInsert);

  // Suffix do telefone só dígitos: letras do nanoid colapsam no normalizeTelefone
  // e podem colidir com resíduos de runs abortadas (dedupe por telefone no tenant).
  const phoneSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-6);
  const clienteResult = await clientesService.createCliente(tenantId, {
    nome: `Cliente ${scenarioName} ${suffix}`,
    telefone: `11996${phoneSuffix}`,
    userId,
    vendedorIdPrincipal: vendedorId,
  });
  if (!clienteResult.success || !clienteResult.data) {
    throw new Error(`Falha ao criar cliente: ${clienteResult.error ?? "erro desconhecido"}`);
  }
  const clienteId = clienteResult.data.id;

  const corInsert = await conn.insert(cores).values({
    tenantId,
    nome: `Cor ${scenarioName} ${suffix}`,
  });
  const corId = getInsertId(corInsert);

  const corOtherInsert = await conn.insert(cores).values({
    tenantId,
    nome: `Cor other ${scenarioName} ${suffix}`,
  });
  const corOtherId = getInsertId(corOtherInsert);

  const produtoInsert = await conn.insert(produtos).values({
    tenantId,
    descricao: `Produto ${scenarioName} ${suffix}`,
    custo: "50.00",
    valorVenda: "100.00",
  });
  const produtoId = getInsertId(produtoInsert);

  const produtoOtherInsert = await conn.insert(produtos).values({
    tenantId,
    descricao: `Produto other ${scenarioName} ${suffix}`,
    custo: "40.00",
    valorVenda: "90.00",
  });
  const produtoOtherId = getInsertId(produtoOtherInsert);

  const produtoOtherTenantInsert = await conn.insert(produtos).values({
    tenantId: otherTenantId,
    descricao: `Produto other tenant ${scenarioName} ${suffix}`,
    custo: "60.00",
    valorVenda: "120.00",
  });
  const produtoOtherTenantId = getInsertId(produtoOtherTenantInsert);

  const corOtherTenantInsert = await conn.insert(cores).values({
    tenantId: otherTenantId,
    nome: `Cor other tenant ${scenarioName} ${suffix}`,
  });
  const corOtherTenantId = getInsertId(corOtherTenantInsert);

  const skuAtivo = await skuService.createSku(tenantId, {
    produtoId,
    corId,
    descricaoSku: `SKU ativo ${scenarioName} ${suffix}`,
    estoque: initialStock,
    bloquearEstoqueNegativo: true,
    ativo: true,
  });

  const skuInativo = await skuService.createSku(tenantId, {
    produtoId,
    corId,
    descricaoSku: `SKU inativo ${scenarioName} ${suffix}`,
    estoque: 10,
    bloquearEstoqueNegativo: true,
    ativo: false,
  });

  const skuSemEstoque = await skuService.createSku(tenantId, {
    produtoId,
    corId,
    descricaoSku: `SKU sem estoque ${scenarioName} ${suffix}`,
    estoque: 0,
    bloquearEstoqueNegativo: true,
    ativo: true,
  });

  const skuOutroProduto = await skuService.createSku(tenantId, {
    produtoId: produtoOtherId,
    corId: corOtherId,
    descricaoSku: `SKU outro produto ${scenarioName} ${suffix}`,
    estoque: 20,
    bloquearEstoqueNegativo: true,
    ativo: true,
  });

  const skuOutroTenant = await skuService.createSku(otherTenantId, {
    produtoId: produtoOtherTenantId,
    corId: corOtherTenantId,
    descricaoSku: `SKU outro tenant ${scenarioName} ${suffix}`,
    estoque: 25,
    bloquearEstoqueNegativo: true,
    ativo: true,
  });

  return {
    tenantId,
    otherTenantId,
    scenarioSuffix: suffix,
    idempotencyKeySeed: `${scenarioName}-${suffix}`,
    userId,
    vendedorId,
    clienteId,
    corId,
    corOtherId,
    produtoId,
    produtoOtherId,
    produtoOtherTenantId,
    skuAtivoId: skuAtivo.id,
    skuInativoId: skuInativo.id,
    skuSemEstoqueId: skuSemEstoque.id,
    skuOutroProdutoId: skuOutroProduto.id,
    skuOutroTenantId: skuOutroTenant.id,
    createdPedidoIds: [],
    createdPedidoNumeros: [],
  };
}

export async function getSkuStockForScenario(tenantId: number, skuId: number): Promise<number> {
  assertPositiveInt(tenantId, "tenantId");
  assertPositiveInt(skuId, "skuId");

  const conn = await requireConn();
  const rows = await conn
    .select({ estoque: produtoSkus.estoque })
    .from(produtoSkus)
    .where(and(eq(produtoSkus.tenantId, tenantId), eq(produtoSkus.id, skuId)))
    .limit(1);

  if (rows.length === 0) {
    throw new Error(`SKU ${skuId} não encontrado no tenant ${tenantId}`);
  }

  return Number(rows[0].estoque ?? 0);
}

export async function getPendenciasForPedidoScenario(
  tenantId: number,
  pedidoId: number,
  skuId?: number
): Promise<PendenciaScenarioRow[]> {
  assertPositiveInt(tenantId, "tenantId");
  assertPositiveInt(pedidoId, "pedidoId");

  const conn = await requireConn();
  const baseCondition = and(eq(pendencias.tenantId, tenantId), eq(pendencias.pedidoId, pedidoId));
  const whereCondition =
    skuId == null ? baseCondition : and(baseCondition, eq(pendencias.skuId, skuId));

  const rows = await conn
    .select({
      id: pendencias.id,
      pedidoId: pendencias.pedidoId,
      produtoId: pendencias.produtoId,
      skuId: pendencias.skuId,
      quantidade: pendencias.quantidade,
      status: pendencias.status,
    })
    .from(pendencias)
    .where(whereCondition);

  return rows.map((row) => ({
    id: row.id,
    pedidoId: row.pedidoId,
    produtoId: row.produtoId,
    skuId: row.skuId ?? null,
    quantidade: row.quantidade,
    status: row.status,
  }));
}

export async function cleanupSkuOrderScenario(scenario: SkuOrderScenario): Promise<void> {
  const conn = await requireConn();
  const cleanupErrors: string[] = [];

  const runStep = async (name: string, action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      cleanupErrors.push(`${name}: ${parseErrorMessage(error)}`);
    }
  };

  const pedidoIds = scenario.createdPedidoIds.filter((id) => Number.isInteger(id) && id > 0);
  const pedidoNumeros = scenario.createdPedidoNumeros.filter((n) => Number.isInteger(n) && n > 0);

  if (pedidoIds.length > 0) {
    await runStep("delete pendencias by pedidos", async () => {
      await conn.delete(pendencias).where(inArray(pendencias.pedidoId, pedidoIds));
    });
  }

  if (pedidoNumeros.length > 0) {
    await runStep("delete contasReceber by pedidoNumero", async () => {
      await conn
        .delete(contasReceber)
        .where(and(eq(contasReceber.tenantId, scenario.tenantId), inArray(contasReceber.pedidoNumero, pedidoNumeros)));
    });
  }

  if (pedidoIds.length > 0) {
    await runStep("delete pedidos", async () => {
      await conn
        .delete(pedidos)
        .where(and(eq(pedidos.tenantId, scenario.tenantId), inArray(pedidos.id, pedidoIds)));
    });
  }

  await runStep("delete sku tenant principal", async () => {
    await conn
      .delete(produtoSkus)
      .where(
        and(
          eq(produtoSkus.tenantId, scenario.tenantId),
          inArray(produtoSkus.id, [
            scenario.skuAtivoId,
            scenario.skuInativoId,
            scenario.skuSemEstoqueId,
            scenario.skuOutroProdutoId,
          ])
        )
      );
  });

  await runStep("delete sku outro tenant", async () => {
    await conn
      .delete(produtoSkus)
      .where(and(eq(produtoSkus.tenantId, scenario.otherTenantId), eq(produtoSkus.id, scenario.skuOutroTenantId)));
  });

  await runStep("delete produto tenant principal", async () => {
    await conn
      .delete(produtos)
      .where(
        and(
          eq(produtos.tenantId, scenario.tenantId),
          inArray(produtos.id, [scenario.produtoId, scenario.produtoOtherId])
        )
      );
  });

  await runStep("delete produto outro tenant", async () => {
    await conn
      .delete(produtos)
      .where(and(eq(produtos.tenantId, scenario.otherTenantId), eq(produtos.id, scenario.produtoOtherTenantId)));
  });

  await runStep("delete cores tenant principal", async () => {
    await conn
      .delete(cores)
      .where(and(eq(cores.tenantId, scenario.tenantId), inArray(cores.id, [scenario.corId, scenario.corOtherId])));
  });

  await runStep("delete cliente_vendedores", async () => {
    await conn.delete(clienteVendedores).where(eq(clienteVendedores.clienteId, scenario.clienteId));
  });

  await runStep("delete cliente", async () => {
    await conn
      .delete(clientes)
      .where(and(eq(clientes.tenantId, scenario.tenantId), eq(clientes.id, scenario.clienteId)));
  });

  await runStep("delete vendedor", async () => {
    await conn
      .delete(vendedores)
      .where(and(eq(vendedores.tenantId, scenario.tenantId), eq(vendedores.id, scenario.vendedorId)));
  });

  await runStep("delete user", async () => {
    await conn.delete(users).where(and(eq(users.tenantId, scenario.tenantId), eq(users.id, scenario.userId)));
  });

  if (cleanupErrors.length > 0) {
    throw new Error(`Falha no cleanup do cenário SKU/ORDER:\n${cleanupErrors.join("\n")}`);
  }
}
