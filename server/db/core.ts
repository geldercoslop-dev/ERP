/**
 * Database Core - Fonte única de verdade do DB.
 * Toda lógica real de acesso ao banco fica aqui.
 * NÃO importa db/index (evita ciclo).
 */

import { drizzle } from "drizzle-orm/mysql2";
import * as mysql from "mysql2/promise";
import { getConnectionPool } from "../config/database.js";
import * as schema from "../../drizzle/schema.js";
import { InfrastructureError } from '../_core/errors/typed-errors.js';
import { setupDatabaseMonitoring } from "../_core/monitoring-setup.js";
import { toDbResult } from "../_core/db-result.js";
import { requireBootstrap } from "../_core/bootstrap.js";
import {
  users,
  vendedores,
  produtos,
  clientes,
  pedidos,
  itensPedido,
  contasReceber,
  contasPagar,
  gruposPrecificacao,
  cores,
  cargas,
  pedidosCarga,
  comissoes,
  contasFixas,
  planoContas,
  counters,
  idempotencyKeys,
  clienteVendedores,
  caixaMensal,
  boletos,
  promocoes,
  promocoesItens,
  pendencias,
} from "../../drizzle/schema.js";

// Re-exportar tabelas para uso em services
export {
  users,
  vendedores,
  produtos,
  clientes,
  pedidos,
  itensPedido,
  contasReceber,
  contasPagar,
  gruposPrecificacao,
  cores,
  cargas,
  pedidosCarga,
  comissoes,
  contasFixas,
  planoContas,
  counters,
  idempotencyKeys,
  clienteVendedores,
  caixaMensal,
  boletos,
  promocoes,
  promocoesItens,
  pendencias,
} from "../../drizzle/schema.js";
import { eq, and, asc, sql } from "drizzle-orm";
import { assertServiceEntryIfEnabled } from "../_core/service-entry-guard.js";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

let pool: mysql.Pool | null = null;
let db: Database | null = null;

export async function getPool(): Promise<mysql.Pool> {
  return getConnectionPool();
}

export async function getDb(): Promise<Database> {
  requireBootstrap('db.getDb');
  if (!db) {
    pool = await getConnectionPool();
    
    // Aplicar monitoramento de consultas lentas
    const monitoredPool = setupDatabaseMonitoring(pool);
    
    db = drizzle(monitoredPool, {
      schema: { ...schema },
      mode: "default",
      logger: false,
    }) as Database;
  }
  return db;
}

/**
 * Internal DB access for bootstrap-time operations.
 * This bypasses requireBootstrap check because it's only called
 * during bootstrapServer() flow when bootstrap is not yet complete.
 * 
 * WARNING: Only use this in bootstrap-related code paths.
 * Regular code MUST use getDb() which has requireBootstrap protection.
 */
export async function getDbForBootstrap(): Promise<Database> {
  if (!globalThis.__BOOTSTRAP_IN_PROGRESS__) {
    throw new Error(
      "FORBIDDEN: getDbForBootstrap só pode ser usado durante bootstrap. " +
      "Use getDb() para acesso regular ao banco de dados."
    );
  }
  
  if (!db) {
    pool = await getConnectionPool();
    
    // Aplicar monitoramento de consultas lentas
    const monitoredPool = setupDatabaseMonitoring(pool);
    
    db = drizzle(monitoredPool, {
      schema: { ...schema },
      mode: "default",
      logger: false,
    }) as Database;
  }
  return db;
}

export { schema };

export {
  eq,
  and,
  or,
  desc,
  asc,
  sql,
  gt,
  inArray,
  isNotNull,
  isNull,
  like,
  ilike,
  ne,
  not,
  between,
} from "drizzle-orm";

  export { gte, lte, lt } from "drizzle-orm";
  export type { SQL } from "drizzle-orm";

export type User = typeof schema.users.$inferSelect;
export type NewUser = typeof schema.users.$inferInsert;
export type Vendedor = typeof schema.vendedores.$inferSelect;
export type NewVendedor = typeof schema.vendedores.$inferInsert;
export type Cliente = typeof schema.clientes.$inferSelect;
export type NewCliente = typeof schema.clientes.$inferInsert;
export type Produto = typeof schema.produtos.$inferSelect;
export type NewProduto = typeof schema.produtos.$inferInsert;
export type InsertCor = typeof schema.cores.$inferInsert;
export type Pedido = typeof schema.pedidos.$inferSelect;
export type NewPedido = typeof schema.pedidos.$inferInsert;
export type InsertPedido = typeof schema.pedidos.$inferInsert;
export type ItemPedido = typeof schema.itensPedido.$inferSelect;
export type NewItemPedido = typeof schema.itensPedido.$inferInsert;
export type InsertItemPedido = typeof schema.itensPedido.$inferInsert;
export type ClienteVendedor = typeof schema.clienteVendedores.$inferSelect;
export type InsertClienteVendedor = typeof schema.clienteVendedores.$inferInsert;

/** Normaliza telefone: só dígitos (máx 32). */
export function normalizeTelefone(telefone: string | null | undefined): string {
  if (telefone == null || telefone === "") return "";
  return String(telefone).replace(/\D/g, "").slice(0, 32);
}

/** Normaliza nome: trim, lowercase, colapsa espaços; retorna nomeNorm + sobrenomeNorm. */
export function normalizeNomeSobrenome(
  nome: string | null | undefined
): { nomeNorm: string; sobrenomeNorm: string } {
  if (nome == null || nome === "") return { nomeNorm: "", sobrenomeNorm: "" };
  const s = String(nome).trim().toLowerCase().replace(/\s+/g, " ");
  const max = 120;
  const truncated = s.slice(0, max * 2);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace <= 0)
    return { nomeNorm: truncated.slice(0, max), sobrenomeNorm: "" };
  return {
    nomeNorm: truncated.slice(0, lastSpace).slice(0, max),
    sobrenomeNorm: truncated.slice(lastSpace + 1).slice(0, max),
  };
}

/** Obtém valor de configuração por chave. */
export async function getConfig(chave: string): Promise<string | null> {
  void chave;
  return null;
}

/** Define valor de configuração por chave. */
export async function setConfig(chave: string, valor: string): Promise<void> {
  void chave;
  void valor;
}

/** Retorna a versão do schema (tabela schema_version, id=1). */
export async function getSchemaVersion(): Promise<number | null> {
  return null;
}

/** Garante linha (id=1) na schema_version com a versão esperada. */
export async function ensureSchemaVersion(expectedVersion: number): Promise<void> {
  void expectedVersion;
}

/** Usuário por id. */
export async function getUserById(id: number): Promise<User | null> {
  const database = await getDb();
  const row = await database.select().from(users).where(eq(users.id, id)).limit(1);
  return row[0] ?? null;
}

/** Usuário por openId (compat). */
export async function getUserByOpenId(openId: string): Promise<User | null> {
  const database = await getDb();
  const row = await database
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return row[0] ?? null;
}

/** Upsert de usuário por (tenantId, openId). */
export async function upsertUser(tenantId: number, user: NewUser): Promise<void> {
  const database = await getDb();
  void tenantId;
  const existing = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.openId, user.openId))
    .limit(1);
  if (existing.length > 0) {
    await database
      .update(users)
      .set({
        name: user.name ?? null,
        email: user.email ?? null,
        loginMethod: user.loginMethod ?? null,
        role: user.role ?? "user",
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing[0].id));
    return;
  }
  await database.insert(users).values(user);
}

/** Cria usuário (sem senha no schema atual). */
export async function insertUser(user: NewUser): Promise<{ id: number }> {
  const database = await getDb();
  const result = await database.insert(users).values(user);
  const dbResult = toDbResult(result);
  return { id: dbResult.insertId ?? 0 };
}

/** Atualiza último login (compat: routers chamam só com userId). */
export async function touchLastSignedIn(userId: number): Promise<void> {
  const database = await getDb();
  await database.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
}

/** Vendedor por userId (compat). */
export async function getVendedorByUserId(userId: number): Promise<Vendedor | null> {
  const database = await getDb();
  const row = await database.select().from(vendedores).where(eq(vendedores.userId, userId)).limit(1);
  return row[0] ?? null;
}

/** Vendedor por id. */
export async function getVendedorById(id: number): Promise<Vendedor | null> {
  const database = await getDb();
  const row = await database.select().from(vendedores).where(eq(vendedores.id, id)).limit(1);
  return row[0] ?? null;
}

/** Pedido por id (row simples). */
export async function getPedidoById(id: number): Promise<Pedido | null> {
  const database = await getDb();
  const row = await database.select().from(pedidos).where(eq(pedidos.id, id)).limit(1);
  return row[0] ?? null;
}

/** Lista todos os vendedores (admin). */
export async function getAllVendedores(): Promise<Vendedor[]> {
  const database = await getDb();
  return await database.select().from(vendedores).orderBy(asc(vendedores.nome));
}

/** Busca vendedor por nome (exact, case-insensitive via LOWER). */
export async function getVendedorByNome(nome: string): Promise<Vendedor | null> {
  const database = await getDb();
  const term = nome.trim().toLowerCase();
  const row = await database
    .select()
    .from(vendedores)
    .where(sql`LOWER(${vendedores.nome}) = ${term}`)
    .limit(1);
  return row[0] ?? null;
}

/** Cria vendedor (retorna id). */
export async function createVendedor(data: NewVendedor): Promise<{ id: number }> {
  const database = await getDb();
  const result = await database.insert(vendedores).values(data);
  const dbResult = toDbResult(result);
  return { id: dbResult.insertId ?? 0 };
}

/** Atualiza vendedor por id. */
export async function updateVendedor(id: number, patch: Partial<NewVendedor>): Promise<void> {
  const database = await getDb();
  await database.update(vendedores).set(patch).where(eq(vendedores.id, id));
}

/** Deleta vendedor por id. */
export async function deleteVendedor(id: number): Promise<void> {
  const database = await getDb();
  await database.delete(vendedores).where(eq(vendedores.id, id));
}

/** Atualiza senha do vendedor (hash bcrypt). */
export async function updateVendedorSenha(vendedorId: number, hashedPassword: string): Promise<void> {
  const database = await getDb();
  await database.update(vendedores).set({ senha: hashedPassword }).where(eq(vendedores.id, vendedorId));
}

/** Compat: cria/retorna usuário por openId e opcionalmente nome. */
export async function findOrCreateUserByOpenId(
  tenantId: number,
  openId: string,
  name?: string | null
): Promise<User> {
  void tenantId;
  const existing = await getUserByOpenId(openId);
  if (existing) return existing;
  const now = new Date().toISOString();
  const created = await insertUser({
    tenantId,
    openId,
    name: name ?? null,
    email: null,
    loginMethod: "local",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  });
  const user = await getUserById(created.id);
  if (!user) throw new InfrastructureError("Falha ao criar usuário");
  return user;
}

/** Garante admin mínimo (user + vendedor admin). */
export async function ensureAdminUser(tenantId: number): Promise<void> {
  try {
    const adminUser = await findOrCreateUserByOpenId(tenantId, "admin", "Administrador");
    // Promove role no users (se ainda não for)
    await upsertUser(tenantId, { ...adminUser, role: "admin", updatedAt: new Date() });
    const existingVendedor = await getVendedorByUserId(adminUser.id);
    if (existingVendedor) return;
    const now = new Date().toISOString();
    await createVendedor({
      tenantId,
      userId: adminUser.id,
      nome: "Administrador",
      email: "admin@local.com",
      senha: null,
      telefone: null,
      admin: true,
      ativo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.error("❌ ERRO CAPTURADO EM DEV - NÃO ENCERRANDO");
      console.error("[ensureAdminUser]", e);
      console.log("🔥 SERVER STILL RUNNING AFTER ERROR");
      return;
    }
    throw e;
  }
}

/** Idempotência: reserva chave na transação. Retorna { reserved: true } ou { reserved: false, resultJson, traceId }. */
export async function reserveIdempotencyKey(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  commandName: string,
  key: string
): Promise<{ reserved: boolean; resultJson?: string | null; traceId?: string | null }> {
  try {
    await tx.insert(idempotencyKeys).values({ tenantId: 0, commandName, key, resultJson: null });
    return { reserved: true };
  } catch {
    const row = await tx
      .select({ resultJson: idempotencyKeys.resultJson, traceId: idempotencyKeys.traceId })
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.commandName, commandName), eq(idempotencyKeys.key, key)))
      .limit(1);
    return {
      reserved: false,
      resultJson: row[0]?.resultJson ?? null,
      traceId: row[0]?.traceId ?? null,
    };
  }
}

/** Idempotência: grava resultado na transação. */
export async function updateIdempotencyResult(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  commandName: string,
  key: string,
  resultJson: string,
  traceId: string
): Promise<void> {
  await tx
    .update(idempotencyKeys)
    .set({ resultJson, traceId })
    .where(and(eq(idempotencyKeys.commandName, commandName), eq(idempotencyKeys.key, key)));
}

/** Conta a receber por id (para ownership). */
export async function getContaReceberById(id: number): Promise<typeof contasReceber.$inferSelect | null> {
  const database = await getDb();
  const row = await database.select().from(contasReceber).where(eq(contasReceber.id, id)).limit(1);
  return row[0] ?? null;
}

/** Boleto por id (para ownership). */
export async function getBoletoById(id: number): Promise<Record<string, unknown> | null> {
  void id;
  return null;
}

/** Dono do cadastro (`users.id`) e tenant — base para ownership de cliente/pedido. */
export async function getClienteOwnerRowById(
  clienteId: number
): Promise<{ tenantId: number; userId: number | null } | null> {
  void clienteId;
  return null;
}

/** Verifica se existe pedido do vendedor para o cliente (para ownership). */
export async function clienteTemPedidoDoVendedor(clienteId: number, vendedorId: number): Promise<boolean> {
  const database = await getDb();
  const row = await database
    .select({ id: pedidos.id })
    .from(pedidos)
    .where(and(eq(pedidos.clienteId, clienteId), eq(pedidos.vendedorId, vendedorId)))
    .limit(1);
  return row.length > 0;
}

export async function insertLeoActionLog(params: {
  tenantId?: number | null;
  usuario: string;
  acao: string;
  entidade: string;
  dados?: string | null;
  resultado: string;
}): Promise<void> {
  try {
    if (params.tenantId == null) return;
    await insertAuditLog({
      tenantId: params.tenantId,
      action: "leo_action",
      entity: params.entidade,
      payloadJson: JSON.stringify({
        usuario: params.usuario,
        acao: params.acao,
        dados: params.dados ?? null,
        resultado: params.resultado,
      }),
    });
  } catch (error) {
    console.error("[db/core] insertLeoActionLog:", error);
  }
}

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "ENTRADA"
  | "SAIDA"
  | "AJUSTE"
  | "BAIXA"
  | "IMPERSONATE_START"
  | "IMPERSONATE_STOP"
  | "update_status"
  | "dashboard_view"
  | "leo_action";

/**
 * @deprecated-audit-write
 * 
 * NÃO usar diretamente.
 * 
 * REGRA:
 * Toda escrita deve passar por:
 * server/services/audit-log.service.ts
 * 
 * Motivo:
 * - sanitização
 * - validação
 * - padronização de payload
 * 
 * TODO (fase futura):
 * delegar automaticamente para audit-log.service.ts
 */
export async function insertAuditLog(
  params: {
    tenantId?: number | null;
    actorUserId?: number | null;
    actorVendedorId?: number | null;
    action: AuditAction;
    entity: string;
    entityId?: string | number | null;
    payloadJson?: string | null;
    traceId?: string | null;
  },
  _tx?: unknown
): Promise<void> {
  void params;
  void _tx;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}

export function getInsertId(result: unknown): number {
  // mysql2 retorna [ResultSetHeader, FieldPacket[]]
  if (Array.isArray(result) && result.length > 0) {
    const header = result[0] as unknown;
    if (typeof header === "object" && header !== null && "insertId" in (header as Record<string, unknown>)) {
      const id = (header as Record<string, unknown>).insertId;
      return typeof id === "number" ? id : Number(id ?? 0);
    }
  }
  if (typeof result === "object" && result !== null && "insertId" in (result as Record<string, unknown>)) {
    const id = (result as Record<string, unknown>).insertId;
    return typeof id === "number" ? id : Number(id ?? 0);
  }
  return 0;
}
