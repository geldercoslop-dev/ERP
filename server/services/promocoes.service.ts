import { eq, and, desc, asc, sql } from "drizzle-orm";
import { getDb, getInsertId, promocoes, promocoesItens, insertAuditLog } from "../db/index";
import { nanoid } from "nanoid";

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

/**
 * Lista todas as promoções com paginação
 */
export async function listPromocoes(
  tenantId: number, 
  options?: { page?: number; pageSize?: number; ativo?: boolean; }
): Promise<{ items: any[]; total: number; page: number; pageSize: number; }> {
  if (!tenantId) return { items: [], total: 0, page: 1, pageSize: 50 };
  const dbConn = await getDb();
  if (!dbConn) return { items: [], total: 0, page: 1, pageSize: 50 };
  
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
  if (!tenantId) return null;
  const dbConn = await getDb();
  if (!dbConn) return null;
  
  const result = await dbConn.select().from(promocoes).where(and(eq(promocoes.tenantId, tenantId), eq(promocoes.id, id))).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Cria uma nova promoção
 */
export async function createPromocao(tenantId: number, data: CreatePromocaoInput) {
  if (!tenantId) throw new Error("tenantId is required");
  const dbConn = await getDb();
  if (!dbConn) throw new Error('Database not available');
  
  const res = await dbConn.insert(promocoes).values({
    tenantId,
    nome: data.nome,
    inicio: data.inicio,
    fim: data.fim,
    ativo: data.ativo ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const promocaoId = getInsertId(res as unknown as Record<string, unknown>);

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
  if (!tenantId) throw new Error("tenantId is required");
  const dbConn = await getDb();
  if (!dbConn) throw new Error('Database not available');
  
  const updateData = {
    ...data,
    updatedAt: new Date()
  };
  
  await dbConn.update(promocoes).set(updateData).where(and(eq(promocoes.tenantId, tenantId), eq(promocoes.id, id)));

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
  if (!tenantId) throw new Error("tenantId is required");
  const dbConn = await getDb();
  if (!dbConn) throw new Error('Database not available');
  
  // Hard delete (itens possuem cascade). Evita promo fantasma.
  await dbConn.delete(promocoes).where(and(eq(promocoes.tenantId, tenantId), eq(promocoes.id, id)));

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
  if (!tenantId) return [];
  const dbConn = await getDb();
  if (!dbConn) return [];

  // Verify promocao belongs to tenant
  const promo = await dbConn.select().from(promocoes).where(and(eq(promocoes.tenantId, tenantId), eq(promocoes.id, promocaoId))).limit(1);
  if (!promo.length) return [];
  
  return await dbConn.select()
    .from(promocoesItens)
    .where(and(eq(promocoesItens.tenantId, tenantId), eq(promocoesItens.promocaoId, promocaoId)))
    .orderBy(asc(promocoesItens.id));
}

/**
 * Define os itens de uma promoção (remove todos e adiciona os novos)
 */
export async function setPromocaoItens(tenantId: number, promocaoId: number, itens: CreatePromocaoItemInput[]) {
  if (!tenantId) throw new Error("tenantId is required");
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");

  return await dbConn.transaction(async (tx) => {
    // Remover itens existentes
    await tx.delete(promocoesItens).where(and(eq(promocoesItens.tenantId, tenantId), eq(promocoesItens.promocaoId, promocaoId)));

    // Inserir novos itens
    if (itens.length > 0) {
      await tx.insert(promocoesItens).values(
        itens.map(item => ({
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
      payloadJson: JSON.stringify({ action: "set_itens", itens }),
      traceId: nanoid(10),
    });

    return { message: "Itens da promoção atualizados com sucesso" };
  });
}

/**
 * Adiciona um item a uma promoção
 */
export async function addPromocaoItem(tenantId: number, promocaoId: number, item: CreatePromocaoItemInput) {
  if (!tenantId) throw new Error("tenantId is required");
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  
  const result = await dbConn.insert(promocoesItens).values({
    tenantId,
    promocaoId,
    produtoId: item.produtoId,
    precoPromocional: String(item.precoPromocional),
    createdAt: new Date(),
  } as typeof promocoesItens.$inferInsert);

  const itemId = getInsertId(result as unknown as Record<string, unknown>);

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
  if (!tenantId) throw new Error("tenantId is required");
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  
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
  if (!tenantId) return [];
  const dbConn = await getDb();
  if (!dbConn) return [];
  
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
  if (!tenantId) return null;
  const dbConn = await getDb();
  if (!dbConn) return null;
  
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
