import { eq, and, desc, asc, sql } from "drizzle-orm";
import { getDb, promocoes, promocoesItens, insertAuditLog, getInsertId } from "../db/index.js";
import { nanoid } from "nanoid";
import { z } from "zod";
import { assertTenantId, assertDbConnection } from "../_core/errors/assertions.js";
import { ValidationError, InfrastructureError } from "../_core/errors/typed-errors.js";
import { toDbDateStrict } from "../utils/date.js";
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
export async function listPromocoes(tenantId, options) {
    assertTenantId(tenantId);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const page = options?.page ?? 1;
    const pageSize = Math.min(options?.pageSize ?? 50, 100);
    const offset = (page - 1) * pageSize;
    // Construir condições
    const conditions = [eq(promocoes.tenantId, tenantId)];
    if (options?.ativo !== undefined) {
        conditions.push(eq(promocoes.ativo, options.ativo ? 1 : 0));
    }
    // Executar consultas em paralelo para melhor performance
    const [items, totalResult] = await Promise.all([
        dbConn.select()
            .from(promocoes)
            .where(and(...conditions))
            .orderBy(desc(promocoes.inicio))
            .limit(pageSize)
            .offset(offset),
        dbConn.select({ count: sql `count(*)` })
            .from(promocoes)
            .where(and(...conditions))
    ]);
    const total = Number(totalResult[0]?.count ?? 0);
    return { items, total, page, pageSize };
}
/**
 * Busca promoção por ID
 */
export async function getPromocaoById(tenantId, id) {
    assertTenantId(tenantId);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const result = await dbConn.select().from(promocoes).where(and(eq(promocoes.tenantId, tenantId), eq(promocoes.id, id))).limit(1);
    return result.length > 0 ? result[0] : null;
}
/**
 * Cria uma nova promoção
 */
export async function createPromocao(tenantId, data) {
    assertTenantId(tenantId);
    const payload = CreatePromocaoSchema.parse(data);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const res = await dbConn.insert(promocoes).values({
        tenantId,
        nome: payload.nome,
        inicio: toDbDateStrict(payload.inicio),
        fim: toDbDateStrict(payload.fim),
        ativo: (payload.ativo ?? true) ? 1 : 0,
        createdAt: toDbDateStrict(new Date()),
        updatedAt: toDbDateStrict(new Date()),
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
export async function updatePromocao(tenantId, id, data) {
    assertTenantId(tenantId);
    const payload = UpdatePromocaoSchema.parse(data);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const updateData = {};
    if (payload.nome !== undefined)
        updateData.nome = payload.nome;
    if (payload.inicio !== undefined)
        updateData.inicio = toDbDateStrict(payload.inicio);
    if (payload.fim !== undefined)
        updateData.fim = toDbDateStrict(payload.fim);
    if (payload.ativo !== undefined)
        updateData.ativo = payload.ativo ? 1 : 0;
    updateData.updatedAt = toDbDateStrict(new Date());
    const existing = await getPromocaoById(tenantId, id);
    if (!existing)
        throw new ValidationError("Promoção não encontrada");
    await dbConn.update(promocoes).set(updateData).where(and(eq(promocoes.tenantId, tenantId), eq(promocoes.id, id)));
    const updated = await getPromocaoById(tenantId, id);
    if (!updated)
        throw new InfrastructureError("Falha ao atualizar promoção");
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
export async function deletePromocao(tenantId, id) {
    assertTenantId(tenantId);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const existing = await getPromocaoById(tenantId, id);
    if (!existing)
        throw new ValidationError("Promoção não encontrada");
    // Hard delete (itens possuem cascade). Evita promo fantasma.
    await dbConn.delete(promocoes).where(and(eq(promocoes.tenantId, tenantId), eq(promocoes.id, id)));
    const deleted = await getPromocaoById(tenantId, id);
    if (deleted)
        throw new InfrastructureError("Falha ao excluir promoção");
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
export async function getPromocaoItens(tenantId, promocaoId) {
    assertTenantId(tenantId);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    // Verify promocao belongs to tenant
    const promo = await dbConn.select().from(promocoes).where(and(eq(promocoes.tenantId, tenantId), eq(promocoes.id, promocaoId))).limit(1);
    if (!promo.length)
        return []; // Ausência legítima - promoção não encontrada
    return await dbConn.select()
        .from(promocoesItens)
        .where(and(eq(promocoesItens.tenantId, tenantId), eq(promocoesItens.promocaoId, promocaoId)))
        .orderBy(asc(promocoesItens.id));
}
/**
 * Define os itens de uma promoção (remove todos e adiciona os novos)
 */
export async function setPromocaoItens(tenantId, promocaoId, itens) {
    assertTenantId(tenantId);
    const itensValidos = z.array(PromocaoItemSchema).parse(itens);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    return await dbConn.transaction(async (tx) => {
        // Remover itens existentes
        await tx.delete(promocoesItens).where(and(eq(promocoesItens.tenantId, tenantId), eq(promocoesItens.promocaoId, promocaoId)));
        // Inserir novos itens
        if (itensValidos.length > 0) {
            await tx.insert(promocoesItens).values(itensValidos.map(item => ({
                tenantId,
                promocaoId,
                produtoId: item.produtoId,
                precoPromocional: String(item.precoPromocional),
                createdAt: toDbDateStrict(new Date()),
            })));
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
export async function addPromocaoItem(tenantId, promocaoId, item) {
    assertTenantId(tenantId);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const result = await dbConn.insert(promocoesItens).values({
        tenantId,
        promocaoId,
        produtoId: item.produtoId,
        precoPromocional: String(item.precoPromocional),
        createdAt: toDbDateStrict(new Date()),
    });
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
export async function removePromocaoItem(tenantId, itemId) {
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
export async function getPromocoesAtivas(tenantId, data = new Date()) {
    assertTenantId(tenantId);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    return await dbConn.select()
        .from(promocoes)
        .where(and(eq(promocoes.tenantId, tenantId), eq(promocoes.ativo, 1), sql `${promocoes.inicio} <= ${data}`, sql `${promocoes.fim} >= ${data}`))
        .orderBy(asc(promocoes.fim));
}
/**
 * Verifica se um produto tem promoção ativa
 */
export async function getPromocaoAtivaByProduto(tenantId, produtoId, data = new Date()) {
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
        .where(and(eq(promocoesItens.tenantId, tenantId), eq(promocoesItens.produtoId, produtoId), eq(promocoes.ativo, 1), sql `${promocoes.inicio} <= ${data}`, sql `${promocoes.fim} >= ${data}`))
        .orderBy(asc(promocoesItens.precoPromocional))
        .limit(1);
    return result.length > 0 ? result[0] : null;
}
