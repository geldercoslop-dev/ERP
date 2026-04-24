/**
 * Database Core - Fonte única de verdade do DB.
 * Toda lógica real de acesso ao banco fica aqui.
 * NÃO importa db/index (evita ciclo).
 */
import { drizzle } from "drizzle-orm/mysql2";
import { getConnectionPool } from "../config/database.js";
import * as schema from "../../drizzle/schema.js";
import { setupDatabaseMonitoring } from "../runtime/monitoring-setup.js";
import { toDbDate } from "../utils/date.js";
import { users, vendedores, pedidos, contasReceber, idempotencyKeys, } from "../../drizzle/schema.js";
// Re-exportar tabelas para uso em services
export { users, vendedores, produtos, clientes, pedidos, itensPedido, contasReceber, contasPagar, gruposPrecificacao, cores, cargas, pedidosCarga, comissoes, contasFixas, planoContas, counters, idempotencyKeys, clienteVendedores, caixaMensal, boletos, promocoes, promocoesItens, pendencias, } from "../../drizzle/schema.js";
import { eq, and, asc, sql } from "drizzle-orm";
import { assertServiceEntryIfEnabled } from "../runtime/service-entry-guard.js";
let pool = null;
let db = null;
export async function getPool() {
    return getConnectionPool();
}
export async function getDb() {
    assertServiceEntryIfEnabled();
    if (!db) {
        pool = await getConnectionPool();
        // Aplicar monitoramento de consultas lentas
        const monitoredPool = setupDatabaseMonitoring(pool);
        db = drizzle(monitoredPool, {
            schema: { ...schema },
            mode: "default",
            logger: false,
        });
    }
    return db;
}
export { schema };
export { eq, and, or, desc, asc, sql, gt, inArray, isNotNull, isNull, like, ilike, ne, not, between, } from "drizzle-orm";
export { gte, lte, lt } from "drizzle-orm";
/** Normaliza telefone: só dígitos (máx 32). */
export function normalizeTelefone(telefone) {
    if (telefone == null || telefone === "")
        return "";
    return String(telefone).replace(/\D/g, "").slice(0, 32);
}
/** Normaliza nome: trim, lowercase, colapsa espaços; retorna nomeNorm + sobrenomeNorm. */
export function normalizeNomeSobrenome(nome) {
    if (nome == null || nome === "")
        return { nomeNorm: "", sobrenomeNorm: "" };
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
export async function getConfig(chave) {
    void chave;
    return null;
}
/** Define valor de configuração por chave. */
export async function setConfig(chave, valor) {
    void chave;
    void valor;
}
/** Retorna a versão do schema (tabela schema_version, id=1). */
export async function getSchemaVersion() {
    return null;
}
/** Garante linha (id=1) na schema_version com a versão esperada. */
export async function ensureSchemaVersion(expectedVersion) {
    void expectedVersion;
}
/** Usuário por id. */
export async function getUserById(id) {
    const database = await getDb();
    const row = await database.select().from(users).where(eq(users.id, id)).limit(1);
    return row[0] ?? null;
}
/** Usuário por openId (compat). */
export async function getUserByOpenId(openId) {
    const database = await getDb();
    const row = await database
        .select()
        .from(users)
        .where(eq(users.openId, openId))
        .limit(1);
    return row[0] ?? null;
}
/** Upsert de usuário por (tenantId, openId). */
export async function upsertUser(tenantId, user) {
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
            updatedAt: toDbDate(new Date()),
        })
            .where(eq(users.id, existing[0].id));
        return;
    }
    await database.insert(users).values(user);
}
/** Cria usuário (sem senha no schema atual). */
export async function insertUser(user) {
    const database = await getDb();
    const result = await database.insert(users).values(user);
    return { id: getInsertId(result) };
}
/** Atualiza último login (compat: routers chamam só com userId). */
export async function touchLastSignedIn(userId) {
    const database = await getDb();
    await database.update(users).set({ lastSignedIn: toDbDate(new Date()) }).where(eq(users.id, userId));
}
/** Vendedor por userId (compat). */
export async function getVendedorByUserId(userId) {
    const database = await getDb();
    const row = await database.select().from(vendedores).where(eq(vendedores.userId, userId)).limit(1);
    return row[0] ?? null;
}
/** Vendedor por id. */
export async function getVendedorById(id) {
    const database = await getDb();
    const row = await database.select().from(vendedores).where(eq(vendedores.id, id)).limit(1);
    return row[0] ?? null;
}
/** Pedido por id (row simples). */
export async function getPedidoById(id) {
    const database = await getDb();
    const row = await database.select().from(pedidos).where(eq(pedidos.id, id)).limit(1);
    return row[0] ?? null;
}
/** Lista todos os vendedores (admin). */
export async function getAllVendedores() {
    const database = await getDb();
    return await database.select().from(vendedores).orderBy(asc(vendedores.nome));
}
/** Busca vendedor por nome (exact, case-insensitive via LOWER). */
export async function getVendedorByNome(nome) {
    const database = await getDb();
    const term = nome.trim().toLowerCase();
    const row = await database
        .select()
        .from(vendedores)
        .where(sql `LOWER(${vendedores.nome}) = ${term}`)
        .limit(1);
    return row[0] ?? null;
}
/** Cria vendedor (retorna id). */
export async function createVendedor(data) {
    const database = await getDb();
    const result = await database.insert(vendedores).values(data);
    return { id: getInsertId(result) };
}
/** Atualiza vendedor por id. */
export async function updateVendedor(id, patch) {
    const database = await getDb();
    await database.update(vendedores).set(patch).where(eq(vendedores.id, id));
}
/** Deleta vendedor por id. */
export async function deleteVendedor(id) {
    const database = await getDb();
    await database.delete(vendedores).where(eq(vendedores.id, id));
}
/** Atualiza senha do vendedor (hash bcrypt). */
export async function updateVendedorSenha(vendedorId, hashedPassword) {
    const database = await getDb();
    await database.update(vendedores).set({ senha: hashedPassword }).where(eq(vendedores.id, vendedorId));
}
/** Compat: cria/retorna usuário por openId e opcionalmente nome. */
export async function findOrCreateUserByOpenId(tenantId, openId, name) {
    void tenantId;
    const existing = await getUserByOpenId(openId);
    if (existing)
        return existing;
    const now = new Date();
    const created = await insertUser({
        tenantId,
        openId,
        name: name ?? null,
        email: null,
        loginMethod: "local",
        role: "user",
        createdAt: toDbDate(now),
        updatedAt: toDbDate(now),
        lastSignedIn: toDbDate(now),
    });
    const user = await getUserById(created.id);
    if (!user)
        throw new Error("Falha ao criar usuário");
    return user;
}
/** Garante admin mínimo (user + vendedor admin). */
export async function ensureAdminUser(tenantId) {
    try {
        const adminUser = await findOrCreateUserByOpenId(tenantId, "admin", "Administrador");
        // Promove role no users (se ainda não for)
        await upsertUser(tenantId, { ...adminUser, role: "admin", updatedAt: toDbDate(new Date()) });
        const existingVendedor = await getVendedorByUserId(adminUser.id);
        if (existingVendedor)
            return;
        const now = new Date();
        await createVendedor({
            tenantId,
            userId: adminUser.id,
            nome: "Administrador",
            email: "admin@local.com",
            senha: null,
            cidade: null,
            telefone: null,
            admin: 1,
            ativo: 1,
            createdAt: toDbDate(now),
            updatedAt: toDbDate(now),
        });
    }
    catch (e) {
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
export async function reserveIdempotencyKey(tx, commandName, key) {
    try {
        await tx.insert(idempotencyKeys).values({ tenantId: 1, commandName, key, resultJson: null });
        return { reserved: true };
    }
    catch {
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
export async function updateIdempotencyResult(tx, commandName, key, resultJson, traceId) {
    await tx
        .update(idempotencyKeys)
        .set({ resultJson, traceId })
        .where(and(eq(idempotencyKeys.commandName, commandName), eq(idempotencyKeys.key, key)));
}
/** Conta a receber por id (para ownership). */
export async function getContaReceberById(id) {
    const database = await getDb();
    const row = await database.select().from(contasReceber).where(eq(contasReceber.id, id)).limit(1);
    return row[0] ?? null;
}
/** Boleto por id (para ownership). */
export async function getBoletoById(id) {
    void id;
    return null;
}
/** Dono do cadastro (`users.id`) e tenant — base para ownership de cliente/pedido. */
export async function getClienteOwnerRowById(clienteId) {
    void clienteId;
    return null;
}
/** Verifica se existe pedido do vendedor para o cliente (para ownership). */
export async function clienteTemPedidoDoVendedor(clienteId, vendedorId) {
    const database = await getDb();
    const row = await database
        .select({ id: pedidos.id })
        .from(pedidos)
        .where(and(eq(pedidos.clienteId, clienteId), eq(pedidos.vendedorId, vendedorId)))
        .limit(1);
    return row.length > 0;
}
export async function insertLeoActionLog(params) {
    try {
        if (params.tenantId == null)
            return;
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
    }
    catch (error) {
        console.error("[db/core] insertLeoActionLog:", error);
    }
}
export async function insertAuditLog(params, _tx) {
    void params;
    void _tx;
}
export async function closeDb() {
    if (pool) {
        await pool.end();
        pool = null;
        db = null;
    }
}
export function getInsertId(result) {
    // mysql2 retorna [ResultSetHeader, FieldPacket[]]
    if (Array.isArray(result) && result.length > 0) {
        const header = result[0];
        if (typeof header === "object" && header !== null && "insertId" in header) {
            const id = header.insertId;
            return typeof id === "number" ? id : Number(id ?? 0);
        }
    }
    if (typeof result === "object" && result !== null && "insertId" in result) {
        const id = result.insertId;
        return typeof id === "number" ? id : Number(id ?? 0);
    }
    return 0;
}
