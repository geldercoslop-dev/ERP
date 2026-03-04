import { eq, and, or, desc, asc, sql, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import * as mysql from "mysql2/promise";
import { getConnectionPool, executeQuery } from "./config/database";

// Reexport: usado pelo router (joins/filtros) sem duplicar imports.
export { eq, and, or, desc, asc, sql, inArray };
export * from "../drizzle/schema";
import { 
  users,
  vendedores,
  produtos,
  cores,
  clientes,
  clienteVendedores,
  pedidos,
  itensPedido,
  cargas,
  pedidosCarga,
  comissoes,
  gruposPrecificacao,
  pendencias,
  counters,
  contasFixas,
  contasPagar,
  contasReceber,
  caixaMensal,
  planoContas,
  boletos,
  pagamentosBoleto,
  configuracoes,
  produtoVariacoes,
  promocoes,
  promocoesItens,
  schemaVersion,
  auditLog,
  idempotencyKeys,
} from "../drizzle/schema";
import { nanoid } from "nanoid";
import { ENV } from './_core/env';
import { EXPECTED_SCHEMA_VERSION } from './_core/schemaVersion';

/** Normaliza telefone: só dígitos (máx 32). */
export function normalizeTelefone(telefone: string | null | undefined): string {
  if (telefone == null || telefone === '') return '';
  const digits = String(telefone).replace(/\D/g, '');
  return digits.slice(0, 32);
}

/** Normaliza nome completo: trim, lowercase, colapsa espaços; retorna nomeNorm + sobrenomeNorm (última palavra). */
export function normalizeNomeSobrenome(nome: string | null | undefined): { nomeNorm: string; sobrenomeNorm: string } {
  if (nome == null || nome === '') return { nomeNorm: '', sobrenomeNorm: '' };
  const s = String(nome).trim().toLowerCase().replace(/\s+/g, ' ');
  const max = 120;
  const truncated = s.slice(0, max * 2);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace <= 0) return { nomeNorm: truncated.slice(0, max), sobrenomeNorm: '' };
  const nomeNorm = truncated.slice(0, lastSpace).slice(0, max);
  const sobrenomeNorm = truncated.slice(lastSpace + 1).slice(0, max);
  return { nomeNorm, sobrenomeNorm };
}

// Tipos inferidos do schema (evita depender de aliases que podem não existir no schema.ts).
export type InsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertVendedor = typeof vendedores.$inferInsert;
export type Vendedor = typeof vendedores.$inferSelect;
export type InsertProduto = typeof produtos.$inferInsert;
export type Produto = typeof produtos.$inferSelect;
export type InsertCor = typeof cores.$inferInsert;
export type Cor = typeof cores.$inferSelect;
export type InsertCliente = typeof clientes.$inferInsert;
export type Cliente = typeof clientes.$inferSelect;
/** Input para createCliente: nome e telefone obrigatórios (validados no router); norms calculados internamente. */
export type CreateClienteInput = {
  nome: string;
  telefone: string;
  telefoneRecado?: string | null;
  rua?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  referencia?: string | null;
  condominio?: string | null;
  bloco?: string | null;
  apartamento?: string | null;
  id?: number;
  vendedorIdPrincipal?: number;
};
export type InsertClienteVendedor = typeof clienteVendedores.$inferInsert;
export type ClienteVendedor = typeof clienteVendedores.$inferSelect;
export type InsertPedido = typeof pedidos.$inferInsert;
export type Pedido = typeof pedidos.$inferSelect;
export type InsertItemPedido = typeof itensPedido.$inferInsert;
export type ItemPedido = typeof itensPedido.$inferSelect;
export type InsertCarga = typeof cargas.$inferInsert;
export type Carga = typeof cargas.$inferSelect;
export type InsertPedidoCarga = typeof pedidosCarga.$inferInsert;
export type PedidoCarga = typeof pedidosCarga.$inferSelect;
export type InsertComissao = typeof comissoes.$inferInsert;
export type Comissao = typeof comissoes.$inferSelect;
export type InsertGrupoPrecificacao = typeof gruposPrecificacao.$inferInsert;
export type GrupoPrecificacao = typeof gruposPrecificacao.$inferSelect;
export type InsertPendencia = typeof pendencias.$inferInsert;
export type Pendencia = typeof pendencias.$inferSelect;

/** Tipo do erro MySQL (mysql2 / Drizzle). */
type MySqlError = Error & { code?: string; errno?: number; sqlState?: string; sqlMessage?: string; sql?: string };

/** Log obrigatório em todo catch de query: err.code, err.errno, err.sqlState, err.sqlMessage e query (se houver). */
function logMySqlError(err: unknown, context?: string, query?: string) {
  const e = err as MySqlError;
  const prefix = context ? `[db ${context}]` : "[db]";
  console.error(`${prefix} MySQL err.code:`, e?.code ?? "(não informado)");
  console.error(`${prefix} MySQL err.errno:`, e?.errno ?? "(não informado)");
  console.error(`${prefix} MySQL err.sqlState:`, e?.sqlState ?? "(não informado)");
  console.error(`${prefix} MySQL err.sqlMessage:`, e?.sqlMessage ?? e?.message ?? "(não informado)");
  if (query) console.error(`${prefix} query:`, query);
  if (e?.sql) console.error(`${prefix} sql (do erro):`, e.sql);
}

// Variáveis globais para manter o ORM
// Tipos do drizzle/mysql2 podem divergir entre Pool callback vs promise.
// O runtime funciona com mysql2/promise Pool; mantemos type como any para não bloquear o build.
let _db: any | null = null;
let _pool: mysql.Pool | null = null;
let _schemaEnsured = false;

/** Apenas valida conexão e status do schema (sem DDL). Todas alterações de schema via migrations Drizzle. */
async function ensureSchema(db: any) {
  if (_schemaEnsured) return;
  _schemaEnsured = true;
  try {
    await (db as any).execute(sql`SELECT 1`);
  } catch (e) {
    logMySqlError(e, "ensureSchema");
    console.warn('[Database] ensureSchema check:', (e as any)?.message || e);
  }
}

/**
 * Obtém uma instância do Drizzle ORM conectada ao banco de dados
 * Usa pool de conexões para melhor performance e resiliência
 */
export async function getDb() {
  // Se já temos uma instância válida, retorne-a
  if (_db) {
    return _db;
  }
  
  try {
    console.log("[Database] Inicializando Drizzle ORM com pool de conexões...");
    
    // Obter o pool de conexões (com retry automático)
    _pool = await getConnectionPool();
    
    // Criar instância do Drizzle com o pool
    _db = drizzle(_pool);
    
    // Garantir que o esquema está configurado
    await ensureSchema(_db);
    
    console.log("[Database] Drizzle ORM inicializado com sucesso");
    
    // Configurar evento para monitorar a saúde do pool.
    // Tipos do mysql2/promise não expõem todos os eventos, mas runtime é EventEmitter.
    (_pool as any).on?.("error", (err: any) => {
      console.error("[Database] Erro no pool de conexões:", err);

      const code = err?.code as string | undefined;
      if (
        code === "PROTOCOL_CONNECTION_LOST" ||
        code === "ECONNREFUSED" ||
        code === "ETIMEDOUT"
      ) {
        console.log("[Database] Conexão perdida. Resetando instâncias...");
        _db = null;
        _pool = null;
      }
    });
    
    return _db;
  } catch (error) {
    logMySqlError(error, "getDb");
    console.error("[Database] Falha ao inicializar Drizzle ORM:", error);
    
    // Fornecer dicas específicas com base no código de erro
    if ((error as MySqlError).code === 'ECONNREFUSED') {
      console.error("[Database] ERRO: Não foi possível conectar ao servidor MySQL.");
      console.error("[Database] Verifique se:");
      console.error("  1. O servidor MySQL está em execução");
      console.error("  2. O host e a porta estão corretos no DATABASE_URL ou variáveis DB_*");
      console.error("  3. Não há firewall bloqueando a conexão");
    } else if ((error as MySqlError).code === 'ER_ACCESS_DENIED_ERROR') {
      console.error("[Database] ERRO: Acesso negado ao banco de dados.");
      console.error("[Database] Verifique se o usuário e senha estão corretos nas variáveis de ambiente");
    } else if ((error as MySqlError).code === 'ER_BAD_DB_ERROR') {
      console.error("[Database] ERRO: O banco de dados não existe.");
      console.error("[Database] Você precisa criar o banco de dados 'vendas_app' no MySQL");
    }
    
    console.error("[Database] DICA: Execute 'npm run check:db' para diagnosticar problemas de conexão.");
    
    // Limpar referências em caso de erro
    _db = null;
    _pool = null;
    
    return null;
  }
}

/** Ações de auditoria (inclui movimentação estoque: ENTRADA, SAIDA, AJUSTE, BAIXA). */
export type AuditAction = "create" | "update" | "delete" | "ENTRADA" | "SAIDA" | "AJUSTE" | "BAIXA";

/** Registra ação na audit_log (sem senha nem dados sensíveis). Se tx for passado, usa a transação. */
export async function insertAuditLog(params: {
  actorUserId?: number | null;
  actorVendedorId?: number | null;
  action: AuditAction;
  entity: string;
  entityId?: string | number | null;
  payloadJson?: string | null;
  traceId?: string | null;
}, tx?: any): Promise<void> {
  const client = tx ?? await getDb();
  if (!client) return;
  try {
    await client.insert(auditLog).values({
      actorUserId: params.actorUserId ?? null,
      actorVendedorId: params.actorVendedorId ?? null,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId != null ? String(params.entityId) : null,
      payloadJson: params.payloadJson ?? null,
      traceId: params.traceId ?? null,
    } as any);
  } catch (e) {
    logMySqlError(e, "insertAuditLog");
  }
}

function isNoSuchTableError(err: any): boolean {
  const code = err?.code ?? err?.cause?.code ?? err?.nativeError?.code;
  const errno = err?.errno ?? err?.cause?.errno ?? err?.nativeError?.errno;
  return code === "ER_NO_SUCH_TABLE" || errno === 1146 || String(err?.message ?? "").includes("doesn't exist");
}

/** Retorna resultado já executado para (commandName, key), ou null. */
export async function getIdempotencyResult(
  commandName: string,
  key: string,
  tx?: any
): Promise<{ resultJson: string; traceId: string | null } | null> {
  const client = tx ?? await getDb();
  if (!client) return null;
  try {
    const rows = await client
      .select({ resultJson: idempotencyKeys.resultJson, traceId: idempotencyKeys.traceId })
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.commandName, commandName), eq(idempotencyKeys.key, key)))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return r.resultJson != null ? { resultJson: r.resultJson, traceId: r.traceId } : null;
  } catch (err: any) {
    if (isNoSuchTableError(err)) {
      throw new Error("Tabela idempotency_keys não existe. Rode: npm run db:migrate");
    }
    throw err;
  }
}

/**
 * Reserva a chave de idempotência dentro da transação (INSERT).
 * Retorna { reserved: true } se inseriu; { reserved: false, resultJson, traceId } se já existia (duplicata).
 * Em caso de "em processamento" (resultJson null na linha existente), resultJson será null.
 */
export async function reserveIdempotencyKey(
  tx: any,
  commandName: string,
  key: string
): Promise<
  | { reserved: true }
  | { reserved: false; resultJson: string | null; traceId: string | null }
> {
  try {
    await tx.insert(idempotencyKeys).values({
      key,
      commandName,
      resultJson: null,
      traceId: null,
    } as any);
    return { reserved: true };
  } catch (err: any) {
    if (isNoSuchTableError(err)) {
      throw new Error("Tabela idempotency_keys não existe. Rode: npm run db:migrate");
    }
    const code = err?.code ?? err?.cause?.code ?? err?.nativeError?.code;
    const errno = err?.errno ?? err?.cause?.errno ?? err?.nativeError?.errno;
    const isDup = code === "ER_DUP_ENTRY" || errno === 1062 || (err?.message && String(err.message).includes("Duplicate"));
    if (!isDup) throw err;
    const rows = await tx
      .select({ resultJson: idempotencyKeys.resultJson, traceId: idempotencyKeys.traceId })
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.commandName, commandName), eq(idempotencyKeys.key, key)))
      .limit(1);
    const r = rows[0];
    return {
      reserved: false,
      resultJson: r?.resultJson ?? null,
      traceId: r?.traceId ?? null,
    };
  }
}

/** Atualiza resultado da chave (dentro da mesma transação após handler). */
export async function updateIdempotencyResult(
  tx: any,
  commandName: string,
  key: string,
  resultJson: string,
  traceId: string | null
): Promise<void> {
  try {
    await tx
      .update(idempotencyKeys)
      .set({ resultJson, traceId } as any)
      .where(and(eq(idempotencyKeys.commandName, commandName), eq(idempotencyKeys.key, key)));
  } catch (err: any) {
    if (isNoSuchTableError(err)) {
      throw new Error("Tabela idempotency_keys não existe. Rode: npm run db:migrate");
    }
    throw err;
  }
}

/** @deprecated Use reserveIdempotencyKey + updateIdempotencyResult. Mantido para compat. */
export async function setIdempotencyResult(
  key: string,
  commandName: string,
  resultJson: string,
  traceId: string | null,
  tx?: any
): Promise<void> {
  const client = tx ?? await getDb();
  if (!client) return;
  try {
    await client.insert(idempotencyKeys).values({
      key,
      commandName,
      resultJson,
      traceId,
    } as any);
  } catch (err: any) {
    if (isNoSuchTableError(err)) {
      throw new Error("Tabela idempotency_keys não existe. Rode: npm run db:migrate");
    }
    throw err;
  }
}

// ===== USERS =====
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    logMySqlError(error, "upsertUser");
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/** Atualiza lastSignedIn e updatedAt do user (após login). */
export async function touchLastSignedIn(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    const now = new Date();
    await db.update(users).set({ lastSignedIn: now, updatedAt: now }).where(eq(users.id, userId));
  } catch (err) {
    logMySqlError(err, "touchLastSignedIn");
  }
}

/** Retorna user pelo openId; se não existir, cria e retorna. Usado por linkUser. */
export async function findOrCreateUserByOpenId(openId: string, name?: string | null): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const existing = await getUserByOpenId(openId);
  if (existing) return existing;
  try {
    const result = await db.insert(users).values({
      openId: openId.trim().toLowerCase(),
      name: name ?? openId,
      role: "user",
    });
    const id = (result as any)?.[0]?.insertId ?? (result as any)?.insertId;
    if (id) return await getUserById(Number(id));
  } catch (err) {
    logMySqlError(err, "findOrCreateUserByOpenId");
  }
  return undefined;
}

/** Garante que exista user admin (openId "admin", role "admin"). Chamado no boot. */
export async function ensureAdminUser(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const adminUser = await getUserByOpenId("admin");
  if (adminUser) return;
  try {
    await db.insert(users).values({
      openId: "admin",
      name: "Administrador",
      email: "admin@sistema.com",
      loginMethod: "simple",
      role: "admin",
    });
    console.log("Usuário admin (admin/admin123) criado automaticamente.");
  } catch (err) {
    logMySqlError(err, "ensureAdminUser");
  }
}

// ===== VENDEDORES =====
export async function createVendedor(data: InsertVendedor) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  try {
    console.log("[db.createVendedor] Iniciando criação de vendedor");
    
    // Prepare data with proper validation
    const nome = String(data.nome ?? "").trim();
    if (!nome) throw new Error("Nome é obrigatório");
    
    const senha = data.senha != null ? String(data.senha) : null;
    if (!senha) throw new Error("Senha é obrigatória");
    
    const admin = Boolean(data.admin);
    const ativo = true;
    const telefoneDb = (data.telefone != null && String(data.telefone).trim() !== "") ? String(data.telefone).trim() : null;
    const emailDb = (data.email != null && String(data.email).trim() !== "") ? String(data.email).trim() : null;
    const cidadeDb = (data.cidade != null && String(data.cidade).trim() !== "") ? String(data.cidade).trim() : null;

    console.log("[db.createVendedor] Dados validados:", { 
      nome, 
      admin, 
      ativo, 
      telefone: telefoneDb, 
      email: emailDb, 
      cidade: cidadeDb,
      senhaLength: senha ? senha.length : 0
    });

    // Verificar se já existe um vendedor com o mesmo nome
    const existingVendedor = await getVendedorByNome(nome);
    if (existingVendedor) {
      console.error(`[db.createVendedor] Já existe um vendedor com o nome: ${nome}`);
      throw new Error(`Já existe um vendedor com o nome: ${nome}`);
    }

    // Use Drizzle's insert; createdAt/updatedAt vêm do schema (defaultNow/onUpdateNow)
    try {
      const result = await db.insert(vendedores).values({
        nome,
        senha,
        admin,
        ativo,
        telefone: telefoneDb,
        email: emailDb,
        cidade: cidadeDb,
      });
      
      const insertId = (result as any)[0]?.insertId;
      console.log(`[db.createVendedor] Vendedor criado com sucesso. ID: ${insertId}`);
      
      // Verificar se o vendedor foi realmente criado
      const createdVendedor = await getVendedorById(insertId);
      if (createdVendedor) {
        console.log(`[db.createVendedor] Verificação: vendedor ${createdVendedor.nome} criado com sucesso`);
      } else {
        console.warn(`[db.createVendedor] Aviso: não foi possível verificar a criação do vendedor`);
      }
      
      return { ok: true, id: insertId };
    } catch (dbError) {
      logMySqlError(dbError, "createVendedor (Drizzle insert)", "INSERT vendedores (nome, senha, admin, ativo, telefone, email, cidade)");

      // Fallback: SQL raw sem createdAt/updatedAt (banco preenche por DEFAULT)
      try {
        console.log("[db.createVendedor] Tentando inserção com SQL raw");
        const [rawResult]: any = await (db as any).execute(sql`
          INSERT INTO vendedores (nome, senha, admin, ativo, telefone, email, cidade)
          VALUES (${nome}, ${senha}, ${admin ? 1 : 0}, ${1}, ${telefoneDb}, ${emailDb}, ${cidadeDb})
        `);
        const insertId = rawResult?.insertId;
        console.log(`[db.createVendedor] Vendedor criado com sucesso via SQL raw. ID: ${insertId}`);
        return { ok: true, id: insertId };
      } catch (rawErr) {
        logMySqlError(rawErr, "createVendedor (SQL raw)", "INSERT INTO vendedores (nome, senha, admin, ativo, telefone, email, cidade) VALUES (...)");
        const rawE = rawErr as MySqlError;
        const out = new Error(rawE?.sqlMessage ?? rawE?.message ?? "Erro ao inserir vendedor") as Error & { code?: string; sqlMessage?: string };
        out.code = rawE?.code;
        out.sqlMessage = rawE?.sqlMessage ?? rawE?.message;
        throw out;
      }
    }
  } catch (e: unknown) {
    logMySqlError(e, "createVendedor (outer)");
    const err = e as MySqlError;
    const sqlMessage = err?.sqlMessage ?? err?.message ?? "Erro ao inserir vendedor";
    const out = new Error(sqlMessage) as Error & { code?: string; sqlMessage?: string };
    out.code = err?.code;
    out.sqlMessage = sqlMessage;
    throw out;
  }
}

export async function getVendedorById(id: number) {
  try {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db.select().from(vendedores).where(eq(vendedores.id, id)).limit(1);
    return result.length > 0 ? result[0] : undefined;
  } catch (err) {
    logMySqlError(err, "getVendedorById");
    return undefined;
  }
}

/** Retorna vendedor cujo userId (users.id) é o informado. Usado pelo context quando cookie é userId. */
export async function getVendedorByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(vendedores)
    .where(eq(vendedores.userId, userId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/** Busca vendedor por nome (login). Case-insensitive. */
export async function getVendedorByNome(nome: string) {
  const db = await getDb();
  if (!db) return undefined;

  // Normaliza o nome para busca case-insensitive
  const term = nome.trim().toLowerCase();
  console.log(`[getVendedorByNome] Buscando vendedor: "${term}"`);
  
  // Busca todos os vendedores ativos
  let all: Array<typeof vendedores.$inferSelect> = [];
  try {
    all = await db.select().from(vendedores).where(eq(vendedores.ativo, true));
  } catch (error) {
    logMySqlError(error, "getVendedorByNome");
    return undefined;
  }
  
  // Busca por correspondência exata (case-insensitive)
  const found = all.find((v) => (v.nome ?? "").toLowerCase() === term);
  
  if (found) {
    console.log(`[getVendedorByNome] Encontrado vendedor com nome exato: ${found.nome}`);
    return found;
  }
  
  // Busca por correspondência parcial se não encontrar exata
  const partial = all.find((v) => (v.nome ?? "").toLowerCase().includes(term));
  
  if (partial) {
    console.log(`[getVendedorByNome] Encontrado vendedor com nome parcial: ${partial.nome}`);
    return partial;
  }
  
  console.log(`[getVendedorByNome] Nenhum vendedor encontrado para: "${term}"`);
  return undefined;
}

export async function getAllVendedores() {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(vendedores).where(eq(vendedores.ativo, true)).orderBy(asc(vendedores.nome));
}

export async function updateVendedor(id: number, data: Partial<InsertVendedor>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(vendedores).set(data).where(eq(vendedores.id, id));
}

/**
 * Atualiza a senha de um vendedor
 * Função especializada para migração de senhas em texto plano para hash
 */
export async function updateVendedorSenha(id: number, hashedPassword: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  try {
    console.log(`[updateVendedorSenha] Atualizando senha para vendedor ID ${id}`);
    
    await db.update(vendedores).set({
      senha: hashedPassword,
      updatedAt: new Date()
    }).where(eq(vendedores.id, id));
    
    console.log(`[updateVendedorSenha] Senha atualizada com sucesso para vendedor ID ${id}`);
    return true;
  } catch (error) {
    logMySqlError(error, "updateVendedorSenha");
    console.error(`[updateVendedorSenha] Erro ao atualizar senha para vendedor ID ${id}:`, error);
    throw new Error(`Falha ao atualizar senha: ${(error as Error).message}`);
  }
}

export async function deleteVendedor(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(vendedores).set({ ativo: false }).where(eq(vendedores.id, id));
}

// ===== PRODUTOS =====
export async function createProduto(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { cores: coresData, variacoes, ...produtoData } = data;
  
  // 1. Calcula estoque total
  let estoqueTotal = 0;
  if (coresData && coresData.length > 0) {
    estoqueTotal = coresData.reduce((sum: number, c: any) => sum + Number(c.estoque), 0);
  } else if (variacoes && variacoes.length > 0) {
    estoqueTotal = variacoes.reduce((sum: number, v: any) => sum + Number(v.estoque), 0);
  }

  // 2. Insere produto base
  const [result] = await db.insert(produtos).values({
    ...produtoData,
    estoque: estoqueTotal
  });
  const produtoId = result.insertId;

  // 3. Insere variações de cores
  if (coresData && coresData.length > 0) {
    for (const c of coresData) {
      await db.insert(produtoVariacoes).values({
        produtoId,
        corId: c.corId,
        estoque: c.estoque,
        acrescimoCusto: "0"
      });
    }
  }

  // 4. Insere variações extras (tamanho/espelho)
  if (variacoes && variacoes.length > 0) {
    for (const v of variacoes) {
      await db.insert(produtoVariacoes).values({
        produtoId,
        tamanho: v.tamanho,
        temEspelho: v.temEspelho,
        acrescimoCusto: v.acrescimoCusto.toString(),
        estoque: v.estoque
      });
    }
  }

  return { id: produtoId };
}

export async function getProdutoById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(produtos).where(eq(produtos.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllProdutos() {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(produtos).where(eq(produtos.ativo, true)).orderBy(asc(produtos.descricao));
}

/**
 * Retorna produtos com preço vigente (considera promoção ativa no dia).
 * - valorVendaBase: preço cadastrado
 * - valorVenda: preço vigente (promo ativa => promocional)
 * - promoAtiva/promoNome
 */
export async function getAllProdutosComPrecoVigente(refDate: Date = new Date()) {
  const db = await getDb();
  if (!db) return [] as any[];

  const items = await db.select().from(produtos).where(eq(produtos.ativo, true)).orderBy(asc(produtos.descricao));
  const ids = items.map((p) => p.id);
  if (ids.length === 0) return [];

  // Resumo de variações (cor/tamanho/espelho) para montar uma descrição operacional em UMA LINHA.
  // Regra:
  // - Se houver 1 cor distinta => usa essa cor.
  // - Se houver várias cores => usa a primeira (ordem alfabética) para manter a frase curta.
  // - Se houver 1 tamanho distinto (não vazio) => usa.
  // - Se qualquer variação tiver espelho => adiciona "COM ESPELHO".
  const variacoesRows: any[] = await (db as any).execute(sql`
    SELECT
      pv.produtoId as produtoId,
      GROUP_CONCAT(DISTINCT c.nome ORDER BY c.nome SEPARATOR ' | ') as cores,
      GROUP_CONCAT(DISTINCT NULLIF(TRIM(pv.tamanho), '') ORDER BY pv.tamanho SEPARATOR ' | ') as tamanhos,
      MAX(CASE WHEN pv.temEspelho = 1 THEN 1 ELSE 0 END) as temEspelho
    FROM produto_variacoes pv
    LEFT JOIN cores c ON c.id = pv.corId
    WHERE pv.produtoId IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    GROUP BY pv.produtoId;
  `);

  const variacoesMap = new Map<number, { cor?: string; tamanho?: string; temEspelho?: boolean }>();
  for (const r of (variacoesRows as any)?.[0] || variacoesRows || []) {
    const pid = Number(r.produtoId);
    if (!Number.isFinite(pid)) continue;

    const coresStr = String(r.cores || "").trim();
    const tamanhosStr = String(r.tamanhos || "").trim();

    const cor = coresStr ? coresStr.split("|")[0]?.trim() : "";
    const tamanho = tamanhosStr ? tamanhosStr.split("|")[0]?.trim() : "";

    variacoesMap.set(pid, {
      cor: cor || undefined,
      tamanho: tamanho || undefined,
      temEspelho: Number(r.temEspelho) === 1,
    });
  }

  // Busca promoções ativas e escolhe o menor preço promocional (se houver múltiplas).
  const rows: any[] = await (db as any).execute(sql`
    SELECT
      pi.produtoId as produtoId,
      MIN(pi.precoPromocional) as precoPromo,
      SUBSTRING_INDEX(GROUP_CONCAT(pr.nome ORDER BY pi.precoPromocional ASC SEPARATOR ' | '), ' | ', 1) as promoNome
    FROM promocoes pr
    INNER JOIN promocoes_itens pi ON pi.promocaoId = pr.id
    WHERE pr.ativo = 1
      AND pr.inicio <= ${refDate}
      AND pr.fim >= ${refDate}
      AND pi.produtoId IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    GROUP BY pi.produtoId;
  `);
  const promoMap = new Map<number, { precoPromo: number; promoNome: string }>();
  for (const r of rows?.[0] || rows || []) {
    const pid = Number(r.produtoId);
    if (!Number.isFinite(pid)) continue;
    promoMap.set(pid, { precoPromo: Number(r.precoPromo), promoNome: String(r.promoNome || '') });
  }

  return items.map((p: any) => {
    const base = Number(p.valorVenda);
    const promo = promoMap.get(p.id);
    const vigente = promo?.precoPromo && promo.precoPromo > 0 ? promo.precoPromo : base;

    const v = variacoesMap.get(p.id);
    const parts = [
      String(p.descricao || "").trim(),
      v?.cor ? String(v.cor).trim() : "",
      v?.tamanho ? String(v.tamanho).trim() : "",
      v?.temEspelho ? "COM ESPELHO" : "",
    ].filter(Boolean);
    return {
      ...p,
      valorVendaBase: base,
      valorVenda: vigente,
      promoAtiva: !!promo,
      promoNome: promo?.promoNome || null,
      // Frase única para o Estoque (ex: "ROUP FLORENCA BRANCO COM ESPELHO")
      descricaoOperacional: parts.join(" "),
    };
  });
}

export async function updateProduto(id: number, data: Partial<InsertProduto>, version?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Verificar se o produto existe
  const produtoAtual = await db.select().from(produtos).where(eq(produtos.id, id)).limit(1);
  if (produtoAtual.length === 0) {
    throw new Error(`Produto ID ${id} não encontrado`);
  }
  
  // PREVENÇÃO DE SOBRESCRITA: Verificar se o produto foi alterado desde que foi carregado
  if (version !== undefined) {
    const updatedAt = produtoAtual[0].updatedAt;
    const versionDate = new Date(version);
    
    if (updatedAt && updatedAt > versionDate) {
      throw new Error(`O produto foi modificado por outro usuário desde que você o abriu. Por favor, atualize a página e tente novamente.`);
    }
  }
  
  // Atualizar produto com timestamp atualizado
  const updateData = {
    ...data,
    updatedAt: new Date()
  };
  
  await db.update(produtos).set(updateData).where(eq(produtos.id, id));
  
  return { 
    success: true,
    version: new Date().getTime() // Retorna nova versão para próxima atualização
  };
}

export async function deleteProduto(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(produtos).set({ ativo: false }).where(eq(produtos.id, id));
}

// ===== PROMOÇÕES =====
export async function listPromocoes() {
  const db = await getDb();
  if (!db) return [] as any[];
  return await db.select().from(promocoes).orderBy(desc(promocoes.inicio));
}

export async function createPromocao(data: { nome: string; inicio: Date; fim: Date; ativo?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const res: any = await db.insert(promocoes).values({
    nome: data.nome,
    inicio: data.inicio,
    fim: data.fim,
    ativo: data.ativo ?? true,
  });
  // drizzle mysql2: insertId em res[0]?.insertId dependendo do driver.
  const insertId = (res as any)?.[0]?.insertId ?? (res as any)?.insertId;
  return { id: Number(insertId) };
}

export async function updatePromocao(id: number, data: Partial<{ nome: string; inicio: Date; fim: Date; ativo: boolean }>) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(promocoes).set(data as any).where(eq(promocoes.id, id));
}

export async function deletePromocao(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  // Hard delete (itens possuem cascade). Evita promo fantasma.
  await (db as any).delete(promocoes).where(eq(promocoes.id, id));
}

export async function getPromocaoItens(promocaoId: number) {
  const db = await getDb();
  if (!db) return [] as any[];
  return await db.select().from(promocoesItens).where(eq(promocoesItens.promocaoId, promocaoId));
}

export async function setPromocaoItens(promocaoId: number, itens: Array<{ produtoId: number; precoPromocional: number }>) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  // Estratégia segura: apaga tudo e recria (conjunto pequeno, simples, evita drift).
  await (db as any).delete(promocoesItens).where(eq(promocoesItens.promocaoId, promocaoId));
  if (itens.length === 0) return;
  await db.insert(promocoesItens).values(
    itens.map((i) => ({
      promocaoId,
      produtoId: i.produtoId,
      precoPromocional: i.precoPromocional.toFixed(2),
    })) as any
  );
}

/**
 * ATUALIZAÇÃO DE ESTOQUE COM LÓGICA DE PENDÊNCIAS (FIFO)
 * Invariante: produto.estoque >= 0. Toda movimentação registrada em audit_log.
 */
export async function updateEstoqueProduto(
  id: number,
  quantidade: number,
  audit?: { actorUserId?: number; actorVendedorId?: number; traceId?: string; motivo?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const res = await db.select({ estoque: produtos.estoque, descricao: produtos.descricao }).from(produtos).where(eq(produtos.id, id)).limit(1);
  const row = res[0];
  const saldoAnterior = Number(row?.estoque ?? 0);

  if (quantidade < 0 && saldoAnterior + quantidade < 0) {
    const msg = `Estoque insuficiente para baixa. Produto "${row?.descricao ?? id}": saldo atual ${saldoAnterior}, tentativa de baixa ${Math.abs(quantidade)}.`;
    const err = new Error(msg) as Error & { code?: string };
    err.code = "ESTOQUE_NEGATIVO";
    throw err;
  }
  
  // Se for entrada de mercadoria, processar pendências
  if (quantidade > 0) {
    let qtdRestante = quantidade;

    // 1) COLETA (pendências de venda sem estoque)
    // Prioridade: COMPRADO primeiro, depois PENDENTE; FIFO por data.
    const pendenciasAtivas = await db.select().from(pendencias)
      .where(and(eq(pendencias.produtoId, id), inArray(pendencias.status, ["PENDENTE", "COMPRADO"])))
      .orderBy(
        // drizzle aceita sql em orderBy
        asc(sql`CASE WHEN ${pendencias.status} = 'COMPRADO' THEN 0 ELSE 1 END`),
        asc(pendencias.dataPedido)
      );

    for (const p of pendenciasAtivas) {
      if (qtdRestante <= 0) break;
      const qtdParaBaixa = Math.min(p.quantidade, qtdRestante);

      if (qtdParaBaixa >= p.quantidade) {
        await db.update(pendencias)
          .set({ status: "RESOLVIDO", dataResolvido: new Date() })
          .where(eq(pendencias.id, p.id));
      } else {
        // Baixa parcial: reduz a quantidade pendente e mantém o status.
        await db.update(pendencias)
          .set({ quantidade: p.quantidade - qtdParaBaixa })
          .where(eq(pendencias.id, p.id));
      }
      qtdRestante -= qtdParaBaixa;
    }

    // 2) REPOSIÇÃO (pendências de compra para estoque)
    // Tabela criada em ensureSchema (reposicoes). Baixa FIFO por dataPedido.
    if (qtdRestante > 0) {
      const [repos]: any = await (db as any).execute(sql`
        SELECT id, quantidade
        FROM reposicoes
        WHERE produtoId = ${id} AND status = 'AGUARDANDO'
        ORDER BY dataPedido ASC, id ASC;
      `);
      const reposRows = (repos || []) as Array<{ id: number; quantidade: number }>;
      for (const r of reposRows) {
        if (qtdRestante <= 0) break;
        const qtdParaBaixa = Math.min(r.quantidade, qtdRestante);
        if (qtdParaBaixa >= r.quantidade) {
          await (db as any).execute(sql`
            UPDATE reposicoes SET status = 'RESOLVIDO' WHERE id = ${r.id};
          `);
        } else {
          await (db as any).execute(sql`
            UPDATE reposicoes SET quantidade = ${r.quantidade - qtdParaBaixa} WHERE id = ${r.id};
          `);
        }
        qtdRestante -= qtdParaBaixa;
      }
    }
  }

  // 3. Atualizar o estoque físico do produto
  await db.update(produtos).set({ 
    estoque: sql`${produtos.estoque} + ${quantidade}` 
  }).where(eq(produtos.id, id));

  const saldoNovo = saldoAnterior + quantidade;
  const action: AuditAction = quantidade > 0 ? "ENTRADA" : "SAIDA";
  await insertAuditLog({
    actorUserId: audit?.actorUserId ?? null,
    actorVendedorId: audit?.actorVendedorId ?? null,
    action,
    entity: "estoque",
    entityId: String(id),
    payloadJson: JSON.stringify({ quantidade, saldoAnterior, saldoNovo, motivo: audit?.motivo ?? "updateEstoqueProduto", produtoId: id }),
    traceId: audit?.traceId ?? nanoid(10),
  });
}

// ===== CORES =====
export async function createCor(data: InsertCor) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(cores).values(data);
  return result;
}

export async function getAllCores() {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(cores).orderBy(asc(cores.nome));
}

export async function updateCor(id: number, data: Partial<InsertCor>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(cores).set(data).where(eq(cores.id, id));
}

export async function deleteCor(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(cores).where(eq(cores.id, id));
}

// ===== CLIENTES =====

export async function getClienteById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(clientes).where(eq(clientes.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllClientes() {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(clientes).orderBy(asc(clientes.nome));
}

/** Clientes vinculados ao vendedor (cliente_vendedores). Por padrão lista só vinculados. */
export async function listClientesByVendedor(vendedorId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ clienteId: clienteVendedores.clienteId })
    .from(clienteVendedores)
    .where(eq(clienteVendedores.vendedorId, vendedorId));
  const idList: number[] = Array.from(new Set(rows.map((r) => r.clienteId).filter((id): id is number => id != null)));
  if (idList.length === 0) return [];
  return await db.select().from(clientes).where(inArray(clientes.id, idList)).orderBy(asc(clientes.nome));
}

/** Busca clientes por termo restrita a clientes vinculados ao vendedor. */
export async function searchClientesByVendedor(searchTerm: string, vendedorId: number) {
  const db = await getDb();
  if (!db) return [];
  const term = `%${searchTerm}%`;
  const rows = await db.select({ clienteId: clienteVendedores.clienteId })
    .from(clienteVendedores)
    .where(eq(clienteVendedores.vendedorId, vendedorId));
  const idList: number[] = Array.from(new Set(rows.map((r) => r.clienteId).filter((id): id is number => id != null)));
  if (idList.length === 0) return [];
  return await db.select().from(clientes)
    .where(and(
      inArray(clientes.id, idList),
      or(
        sql`LOWER(${clientes.nome}) LIKE LOWER(${term})`,
        sql`${clientes.telefone} LIKE ${term}`
      )
    ))
    .orderBy(asc(clientes.nome))
    .limit(50);
}

/** Retorna true se o cliente está vinculado ao vendedor (ou tem pedido do vendedor, compat). */
export async function clienteTemPedidoDoVendedor(clienteId: number, vendedorId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const vinculo = await db.select({ id: clienteVendedores.id }).from(clienteVendedores)
    .where(and(eq(clienteVendedores.clienteId, clienteId), eq(clienteVendedores.vendedorId, vendedorId)))
    .limit(1);
  if (vinculo.length > 0) return true;
  const rows = await db.select({ id: pedidos.id }).from(pedidos)
    .where(and(eq(pedidos.clienteId, clienteId), eq(pedidos.vendedorId, vendedorId)))
    .limit(1);
  return rows.length > 0;
}

/** Busca global: todos os clientes por nome/telefone (para vendedor escolher e vincular). */
export async function searchClientesGlobal(searchTerm: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const term = `%${searchTerm}%`;
  return await db.select().from(clientes)
    .where(or(
      sql`LOWER(${clientes.nome}) LIKE LOWER(${term})`,
      sql`${clientes.telefone} LIKE ${term}`,
      sql`${clientes.telefoneRecado} LIKE ${term}`
    ))
    .orderBy(asc(clientes.nome))
    .limit(limit);
}

/** Vendedor principal do cliente (tipo PRINCIPAL). Retorna { vendedorId, nome } ou null. */
export async function getVendedorPrincipalDoCliente(clienteId: number): Promise<{ vendedorId: number; nome: string } | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({
    vendedorId: vendedores.id,
    nome: vendedores.nome,
  })
    .from(clienteVendedores)
    .innerJoin(vendedores, eq(clienteVendedores.vendedorId, vendedores.id))
    .where(and(eq(clienteVendedores.clienteId, clienteId), eq(clienteVendedores.tipo, 'PRINCIPAL')))
    .limit(1);
  if (rows.length === 0) return null;
  return { vendedorId: rows[0].vendedorId, nome: rows[0].nome ?? '' };
}

/** Cria vínculo cliente ↔ vendedor (ignora se já existir). */
export async function createClienteVinculo(clienteId: number, vendedorId: number, tipo: 'PRINCIPAL' | 'SECUNDARIO' = 'SECUNDARIO') {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    await db.insert(clienteVendedores).values({ clienteId, vendedorId, tipo });
  } catch (e: any) {
    if (e?.errno !== 1062 && e?.code !== 'ER_DUP_ENTRY') throw e;
  }
}

/**
 * Garante vínculo (clienteId, vendedorId) de forma idempotente dentro de uma transação.
 * Se já existe vínculo, não faz nada. Se o cliente já tem PRINCIPAL com outro vendedor, insere SECUNDARIO; senão insere PRINCIPAL.
 */
export async function ensureClienteVendedorLink(tx: any, clienteId: number, vendedorId: number): Promise<void> {
  const existing = await tx.select({ id: clienteVendedores.id }).from(clienteVendedores)
    .where(and(eq(clienteVendedores.clienteId, clienteId), eq(clienteVendedores.vendedorId, vendedorId)))
    .limit(1);
  if (existing.length > 0) return;

  const principal = await tx.select({ id: clienteVendedores.id }).from(clienteVendedores)
    .where(and(eq(clienteVendedores.clienteId, clienteId), eq(clienteVendedores.tipo, 'PRINCIPAL')))
    .limit(1);
  const tipo: 'PRINCIPAL' | 'SECUNDARIO' = principal.length > 0 ? 'SECUNDARIO' : 'PRINCIPAL';

  try {
    await tx.insert(clienteVendedores).values({ clienteId, vendedorId, tipo });
  } catch (e: any) {
    if (e?.errno !== 1062 && e?.code !== 'ER_DUP_ENTRY') throw e;
  }
}

export async function createCliente(data: CreateClienteInput, vendedorIdPrincipal?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const raw = data as any;
  const telefone = raw.telefone === '' || raw.telefone == null ? null : raw.telefone;
  const telefoneNorm = normalizeTelefone(raw.telefone);
  const { nomeNorm, sobrenomeNorm } = normalizeNomeSobrenome(raw.nome);

  const existing = await db.select({ id: clientes.id }).from(clientes)
    .where(and(
      eq(clientes.telefoneNorm, telefoneNorm),
      eq(clientes.nomeNorm, nomeNorm.slice(0, 120)),
      eq(clientes.sobrenomeNorm, sobrenomeNorm.slice(0, 120))
    ))
    .limit(1);
  if (existing.length > 0) {
    const id = existing[0].id;
    if (vendedorIdPrincipal != null) {
      try {
        await db.insert(clienteVendedores).values({ clienteId: id, vendedorId: vendedorIdPrincipal, tipo: 'PRINCIPAL' });
      } catch (e: any) {
        if (e?.errno !== 1062 && e?.code !== 'ER_DUP_ENTRY') throw e;
      }
    }
    return { id };
  }

  const payload: InsertCliente = {
    nome: raw.nome,
    telefone,
    telefoneNorm: telefoneNorm.slice(0, 32),
    nomeNorm: nomeNorm.slice(0, 120),
    sobrenomeNorm: sobrenomeNorm.slice(0, 120),
    telefoneRecado: raw.telefoneRecado ?? null,
    rua: raw.rua ?? null,
    numero: raw.numero ?? null,
    bairro: raw.bairro ?? null,
    cidade: raw.cidade ?? null,
    uf: raw.uf ?? null,
    referencia: raw.referencia ?? null,
    condominio: raw.condominio ?? null,
    bloco: raw.bloco ?? null,
    apartamento: raw.apartamento ?? null,
  };
  if (raw.id != null) (payload as any).id = raw.id;
  const result = await db.insert(clientes).values(payload);
  const id = raw.id ?? (result as any)?.[0]?.insertId ?? (result as any)?.insertId;
  if (id == null) throw new Error("Falha ao obter id do cliente");
  if (vendedorIdPrincipal != null) {
    try {
      await db.insert(clienteVendedores).values({ clienteId: id, vendedorId: vendedorIdPrincipal, tipo: 'PRINCIPAL' });
    } catch (e: any) {
      if (e?.errno !== 1062 && e?.code !== 'ER_DUP_ENTRY') throw e;
    }
  }
  return { id };
}

export async function searchClientes(searchTerm: string) {
  const db = await getDb();
  if (!db) return [];
  
  const term = `%${searchTerm}%`;
  return await db.select().from(clientes)
    .where(or(
      sql`LOWER(${clientes.nome}) LIKE LOWER(${term})`,
      sql`${clientes.telefone} LIKE ${term}`
    ))
    .orderBy(asc(clientes.nome))
    .limit(50);
}

export async function updateCliente(id: number, data: Partial<InsertCliente>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const raw = data as any;
  const set: Record<string, unknown> = { ...raw };
  if (raw.nome !== undefined) {
    const { nomeNorm, sobrenomeNorm } = normalizeNomeSobrenome(raw.nome);
    set.nomeNorm = nomeNorm.slice(0, 120);
    set.sobrenomeNorm = sobrenomeNorm.slice(0, 120);
  }
  if (raw.telefone !== undefined) {
    set.telefoneNorm = normalizeTelefone(raw.telefone).slice(0, 32);
  }
  await db.update(clientes).set(set as any).where(eq(clientes.id, id));
}

// Versão SQL (usada pelo fluxo novo)
export async function deleteClienteById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(clientes).where(eq(clientes.id, id));
  return { success: true };
}


// ===== COUNTERS =====
export async function getNextCounter(name: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const counter = await db.select().from(counters).where(eq(counters.name, name)).limit(1);

  if (counter.length === 0) {
    await db.insert(counters).values({ name, seq: 1, free: null });
    return 1;
  }

  const current = counter[0];
  const nextNum = (current.seq ?? 0) + 1;

  // Mais seguro: nunca reaproveitar número (evita confusão em relatórios e fórmulas futuras).
  await db.update(counters).set({ seq: nextNum }).where(eq(counters.name, name));
  return nextNum;
}

// ===== PEDIDOS E ITENS =====
export async function createPedido(data: InsertPedido) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(pedidos).values(data);
  const pedidoId = (result[0] as any).insertId;

  // Criar conta provisória no Contas a Receber (30 dias)
  // Esta conta será removida quando a carga for baixada como BOLETO
  await db.insert(contasReceber).values({
    pedidoNumero: data.numero,
    clienteNome: data.clienteNome,
    vendedorId: data.vendedorId,
    descricao: `Conta Provisória - Pedido #${data.numero}`,
    valor: data.total,
    dataVencimento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 dias automático
    status: 'PENDENTE',
    observacoes: 'Gerada automaticamente no pedido. Será substituída na baixa da carga.',
  });

  return result;
}

/**
 * CRIAÇÃO DE ITENS COM GERAÇÃO DE PENDÊNCIAS
 * Se a venda resultar em estoque negativo, cria automaticamente uma pendência.
 */
export async function createItensPedido(items: InsertItemPedido[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  for (const item of items) {
    // 1. Inserir o item do pedido
    await db.insert(itensPedido).values(item);
    
    // 2. Se for produto do catálogo, atualizar estoque e verificar pendência
    if (item.tipo === "CATALOGO" && item.produtoId) {
      const produto = await getProdutoById(item.produtoId);
      if (produto) {
        const qtd = Number(item.quantidade ?? 0);
        const novoEstoque = Number(produto.estoque) - qtd;
        
        // Se o estoque ficar negativo, criar linha em pendências
        if (novoEstoque < 0) {
          // Quantidade pendente é o que faltou (ou a quantidade total da linha se já estava negativo)
          const qtdPendente = Number(produto.estoque) > 0 ? Math.abs(novoEstoque) : qtd;
          
          const pedido = await getPedidoById(item.pedidoId);
          
          await db.insert(pendencias).values({
            pedidoId: item.pedidoId,
            vendedorId: pedido?.vendedorId || 0,
            produtoId: item.produtoId,
            corId: item.corId,
            quantidade: qtdPendente,
            status: "PENDENTE"
          });
        }
        
        // Atualizar estoque (permitindo ficar negativo)
        await db.update(produtos).set({ estoque: novoEstoque }).where(eq(produtos.id, item.produtoId));
      }
    }
  }
}

export async function getPedidoById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(pedidos).where(eq(pedidos.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllPedidos() {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(pedidos).orderBy(desc(pedidos.createdAt));
}

export async function getItensByPedido(pedidoId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(itensPedido).where(eq(itensPedido.pedidoId, pedidoId));
}

// ===== PENDÊNCIAS =====
/** Lista pendências. Se vendedorId for informado, retorna apenas as do vendedor. */
export async function listPendencias(vendedorId?: number) {
  const db = await getDb();
  if (!db) return [];

  const statusFilter = inArray(pendencias.status, ["PENDENTE", "COMPRADO"]);
  const whereClause = vendedorId != null
    ? and(statusFilter, eq(pendencias.vendedorId, vendedorId))
    : statusFilter;

  return await db.select({
    id: pendencias.id,
    pedidoId: pendencias.pedidoId,
    pedidoNumero: pedidos.numero,
    vendedorNome: vendedores.nome,
    clienteNome: pedidos.clienteNome,
    produtoDescricao: produtos.descricao,
    produtoMarca: produtos.marca,
    corNome: cores.nome,
    quantidade: pendencias.quantidade,
    status: pendencias.status,
    dataPedido: pendencias.dataPedido,
  })
  .from(pendencias)
  .innerJoin(pedidos, eq(pendencias.pedidoId, pedidos.id))
  .innerJoin(vendedores, eq(pendencias.vendedorId, vendedores.id))
  .innerJoin(produtos, eq(pendencias.produtoId, produtos.id))
  .leftJoin(cores, eq(pendencias.corId, cores.id))
  .where(whereClause)
  .orderBy(asc(pendencias.dataPedido));
}

/** Atualiza status da pendência. Se vendedorId for informado, só atualiza se a pendência for desse vendedor. */
export async function updateStatusPendencia(id: number, status: "PENDENTE" | "COMPRADO" | "RESOLVIDO", vendedorId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: any = { status };
  if (status === "RESOLVIDO") {
    updateData.dataResolvido = new Date();
  }

  const whereClause = vendedorId != null
    ? and(eq(pendencias.id, id), eq(pendencias.vendedorId, vendedorId))
    : eq(pendencias.id, id);
  await db.update(pendencias).set(updateData).where(whereClause);
}

// (Restante das funções omitidas para brevidade, mantendo a estrutura original do arquivo)
// ... Fornecedores, Contas, Financeiro, etc.
export async function getAllGruposPrecificacao() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(gruposPrecificacao).orderBy(asc(gruposPrecificacao.nome));
}
export async function createGrupoPrecificacao(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(gruposPrecificacao).values(data);
}
export async function updateGrupoPrecificacao(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(gruposPrecificacao).set(data).where(eq(gruposPrecificacao.id, id));
}
export async function deleteGrupoPrecificacao(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(gruposPrecificacao).where(eq(gruposPrecificacao.id, id));
}
export async function listPlanoContas() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(planoContas).where(eq(planoContas.ativo, true));
}
export async function listContasPagar() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(contasPagar);
}
export async function listContasReceber() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(contasReceber);
}
export async function listContasFixas() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(contasFixas).where(eq(contasFixas.ativo, true));
}
export async function getAllComissoes() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(comissoes).orderBy(desc(comissoes.createdAt));
}

export async function getComissoesByVendedor(vendedorId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(comissoes)
    .where(eq(comissoes.vendedorId, vendedorId))
    .orderBy(desc(comissoes.createdAt));
}

export async function marcarComissaoPaga(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(comissoes)
    .set({ status: "PAGA" as any, dataPagamento: new Date() } as any)
    .where(eq(comissoes.id, id));
  return { ok: true as const };
}
export async function getAllCargas() {
  const db = await getDb();
  if (!db) return [];

  const queryDesc = "SELECT cargas + leftJoin pedidos_carga/pedidos, groupBy, orderBy createdAt";
  try {
    const rows = await db.select({
      id: cargas.id,
      numero: cargas.numero,
      cidadeRota: cargas.cidadeRota,
      dataEntrega: cargas.dataEntrega,
      status: cargas.status,
      createdAt: cargas.createdAt,
      totalPedidos: sql<number>`COUNT(${pedidosCarga.id})`,
      entregues: sql<number>`SUM(CASE WHEN ${pedidosCarga.entregue} THEN 1 ELSE 0 END)`,
      valorTotal: sql<string>`COALESCE(SUM(${pedidos.total}), 0)`,
      clientesResumo: sql<string>`COALESCE(GROUP_CONCAT(DISTINCT ${pedidos.clienteNome}), '')`,
    })
      .from(cargas)
      .leftJoin(pedidosCarga, eq(pedidosCarga.cargaId, cargas.id))
      .leftJoin(pedidos, eq(pedidos.id, pedidosCarga.pedidoId))
      .groupBy(cargas.id)
      .orderBy(desc(cargas.createdAt));
    return rows;
  } catch (err) {
    logMySqlError(err, "getAllCargas", queryDesc);
    throw err;
  }
}

/** Backup completo (JSON) para download ZIP. */
export async function gerarBackupCompleto() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [
    produtosRows,
    clientesRows,
    vendedoresRows,
    pedidosRows,
    coresRows,
    planoContasRows,
    contasFixasRows,
    contasPagarRows,
    contasReceberRows,
    comissoesRows,
    cargasRows,
  ] = await Promise.all([
    db.select().from(produtos),
    db.select().from(clientes),
    db.select().from(vendedores),
    db.select().from(pedidos),
    db.select().from(cores),
    db.select().from(planoContas),
    db.select().from(contasFixas),
    db.select().from(contasPagar),
    db.select().from(contasReceber),
    db.select().from(comissoes),
    db.select().from(cargas),
  ]);

  return {
    dataBackup: new Date().toISOString(),
    produtos: produtosRows,
    clientes: clientesRows,
    vendedores: vendedoresRows,
    pedidos: pedidosRows,
    cores: coresRows,
    // Schema atual não possui tabela dedicada de fornecedores.
    fornecedores: [] as any[],
    planoContas: planoContasRows,
    contasFixas: contasFixasRows,
    contasPagar: contasPagarRows,
    contasReceber: contasReceberRows,
    comissoes: comissoesRows,
    cargas: cargasRows,
  };
}

// ===== AJUSTE RÁPIDO DE ESTOQUE =====
/** Estoque nunca negativo; movimentação registrada em audit_log. */
export async function ajusteRapidoEstoque(
  produtoId: number,
  quantidade: number,
  tipo: "entrada" | "saida",
  audit?: { actorUserId?: number; actorVendedorId?: number; traceId?: string; motivo?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const ajuste = tipo === "entrada" ? quantidade : -quantidade;
  const res = await db.select({ estoque: produtos.estoque, descricao: produtos.descricao }).from(produtos).where(eq(produtos.id, produtoId)).limit(1);
  const row = res[0];
  const saldoAnterior = Number(row?.estoque ?? 0);

  if (tipo === "saida" && quantidade > 0 && saldoAnterior < quantidade) {
    const msg = `Estoque insuficiente para saída. Produto "${row?.descricao ?? produtoId}": saldo atual ${saldoAnterior}, solicitado ${quantidade}.`;
    const err = new Error(msg) as Error & { code?: string };
    err.code = "ESTOQUE_NEGATIVO";
    throw err;
  }
  
  await db.update(produtos).set({ 
    estoque: sql`${produtos.estoque} + ${ajuste}` 
  }).where(eq(produtos.id, produtoId));

  const saldoNovo = saldoAnterior + ajuste;
  const action: AuditAction = tipo === "entrada" ? "ENTRADA" : "SAIDA";
  await insertAuditLog({
    actorUserId: audit?.actorUserId ?? null,
    actorVendedorId: audit?.actorVendedorId ?? null,
    action,
    entity: "estoque",
    entityId: String(produtoId),
    payloadJson: JSON.stringify({ quantidade, saldoAnterior, saldoNovo, motivo: audit?.motivo ?? "ajusteRapidoEstoque", tipo }),
    traceId: audit?.traceId ?? nanoid(10),
  });
  
  // Se for entrada, processar pendências FIFO
  if (tipo === "entrada" && ajuste > 0) {
    let qtdRestante = ajuste;
    
    const pendenciasAtivas = await db.select().from(pendencias)
      .where(and(
        eq(pendencias.produtoId, produtoId),
        inArray(pendencias.status, ["PENDENTE", "COMPRADO"])
      ))
      .orderBy(asc(pendencias.dataPedido));

    for (const p of pendenciasAtivas) {
      if (qtdRestante <= 0) break;
      
      const qtdParaBaixa = Math.min(p.quantidade, qtdRestante);
      
      if (qtdParaBaixa === p.quantidade) {
        await db.update(pendencias)
          .set({ status: "RESOLVIDO", dataResolvido: new Date() })
          .where(eq(pendencias.id, p.id));
        qtdRestante -= qtdParaBaixa;
      } else {
        break;
      }
    }
  }
  
  return { success: true, tipo, quantidade, produtoId };
}

// ===== EXCLUSÃO E EDIÇÃO DE PEDIDOS COM AJUSTE DE ESTOQUE =====
export async function deletePedido(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. Buscar itens do pedido para devolver ao estoque
  const itens = await db.select().from(itensPedido).where(eq(itensPedido.pedidoId, id));
  
  for (const item of itens) {
    if (item.tipo === "CATALOGO" && item.produtoId) {
      // Devolver ao estoque (quantidade positiva)
      await db.update(produtos)
        .set({ estoque: sql`${produtos.estoque} + ${item.quantidade}` })
        .where(eq(produtos.id, item.produtoId));
    }
  }
  
  // 2. Apagar pendências associadas
  await db.delete(pendencias).where(eq(pendencias.pedidoId, id));
  
  // 3. Apagar itens e o pedido
  await db.delete(itensPedido).where(eq(itensPedido.pedidoId, id));
  await db.delete(pedidos).where(eq(pedidos.id, id));
  
  return { success: true };
}

export async function updatePedido(id: number, data: any, items: any[], version?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Verificar se o pedido existe
  const pedidoAtual = await db.select().from(pedidos).where(eq(pedidos.id, id)).limit(1);
  if (pedidoAtual.length === 0) {
    throw new Error(`Pedido ID ${id} não encontrado`);
  }
  
  // PREVENÇÃO DE SOBRESCRITA: Verificar se o pedido foi alterado desde que foi carregado
  if (version !== undefined) {
    const updatedAt = pedidoAtual[0].updatedAt;
    const versionDate = new Date(version);
    
    if (updatedAt && updatedAt > versionDate) {
      throw new Error(`O pedido foi modificado por outro usuário desde que você o abriu. Por favor, atualize a página e tente novamente.`);
    }
  }
  
  // Iniciar transação para garantir consistência
  return await db.transaction(async (tx) => {
    // 1. Devolver estoque dos itens antigos
    const itensAntigos = await tx.select().from(itensPedido).where(eq(itensPedido.pedidoId, id));
    for (const item of itensAntigos) {
      if (item.tipo === "CATALOGO" && item.produtoId) {
        await tx.update(produtos)
          .set({ estoque: sql`${produtos.estoque} + ${item.quantidade}` })
          .where(eq(produtos.id, item.produtoId));
      }
    }
    
    // 2. Apagar pendências e itens antigos
    await tx.delete(pendencias).where(eq(pendencias.pedidoId, id));
    await tx.delete(itensPedido).where(eq(itensPedido.pedidoId, id));
    
    // 3. Atualizar dados do pedido com timestamp atualizado
    const updateData = {
      ...data,
      updatedAt: new Date()
    };
    
    await tx.update(pedidos).set(updateData).where(eq(pedidos.id, id));
    
    // 4. Inserir novos itens e processar estoque/pendências novamente
    await createItensPedido(items.map(item => ({ ...item, pedidoId: id })));
    
    return { 
      success: true,
      version: new Date().getTime() // Retorna nova versão para próxima atualização
    };
  });
}

// ===== REAPROVEITAMENTO DE NÚMEROS E UPSERT DE CLIENTE =====
export async function releaseCounterNumber(name: string, num: number) {
  // Numeração NÃO reaproveitável (mais seguro): função mantida só por compatibilidade.
  return;
}

export async function upsertClienteByNomeTelefone(data: InsertCliente) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Buscar por nome e telefone
  const existing = await db.select().from(clientes)
    .where(and(
      eq(clientes.nome, data.nome),
      eq(clientes.telefone, data.telefone || "")
    ))
    .limit(1);
    
  if (existing.length > 0) {
    const id = existing[0].id;
    await db.update(clientes).set(data).where(eq(clientes.id, id));
    return id;
  } else {
    const result = await db.insert(clientes).values(data);
    return (result as any).insertId;
  }
}

// ===== GESTÃO DE CARGAS E BAIXAS =====
export async function createCarga(data: any, pedidosIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Regra: só aceita pedidos IMPRESSO (não aceita GERADO).
  if (!pedidosIds || pedidosIds.length === 0) {
    throw new Error('Selecione ao menos um pedido.');
  }
  const pedidosRows = await db.select({ id: pedidos.id, status: pedidos.status })
    .from(pedidos)
    .where(inArray(pedidos.id, pedidosIds));
  const invalidos = pedidosRows.filter(p => (p.status as any) !== 'IMPRESSO');
  if (invalidos.length > 0) {
    const nums = await db.select({ numero: pedidos.numero }).from(pedidos).where(inArray(pedidos.id, invalidos.map(i => i.id)));
    throw new Error(`Somente pedidos IMPRESSO podem entrar na carga. Inválidos: ${nums.map(n => `#${n.numero}`).join(', ')}`);
  }

  const numero = await getNextCounter('cargas');
  const result = await db.insert(cargas).values({
    numero,
    cidadeRota: data.cidadeRota,
    dataEntrega: data.dataEntrega,
    status: 'ABERTA' });
  
  const cargaId = (result as any).insertId;
  
  for (const pedidoId of pedidosIds) {
    await db.insert(pedidosCarga).values({
      cargaId,
      pedidoId,
      entregue: false
    });
  }
  return { success: true, id: cargaId, numero };
}

export async function getCargaById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const cargaData = await db.select().from(cargas).where(eq(cargas.id, id)).limit(1);
  if (cargaData.length === 0) return null;
  
  const pedidosRel = await db.select({
    id: pedidos.id,
    numero: pedidos.numero,
    clienteNome: pedidos.clienteNome,
    clienteTelefone: pedidos.clienteTelefone,
    vendedorId: pedidos.vendedorId,
    vendedorNome: vendedores.nome,
    formaPagamento: pedidos.formaPagamento,
    total: pedidos.total,
    status: pedidos.status,
    observacoes: pedidos.observacoes,
    entregue: pedidosCarga.entregue,
    pedidoCargaId: pedidosCarga.id
  })
  .from(pedidosCarga)
  .innerJoin(pedidos, eq(pedidosCarga.pedidoId, pedidos.id))
  .innerJoin(vendedores, eq(vendedores.id, pedidos.vendedorId))
  .where(eq(pedidosCarga.cargaId, id));

  
  return {
    ...cargaData[0],
    pedidos: pedidosRel
  };
}

// Edita pedidos dentro de uma carga (incluir/remover).
// Regras:
// - Só permite alterar pedidos em carga ABERTA.
// - Incluir: somente pedidos IMPRESSO.
// - Remover: somente pedidos NÃO ENTREGUES.
// - Enquanto a carga estiver ABERTA, os pedidos permanecem IMPRESSO.
// - Ao FECHAR a carga, os pedidos passam para EM_ROTA.

export async function updateCargaPedidos(cargaId: number, changes: { addIds?: number[]; removeIds?: number[] }) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const cargaRow = await db.select().from(cargas).where(eq(cargas.id, cargaId)).limit(1);
  if (!cargaRow.length) throw new Error('Carga não encontrada');
  const status = (cargaRow[0] as any).status as string;
  if (status === 'ENTREGUE') throw new Error('Carga já entregue. Não é possível alterar.');
  if (status !== 'ABERTA') throw new Error('Carga já foi liberada para rota. Não é possível alterar.');

  const addIds = Array.from(new Set((changes.addIds || []).filter(Boolean)));
  const removeIds = Array.from(new Set((changes.removeIds || []).filter(Boolean)));

  // REMOVER
  if (removeIds.length) {
    // Não remover entregue
    const rels = await db.select({ id: pedidosCarga.id, pedidoId: pedidosCarga.pedidoId, entregue: pedidosCarga.entregue })
      .from(pedidosCarga)
      .where(and(eq(pedidosCarga.cargaId, cargaId), inArray(pedidosCarga.pedidoId, removeIds)));
    const entregues = rels.filter(r => r.entregue);
    if (entregues.length) {
      throw new Error(`Não é possível remover pedido entregue da carga. Pedidos: ${entregues.map(e => e.pedidoId).join(', ')}`);
    }

    // Remove relação
    await db.delete(pedidosCarga)
      .where(and(eq(pedidosCarga.cargaId, cargaId), inArray(pedidosCarga.pedidoId, removeIds)));

    // Voltar status para IMPRESSO se o pedido não estiver em outra carga
    for (const pid of removeIds) {
      const aindaEmOutra = await db.select({ id: pedidosCarga.id })
        .from(pedidosCarga)
        .where(eq(pedidosCarga.pedidoId, pid))
        .limit(1);
      if (!aindaEmOutra.length) {
        await db.update(pedidos).set({ status: 'IMPRESSO' as any }).where(eq(pedidos.id, pid));
      }
    }
  }

  // INCLUIR
  if (addIds.length) {
    // só IMPRESSO
    const pedidosRows = await db.select({ id: pedidos.id, status: pedidos.status })
      .from(pedidos)
      .where(inArray(pedidos.id, addIds));
    const invalidos = pedidosRows.filter(p => (p.status as any) !== 'IMPRESSO');
    if (invalidos.length) {
      const nums = await db.select({ numero: pedidos.numero }).from(pedidos).where(inArray(pedidos.id, invalidos.map(i => i.id)));
      throw new Error(`Somente pedidos IMPRESSO podem entrar na carga. Inválidos: ${nums.map(n => `#${n.numero}`).join(', ')}`);
    }

    // garantir que não está em outra carga
    const relExist = await db.select({ pedidoId: pedidosCarga.pedidoId })
      .from(pedidosCarga)
      .where(inArray(pedidosCarga.pedidoId, addIds));
    if (relExist.length) {
      throw new Error('Um ou mais pedidos já estão em outra carga.');
    }

    for (const pedidoId of addIds) {
      await db.insert(pedidosCarga).values({ cargaId, pedidoId, entregue: false });
    }
    await db.update(pedidos).set({ status: 'EM_ROTA' as any }).where(inArray(pedidos.id, addIds));
  }

  return { success: true };
}


// Liberar/Fechar carga: muda status para EM_ROTA e atualiza os pedidos (da carga) para EM_ROTA.
// Regras: só pode fechar se estiver ABERTA e tiver ao menos 1 pedido.
export async function fecharCarga(cargaId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const cargaRow = await db.select().from(cargas).where(eq(cargas.id, cargaId)).limit(1);
  if (!cargaRow.length) throw new Error('Carga não encontrada');

  const status = (cargaRow[0] as any).status as string;
  if (status === 'ENTREGUE') throw new Error('Carga já entregue.');
  if (status !== 'ABERTA') throw new Error('Carga já está em rota.');

  const rels = await db.select({ pedidoId: pedidosCarga.pedidoId })
    .from(pedidosCarga)
    .where(eq(pedidosCarga.cargaId, cargaId));

  if (!rels.length) throw new Error('Carga sem pedidos. Inclua ao menos 1 pedido.');

  const pedidoIds = rels.map(r => r.pedidoId);

  // Atualiza status da carga
  await db.update(cargas).set({ status: 'EM_ROTA' as any }).where(eq(cargas.id, cargaId));

  // Atualiza pedidos para EM_ROTA (somente se ainda estão IMPRESSO)
  await db.update(pedidos).set({ status: 'EM_ROTA' as any })
    .where(and(inArray(pedidos.id, pedidoIds), eq(pedidos.status, 'IMPRESSO' as any)));

  return { success: true };
}

export async function baixarPedidoCarga(pedidoCargaId: number, data: {
  entradaForma: 'PIX' | 'BOLETO' | 'CARTAO' | 'DINHEIRO',
  entradaValor?: number,
  segundaForma?: 'PIX' | 'CARTAO' | 'DINHEIRO',
  segundaValor?: number,
  boletoParcelas?: number,
  // Vencimentos editáveis (se fornecido, substitui o cálculo automático)
  boletoVencimentos?: Date[],
  boletoPrimeiroVencimento?: Date,
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const boletoIds: number[] = [];
  
  // 1. Marcar como entregue na carga
  const rel = await db.select().from(pedidosCarga).where(eq(pedidosCarga.id, pedidoCargaId)).limit(1);
  if (rel.length === 0) throw new Error("Relação carga-pedido não encontrada");

  // Só pode dar baixa quando a carga estiver EM_ROTA
  const cargaRow = await db.select({ status: cargas.status })
    .from(cargas)
    .where(eq(cargas.id, (rel[0] as any).cargaId))
    .limit(1);
  if (!cargaRow.length) throw new Error('Carga não encontrada');
  const cargaStatus = (cargaRow[0] as any).status as string;
  if (cargaStatus !== 'EM_ROTA') {
    throw new Error('Esta carga ainda não foi liberada para rota.');
  }

  
  await db.update(pedidosCarga).set({
    entregue: true,
    dataBaixa: new Date()
  }).where(eq(pedidosCarga.id, pedidoCargaId));
  
  // 2. Baixar o pedido no fluxo único (financeiro + comissão + contas)
  const result = await baixarPedidoDireto(rel[0].pedidoId, data as any);
  boletoIds.push(...(result.boletoIds || []));
  
  // 4. Verificar se a carga foi toda baixada
  const cargaId = rel[0].cargaId;
  const pendentes = await db.select().from(pedidosCarga)
    .where(and(eq(pedidosCarga.cargaId, cargaId), eq(pedidosCarga.entregue, false)));
    
  if (pendentes.length === 0) {
    await db.update(cargas).set({ status: 'ENTREGUE' }).where(eq(cargas.id, cargaId));
  }
  
  return {
    success: true,
    boletoIds,
    pedidoNumero: result.pedidoNumero,
    clienteNome: result.clienteNome,
  };
}

// ===== BAIXA DIRETA (SEM CARGA) =====
// Usado pela tela "Meus Pedidos": marca ENTREGUE e integra Financeiro (contas a receber + caixa) e comissão.
// Se tx for passado, usa a transação existente (para executeCommand/idempotência).
export async function baixarPedidoDireto(pedidoId: number, data: {
  entradaForma: 'PIX' | 'BOLETO' | 'CARTAO' | 'DINHEIRO',
  entradaValor?: number,
  segundaForma?: 'PIX' | 'CARTAO' | 'DINHEIRO',
  segundaValor?: number,
  boletoParcelas?: number,
  boletoVencimentos?: Date[],
  boletoPrimeiroVencimento?: Date,
}, tx?: any) {
  const client = tx ?? await getDb();
  if (!client) throw new Error('Database not available');

  const pedidoRows = await client.select().from(pedidos).where(eq(pedidos.id, pedidoId)).limit(1);
  if (pedidoRows.length === 0) throw new Error('Pedido não encontrado');
  const pedido = pedidoRows[0];

  const valorTotal = parseFloat(pedido.total.toString());
  const entradaValor = typeof data.entradaValor === 'number' ? data.entradaValor : valorTotal;
  const segundaValor = typeof data.segundaValor === 'number' ? data.segundaValor : 0;
  const boletoParcelas = Math.max(1, Math.floor(data.boletoParcelas || 1));
  const boletoPrimeiroVenc = data.boletoPrimeiroVencimento || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  if (Array.isArray(data.boletoVencimentos) && data.boletoVencimentos.length > 0) {
    if (data.boletoVencimentos.length !== boletoParcelas) {
      throw new Error('Quantidade de vencimentos deve ser igual ao número de parcelas do boleto');
    }
  }

  // Validações duras (evita erro futuro)
  if (entradaValor < 0 || entradaValor > valorTotal) {
    throw new Error('Valor de entrada inválido');
  }

  if (segundaValor < 0 || segundaValor > valorTotal) {
    throw new Error('Valor da segunda forma inválido');
  }

  if (data.entradaForma === 'BOLETO' && (data.segundaForma || segundaValor > 0)) {
    throw new Error('Boleto como forma única não pode ter segunda forma');
  }

  // Total recebido agora (PIX/DINHEIRO/CARTAO). Boleto não entra aqui.
  const recebidoAgoraTotal = (data.entradaForma === 'BOLETO' ? 0 : entradaValor) + (data.segundaForma ? segundaValor : 0);

  if (recebidoAgoraTotal > valorTotal + 1e-9) {
    throw new Error('Soma das formas excede o total do pedido');
  }

  const usandoBoletoResto = data.entradaForma !== 'BOLETO' && (typeof data.boletoParcelas === 'number' || typeof data.boletoPrimeiroVencimento === 'object' || Array.isArray((data as any).boletoVencimentos));
  const boletoTotal = data.entradaForma === 'BOLETO'
    ? valorTotal
    : Math.max(0, valorTotal - recebidoAgoraTotal);

  // Se não está usando boleto e sobrou valor, então está faltando definir segunda forma.
  if (!usandoBoletoResto && data.entradaForma !== 'BOLETO' && boletoTotal > 0.009) {
    throw new Error('Pagamento incompleto: defina 2ª forma ou use boleto para o restante');
  }

  const formaPagamentoJson = JSON.stringify({
    confirmado: true,
    formas: [
      data.entradaForma !== 'BOLETO' ? { forma: data.entradaForma, valor: Number(entradaValor.toFixed(2)) } : null,
      data.segundaForma ? { forma: data.segundaForma, valor: Number(segundaValor.toFixed(2)) } : null,
    ].filter(Boolean),
    boleto: (data.entradaForma === 'BOLETO' || boletoTotal > 0)
      ? { parcelas: boletoParcelas, total: Number(boletoTotal.toFixed(2)), primeiroVencimento: boletoPrimeiroVenc.toISOString() }
      : null,
  });

  const dataAtual = new Date();
  const mesAno = `${dataAtual.getFullYear()}-${String(dataAtual.getMonth() + 1).padStart(2, '0')}`;

  const runBody = async (t: any) => {
    // 1) Atualiza o pedido
    await t.update(pedidos).set({
      status: 'ENTREGUE',
      dataEntrega: new Date(),
      formaPagamento: formaPagamentoJson,
    }).where(eq(pedidos.id, pedidoId));

    // 2) Contas a Receber + Caixa
    await t.delete(contasReceber).where(and(
      eq(contasReceber.pedidoNumero, pedido.numero),
      eq(contasReceber.status, 'PENDENTE')
    ));

    const boletoIds: number[] = [];

    if (data.entradaForma === 'BOLETO') {
      const parcelas = boletoParcelas;
      const total = valorTotal;
      const base = Math.floor((total / parcelas) * 100) / 100;
      let restanteCentavos = Math.round(total * 100) - Math.round(base * 100) * parcelas;
      for (let i = 0; i < parcelas; i++) {
        const valorParcela = base + (restanteCentavos > 0 ? 0.01 : 0);
        if (restanteCentavos > 0) restanteCentavos -= 1;
        const venc = (Array.isArray(data.boletoVencimentos) && data.boletoVencimentos[i])
          ? new Date(data.boletoVencimentos[i])
          : new Date(boletoPrimeiroVenc.getTime() + i * 30 * 24 * 60 * 60 * 1000);
        const inserted = await t.insert(contasReceber).values({
          pedidoNumero: pedido.numero,
          clienteNome: pedido.clienteNome,
          vendedorId: pedido.vendedorId,
          descricao: `Boleto ${i + 1}/${parcelas} - Pedido #${pedido.numero}`,
          valor: valorParcela.toFixed(2) as any,
          dataVencimento: venc,
          status: 'PENDENTE',
          formaPagamento: 'BOLETO',
        });
        const insertId = (inserted as any)[0]?.insertId ?? (inserted as any).insertId;
        if (typeof insertId === 'number') boletoIds.push(insertId);
      }
    } else {
      const recebido1 = entradaValor;
      if (recebido1 > 0) {
        await t.insert(contasReceber).values({
          pedidoNumero: pedido.numero,
          clienteNome: pedido.clienteNome,
          vendedorId: pedido.vendedorId,
          descricao: `Entrada - Pedido #${pedido.numero}`,
          valor: recebido1.toFixed(2) as any,
          dataVencimento: dataAtual,
          status: 'RECEBIDA',
          dataRecebimento: dataAtual,
          formaPagamento: data.entradaForma as any,
        });
        await atualizarCaixaMensal(mesAno, data.entradaForma, recebido1, t);
      }
      if (data.segundaForma && segundaValor > 0) {
        await t.insert(contasReceber).values({
          pedidoNumero: pedido.numero,
          clienteNome: pedido.clienteNome,
          vendedorId: pedido.vendedorId,
          descricao: `2ª Forma - Pedido #${pedido.numero}`,
          valor: segundaValor.toFixed(2) as any,
          dataVencimento: dataAtual,
          status: 'RECEBIDA',
          dataRecebimento: dataAtual,
          formaPagamento: data.segundaForma as any,
        });
        await atualizarCaixaMensal(mesAno, data.segundaForma, segundaValor, t);
      }
      if (boletoTotal > 0) {
        const parcelas = boletoParcelas;
        const base = Math.floor((boletoTotal / parcelas) * 100) / 100;
        let restanteCentavos = Math.round(boletoTotal * 100) - Math.round(base * 100) * parcelas;
        for (let i = 0; i < parcelas; i++) {
          const valorParcela = base + (restanteCentavos > 0 ? 0.01 : 0);
          if (restanteCentavos > 0) restanteCentavos -= 1;
          const venc = (Array.isArray(data.boletoVencimentos) && data.boletoVencimentos[i])
            ? new Date(data.boletoVencimentos[i])
            : new Date(boletoPrimeiroVenc.getTime() + i * 30 * 24 * 60 * 60 * 1000);
          const inserted = await t.insert(contasReceber).values({
            pedidoNumero: pedido.numero,
            clienteNome: pedido.clienteNome,
            vendedorId: pedido.vendedorId,
            descricao: `Boleto ${i + 1}/${parcelas} - Pedido #${pedido.numero}`,
            valor: valorParcela.toFixed(2) as any,
            dataVencimento: venc,
            status: 'PENDENTE',
            formaPagamento: 'BOLETO',
          });
          const insertId = (inserted as any)[0]?.insertId ?? (inserted as any).insertId;
          if (typeof insertId === 'number') boletoIds.push(insertId);
        }
      }
    }

    const jaExiste = await t.select({ id: comissoes.id }).from(comissoes)
      .where(eq(comissoes.pedidoId, pedido.id)).limit(1);
    if (jaExiste.length > 0) {
      return { success: true, boletoIds, pedidoNumero: pedido.numero, clienteNome: pedido.clienteNome };
    }

    const itens = await t.select({
      quantidade: itensPedido.quantidade,
      valorUnitario: itensPedido.valorUnitario,
      produtoId: itensPedido.produtoId,
    }).from(itensPedido).where(eq(itensPedido.pedidoId, pedidoId));

    const produtoIds: number[] = Array.from(
      new Set(itens.filter((i) => i.produtoId != null).map((i) => i.produtoId as number))
    );
    const produtosRows = produtoIds.length
      ? await t
          .select({ id: produtos.id, comissao: produtos.comissao })
          .from(produtos)
          .where(inArray(produtos.id, produtoIds))
      : [];
    const mapComissao = new Map<number, number>();
    for (const p of produtosRows) mapComissao.set(p.id, parseFloat(p.comissao.toString()));

    let valorComissao = 0;
    for (const i of itens) {
      if (!i.produtoId) continue;
      const perc = mapComissao.get(i.produtoId) ?? 0;
      const itemTotal = Number(i.quantidade) * parseFloat(i.valorUnitario.toString());
      valorComissao += itemTotal * (perc / 100);
    }
    const percentualComissao = valorTotal > 0 ? (valorComissao / valorTotal) * 100 : 0;

    await t.insert(comissoes).values({
      vendedorId: pedido.vendedorId,
      pedidoId: pedido.id,
      valorVenda: pedido.total,
      percentualComissao: percentualComissao.toFixed(2) as any,
      valorComissao: valorComissao.toFixed(2) as any,
      status: 'PENDENTE',
    } as any);

    return {
      success: true,
      boletoIds,
      pedidoNumero: pedido.numero,
      clienteNome: pedido.clienteNome,
    };
  };
  if (tx) return runBody(tx);
  return await client.transaction(runBody);
}

// ===== FINANCEIRO BOLETOS =====
export async function getBoletosByCliente(clienteId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(boletos).where(eq(boletos.clienteId, clienteId)).orderBy(asc(boletos.dataVencimento));
}

export async function getBoletosByVendedor(vendedorId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(boletos).where(eq(boletos.vendedorId, vendedorId)).orderBy(desc(boletos.createdAt));
}

export async function baixarBoletoParcial(boletoId: number, valorPago: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const boleto = await db.select().from(boletos).where(eq(boletos.id, boletoId)).limit(1);
  if (boleto.length === 0) throw new Error("Boleto não encontrado");
  
  const novoValorAberto = Number(boleto[0].valorAberto) - valorPago;
  const novoStatus = novoValorAberto <= 0 ? 'PAGO' : 'PARCIAL';
  
  await db.insert(pagamentosBoleto).values({
    boletoId,
    valorPago: valorPago.toString(),
    dataPagamento: new Date()
  });
  
  await db.update(boletos).set({
    valorAberto: Math.max(0, novoValorAberto).toString(),
    status: novoStatus
  }).where(eq(boletos.id, boletoId));
  
  return { success: true, novoValorAberto };
}

// ===== CONFIGURAÇÕES =====
export async function setConfig(chave: string, valor: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await db.select().from(configuracoes).where(eq(configuracoes.chave, chave)).limit(1);
  if (existing.length > 0) {
    await db.update(configuracoes).set({ valor }).where(eq(configuracoes.id, existing[0].id));
  } else {
    await db.insert(configuracoes).values({ chave, valor });
  }
  return { success: true };
}

export async function getConfig(chave: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(configuracoes).where(eq(configuracoes.chave, chave)).limit(1);
  return result.length > 0 ? result[0].valor : null;
}

/** Retorna boleto por id (campos mínimos para ownership check). */
export async function getBoletoById(id: number): Promise<{ id: number; vendedorId: number } | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ id: boletos.id, vendedorId: boletos.vendedorId }).from(boletos).where(eq(boletos.id, id)).limit(1);
  return rows.length > 0 ? { id: rows[0].id, vendedorId: rows[0].vendedorId } : null;
}

export async function getBoletoCompleto(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select({
    id: boletos.id,
    numeroPedido: boletos.numeroPedido,
    valorOriginal: boletos.valorOriginal,
    valorAberto: boletos.valorAberto,
    dataVencimento: boletos.dataVencimento,
    status: boletos.status,
    clienteNome: clientes.nome,
    clienteTelefone: clientes.telefone
  })
  .from(boletos)
  .innerJoin(clientes, eq(boletos.clienteId, clientes.id))
  .where(eq(boletos.id, id))
  .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

// ===== CONTAS A RECEBER =====
export async function getAllContasReceber(status?: string) {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select().from(contasReceber);
  
  if (status) {
    query = query.where(eq(contasReceber.status, status as any));
  }
  
  return await query.orderBy(desc(contasReceber.dataVencimento));
}

export async function getContaReceberById(id: number): Promise<{ id: number; vendedorId: number | null } | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ id: contasReceber.id, vendedorId: contasReceber.vendedorId }).from(contasReceber).where(eq(contasReceber.id, id)).limit(1);
  return rows.length > 0 ? { id: rows[0].id, vendedorId: rows[0].vendedorId } : null;
}

export async function getContasReceberByVendedor(vendedorId: number, status?: string) {
  const db = await getDb();
  if (!db) return [];
  const whereClause = status
    ? and(eq(contasReceber.vendedorId, vendedorId), eq(contasReceber.status, status as any))
    : eq(contasReceber.vendedorId, vendedorId);
  return await db.select().from(contasReceber).where(whereClause).orderBy(desc(contasReceber.dataVencimento));
}

export async function createContaReceber(
  data: {
    pedidoNumero?: number;
    clienteNome: string;
    vendedorId?: number;
    descricao: string;
    valor: number;
    dataVencimento: string;
    formaPagamento?: string;
    observacoes?: string;
  },
  tx?: any
) {
  const client = tx ?? await getDb();
  if (!client) throw new Error("Database not available");
  await client.insert(contasReceber).values({
    pedidoNumero: data.pedidoNumero,
    clienteNome: data.clienteNome,
    vendedorId: data.vendedorId,
    descricao: data.descricao,
    valor: data.valor.toString(),
    dataVencimento: new Date(data.dataVencimento),
    formaPagamento: data.formaPagamento as any,
    observacoes: data.observacoes,
    status: "PENDENTE",
  } as any);
  return { success: true };
}

export async function marcarContaRecebida(id: number, dataRecebimento: string, formaPagamento: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Buscar a conta
  const conta = await db.select().from(contasReceber).where(eq(contasReceber.id, id)).limit(1);
  if (conta.length === 0) throw new Error("Conta não encontrada");
  
  const valor = parseFloat(conta[0].valor);
  const dataReceb = new Date(dataRecebimento);
  const mesAno = `${dataReceb.getFullYear()}-${String(dataReceb.getMonth() + 1).padStart(2, '0')}`;
  
  // Atualizar a conta
  await db.update(contasReceber)
    .set({
      status: 'RECEBIDA',
      dataRecebimento: dataReceb,
      formaPagamento: formaPagamento as any,
    })
    .where(eq(contasReceber.id, id));
  
  // Atualizar o caixa mensal
  await atualizarCaixaMensal(mesAno, formaPagamento, valor);
  
  return { success: true };
}

export async function deleteContaReceber(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(contasReceber).where(eq(contasReceber.id, id));
  return { success: true };
}

// ===== CAIXA MENSAL =====
/** Quando tx é passado, usa a transação (para baixarPedidoDireto). */
export async function atualizarCaixaMensal(mesAno: string, formaPagamento: string, valor: number, tx?: any) {
  const db = tx ?? await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await db.select().from(caixaMensal).where(eq(caixaMensal.mesAno, mesAno)).limit(1);
  
  if (existing.length === 0) {
    const novoRegistro: any = {
      mesAno,
      totalBoleto: '0',
      totalPix: '0',
      totalCartao: '0',
      totalDinheiro: '0',
      totalGeral: '0',
    };
    if (formaPagamento === 'BOLETO') novoRegistro.totalBoleto = valor.toString();
    else if (formaPagamento === 'PIX') novoRegistro.totalPix = valor.toString();
    else if (formaPagamento === 'CARTAO') novoRegistro.totalCartao = valor.toString();
    else if (formaPagamento === 'DINHEIRO') novoRegistro.totalDinheiro = valor.toString();
    novoRegistro.totalGeral = valor.toString();
    await db.insert(caixaMensal).values(novoRegistro);
  } else {
    const atual = existing[0];
    const updates: any = {};
    if (formaPagamento === 'BOLETO') updates.totalBoleto = (parseFloat(atual.totalBoleto) + valor).toString();
    else if (formaPagamento === 'PIX') updates.totalPix = (parseFloat(atual.totalPix) + valor).toString();
    else if (formaPagamento === 'CARTAO') updates.totalCartao = (parseFloat(atual.totalCartao) + valor).toString();
    else if (formaPagamento === 'DINHEIRO') updates.totalDinheiro = (parseFloat(atual.totalDinheiro) + valor).toString();
    updates.totalGeral = (parseFloat(atual.totalGeral) + valor).toString();
    await db.update(caixaMensal).set(updates).where(eq(caixaMensal.id, atual.id));
  }
  return { success: true };
}

export async function getCaixaMensal(mesAno?: string) {
  const db = await getDb();
  if (!db) return null;
  
  if (mesAno) {
    const result = await db.select().from(caixaMensal).where(eq(caixaMensal.mesAno, mesAno)).limit(1);
    return result.length > 0 ? result[0] : null;
  }
  
  // Retornar o mês atual
  const hoje = new Date();
  const mesAnoAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const result = await db.select().from(caixaMensal).where(eq(caixaMensal.mesAno, mesAnoAtual)).limit(1);
  
  if (result.length === 0) {
    // Criar registro zerado para o mês atual
    await db.insert(caixaMensal).values({
      mesAno: mesAnoAtual,
      totalBoleto: '0',
      totalPix: '0',
      totalCartao: '0',
      totalDinheiro: '0',
      totalGeral: '0',
    });
    
    const newResult = await db.select().from(caixaMensal).where(eq(caixaMensal.mesAno, mesAnoAtual)).limit(1);
    return newResult.length > 0 ? newResult[0] : null;
  }
  
  return result[0];
}

export async function getAllCaixaMensal() {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(caixaMensal).orderBy(desc(caixaMensal.mesAno));
}

// ===== CAIXA MOVIMENTOS (ENTRADA/SAÍDA) =====
export async function registrarMovimentoCaixa(data: {
  tipo: 'ENTRADA' | 'SAIDA';
  formaPagamento: 'PIX' | 'BOLETO' | 'CARTAO' | 'DINHEIRO' | 'CHEQUE';
  valor: number;
  descricao: string;
  referenciaTipo?: string;
  referenciaId?: number;
  marca?: string;
  dataMovimento?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await (db as any).execute(sql`
    INSERT INTO caixa_movimentos (dataMovimento, tipo, formaPagamento, valor, descricao, referenciaTipo, referenciaId, marca)
    VALUES (
      ${data.dataMovimento ?? new Date()},
      ${data.tipo},
      ${data.formaPagamento},
      ${data.valor},
      ${data.descricao},
      ${data.referenciaTipo ?? null},
      ${data.referenciaId ?? null},
      ${data.marca ?? null}
    );
  `);
}

// ===== NOTA DE ENTRADA (1 marca por nota) =====
export async function criarNotaEntrada(input: {
  marca: string;
  dataChegada: Date;
  valorTotal: number;
  formaPagamento: 'PIX' | 'DINHEIRO' | 'BOLETO' | 'CHEQUE' | 'CARTAO';
  parcelas?: Array<{ parcela: number; valor: number; dataVencimento: Date }>; // para BOLETO/CHEQUE
  observacao?: string;
  itens: Array<{ produtoId: number; quantidade: number; custoUnit?: number }>;
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Validações duras
  if (!input.itens.length) throw new Error('Nota sem itens');
  if (input.valorTotal <= 0) throw new Error('Valor total inválido');
  if ((input.formaPagamento === 'BOLETO' || input.formaPagamento === 'CHEQUE') && (!input.parcelas || input.parcelas.length === 0)) {
    throw new Error('Parcelas obrigatórias para BOLETO/CHEQUE');
  }

  // Transação: grava nota, financeiro, itens, estoque e baixa automática
  await (db as any).transaction(async (tx: any) => {
    const [notaRes]: any = await tx.execute(sql`
      INSERT INTO notas_entrada (marca, dataChegada, valorTotal, formaPagamento, parcelas, observacao, createdBy)
      VALUES (
        ${input.marca},
        ${input.dataChegada},
        ${input.valorTotal},
        ${input.formaPagamento},
        ${input.parcelas ? input.parcelas.length : null},
        ${input.observacao ?? null},
        ${input.createdBy ?? null}
      );
    `);
    const notaId = (notaRes as any).insertId ?? (notaRes?.[0]?.insertId);
    if (!notaId) throw new Error('Falha ao criar nota');

    // Financeiro
    if (input.formaPagamento === 'PIX' || input.formaPagamento === 'DINHEIRO' || input.formaPagamento === 'CARTAO') {
      // Saída imediata no caixa (movimentos)
      await tx.execute(sql`
        INSERT INTO caixa_movimentos (dataMovimento, tipo, formaPagamento, valor, descricao, referenciaTipo, referenciaId, marca)
        VALUES (${input.dataChegada}, 'SAIDA', ${input.formaPagamento}, ${input.valorTotal}, ${`Nota de Entrada #${notaId}`}, 'NOTA_ENTRADA', ${notaId}, ${input.marca});
      `);
    } else {
      // BOLETO/CHEQUE -> Contas a Pagar por parcela + tabela de parcelas da nota
      const parcelas = input.parcelas!;
      for (const p of parcelas) {
        await tx.execute(sql`
          INSERT INTO notas_entrada_parcelas (notaId, parcela, valor, dataVencimento)
          VALUES (${notaId}, ${p.parcela}, ${p.valor}, ${p.dataVencimento});
        `);
        await tx.insert(contasPagar).values({
          descricao: `Nota de Entrada #${notaId} - Parcela ${p.parcela}/${parcelas.length}`,
          valor: p.valor.toString(),
          dataVencimento: p.dataVencimento,
          status: 'PENDENTE',
          fornecedor: null,
        } as any);
      }
    }

    // Itens + estoque + baixa automática (pendências/coleta + reposição)
    for (const it of input.itens) {
      await tx.execute(sql`
        INSERT INTO notas_entrada_itens (notaId, produtoId, quantidade, custoUnit)
        VALUES (${notaId}, ${it.produtoId}, ${it.quantidade}, ${it.custoUnit ?? null});
      `);

      // Atualiza estoque e baixa automática usando a função já segura
      // (reaproveita a mesma lógica de updateEstoqueProduto)
      // Aqui chamamos via SQL/Drizzle fora, mas dentro da transação precisamos replicar a lógica.
      // Para manter consistência, fazemos o update de estoque e a baixa aqui mesmo.

      // 1) Baixa COLETA (pendencias)
      let qtdRestante = it.quantidade;

      const pendAtivas = await tx.select().from(pendencias)
        .where(and(eq(pendencias.produtoId, it.produtoId), inArray(pendencias.status, ['PENDENTE', 'COMPRADO'])))
        .orderBy(
          asc(sql`CASE WHEN ${pendencias.status} = 'COMPRADO' THEN 0 ELSE 1 END`),
          asc(pendencias.dataPedido)
        );

      for (const p of pendAtivas) {
        if (qtdRestante <= 0) break;
        const qtdParaBaixa = Math.min(p.quantidade, qtdRestante);
        if (qtdParaBaixa >= p.quantidade) {
          await tx.update(pendencias).set({ status: 'RESOLVIDO', dataResolvido: new Date() }).where(eq(pendencias.id, p.id));
        } else {
          await tx.update(pendencias).set({ quantidade: p.quantidade - qtdParaBaixa }).where(eq(pendencias.id, p.id));
        }
        qtdRestante -= qtdParaBaixa;
      }

      // 2) Baixa REPOSIÇÃO (reposicoes)
      if (qtdRestante > 0) {
        const [repos]: any = await tx.execute(sql`
          SELECT id, quantidade
          FROM reposicoes
          WHERE produtoId = ${it.produtoId} AND status = 'AGUARDANDO'
          ORDER BY dataPedido ASC, id ASC;
        `);
        for (const r of (repos || []) as Array<{ id: number; quantidade: number }>) {
          if (qtdRestante <= 0) break;
          const qtdParaBaixa = Math.min(r.quantidade, qtdRestante);
          if (qtdParaBaixa >= r.quantidade) {
            await tx.execute(sql`UPDATE reposicoes SET status='RESOLVIDO' WHERE id=${r.id};`);
          } else {
            await tx.execute(sql`UPDATE reposicoes SET quantidade=${r.quantidade - qtdParaBaixa} WHERE id=${r.id};`);
          }
          qtdRestante -= qtdParaBaixa;
        }
      }

      // 3) Saldo anterior para auditoria, depois atualiza estoque físico
      const [row] = await tx.select({ estoque: produtos.estoque }).from(produtos).where(eq(produtos.id, it.produtoId)).limit(1);
      const saldoAnterior = Number(row?.estoque ?? 0);
      const saldoNovo = saldoAnterior + it.quantidade;
      await tx.update(produtos).set({ estoque: sql`${produtos.estoque} + ${it.quantidade}` }).where(eq(produtos.id, it.produtoId));
      await insertAuditLog({
        actorUserId: input.createdBy ?? null,
        actorVendedorId: null,
        action: "ENTRADA",
        entity: "estoque",
        entityId: String(it.produtoId),
        payloadJson: JSON.stringify({ quantidade: it.quantidade, saldoAnterior, saldoNovo, motivo: "nota_entrada", notaId, produtoId: it.produtoId }),
        traceId: nanoid(10),
      }, tx);
    }

    return notaId;
  });
}

// ===== PLANO DE CONTAS =====
export async function createPlanoContas(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(planoContas).values(data);
}

export async function getPlanoContas(tipo?: 'RECEITA' | 'DESPESA') {
  const db = await getDb();
  if (!db) return [];
  if (tipo) {
    return await db.select().from(planoContas).where(and(eq(planoContas.tipo, tipo), eq(planoContas.ativo, true)));
  }
  return await db.select().from(planoContas).where(eq(planoContas.ativo, true));
}

// ===== CONTAS A PAGAR =====
export async function createContaPagar(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(contasPagar).values(data);
}

export async function listContasPagarFiltro(status?: 'PENDENTE' | 'PAGO', fornecedor?: string) {
  const db = await getDb();
  if (!db) return [];
  
  let query: any = db.select().from(contasPagar);
  const conditions: any[] = [];
  
  if (status) conditions.push(eq(contasPagar.status, status));
  // Busca por texto no campo fornecedor (varchar)
  if (fornecedor?.trim()) conditions.push(sql`${contasPagar.fornecedor} LIKE ${'%' + fornecedor.trim() + '%'}`);
  
  if (conditions.length > 0) {
    return await query.where(and(...conditions)).orderBy(asc(contasPagar.dataVencimento));
  }
  
  return await query.orderBy(asc(contasPagar.dataVencimento));
}

export async function pagarConta(id: number, valorPago: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.update(contasPagar).set({
    status: 'PAGO',
    valor: valorPago.toString(),
    dataPagamento: new Date()
  }).where(eq(contasPagar.id, id));
}

export async function deleteContaPagar(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.delete(contasPagar).where(eq(contasPagar.id, id));
}

// ===== CONTAS FIXAS =====
export async function createContaFixa(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(contasFixas).values(data);
}



/** Resultado de um item do diagnóstico: tipoProblema, entidade, id, detalhe, sugestão. */
export type ProblemaDiagnostico = {
  tipoProblema: string;
  entidade: string;
  id?: string | number;
  detalhe: string;
  sugestao: string;
  /** Compatibilidade: mesmo que detalhe */
  mensagem?: string;
  /** Compatibilidade: mesmo que id */
  entityId?: string | number;
};

/** Diagnóstico de consistência (admin): pedidos sem itens, itens órfãos, pendencias quebradas, totais inconsistentes, estoque negativo, contas a receber órfãs. */
export async function runDiagnosticoConsistencia(): Promise<ProblemaDiagnostico[]> {
  const db = await getDb();
  if (!db) return [{ tipoProblema: "erro", entidade: "sistema", detalhe: "Banco indisponível.", sugestao: "Verifique a conexão MySQL." }];
  const problemas: ProblemaDiagnostico[] = [];

  function add(tipoProblema: string, entidade: string, id: string | number | undefined, detalhe: string, sugestao: string) {
    problemas.push({ tipoProblema, entidade, id, detalhe, sugestao, mensagem: detalhe, entityId: id });
  }

  try {
    const [pedidosSemItens]: any[] = await (db as any).execute(sql`
      SELECT p.id, p.numero FROM pedidos p
      LEFT JOIN itens_pedido i ON i.pedidoId = p.id
      WHERE i.id IS NULL AND p.status != 'CANCELADO'
    `);
    for (const r of pedidosSemItens || []) {
      add("pedido_sem_itens", "pedido", r.id, `Pedido #${r.numero} (id ${r.id}) sem itens.`, "Inclua itens no pedido ou cancele-o.");
    }

    const [itensSemProduto]: any[] = await (db as any).execute(sql`
      SELECT i.id, i.pedidoId, i.descricao FROM itens_pedido i
      WHERE i.tipo = 'CATALOGO' AND (i.produtoId IS NULL OR i.produtoId NOT IN (SELECT id FROM produtos))
    `);
    for (const r of itensSemProduto || []) {
      add("item_sem_produto", "item_pedido", r.id, `Item pedido ${r.pedidoId} (${r.descricao}) sem produto válido.`, "Vincule a um produto do catálogo ou altere o tipo do item.");
    }

    const [pendenciasOrfas]: any[] = await (db as any).execute(sql`
      SELECT pe.id FROM pendencias pe
      LEFT JOIN pedidos p ON p.id = pe.pedidoId
      LEFT JOIN produtos pr ON pr.id = pe.produtoId
      WHERE p.id IS NULL OR pr.id IS NULL
    `);
    for (const r of pendenciasOrfas || []) {
      add("pendencia_quebrada", "pendencia", r.id, `Pendência id ${r.id} com pedido ou produto inexistente.`, "Corrija a referência ou remova a pendência.");
    }

    const [estoqueNegativo]: any[] = await (db as any).execute(sql`SELECT id, descricao, estoque FROM produtos WHERE estoque < 0`);
    for (const r of estoqueNegativo || []) {
      add("estoque_negativo", "produto", r.id, `Produto "${r.descricao}" (id ${r.id}): estoque ${r.estoque}.`, "Faça entrada de estoque ou ajuste manual para valor >= 0.");
    }

    const pedidosList = await db.select({ id: pedidos.id, numero: pedidos.numero, total: pedidos.total }).from(pedidos);
    for (const p of pedidosList) {
      const itens = await db.select({
        qtd: itensPedido.quantidade,
        valor: itensPedido.valorUnitario,
      }).from(itensPedido).where(eq(itensPedido.pedidoId, p.id));
      const soma = itens.reduce((s, i) => s + Number(i.qtd) * parseFloat(String(i.valor)), 0);
      const totalPedido = parseFloat(String(p.total));
      if (Math.abs(soma - totalPedido) > 0.02) {
        add("total_inconsistente", "pedido", p.id, `Pedido #${p.numero}: soma itens ${soma.toFixed(2)} != total ${totalPedido.toFixed(2)}.`, "Recalcule o total do pedido ou edite os itens.");
      }
    }

    // Contas a receber órfãs: pedidoNumero não existe em pedidos ou pedido está cancelado
    const [contasOrfas]: any[] = await (db as any).execute(sql`
      SELECT c.id, c.pedidoNumero, c.descricao FROM contas_receber c
      LEFT JOIN pedidos p ON p.numero = c.pedidoNumero
      WHERE p.id IS NULL OR p.status = 'CANCELADO'
    `);
    for (const r of contasOrfas || []) {
      add("conta_receber_orfa", "contas_receber", r.id, `Conta id ${r.id} (pedido #${r.pedidoNumero}): pedido inexistente ou cancelado.`, "Vincule a um pedido válido ou remova/ajuste a conta.");
    }
  } catch (e) {
    logMySqlError(e, "runDiagnosticoConsistencia");
    problemas.push({ tipoProblema: "erro", entidade: "sistema", detalhe: (e as Error).message, sugestao: "Verifique os logs do servidor." });
  }
  return problemas;
}

/** Retorna a versão do schema gravada no banco (tabela schema_version, id=1). */
export async function getSchemaVersion(): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const row = await db.select().from(schemaVersion).where(eq(schemaVersion.id, 1)).limit(1);
    return row[0]?.version ?? null;
  } catch {
    return null;
  }
}

/** Garante que a tabela schema_version existe e tem a linha id=1 (para /api/health). */
export async function ensureSchemaVersionTable(version: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    const existing = await db.select().from(schemaVersion).where(eq(schemaVersion.id, 1)).limit(1);
    if (existing.length === 0) {
      await db.insert(schemaVersion).values({ id: 1, version });
    }
  } catch {
    // Tabela pode não existir ainda (primeira migração)
  }
}

export async function gerarContasFixasMes(mesAno: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const fixas = await listContasFixas();
  const [ano, mes] = mesAno.split('-').map(Number);
  
  for (const f of fixas) {
    const dataVencimento = new Date(ano, mes - 1, f.diaVencimento);
    const descricaoGerada = `Conta Fixa: ${String((f as any).descricao ?? "")} - ${mesAno}`;
    
    // Verifica se já foi gerada para este mês (evita duplicidade)
    const existe = await db
      .select({ id: contasPagar.id })
      .from(contasPagar)
      .where(
        and(
          eq(contasPagar.descricao, descricaoGerada),
          sql`DATE_FORMAT(${contasPagar.dataVencimento}, '%Y-%m') = ${mesAno}`
        )
      )
      .limit(1);
    
    if (existe.length === 0) {
      await db.insert(contasPagar).values({
        descricao: descricaoGerada,
        valor: String((f as any).valor ?? "0"),
        dataVencimento,
        status: "PENDENTE",
        planoContasId: (f as any).planoContasId ?? null,
        fornecedor: null,
      });
    }
  }
}
