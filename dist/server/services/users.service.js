import { eq, and, desc, asc, sql } from "drizzle-orm";
import { getDb, getInsertId, normalizeNomeSobrenome } from "../db/index.js";
import { users, vendedores } from "../../drizzle/schema.js";
import { nanoid } from "nanoid";
import { recordQueryTime } from "../_core/system-monitor.js";
import { logAuditAction } from "./audit-log.service.js";
import { assertTenantId, assertDbConnection } from "../_core/errors/assertions.js";
/**
 * Cria ou atualiza um usuário (vinculado ao tenant)
 */
export async function upsertUser(tenantId, user) {
    assertTenantId(tenantId);
    if (!user.openId) {
        return { success: false, error: "User openId is required for upsert" };
    }
    try {
        const dbConn = await getDb();
        assertDbConnection(dbConn);
        const existing = await dbConn.select().from(users).where(and(eq(users.tenantId, tenantId), eq(users.openId, user.openId))).limit(1);
        if (existing.length > 0) {
            // Update existing user
            await dbConn.update(users).set({
                name: user.name,
                email: user.email,
                updatedAt: new Date().toISOString(),
            }).where(and(eq(users.tenantId, tenantId), eq(users.openId, user.openId)));
            // Auditoria Logger
            await logAuditAction("update", "users", { action: "upsert_user_update", email: user.email }, {
                tenantId,
                entityId: user.openId,
                traceId: nanoid(10)
            });
        }
        else {
            // Create new user
            const result = await dbConn.insert(users).values({
                tenantId,
                openId: user.openId,
                name: user.name,
                email: user.email,
                role: user.role ?? "user",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
            // Auditoria Logger
            await logAuditAction("create", "users", { action: "upsert_user_create", email: user.email }, {
                tenantId,
                entityId: user.openId,
                traceId: nanoid(10)
            });
        }
        // Return success
        const updatedUser = await dbConn.select().from(users).where(and(eq(users.tenantId, tenantId), eq(users.openId, user.openId))).limit(1);
        return { success: true, data: updatedUser[0] };
    }
    catch (error) {
        console.error('[UserService] Error in upsertUser:', error);
        return { success: false, error: `Failed to upsert user: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
}
/**
 * Busca usuário pelo OpenID
 * @param tenantId - ID do tenant
 * @param openId - OpenID do usuário
 */
export async function getUserByOpenId(tenantId, openId) {
    if (!tenantId || !openId)
        return null;
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const result = await dbConn
        .select()
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.openId, openId)))
        .limit(1);
    return result.length > 0 ? result[0] : null;
}
/**
 * Busca usuário pelo ID
 * @param id - ID do usuário
 * @param tenantId - Opcional (usado para isolamento ou validação)
 */
export async function getUserById(id, tenantId) {
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const result = tenantId
        ? await dbConn.select().from(users).where(and(eq(users.tenantId, tenantId), eq(users.id, id))).limit(1)
        : await dbConn.select().from(users).where(eq(users.id, id)).limit(1);
    return result.length > 0 ? result[0] : null;
}
/**
 * Busca usuário pelo openId sem filtro de tenant (para sessões legadas sem contexto de tenant).
 */
export async function getUserByOpenIdGlobal(openId) {
    if (!openId)
        return null;
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const result = await dbConn.select().from(users).where(eq(users.openId, openId)).limit(1);
    return result.length > 0 ? result[0] : null;
}
/**
 * Atualiza último login do usuário
 */
export async function touchLastSignedIn(tenantId, userId) {
    assertTenantId(tenantId);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    await dbConn.update(users).set({ lastSignedIn: new Date().toISOString() }).where(and(eq(users.tenantId, tenantId), eq(users.id, userId)));
}
/**
 * Lista usuários com paginação e filtros
 */
export async function listUsers(tenantId, options = {}) {
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const { page = 1, limit = 50, search, role, active, sortBy = "name", sortOrder = "asc" } = options;
    const offset = (page - 1) * limit;
    // Build query conditions
    const conditions = [eq(users.tenantId, tenantId)];
    if (search) {
        conditions.push(sql `(name LIKE ${`%${search}%`} OR email LIKE ${`%${search}%`})`);
    }
    if (role && (role === "user" || role === "admin")) {
        conditions.push(eq(users.role, role));
    }
    // Build order by
    const orderByColumn = ((() => {
        switch (sortBy) {
            case "name":
                return users.name;
            case "createdAt":
                return users.createdAt;
            case "lastSignedInAt":
                return users.lastSignedIn;
            default:
                return users.name;
        }
    })());
    const orderBy = sortOrder === "desc" ? desc(orderByColumn) : asc(orderByColumn);
    const startTime = Date.now();
    const result = await dbConn
        .select()
        .from(users)
        .where(and(...conditions))
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);
    // Get total count
    const countResult = await dbConn
        .select({ count: sql `count(*)` })
        .from(users)
        .where(and(...conditions));
    recordQueryTime('users', 'listUsers', Date.now() - startTime);
    return {
        success: true,
        data: {
            users: result,
            total: countResult[0]?.count || 0,
            page,
            limit
        }
    };
}
/**
 * Cria ou atualiza um vendedor (vinculado ao tenant)
 */
export async function upsertVendedor(tenantId, vendedor) {
    try {
        assertTenantId(tenantId);
        if (!vendedor.nome) {
            return { success: false, error: "Vendedor nome is required" };
        }
        const dbConn = await getDb();
        assertDbConnection(dbConn);
        const { nomeNorm, sobrenomeNorm } = normalizeNomeSobrenome(vendedor.nome);
        const nomeVendedor = [nomeNorm, sobrenomeNorm].filter(Boolean).join(" ").trim() || String(vendedor.nome);
        const existing = await dbConn.select().from(vendedores).where(and(eq(vendedores.tenantId, tenantId), eq(vendedores.nome, vendedor.nome))).limit(1);
        if (existing.length > 0) {
            // Update existing vendedor
            await dbConn.update(vendedores).set({
                nome: nomeVendedor,
                telefone: vendedor.telefone || null,
                email: vendedor.email || null,
                updatedAt: new Date().toISOString(),
            }).where(and(eq(vendedores.tenantId, tenantId), eq(vendedores.nome, vendedor.nome)));
            // Auditoria Logger
            void logAuditAction("update", "admin", { action: "upsert_vendedor_update", nome: vendedor.nome }, { tenantId, entityId: String(existing[0].id) });
            // Return updated vendedor
            const updatedVendedor = await dbConn.select().from(vendedores).where(eq(vendedores.id, existing[0].id)).limit(1);
            return { success: true, data: updatedVendedor[0] };
        }
        else {
            // Create new vendedor
            const result = await dbConn.insert(vendedores).values({
                tenantId, // Usar tenantId (não tenant_id) para Drizzle
                nome: nomeVendedor,
                telefone: vendedor.telefone || null,
                email: vendedor.email || null,
                ativo: vendedor.ativo ? 1 : 0, // Corrigir: converter boolean para tinyint
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
            const vendedorId = getInsertId(result);
            // Auditoria Logger
            void logAuditAction("create", "admin", { action: "upsert_vendedor_create", nome: vendedor.nome }, { tenantId, entityId: String(vendedorId) });
            // Return created vendedor
            const createdVendedor = await dbConn.select().from(vendedores).where(eq(vendedores.id, vendedorId)).limit(1);
            return { success: true, data: createdVendedor[0] };
        }
    }
    catch (error) {
        console.error('[UserService] Error in upsertVendedor:', error);
        return { success: false, error: `Failed to upsert vendedor: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
}
/**
 * Busca vendedor pelo ID
 */
export async function getVendedorById(id, tenantId) {
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const result = tenantId
        ? await dbConn.select().from(vendedores).where(and(eq(vendedores.tenantId, tenantId), eq(vendedores.id, id))).limit(1)
        : await dbConn.select().from(vendedores).where(eq(vendedores.id, id)).limit(1);
    return result.length > 0 ? result[0] : null;
}
/**
 * Lista vendedores com paginação e filtros
 */
export async function listVendedores(tenantId, options = {}) {
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const { page = 1, limit = 50, search, active, sortBy = "nome", sortOrder = "asc" } = options;
    const offset = (page - 1) * limit;
    // Build query conditions
    const conditions = [eq(vendedores.tenantId, tenantId)];
    if (search) {
        conditions.push(sql `(nome LIKE ${`%${search}%`} OR telefone LIKE ${`%${search}%`} OR email LIKE ${`%${search}%`})`);
    }
    if (typeof active === "boolean") {
        conditions.push(eq(vendedores.ativo, active ? 1 : 0)); // Corrigir: converter boolean para tinyint
    }
    // Build order by
    let orderBy;
    switch (sortBy) {
        case "nome":
            orderBy = sortOrder === "desc" ? desc(vendedores.nome) : asc(vendedores.nome);
            break;
        case "createdAt":
            orderBy = sortOrder === "desc" ? desc(vendedores.createdAt) : asc(vendedores.createdAt);
            break;
        default:
            orderBy = asc(vendedores.nome);
    }
    const startTime = Date.now();
    const result = await dbConn
        .select()
        .from(vendedores)
        .where(and(...conditions))
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);
    // Get total count
    const countResult = await dbConn
        .select({ count: sql `count(*)` })
        .from(vendedores)
        .where(and(...conditions));
    recordQueryTime('vendedores', 'listVendedores', Date.now() - startTime);
    return {
        success: true,
        data: {
            vendedores: result,
            total: countResult[0]?.count || 0,
            page,
            limit
        }
    };
}
/**
 * Ativa ou desativa um vendedor
 */
export async function toggleVendedor(tenantId, id, active) {
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const result = await dbConn
        .update(vendedores)
        .set({ ativo: active ? 1 : 0, updatedAt: new Date().toISOString() })
        .where(and(eq(vendedores.tenantId, tenantId), eq(vendedores.id, id)));
    const affected = Array.isArray(result) ? result[0]?.affectedRows : result?.affectedRows;
    if (affected === 0) {
        return { success: false, message: "Vendedor não encontrado" };
    }
    // Auditoria Logger
    void logAuditAction("update", "admin", { action: "toggle_vendedor", active }, { tenantId, entityId: String(id) });
    return { success: true, message: `Vendedor ${active ? "ativado" : "desativado"} com sucesso` };
}
/**
 * Remove um vendedor (soft delete)
 */
export async function removeVendedor(tenantId, id) {
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const result = await dbConn
        .update(vendedores)
        .set({ ativo: 0, updatedAt: new Date().toISOString() })
        .where(and(eq(vendedores.tenantId, tenantId), eq(vendedores.id, id)));
    const affected = Array.isArray(result) ? result[0]?.affectedRows : result?.affectedRows;
    if (affected === 0) {
        return { success: false, message: "Vendedor não encontrado" };
    }
    // Auditoria Logger
    void logAuditAction("delete", "admin", { action: "remove_vendedor" }, { tenantId, entityId: String(id) });
    return { success: true, message: "Vendedor removido com sucesso" };
}
export { getVendedorByNome } from "../db/core.js";
export async function getUserByDisplayName(displayName) {
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const term = displayName.trim().toLowerCase();
    const result = await dbConn
        .select()
        .from(users)
        .where(sql `LOWER(${users.name}) = ${term}`)
        .limit(1);
    return result[0] ?? null;
}
