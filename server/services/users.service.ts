import { eq, and, desc, asc, sql, type SQL } from "drizzle-orm";
import { getDb, getInsertId, insertAuditLog, normalizeNomeSobrenome } from "../db/index.js";
import type { NewUser as InsertUser, NewVendedor as InsertVendedor, Database } from "../db/index.js";
import type { User, Vendedor } from "../db/index.js";
import { users, vendedores } from "../../drizzle/schema.js";
import { nanoid } from "nanoid";
import { recordQueryTime } from "../_core/system-monitor.js";
import { logAuditAction } from "./audit-log.service.js";

// Types
export type CreateVendedorInput = InsertVendedor;

/**
 * Cria ou atualiza um usuário (vinculado ao tenant)
 */
export async function upsertUser(tenantId: number, user: InsertUser): Promise<{ success: boolean; data?: User; error?: string }> {
  if (!tenantId) return { success: false, error: "tenantId is required" };
  if (!user.openId) {
    return { success: false, error: "User openId is required for upsert" };
  }

  try {
    const dbConn = await getDb();
    if (!dbConn) return { success: false, error: "Database not available" };

    const existing = await dbConn.select().from(users).where(and(eq(users.tenantId, tenantId), eq(users.openId, user.openId))).limit(1);

    if (existing.length > 0) {
      // Update existing user
      await dbConn.update(users).set({
        name: user.name,
        email: user.email,
        updatedAt: new Date(),
      }).where(and(eq(users.tenantId, tenantId), eq(users.openId, user.openId)));

      // Auditoria Logger
      await logAuditAction(
        "update",
        "users",
        { action: "upsert_user_update", email: user.email },
        {
          tenantId,
          entityId: user.openId,
          traceId: nanoid(10)
        }
      );
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
      await logAuditAction(
        "create",
        "users",
        { action: "upsert_user_create", email: user.email },
        {
          tenantId,
          entityId: user.openId,
          traceId: nanoid(10)
        }
      );
    }

    // Return success
    const updatedUser = await dbConn.select().from(users).where(and(eq(users.tenantId, tenantId), eq(users.openId, user.openId))).limit(1);
    return { success: true, data: updatedUser[0] };
  } catch (error) {
    console.error('[UserService] Error in upsertUser:', error);
    return { success: false, error: `Failed to upsert user: ${error instanceof Error ? error.message : 'Unknown error'}` };
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
): Promise<{ success: boolean; data?: { users: User[]; total: number; page: number; limit: number }; error?: string }> {
  const dbConn = await getDb();
  if (!dbConn) return { success: false, error: "Database not available" };

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
export async function upsertVendedor(tenantId: number, vendedor: InsertVendedor): Promise<{ success: boolean; data?: Vendedor; error?: string }> {
  try {
    if (!tenantId) return { success: false, error: "tenantId is required" };
    if (!vendedor.nome) {
      return { success: false, error: "Vendedor nome is required" };
    }

    const dbConn = await getDb();
    if (!dbConn) return { success: false, error: "Database not available" };

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
      void logAuditAction(
        "update",
        "admin",
        { action: "upsert_vendedor_update", nome: vendedor.nome },
        { tenantId, entityId: String(existing[0].id) }
      );

      // Return updated vendedor
      const updatedVendedor = await dbConn.select().from(vendedores).where(eq(vendedores.id, existing[0].id)).limit(1);
      return { success: true, data: updatedVendedor[0] };
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

      const vendedorId = getInsertId(result);

      // Auditoria Logger
      void logAuditAction(
        "create",
        "admin",
        { action: "upsert_vendedor_create", nome: vendedor.nome },
        { tenantId, entityId: String(vendedorId) }
      );

      // Return created vendedor
      const createdVendedor = await dbConn.select().from(vendedores).where(eq(vendedores.id, vendedorId)).limit(1);
      return { success: true, data: createdVendedor[0] };
    }
  } catch (error) {
    console.error('[UserService] Error in upsertVendedor:', error);
    return { success: false, error: `Failed to upsert vendedor: ${error instanceof Error ? error.message : 'Unknown error'}` };
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
): Promise<{ success: boolean; data?: { vendedores: Vendedor[]; total: number; page: number; limit: number }; error?: string }> {
  const dbConn = await getDb();
  if (!dbConn) return { success: false, error: "Database not available" };

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
export async function toggleVendedor(tenantId: number, id: number, active: boolean): Promise<{ success: boolean; message: string }> {
  const dbConn = await getDb();
  if (!dbConn) return { success: false, message: "Database not available" };

  const result = await dbConn
    .update(vendedores)
    .set({ ativo: active, updatedAt: new Date() })
    .where(and(eq(vendedores.tenantId, tenantId), eq(vendedores.id, id)));

  const affected = Array.isArray(result) ? (result[0] as { affectedRows?: number })?.affectedRows : (result as { affectedRows?: number })?.affectedRows;
  if (affected === 0) {
    return { success: false, message: "Vendedor não encontrado" };
  }

  // Auditoria Logger
  void logAuditAction(
    "update",
    "admin",
    { action: "toggle_vendedor", active },
    { tenantId, entityId: String(id) }
  );

  return { success: true, message: `Vendedor ${active ? "ativado" : "desativado"} com sucesso` };
}

/**
 * Remove um vendedor (soft delete)
 */
export async function removeVendedor(tenantId: number, id: number): Promise<{ success: boolean; message: string }> {
  const dbConn = await getDb();
  if (!dbConn) return { success: false, message: "Database not available" };

  const result = await dbConn
    .update(vendedores)
    .set({ ativo: false, updatedAt: new Date() })
    .where(and(eq(vendedores.tenantId, tenantId), eq(vendedores.id, id)));

  const affected = Array.isArray(result) ? (result[0] as { affectedRows?: number })?.affectedRows : (result as { affectedRows?: number })?.affectedRows;
  if (affected === 0) {
    return { success: false, message: "Vendedor não encontrado" };
  }

  // Auditoria Logger
  void logAuditAction(
    "delete",
    "admin",
    { action: "remove_vendedor" },
    { tenantId, entityId: String(id) }
  );

  return { success: true, message: "Vendedor removido com sucesso" };
}

export { getVendedorByNome } from "../db/core.js";

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
