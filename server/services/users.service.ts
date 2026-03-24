import { eq, and, desc, asc, sql, type SQL } from "drizzle-orm";
import { getDb, getInsertId, insertAuditLog, normalizeNomeSobrenome } from "../db/index";
import type { NewUser as InsertUser, NewVendedor as InsertVendedor, Database } from "../db/index";
import type { User, Vendedor } from "../db/index";
import { users, vendedores } from "../../drizzle/schema";
import { nanoid } from "nanoid";
import { recordQueryTime } from "../_core/system-monitor";
import { auditLog } from "../_core/audit-log";

// Types
export type CreateVendedorInput = InsertVendedor;

/**
 * Cria ou atualiza um usuário (vinculado ao tenant)
 */
export async function upsertUser(tenantId: number, user: InsertUser) {
  if (!tenantId) throw new Error("tenantId is required");
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  try {
    const dbConn = await getDb();
    if (!dbConn) throw new Error("Database not available");

    const existing = await dbConn.select().from(users).where(and(eq(users.tenantId, tenantId), eq(users.openId, user.openId))).limit(1);

    if (existing.length > 0) {
      // Update existing user
      await dbConn.update(users).set({
        name: user.name,
        email: user.email,
        updatedAt: new Date(),
      }).where(and(eq(users.tenantId, tenantId), eq(users.openId, user.openId)));

      // Auditoria Logger
      auditLog({
        action: "update",
        module: "admin",
        resourceId: user.openId,
        details: { action: "upsert_user_update", email: user.email },
        traceId: nanoid(10)
      });
    } else {
      // Create new user
      const result = await dbConn.insert(users).values({
        tenantId,
        openId: user.openId,
        name: user.name,
        email: user.email,
        role: user.role ?? "user",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Auditoria Logger
      auditLog({
        action: "create",
        module: "admin",
        resourceId: user.openId,
        details: { action: "upsert_user_create", email: user.email },
        traceId: nanoid(10)
      });
    }
  } catch (error) {
    console.error('[UserService] Error in upsertUser:', error);
    throw new Error(`Failed to upsert user: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Busca usuário pelo OpenID
 * @param tenantId - ID do tenant
 * @param openId - OpenID do usuário
 */
export async function getUserByOpenId(tenantId: number, openId: string): Promise<User | null> {
  if (!tenantId || !openId) return null;
  
  const dbConn = await getDb();
  if (!dbConn) return null;
  
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
export async function getUserById(id: number, tenantId?: number): Promise<User | null> {
  const dbConn = await getDb();
  if (!dbConn) return null;
  
  const result = tenantId
    ? await dbConn.select().from(users).where(and(eq(users.tenantId, tenantId), eq(users.id, id))).limit(1)
    : await dbConn.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

/**
 * Atualiza último login do usuário
 */
export async function touchLastSignedIn(tenantId: number, userId: number): Promise<void> {
  if (!tenantId) return;
  const dbConn = await getDb();
  if (!dbConn) return;

  await dbConn.update(users).set({ lastSignedIn: new Date() }).where(and(eq(users.tenantId, tenantId), eq(users.id, userId)));
}

/**
 * Lista usuários com paginação e filtros
 */
export async function listUsers(
  tenantId: number,
  options: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    active?: boolean;
    sortBy?: "name" | "createdAt" | "lastSignedInAt";
    sortOrder?: "asc" | "desc";
  } = {}
): Promise<{ users: User[]; total: number; page: number; limit: number }> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");

  const { page = 1, limit = 50, search, role, active, sortBy = "name", sortOrder = "asc" } = options;
  const offset = (page - 1) * limit;

  // Build query conditions
  const conditions = [eq(users.tenantId, tenantId)];
  
  if (search) {
    conditions.push(sql`(name LIKE ${`%${search}%`} OR email LIKE ${`%${search}%`})`);
  }
  
  if (role && (role === "user" || role === "admin")) {
    conditions.push(eq(users.role, role as "user" | "admin"));
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
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(and(...conditions));

  recordQueryTime('users', 'listUsers', Date.now() - startTime);

  return {
    users: result,
    total: countResult[0]?.count || 0,
    page,
    limit
  };
}

/**
 * Cria ou atualiza um vendedor (vinculado ao tenant)
 */
export async function upsertVendedor(tenantId: number, vendedor: InsertVendedor) {
  if (!tenantId) throw new Error("tenantId is required");
  if (!vendedor.nome) {
    throw new Error("Vendedor nome is required");
  }

  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");

  const { nomeNorm, sobrenomeNorm } = normalizeNomeSobrenome(vendedor.nome);
  const nomeVendedor = [nomeNorm, sobrenomeNorm].filter(Boolean).join(" ").trim() || String(vendedor.nome);

  const existing = await dbConn.select().from(vendedores).where(and(eq(vendedores.tenantId, tenantId), eq(vendedores.nome, vendedor.nome))).limit(1);

  if (existing.length > 0) {
    // Update existing vendedor
    await dbConn.update(vendedores).set({
      nome: nomeVendedor,
      telefone: vendedor.telefone || null,
      email: vendedor.email || null,
      updatedAt: new Date(),
    }).where(and(eq(vendedores.tenantId, tenantId), eq(vendedores.nome, vendedor.nome)));

    // Auditoria Logger
    auditLog({
      action: "update",
      module: "admin",
      resourceId: String(existing[0].id),
      details: { action: "upsert_vendedor_update", nome: vendedor.nome }
    });
  } else {
    // Create new vendedor
    const result = await dbConn.insert(vendedores).values({
      tenantId,
      nome: nomeVendedor,
      telefone: vendedor.telefone || null,
      email: vendedor.email || null,
      ativo: vendedor.ativo ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Auditoria Logger
    auditLog({
      action: "create",
      module: "admin",
      resourceId: String(getInsertId(result)),
      details: { action: "upsert_vendedor_create", nome: vendedor.nome }
    });
  }
}

/**
 * Busca vendedor pelo ID
 */
export async function getVendedorById(id: number, tenantId?: number): Promise<Vendedor | null> {
  const dbConn = await getDb();
  if (!dbConn) return null;
  
  const result = tenantId
    ? await dbConn.select().from(vendedores).where(and(eq(vendedores.tenantId, tenantId), eq(vendedores.id, id))).limit(1)
    : await dbConn.select().from(vendedores).where(eq(vendedores.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

/**
 * Lista vendedores com paginação e filtros
 */
export async function listVendedores(
  tenantId: number,
  options: {
    page?: number;
    limit?: number;
    search?: string;
    active?: boolean;
    sortBy?: "nome" | "createdAt" | "comissao";
    sortOrder?: "asc" | "desc";
  } = {}
): Promise<{ vendedores: Vendedor[]; total: number; page: number; limit: number }> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");

  const { page = 1, limit = 50, search, active, sortBy = "nome", sortOrder = "asc" } = options;
  const offset = (page - 1) * limit;

  // Build query conditions
  const conditions = [eq(vendedores.tenantId, tenantId)];
  
  if (search) {
    conditions.push(sql`(nome LIKE ${`%${search}%`} OR telefone LIKE ${`%${search}%`} OR email LIKE ${`%${search}%`})`);
  }
  
  if (typeof active === "boolean") {
    conditions.push(eq(vendedores.ativo, active));
  }

  // Build order by
  let orderBy: SQL<unknown>;
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
    .select({ count: sql<number>`count(*)` })
    .from(vendedores)
    .where(and(...conditions));

  recordQueryTime('vendedores', 'listVendedores', Date.now() - startTime);

  return {
    vendedores: result,
    total: countResult[0]?.count || 0,
    page,
    limit
  };
}

/**
 * Ativa ou desativa um vendedor
 */
export async function toggleVendedor(tenantId: number, id: number, active: boolean): Promise<{ success: boolean; message: string }> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");

  const result = await dbConn
    .update(vendedores)
    .set({ ativo: active, updatedAt: new Date() })
    .where(and(eq(vendedores.tenantId, tenantId), eq(vendedores.id, id)));

  const affected = Array.isArray(result) ? (result[0] as { affectedRows?: number })?.affectedRows : (result as { affectedRows?: number })?.affectedRows;
  if (affected === 0) {
    return { success: false, message: "Vendedor não encontrado" };
  }

  // Auditoria Logger
  auditLog({
    action: "update",
    module: "admin",
    resourceId: String(id),
    details: { action: "toggle_vendedor", active }
  });

  return { success: true, message: `Vendedor ${active ? "ativado" : "desativado"} com sucesso` };
}

/**
 * Remove um vendedor (soft delete)
 */
export async function removeVendedor(tenantId: number, id: number): Promise<{ success: boolean; message: string }> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");

  const result = await dbConn
    .update(vendedores)
    .set({ ativo: false, updatedAt: new Date() })
    .where(and(eq(vendedores.tenantId, tenantId), eq(vendedores.id, id)));

  const affected = Array.isArray(result) ? (result[0] as { affectedRows?: number })?.affectedRows : (result as { affectedRows?: number })?.affectedRows;
  if (affected === 0) {
    return { success: false, message: "Vendedor não encontrado" };
  }

  // Auditoria Logger
  auditLog({
    action: "delete",
    module: "admin",
    resourceId: String(id),
    details: { action: "remove_vendedor" }
  });

  return { success: true, message: "Vendedor removido com sucesso" };
}

export { getVendedorByNome } from "../db/core";

export async function getUserByDisplayName(displayName: string): Promise<User | null> {
  const dbConn = await getDb();
  if (!dbConn) return null;
  const term = displayName.trim().toLowerCase();
  const result = await dbConn
    .select()
    .from(users)
    .where(sql`LOWER(${users.name}) = ${term}`)
    .limit(1);
  return result[0] ?? null;
}
