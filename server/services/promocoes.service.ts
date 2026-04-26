import { eq, and, desc, asc, sql } from "drizzle-orm";
import { getDb, promocoes, promocoesItens, insertAuditLog, getInsertId } from "../db/index.js";
import { DbResult, toDbResult } from '../_core/db-result.js';
import { nanoid } from "nanoid";
import { z } from "zod";
import { assertTenantId, assertDbConnection } from "../_core/errors/assertions.js";
import { ValidationError, InfrastructureError } from "../_core/errors/typed-errors.js";

// Type REAL da transaction Drizzle
import type { Database } from '../db/core.js';
type DbTx = Parameters<Parameters<Database['transaction']>[0]>[0];
type DbConn = Database;

// Types
export type CreatePromocaoInput = {
  nome: string;
  inicio: Date;
  fim: Date;
  ativo?: boolean;
};

export type UpdatePromocaoInput = Partial<CreatePromocaoInput>;

export type CreatePromocaoItemInput = {
  produtoId: number;
  precoPromocional: number;
};

const CreatePromocaoSchema = z.object({
  nome: z.string().min(2),
  inicio: z.date(),
  fim: z.date(),
  ativo: z.boolean().optional(),
}).strict();

const UpdatePromocaoSchema = z.object({
  nome: z.string().min(2).optional(),
  inicio: z.date().optional(),
  fim: z.date().optional(),
  ativo: z.boolean().optional(),
}).strict();

const PromocaoItemSchema = z.object({
  produtoId: z.number().int().positive(),
  precoPromocional: z.number().nonnegative(),
}).strict();

/**
 * Lista todas as promoções com paginação
 */
export async function listPromocoes(
  tenantId: number, 
  options?: { page?: number; pageSize?: number; ativo?: boolean; }
): Promise<{ items: Array<typeof promocoes.$inferSelect>; total: number; page: number; pageSize: number; }> {
  assertTenantId(tenantId);
  const dbConn = await getDb();
  assertDbConnection(dbConn);
  
  const page = options?.page ?? 1;
  const pageSize = Math.min(options?.pageSize ?? 50, 100);
  const offset = (page - 1) * pageSize;
  
  // Construir condições
  const conditions = [eq(promocoes.tenantId, tenantId)];
  if (options?.ativo !== undefined) {
    conditions.push(eq(promocoes.ativo, options.ativo));
  }
  
  // Executar consultas em paralelo para melhor performance
  const [items, totalResult] = await Promise.all([
    dbConn.select()
      .from(promocoes)
      .where(and(...conditions))
      .orderBy(desc(promocoes.inicio))
      .limit(pageSize)
      .offset(offset),
    dbConn.select({ count: sql`count(*)` })
      .from(promocoes)
      .where(and(...conditions))
  ]);
  
  const total = Number(totalResult[0]?.count ?? 0);
  
  return { items, total, page, pageSize };
}

/**
 * Busca promoção por ID
 */
export async function getPromocaoById(tenantId: number, id: number) {
  assertTenantId(tenantId);
  const dbConn = await getDb();
  assertDbConnection(dbConn);
  
  const result = await dbConn.select().from(promocoes).where(and(eq(promocoes.tenantId, tenantId), eq(promocoes.id, id))).limit(1);
  return result.length > 0 ? result[0] : null;
}

/**
 * Cria uma nova promoção
 */
export async function createPromocao(tenantId: number, data: CreatePromocaoInput) {
  assertTenantId(tenantId);
  const payload = CreatePromocaoSchema.parse(data);
  const dbConn = await getDb();
  assertDbConnection(dbConn);
  
  const res = await dbConn.insert(promocoes).values({
    tenantId,
    nome: payload.nome,
    inicio: payload.inicio instanceof Date ? payload.inicio : new Date(payload.inicio),
    fim: payload.fim instanceof Date ? payload.fim : new Date(payload.fim),
    ativo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const promocaoId = getInsertId(res);

  // Registrar auditoria
  await insertAuditLog({
    tenantId,
    action: "create",
    entity: "promocao",
    entityId: String(promocaoId),
    payloadJson: JSON.stringify(data),
    traceId: nanoid(10),
  });

  return { id: promocaoId };
}

/**
 * Atualiza uma promoção
 */
export async function updatePromocao(tenantId: number, id: number, data: UpdatePromocaoInput) {
  assertTenantId(tenantId);
  const payload = UpdatePromocaoSchema.parse(data);
  const dbConn = await getDb();
  assertDbConnection(dbConn);
  
  const updateData: Partial<typeof promocoes.$inferInsert> = {
    ...payload,
    updatedAt: new Date(),
    inicio: payload.inicio instanceof Date ? payload.inicio : (payload.inicio ? new Date(payload.inicio) : undefined),
    fim: payload.fim instanceof Date ? payload.fim : (payload.fim ? new Date(payload.fim) : undefined),
    ativo: payload.ativo !== undefined ? payload.ativo : undefined,
  };
  
  const existing = await getPromocaoById(tenantId, id);
  if (!existing) throw new ValidationError("Promoção não encontrada");
  await dbConn.update(promocoes).set(updateData).where(and(eq(promocoes.tenantId, tenantId), eq(promocoes.id, id)));
  const updated = await getPromocaoById(tenantId, id);
  if (!updated) throw new InfrastructureError("Falha ao atualizar promoção");

  // Registrar auditoria
  await insertAuditLog({
    tenantId,
    action: "update",
    entity: "promocao",
    entityId: String(id),
    payloadJson: JSON.stringify(updateData),
    traceId: nanoid(10),
  });
}

/**
 * Remove uma promoção (hard delete)
 */
export async function deletePromocao(tenantId: number, id: number) {
  assertTenantId(tenantId);
  const dbConn = await getDb();
  assertDbConnection(dbConn);
  
  const existing = await getPromocaoById(tenantId, id);
  if (!existing) throw new ValidationError("Promoção não encontrada");
  // Hard delete (itens possuem cascade). Evita promo fantasma.
  await dbConn.delete(promocoes).where(and(eq(promocoes.tenantId, tenantId), eq(promocoes.id, id)));
  const deleted = await getPromocaoById(tenantId, id);
  if (deleted) throw new InfrastructureError("Falha ao excluir promoção");

  // Registrar auditoria
  await insertAuditLog({
    tenantId,
    action: "delete",
    entity: "promocao",
    entityId: String(id),
    payloadJson: JSON.stringify({ action: "promocao_deleted" }),
    traceId: nanoid(10),
  });
}

/**
 * Lista itens de uma promoção
 */
export async function getPromocaoItens(tenantId: number, promocaoId: number) {
  assertTenantId(tenantId);
  const dbConn = await getDb();
  assertDbConnection(dbConn);

  // Verify promocao belongs to tenant
  const promo = await dbConn.select().from(promocoes).where(and(eq(promocoes.tenantId, tenantId), eq(promocoes.id, promocaoId))).limit(1);
  if (!promo.length) return []; // Ausência legítima - promoção não encontrada
  
  return await dbConn.select()
    .from(promocoesItens)
    .where(and(eq(promocoesItens.tenantId, tenantId), eq(promocoesItens.promocaoId, promocaoId)))
    .orderBy(asc(promocoesItens.id));
}

/**
 * Define os itens de uma promoção (remove todos e adiciona os novos)
 */
export async function setPromocaoItens(tenantId: number, promocaoId: number, itens: CreatePromocaoItemInput[]) {
  assertTenantId(tenantId);
  const itensValidos = z.array(PromocaoItemSchema).parse(itens);
  const dbConn = await getDb();
  assertDbConnection(dbConn);

  return await dbConn.transaction(async (tx: DbTx) => {
    // Remover itens existentes
    await tx.delete(promocoesItens).where(and(eq(promocoesItens.tenantId, tenantId), eq(promocoesItens.promocaoId, promocaoId)));

    // Inserir novos itens
    if (itensValidos.length > 0) {
      await tx.insert(promocoesItens).values(
        itensValidos.map(item => ({
          tenantId,
          promocaoId,
          produtoId: item.produtoId,
          precoPromocional: String(item.precoPromocional),
          createdAt: new Date(),
        } as typeof promocoesItens.$inferInsert))
      );
    }

    // Registrar auditoria
    await insertAuditLog({
      tenantId,
      action: "update",
      entity: "promocao_itens",
      entityId: String(promocaoId),
      payloadJson: JSON.stringify({ action: "set_itens", itens: itensValidos }),
      traceId: nanoid(10),
    });

    return { message: "Itens da promoção atualizados com sucesso" };
  });
}

/**
 * Adiciona um item a uma promoção
 */
export async function addPromocaoItem(tenantId: number, promocaoId: number, item: CreatePromocaoItemInput) {
  assertTenantId(tenantId);
  const dbConn = await getDb();
  assertDbConnection(dbConn);
  
  const result = await dbConn.insert(promocoesItens).values({
    tenantId,
    promocaoId,
    produtoId: item.produtoId,
    precoPromocional: String(item.precoPromocional),
    createdAt: new Date(),
  } as typeof promocoesItens.$inferInsert);

  const itemId = getInsertId(result);

  // Registrar auditoria
  await insertAuditLog({
    tenantId,
    action: "create",
    entity: "promocao_item",
    entityId: String(itemId),
    payloadJson: JSON.stringify({ promocaoId, ...item }),
    traceId: nanoid(10),
  });

  return { id: itemId };
}

/**
 * Remove um item de uma promoção
 */
export async function removePromocaoItem(tenantId: number, itemId: number) {
  assertTenantId(tenantId);
  const dbConn = await getDb();
  assertDbConnection(dbConn);
  
  await dbConn.delete(promocoesItens).where(and(eq(promocoesItens.tenantId, tenantId), eq(promocoesItens.id, itemId)));

  // Registrar auditoria
  await insertAuditLog({
    tenantId,
    action: "delete",
    entity: "promocao_item",
    entityId: String(itemId),
    payloadJson: JSON.stringify({ action: "item_deleted" }),
    traceId: nanoid(10),
  });
}

/**
 * Lista promoções ativas em uma data
 */
export async function getPromocoesAtivas(tenantId: number, data: Date = new Date()) {
  assertTenantId(tenantId);
  const dbConn = await getDb();
  assertDbConnection(dbConn);
  
  return await dbConn.select()
    .from(promocoes)
    .where(and(
      eq(promocoes.tenantId, tenantId),
      eq(promocoes.ativo, true),
      sql`${promocoes.inicio} <= ${data}`,
      sql`${promocoes.fim} >= ${data}`
    ))
    .orderBy(asc(promocoes.fim));
}

/**
 * Verifica se um produto tem promoção ativa
 */
export async function getPromocaoAtivaByProduto(tenantId: number, produtoId: number, data: Date = new Date()) {
  assertTenantId(tenantId);
  const dbConn = await getDb();
  assertDbConnection(dbConn);
  
  const result = await dbConn
    .select({
      promocao: promocoes,
      item: promocoesItens,
    })
    .from(promocoesItens)
    .innerJoin(promocoes, eq(promocoes.id, promocoesItens.promocaoId))
    .where(and(
      eq(promocoesItens.tenantId, tenantId),
      eq(promocoesItens.produtoId, produtoId),
      eq(promocoes.ativo, true),
      sql`${promocoes.inicio} <= ${data}`,
      sql`${promocoes.fim} >= ${data}`
    ))
    .orderBy(asc(promocoesItens.precoPromocional))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}
