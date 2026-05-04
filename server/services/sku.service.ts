/**
 * SKU Service
 *
 * Serviço oficial para operações com SKUs de produto.
 * Camada: SERVICE → DB via Drizzle ORM.
 *
 * Responsabilidades:
 * - CRUD de SKUs em produto_skus.
 * - Controle de estoque por SKU.
 * - Validação obrigatória de tenantId.
 * - Bloqueio de estoque negativo quando configurado.
 * - Operações críticas de estoque com transaction + FOR UPDATE.
 */

import { and, desc, eq, isNull, ne, type SQL } from "drizzle-orm";
import { getDb, getInsertId } from "../db/index.js";
import { produtoSkus, produtos, cores } from "../../drizzle/schema.js";
import { assertDbConnection, assertTenantId } from "../_core/errors/assertions.js";
import { InfrastructureError, ValidationError } from "../_core/errors/typed-errors.js";
import { createLogger } from "../infra/structured-logger.js";
import type { Database } from "../db/core.js";

type DbConn = Awaited<ReturnType<typeof getDb>>;
type DbTx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbExecutor = DbConn | DbTx;
type ProdutoSkuInsert = typeof produtoSkus.$inferInsert;

const logger = createLogger("sku-service");

const MSG_ESTOQUE_INSUFICIENTE = "Esse produto acabou, sem previsão de chegar nova remessa.";

// ============================================================================
// TIPOS LOCAIS
// ============================================================================

export interface CreateSkuInput {
  produtoId: number;
  corId?: number | null;
  descricaoSku: string;
  skuCode?: string | null;
  tamanho?: string | null;
  temEspelho?: boolean;
  atributosJson?: string | null;
  estoque?: number;
  bloquearEstoqueNegativo?: boolean;
  acrescimoCusto?: number | string;
  valorVenda?: number | string | null;
  ativo?: boolean;
}

export interface UpdateSkuInput {
  corId?: number | null;
  descricaoSku?: string;
  skuCode?: string | null;
  tamanho?: string | null;
  temEspelho?: boolean;
  atributosJson?: string | null;
  acrescimoCusto?: number | string;
  valorVenda?: number | string | null;
  ativo?: boolean;
  bloquearEstoqueNegativo?: boolean;
}

export interface SetSkuEstoqueInput {
  estoque: number;
  motivo?: string;
  actorUserId?: number;
  actorVendedorId?: number;
}

export interface SkuStockOperationResult {
  success: boolean;
  skuId: number;
  saldoAnterior: number;
  saldoNovo: number;
  quantidadeProcessada: number;
  message: string;
}

export interface SkuWithDetails {
  id: number;
  tenantId: number;
  produtoId: number;
  corId: number | null;
  descricaoSku: string;
  skuCode: string | null;
  tamanho: string | null;
  temEspelho: boolean;
  atributosJson: string | null;
  estoque: number;
  bloquearEstoqueNegativo: boolean;
  acrescimoCusto: string;
  valorVenda: string | null;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
  corNome: string | null;
}

// ============================================================================
// HELPERS
// ============================================================================

function assertRequiredId(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`${fieldName} obrigatório`);
  }
}

function assertPositiveQuantity(value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError("Quantidade deve ser um número inteiro positivo");
  }
}

function assertIntegerEstoque(value: number): void {
  if (!Number.isInteger(value)) {
    throw new ValidationError("Estoque deve ser um número inteiro");
  }
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequiredText(value: string, fieldName: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new ValidationError(`${fieldName} é obrigatório`);
  }

  return trimmed;
}

function normalizeDecimal(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "0.00";

  const parsed = typeof value === "string" ? Number(value.replace(",", ".")) : value;

  if (!Number.isFinite(parsed)) {
    throw new ValidationError("Valor decimal inválido");
  }

  return parsed.toFixed(2);
}

function hasTransaction(db: DbExecutor): db is DbConn {
  return "transaction" in db && typeof db.transaction === "function";
}

function mapSkuWithDetails(row: { sku: typeof produtoSkus.$inferSelect; corNome: string | null }): SkuWithDetails {
  return {
    ...row.sku,
    corNome: row.corNome,
  };
}

async function assertProdutoBelongsToTenant(
  db: DbExecutor,
  tenantId: number,
  produtoId: number
): Promise<void> {
  const produto = await db
    .select({ id: produtos.id })
    .from(produtos)
    .where(and(eq(produtos.tenantId, tenantId), eq(produtos.id, produtoId)))
    .limit(1);

  if (produto.length === 0) {
    throw new ValidationError("Produto não encontrado ou acesso negado");
  }
}

async function assertCorBelongsToTenant(
  db: DbExecutor,
  tenantId: number,
  corId: number | null | undefined
): Promise<void> {
  if (corId === null || corId === undefined) return;

  assertRequiredId(corId, "corId");

  const cor = await db
    .select({ id: cores.id })
    .from(cores)
    .where(and(eq(cores.tenantId, tenantId), eq(cores.id, corId)))
    .limit(1);

  if (cor.length === 0) {
    throw new ValidationError("Cor não encontrada ou acesso negado");
  }
}

async function checkDuplicateSkuCombination(
  db: DbExecutor,
  tenantId: number,
  produtoId: number,
  input: {
    corId: number | null;
    tamanho: string | null;
    temEspelho: boolean;
    descricaoSku: string;
  },
  excludeSkuId?: number
): Promise<boolean> {
  const conditions: SQL[] = [
    eq(produtoSkus.tenantId, tenantId),
    eq(produtoSkus.produtoId, produtoId),
    eq(produtoSkus.descricaoSku, input.descricaoSku),
    eq(produtoSkus.temEspelho, input.temEspelho),
  ];

  if (input.corId === null) {
    conditions.push(isNull(produtoSkus.corId));
  } else {
    conditions.push(eq(produtoSkus.corId, input.corId));
  }

  if (input.tamanho === null) {
    conditions.push(isNull(produtoSkus.tamanho));
  } else {
    conditions.push(eq(produtoSkus.tamanho, input.tamanho));
  }

  if (excludeSkuId !== undefined) {
    conditions.push(ne(produtoSkus.id, excludeSkuId));
  }

  const existing = await db
    .select({ id: produtoSkus.id })
    .from(produtoSkus)
    .where(and(...conditions))
    .limit(1);

  return existing.length > 0;
}

async function checkDuplicateSkuCode(
  db: DbExecutor,
  tenantId: number,
  skuCode: string | null,
  excludeSkuId?: number
): Promise<boolean> {
  if (skuCode === null) return false;

  const conditions: SQL[] = [
    eq(produtoSkus.tenantId, tenantId),
    eq(produtoSkus.skuCode, skuCode),
  ];

  if (excludeSkuId !== undefined) {
    conditions.push(ne(produtoSkus.id, excludeSkuId));
  }

  const existing = await db
    .select({ id: produtoSkus.id })
    .from(produtoSkus)
    .where(and(...conditions))
    .limit(1);

  return existing.length > 0;
}

async function getSkuForUpdate(
  tx: DbTx,
  tenantId: number,
  skuId: number
): Promise<{
  estoque: number;
  descricaoSku: string;
  bloquearEstoqueNegativo: boolean;
}> {
  const rows = await tx
    .select({
      estoque: produtoSkus.estoque,
      descricaoSku: produtoSkus.descricaoSku,
      bloquearEstoqueNegativo: produtoSkus.bloquearEstoqueNegativo,
    })
    .from(produtoSkus)
    .where(and(eq(produtoSkus.tenantId, tenantId), eq(produtoSkus.id, skuId)))
    .for("update")
    .limit(1);

  if (rows.length === 0) {
    throw new ValidationError("SKU não encontrado ou acesso negado");
  }

  return {
    estoque: Number(rows[0].estoque ?? 0),
    descricaoSku: rows[0].descricaoSku,
    bloquearEstoqueNegativo: rows[0].bloquearEstoqueNegativo ?? true,
  };
}

// ============================================================================
// CONSULTAS
// ============================================================================

export async function listSkusByProduto(
  tenantId: number,
  produtoId: number
): Promise<SkuWithDetails[]> {
  assertTenantId(tenantId);
  assertRequiredId(produtoId, "produtoId");

  const db = await getDb();
  assertDbConnection(db);

  const results = await db
    .select({
      sku: produtoSkus,
      corNome: cores.nome,
    })
    .from(produtoSkus)
    .leftJoin(cores, and(eq(produtoSkus.corId, cores.id), eq(cores.tenantId, tenantId)))
    .where(and(eq(produtoSkus.tenantId, tenantId), eq(produtoSkus.produtoId, produtoId)))
    .orderBy(desc(produtoSkus.ativo), desc(produtoSkus.createdAt));

  return results.map(mapSkuWithDetails);
}

export async function getSkuById(
  tenantId: number,
  skuId: number
): Promise<SkuWithDetails | null> {
  assertTenantId(tenantId);
  assertRequiredId(skuId, "skuId");

  const db = await getDb();
  assertDbConnection(db);

  const results = await db
    .select({
      sku: produtoSkus,
      corNome: cores.nome,
    })
    .from(produtoSkus)
    .leftJoin(cores, and(eq(produtoSkus.corId, cores.id), eq(cores.tenantId, tenantId)))
    .where(and(eq(produtoSkus.tenantId, tenantId), eq(produtoSkus.id, skuId)))
    .limit(1);

  if (results.length === 0) return null;

  return mapSkuWithDetails(results[0]);
}

// ============================================================================
// CRUD
// ============================================================================

export async function createSku(
  tenantId: number,
  input: CreateSkuInput
): Promise<{ id: number }> {
  assertTenantId(tenantId);
  assertRequiredId(input.produtoId, "produtoId");

  const descricaoSku = normalizeRequiredText(input.descricaoSku, "descricaoSku");
  const skuCode = normalizeNullableText(input.skuCode);
  const tamanho = normalizeNullableText(input.tamanho);
  const corId = input.corId ?? null;
  const temEspelho = input.temEspelho ?? false;
  const estoque = input.estoque ?? 0;

  assertIntegerEstoque(estoque);

  const db = await getDb();
  assertDbConnection(db);

  await assertProdutoBelongsToTenant(db, tenantId, input.produtoId);
  await assertCorBelongsToTenant(db, tenantId, corId);

  const duplicateCombination = await checkDuplicateSkuCombination(db, tenantId, input.produtoId, {
    corId,
    tamanho,
    temEspelho,
    descricaoSku,
  });

  if (duplicateCombination) {
    throw new ValidationError("Já existe um SKU com esta combinação de produto, cor, tamanho, espelho e descrição");
  }

  const duplicateSkuCode = await checkDuplicateSkuCode(db, tenantId, skuCode);
  if (duplicateSkuCode) {
    throw new ValidationError("Já existe um SKU com este código");
  }

  const bloquearEstoqueNegativo = input.bloquearEstoqueNegativo ?? true;

  if (bloquearEstoqueNegativo && estoque < 0) {
    throw new ValidationError(MSG_ESTOQUE_INSUFICIENTE);
  }

  const insertData: ProdutoSkuInsert = {
    tenantId,
    produtoId: input.produtoId,
    corId,
    descricaoSku,
    skuCode,
    tamanho,
    temEspelho,
    atributosJson: input.atributosJson ?? null,
    estoque,
    bloquearEstoqueNegativo,
    acrescimoCusto: normalizeDecimal(input.acrescimoCusto),
    valorVenda: input.valorVenda !== null && input.valorVenda !== undefined
      ? normalizeDecimal(input.valorVenda)
      : null,
    ativo: input.ativo ?? true,
  };

  const result = await db.insert(produtoSkus).values(insertData);
  const skuId = getInsertId(result);

  logger.info("SKU criado", {
    tenantId,
    payload: { skuId, produtoId: input.produtoId },
  });

  return { id: skuId };
}

export async function updateSku(
  tenantId: number,
  skuId: number,
  input: UpdateSkuInput
): Promise<{ success: boolean }> {
  assertTenantId(tenantId);
  assertRequiredId(skuId, "skuId");

  const db = await getDb();
  assertDbConnection(db);

  const existing = await getSkuById(tenantId, skuId);
  if (!existing) {
    throw new ValidationError("SKU não encontrado ou acesso negado");
  }

  const corId = input.corId !== undefined ? input.corId : existing.corId;
  const descricaoSku = input.descricaoSku !== undefined
    ? normalizeRequiredText(input.descricaoSku, "descricaoSku")
    : existing.descricaoSku;
  const tamanho = input.tamanho !== undefined
    ? normalizeNullableText(input.tamanho)
    : existing.tamanho;
  const temEspelho = input.temEspelho !== undefined
    ? input.temEspelho
    : existing.temEspelho;
  const skuCode = input.skuCode !== undefined
    ? normalizeNullableText(input.skuCode)
    : existing.skuCode;

  await assertCorBelongsToTenant(db, tenantId, corId);

  const duplicateCombination = await checkDuplicateSkuCombination(
    db,
    tenantId,
    existing.produtoId,
    {
      corId,
      tamanho,
      temEspelho,
      descricaoSku,
    },
    skuId
  );

  if (duplicateCombination) {
    throw new ValidationError("Já existe outro SKU com esta combinação de produto, cor, tamanho, espelho e descrição");
  }

  const duplicateSkuCode = await checkDuplicateSkuCode(db, tenantId, skuCode, skuId);
  if (duplicateSkuCode) {
    throw new ValidationError("Já existe outro SKU com este código");
  }

  const updateData: Partial<ProdutoSkuInsert> = {
    updatedAt: new Date(),
  };

  if (input.corId !== undefined) updateData.corId = input.corId;
  if (input.descricaoSku !== undefined) updateData.descricaoSku = descricaoSku;
  if (input.skuCode !== undefined) updateData.skuCode = skuCode;
  if (input.tamanho !== undefined) updateData.tamanho = tamanho;
  if (input.temEspelho !== undefined) updateData.temEspelho = input.temEspelho;
  if (input.atributosJson !== undefined) updateData.atributosJson = input.atributosJson;
  if (input.acrescimoCusto !== undefined) updateData.acrescimoCusto = normalizeDecimal(input.acrescimoCusto);
  if (input.valorVenda !== undefined) {
    updateData.valorVenda = input.valorVenda !== null ? normalizeDecimal(input.valorVenda) : null;
  }
  if (input.ativo !== undefined) updateData.ativo = input.ativo;
  if (input.bloquearEstoqueNegativo !== undefined) updateData.bloquearEstoqueNegativo = input.bloquearEstoqueNegativo;

  await db
    .update(produtoSkus)
    .set(updateData)
    .where(and(eq(produtoSkus.tenantId, tenantId), eq(produtoSkus.id, skuId)));

  logger.info("SKU atualizado", {
    tenantId,
    payload: { skuId },
  });

  return { success: true };
}

// ============================================================================
// ESTOQUE
// ============================================================================

export async function setSkuEstoque(
  tenantId: number,
  skuId: number,
  input: SetSkuEstoqueInput
): Promise<SkuStockOperationResult> {
  assertTenantId(tenantId);
  assertRequiredId(skuId, "skuId");
  assertIntegerEstoque(input.estoque);

  const db = await getDb();
  assertDbConnection(db);

  return db.transaction(async (tx) => {
    const sku = await getSkuForUpdate(tx, tenantId, skuId);

    const saldoAnterior = sku.estoque;
    const saldoNovo = input.estoque;

    if (sku.bloquearEstoqueNegativo && saldoNovo < 0) {
      throw new ValidationError(MSG_ESTOQUE_INSUFICIENTE);
    }

    await tx
      .update(produtoSkus)
      .set({
        estoque: saldoNovo,
        updatedAt: new Date(),
      })
      .where(and(eq(produtoSkus.tenantId, tenantId), eq(produtoSkus.id, skuId)));

    const delta = saldoNovo - saldoAnterior;

    logger.info("SKU estoque ajustado", {
      tenantId,
      payload: {
        skuId,
        saldoAnterior,
        saldoNovo,
        delta,
        motivo: input.motivo ?? null,
        actorUserId: input.actorUserId ?? null,
        actorVendedorId: input.actorVendedorId ?? null,
      },
    });

    return {
      success: true,
      skuId,
      saldoAnterior,
      saldoNovo,
      quantidadeProcessada: Math.abs(delta),
      message: `Estoque ajustado de ${saldoAnterior} para ${saldoNovo}`,
    };
  });
}

async function decrementSkuEstoqueInTx(
  tx: DbTx,
  tenantId: number,
  skuId: number,
  quantidade: number
): Promise<SkuStockOperationResult> {
  const sku = await getSkuForUpdate(tx, tenantId, skuId);

  const saldoAnterior = sku.estoque;
  const saldoNovo = saldoAnterior - quantidade;

  if (sku.bloquearEstoqueNegativo && saldoNovo < 0) {
    throw new ValidationError(MSG_ESTOQUE_INSUFICIENTE);
  }

  await tx
    .update(produtoSkus)
    .set({
      estoque: saldoNovo,
      updatedAt: new Date(),
    })
    .where(and(eq(produtoSkus.tenantId, tenantId), eq(produtoSkus.id, skuId)));

  logger.info("SKU estoque decrementado", {
    tenantId,
    payload: { skuId, saldoAnterior, saldoNovo, quantidade },
  });

  return {
    success: true,
    skuId,
    saldoAnterior,
    saldoNovo,
    quantidadeProcessada: quantidade,
    message: `Estoque decrementado: ${saldoAnterior} → ${saldoNovo}`,
  };
}

export async function decrementSkuEstoque(
  txOrDb: DbExecutor,
  tenantId: number,
  skuId: number,
  quantidade: number
): Promise<SkuStockOperationResult> {
  assertTenantId(tenantId);
  assertRequiredId(skuId, "skuId");
  assertPositiveQuantity(quantidade);

  if (hasTransaction(txOrDb)) {
    return txOrDb.transaction((tx) => decrementSkuEstoqueInTx(tx, tenantId, skuId, quantidade));
  }

  return decrementSkuEstoqueInTx(txOrDb, tenantId, skuId, quantidade);
}

async function incrementSkuEstoqueInTx(
  tx: DbTx,
  tenantId: number,
  skuId: number,
  quantidade: number
): Promise<SkuStockOperationResult> {
  const sku = await getSkuForUpdate(tx, tenantId, skuId);

  const saldoAnterior = sku.estoque;
  const saldoNovo = saldoAnterior + quantidade;

  await tx
    .update(produtoSkus)
    .set({
      estoque: saldoNovo,
      updatedAt: new Date(),
    })
    .where(and(eq(produtoSkus.tenantId, tenantId), eq(produtoSkus.id, skuId)));

  logger.info("SKU estoque incrementado", {
    tenantId,
    payload: { skuId, saldoAnterior, saldoNovo, quantidade },
  });

  return {
    success: true,
    skuId,
    saldoAnterior,
    saldoNovo,
    quantidadeProcessada: quantidade,
    message: `Estoque incrementado: ${saldoAnterior} → ${saldoNovo}`,
  };
}

export async function incrementSkuEstoque(
  txOrDb: DbExecutor,
  tenantId: number,
  skuId: number,
  quantidade: number
): Promise<SkuStockOperationResult> {
  assertTenantId(tenantId);
  assertRequiredId(skuId, "skuId");
  assertPositiveQuantity(quantidade);

  if (hasTransaction(txOrDb)) {
    return txOrDb.transaction((tx) => incrementSkuEstoqueInTx(tx, tenantId, skuId, quantidade));
  }

  return incrementSkuEstoqueInTx(txOrDb, tenantId, skuId, quantidade);
}

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default {
  listSkusByProduto,
  getSkuById,
  createSku,
  updateSku,
  setSkuEstoque,
  decrementSkuEstoque,
  incrementSkuEstoque,
};
