import { eq, and, desc, asc, sql, like, ne } from "drizzle-orm";
import { PedidoStatus } from "../shared/domain-status.js";
import {
  getDb,
  getInsertId,
  clientes,
  clienteVendedores,
  vendedores,
  pedidos,
  insertAuditLog,
  normalizeTelefone,
  normalizeNomeSobrenome,
  NewCliente,
} from "../db/core.js";
import type { Cliente, ClienteVendedor } from "../db/core.js";
import { ensureArray, ensureObject, ensureCreatedResult } from "../_core/service-response.js";
import { validateTenantAccess, globalDbAuditor } from "../_core/tenant-validator.js";
import { assertVendedorActor, type ServiceActor } from "../_core/service-actor.js";

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
import { nanoid } from "nanoid";
import { recordQueryTime } from "../_core/system-monitor.js";
import { auditLog } from "../_core/audit-log.js";

// Types — entrada do router: nome e telefone obrigatórios; normalização feita no createCliente
export type CreateClienteWithVendedorInput = {
  nome: string;
  telefone: string;
  userId?: number; // Opcional para compatibilidade com callers antigos
  vendedorIdPrincipal?: number;
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
};

function assertRequiredId(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} obrigatório`);
  }
}

function assertRequiredPayload<T>(value: T | null | undefined, message: string): T {
  if (value == null) {
    throw new Error(message);
  }

  return value;
}

// Type REAL da connection Drizzle
import type { Database } from '../db/core.js';
type DbConn = Database;

/** Vínculo cliente_vendedores válido no tenant (prova de escopo vendedor). */
async function vendedorLinkedToCliente(
  dbConn: DbConn,
  tenantId: number,
  vendedorId: number,
  clienteId: number
): Promise<boolean> {
  const row = await dbConn
    .select({ id: clienteVendedores.id })
    .from(clienteVendedores)
    .innerJoin(clientes, eq(clientes.id, clienteVendedores.clienteId))
    .where(
      and(
        eq(clientes.tenantId, tenantId),
        eq(clienteVendedores.clienteId, clienteId),
        eq(clienteVendedores.vendedorId, vendedorId)
      )
    )
    .limit(1);
  return row.length > 0;
}

/** Update/delete: apenas admin ou vendedor vinculado. */
function userCanMutateCliente(actor: ServiceActor): boolean {
  if (actor.role === "admin") return true;
  return actor.vendedorId != null;
}

/** Verificar se vendedor/usuário tem acesso ao cliente (userId direto OU via clienteVendedores). */
async function userCanAccessCliente(
  dbConn: DbConn,
  tenantId: number,
  actor: ServiceActor,
  clienteId: number
): Promise<boolean> {
  if (actor.role === "admin") return true;
  
  if (!actor.userId && !actor.vendedorId) return false;
  
  // Buscar cliente precisa verificar vendedorId
  const row = await dbConn
    .select({ id: clientes.id })
    .from(clientes)
    .where(eq(clientes.id, clienteId))
    .limit(1);
  
  if (row.length === 0) return false;
  
  const cliente = row[0];
  
  // Acesso via clienteVendedores (compatibilidade)
  if (actor.vendedorId) {
    return await vendedorLinkedToCliente(dbConn, tenantId, actor.vendedorId, clienteId);
  }
  
  return false;
}

/**
 * Cria um novo cliente com normalização de dados
 * @param tenantId - ID do tenant para isolamento de dados
 */
export async function createCliente(
  tenantId: number, 
  data: CreateClienteWithVendedorInput,
  userIdOverride?: number
): Promise<{ id: number }> {
  try {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredPayload(data, "Dados do cliente obrigatórios");
    if (!data.nome) throw new Error("Nome do cliente obrigatório");
    if (!data.telefone) throw new Error("Telefone do cliente obrigatório");

    const dbConn = await getDb();
    if (!dbConn) throw new Error("Banco de dados indisponível");
    
    // userId: prioritário userIdOverride, senão data.userId (opcional para compatibilidade)
    const userId = userIdOverride ?? data.userId;
    
    // Normalizar dados
    const telefone = normalizeTelefone(data.telefone);
    const telefoneRecado = normalizeTelefone(data.telefoneRecado);
    const { nomeNorm, sobrenomeNorm } = normalizeNomeSobrenome(data.nome);
    
    // Verificar duplicação por telefone DENTRO DO TENANT
    const existingByPhone = await dbConn.select()
      .from(clientes)
      .where(and(eq(clientes.tenantId, tenantId), eq(clientes.telefone, telefone)))
      .limit(1);
    
    if (existingByPhone.length > 0) {
      throw new Error("Já existe um cliente com este telefone");
    }
    
    // Inserir cliente com tenantId
    const result = await dbConn.insert(clientes).values({
      tenantId,
      nome: data.nome.trim(),
      nomeNorm,
      sobrenomeNorm,
      telefone,
      telefoneNorm: telefone,
      telefoneRecado,
      rua: data.rua?.trim() || null,
      numero: data.numero?.trim() || null,
      bairro: data.bairro?.trim() || null,
      cidade: data.cidade?.trim() || null,
      uf: data.uf?.trim() || null,
      referencia: data.referencia?.trim() || null,
      condominio: data.condominio?.trim() || null,
      bloco: data.bloco?.trim() || null,
      apartamento: data.apartamento?.trim() || null,
    });
    
    const clienteId = getInsertId(result);
    if (!Number.isInteger(Number(clienteId)) || Number(clienteId) <= 0) {
      throw new Error("Falha ao criar cliente");
    }
    
    // Associar ao vendedor principal se informado
    if (data.vendedorIdPrincipal) {
      assertRequiredId(Number(data.vendedorIdPrincipal), "vendedorIdPrincipal");
      await dbConn.insert(clienteVendedores).values({
        clienteId,
        vendedorId: data.vendedorIdPrincipal,
        tipo: "PRINCIPAL",
        createdAt: new Date(),
      } as ClienteVendedor);
    }
    
    // Registrar auditoria (nova camada de auditoria logger)
    auditLog({
      action: "create",
      module: "clientes",
      resourceId: clienteId,
      details: { nome: data.nome, telefone, userId }
    });
    
    // Registrar auditoria (banco legado)
    await insertAuditLog({
      tenantId, // Agora obrigatório
      action: "create",
      entity: "cliente",
      entityId: String(clienteId),
      payloadJson: JSON.stringify({ nome: data.nome, telefone, userId }),
      traceId: nanoid(10),
    });
    
    // Garantir que o retorno tenha um ID válido
    return ensureCreatedResult({ id: clienteId });
  } catch (error) {
    console.error("Erro ao criar cliente:", error);
    throw error;
  }
}

export async function getHistoricoCliente(
  tenantId: number,
  actor: ServiceActor,
  clienteId: number,
  limit = 20
): Promise<Array<{ id: number; numero: number; total: string; createdAt: Date; status: string }>> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredId(clienteId, "clienteId");

  const dbConn = await getDb();
  if (!dbConn) return [];

  if (actor.role === "vendedor") {
    assertVendedorActor(actor);
    const ok = await vendedorLinkedToCliente(dbConn, tenantId, actor.vendedorId, clienteId);
    if (!ok) return [];
  }

  const pedidoConds = [eq(pedidos.tenantId, tenantId), eq(pedidos.clienteId, clienteId)];
  if (actor.role === "vendedor") {
    assertVendedorActor(actor);
    pedidoConds.push(eq(pedidos.vendedorId, actor.vendedorId));
  }

  const rows = await dbConn
    .select({
      id: pedidos.id,
      numero: pedidos.numero,
      total: pedidos.total,
      createdAt: pedidos.createdAt,
      status: pedidos.status,
    })
    .from(pedidos)
    .where(and(...pedidoConds))
    .orderBy(desc(pedidos.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));

  return ensureArray(rows).map((r) => ({
    ...r,
    status: String(r.status),
  }));
}

/**
 * Busca cliente por ID com escopo de ator (vendedor só com vínculo em cliente_vendedores).
 */
export async function getClienteById(tenantId: number, actor: ServiceActor, id: number): Promise<Cliente | null> {
  if (!Number.isInteger(tenantId) || tenantId <= 0) return null;
  if (!Number.isInteger(id) || id <= 0) return null;
  const dbConn = await getDb();
  if (!dbConn) return null;

  const result = await dbConn.select().from(clientes).where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, id))).limit(1);
  const row = result.length > 0 ? ensureObject(result[0]) : null;
  if (!row) return null;
  
  // Verificar ownership (userId direto OU vendedorID)
  const canAccess = await userCanAccessCliente(dbConn, tenantId, actor, id);
  return canAccess ? row : null;
}

/**
 * Lista clientes com busca e paginação. Admin: tenant inteiro (filtro opcional por vendedor em params).
 * Vendedor: obrigatório escopo pelo próprio vendedorId do ator (ignora spoofing de params).
 */
export async function listClientes(
  tenantId: number,
  actor: ServiceActor,
  params: {
    page?: number;
    pageSize?: number;
    busca?: string;
    /** Somente admin: filtrar listagem a um vendedor. */
    vendedorId?: number;
  }
): Promise<{ items: Cliente[]; total: number; page: number; pageSize: number }> {
  const start = Date.now();
  
  // VALIDAÇÃO CRÍTICA DE SEGURANÇA
  try {
    validateTenantAccess(tenantId, actor);
  } catch (error) {
    console.error('[listClientes] Falha de segurança:', (error as Error).message);
    return { items: [], total: 0, page: 1, pageSize: 50 };
  }
  
  if (!Number.isInteger(tenantId) || tenantId <= 0) return { items: [], total: 0, page: 1, pageSize: 50 };
  const dbConn = await getDb();
  if (!dbConn) return { items: [], total: 0, page: 1, pageSize: 50 };

  const safeParams = params ?? {};
  const { page = 1, pageSize = 50, busca } = safeParams;
  const limit = Math.min(pageSize, 100);
  const offset = (page - 1) * pageSize;

  const conditions = [eq(clientes.tenantId, tenantId)];

  let effectiveVendedorFilter: number | undefined;
  let effectiveUserIdFilter: number | undefined;
  
  if (actor.role === "vendedor") {
    assertVendedorActor(actor);
    effectiveVendedorFilter = actor.vendedorId;
    effectiveUserIdFilter = actor.userId;
  } else if (safeParams.vendedorId != null && Number.isInteger(safeParams.vendedorId) && safeParams.vendedorId > 0) {
    effectiveVendedorFilter = safeParams.vendedorId;
  }

  if (busca && busca.trim()) {
    const searchTerm = `%${busca.trim()}%`;
    conditions.push(
      sql`(${clientes.nome} LIKE ${searchTerm} OR 
            ${clientes.telefone} LIKE ${searchTerm} OR 
            ${clientes.cidade} LIKE ${searchTerm})`
    );
  }

  // Filtrar por vendedorId (compatibilidade)
  if (effectiveVendedorFilter != null) {
    const vendedorCondition = effectiveVendedorFilter != null
      ? eq(clienteVendedores.vendedorId, effectiveVendedorFilter)
      : null;

    // Se temos vendedorCondition, usar JOIN com clienteVendedores
    if (vendedorCondition) {
      const queryWithVendedor = dbConn
        .select({
          id: clientes.id,
          tenantId: clientes.tenantId,
          nome: clientes.nome,
          telefone: clientes.telefone,
          telefoneNorm: clientes.telefoneNorm,
          nomeNorm: clientes.nomeNorm,
          sobrenomeNorm: clientes.sobrenomeNorm,
          cidade: clientes.cidade,
          uf: clientes.uf,
          createdAt: clientes.createdAt,
          updatedAt: clientes.updatedAt,
        })
        .from(clientes)
        .leftJoin(clienteVendedores, eq(clientes.id, clienteVendedores.clienteId))
        .where(
          and(
            ...conditions,
            vendedorCondition
          )
        )
        .orderBy(asc(clientes.nome))
        .limit(limit)
        .offset(offset);
      const rows = await queryWithVendedor;
      const items = ensureArray(rows as Cliente[]);

      const totalResult = await dbConn
        .select({ count: sql<number>`count(distinct ${clientes.id})` })
        .from(clientes)
        .leftJoin(clienteVendedores, eq(clientes.id, clienteVendedores.clienteId))
        .where(
          and(
            ...conditions,
            sql`${clienteVendedores.vendedorId} = ${effectiveVendedorFilter}`
          )
        );
      const total = Number(totalResult[0]?.count ?? 0);
      recordQueryTime("clientes.service", "listClientes", Date.now() - start);
      return { items, total, page, pageSize };
    }

    
    // Se só temos vendedorId (compatibilidade com dados antigos)
    if (vendedorCondition) {
      const queryWithJoin = dbConn
        .select({
          id: clientes.id,
          tenantId: clientes.tenantId,
          nome: clientes.nome,
          telefone: clientes.telefone,
          telefoneNorm: clientes.telefoneNorm,
          nomeNorm: clientes.nomeNorm,
          sobrenomeNorm: clientes.sobrenomeNorm,
          cidade: clientes.cidade,
          uf: clientes.uf,
          createdAt: clientes.createdAt,
          updatedAt: clientes.updatedAt,
        })
        .from(clientes)
        .innerJoin(clienteVendedores, eq(clientes.id, clienteVendedores.clienteId))
        .where(and(...conditions, vendedorCondition))
        .orderBy(asc(clientes.nome))
        .limit(limit)
        .offset(offset);
      const rows = await queryWithJoin;
      const items = ensureArray(rows as Cliente[]);

      const totalResult = await dbConn
        .select({ count: sql<number>`count(*)` })
        .from(clientes)
        .innerJoin(clienteVendedores, eq(clientes.id, clienteVendedores.clienteId))
        .where(and(...conditions, vendedorCondition));
      const total = Number(totalResult[0]?.count ?? 0);
      recordQueryTime("clientes.service", "listClientes", Date.now() - start);
      return { items, total, page, pageSize };
    }
  }

  const items = ensureArray(
    await dbConn.select().from(clientes).where(and(...conditions)).orderBy(asc(clientes.nome)).limit(limit).offset(offset)
  );

  const totalResult = await dbConn.select({ count: sql<number>`count(*)` }).from(clientes).where(and(...conditions));
  const total = Number(totalResult[0]?.count || 0);

  recordQueryTime("clientes.service", "listClientes", Date.now() - start);
  return { items, total, page, pageSize };
}

/**
 * Atualiza dados do cliente
 * @param tenantId - ID do tenant para validação
 */
export async function updateCliente(tenantId: number, actor: ServiceActor, id: number, data: Partial<CreateClienteInput>): Promise<{ success: boolean }> {
  try {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredId(id, "clienteId");
    assertRequiredPayload(data, "Dados do cliente obrigatórios");
    const dbConn = await getDb();
    if (!dbConn) throw new Error("Banco de dados indisponível");
    
    // Verificar ownership (novo: userId direto OU via clienteVendedores)
    const canAccess = await userCanAccessCliente(dbConn, tenantId, actor, id);
    if (!canAccess) {
      throw new Error("Acesso negado: você não tem permissão para editar este cliente");
    }
    
    const clienteAtual = await dbConn.select().from(clientes).where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, id))).limit(1);
    if (!clienteAtual.length) throw new Error("Cliente não encontrado");
    
    const updateData: Partial<Cliente> & { updatedAt: Date } = { updatedAt: new Date() };
    
    if (data.nome !== undefined) {
      const { nomeNorm, sobrenomeNorm } = normalizeNomeSobrenome(data.nome);
      updateData.nome = data.nome.trim();
      updateData.nomeNorm = nomeNorm;
      updateData.sobrenomeNorm = sobrenomeNorm;
    }
    
    if (data.telefone !== undefined) {
      const telefone = normalizeTelefone(data.telefone);
      
      const existingByPhone = await dbConn.select()
        .from(clientes)
        .where(and(eq(clientes.tenantId, tenantId), eq(clientes.telefone, telefone), sql`${clientes.id} != ${id}`))
        .limit(1);
      
      if (existingByPhone.length > 0) {
        throw new Error("Já existe um cliente com este telefone");
      }
      updateData.telefone = telefone;
    }
    
    const fields: (keyof CreateClienteInput)[] = ['telefoneRecado', 'rua', 'numero', 'bairro', 'cidade', 'uf', 'referencia', 'condominio', 'bloco', 'apartamento'];
    const updatePayload = updateData as Record<string, string | number | null | Date>;
    for (const f of fields) {
      const v = data[f];
      if (v !== undefined) {
        updatePayload[f] = (typeof v === 'string' ? v.trim() : v) || null;
      }
    }
    
    await dbConn.update(clientes)
      .set(updateData)
      .where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, id)));
    const after = await dbConn.select().from(clientes).where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, id))).limit(1);
    if (after.length === 0) throw new Error("Falha ao atualizar cliente");
    return { success: true };
  } catch (error) {
    console.error("Erro ao atualizar cliente:", error);
    throw error;
  }
}

/**
 * Associa cliente a vendedor (com validação de tenant)
 * @param tenantId - ID do tenant para validação
 */
export async function associarClienteVendedor(tenantId: number, clienteId: number, vendedorId: number, principal: boolean = false): Promise<void> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredId(clienteId, "clienteId");
  assertRequiredId(vendedorId, "vendedorId");
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  
  // Validar que cliente pertence ao tenant
  const cliente = await dbConn.select().from(clientes).where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, clienteId))).limit(1);
  if (cliente.length === 0) throw new Error("Cliente não encontrado");
  
  // Se for principal, remover associação principal anterior
  if (principal) {
    await dbConn.update(clienteVendedores)
      .set({ tipo: "SECUNDARIO" })
      .where(and(eq(clienteVendedores.clienteId, clienteId), eq(clienteVendedores.tipo, "PRINCIPAL")));
  }
  
  // Verificar se associação já existe
  const existing = await dbConn.select()
    .from(clienteVendedores)
    .where(and(eq(clienteVendedores.clienteId, clienteId), eq(clienteVendedores.vendedorId, vendedorId)))
    .limit(1);
  
  if (existing.length > 0) {
    await dbConn.update(clienteVendedores)
      .set({ tipo: principal ? "PRINCIPAL" : "SECUNDARIO", createdAt: new Date() })
      .where(eq(clienteVendedores.id, existing[0].id));
  } else {
    await dbConn.insert(clienteVendedores).values({
      clienteId,
      vendedorId,
      tipo: principal ? "PRINCIPAL" : "SECUNDARIO",
      createdAt: new Date(),
    } as ClienteVendedor);
  }
}

/**
 * Busca ou cria um cliente baseado em nome e telefone (normalizados)
 * @param tenantId - ID do tenant para isolamento
 * @param data - Dados do cliente para criação
 * @param tx - Transação opcional
 */
export async function getOrCreateCliente(
  tenantId: number,
  data: CreateClienteInput & { nome: string; telefone: string },
  tx?: DbConn
): Promise<number> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredPayload(data, "Dados do cliente obrigatórios");
  if (!data.nome) throw new Error("Nome do cliente obrigatório");
  if (!data.telefone) throw new Error("Telefone do cliente obrigatório");
  const dbConn = tx || await getDb();
  if (!dbConn) throw new Error("Database not available");

  const telefoneNorm = normalizeTelefone(data.telefone);
  const { nomeNorm, sobrenomeNorm } = normalizeNomeSobrenome(data.nome);
  const nn = nomeNorm.slice(0, 120);
  const sn = sobrenomeNorm.slice(0, 120);

  // Buscar existente
  const existing = await dbConn.select({ id: clientes.id })
    .from(clientes)
    .where(and(
      eq(clientes.tenantId, tenantId),
      eq(clientes.telefoneNorm, telefoneNorm),
      eq(clientes.nomeNorm, nn),
      eq(clientes.sobrenomeNorm, sn)
    ))
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  // Criar novo
  const tel = data.telefone === '' || data.telefone == null ? null : (data.telefone || null);
  const created = await dbConn.insert(clientes).values({
    tenantId,
    nome: data.nome,
    telefone: tel,
    telefoneNorm: telefoneNorm.slice(0, 32),
    nomeNorm: nn,
    sobrenomeNorm: sn,
    telefoneRecado: data.telefoneRecado || null,
    rua: data.rua || null,
    numero: data.numero || null,
    bairro: data.bairro || null,
    cidade: data.cidade || null,
    uf: data.uf || null,
    referencia: data.referencia || null,
    condominio: data.condominio || null,
    bloco: data.bloco || null,
    apartamento: data.apartamento || null,
  });

  const clienteId = getInsertId(created);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    throw new Error("Falha ao criar cliente");
  }

  return clienteId;
}

/**
 * Garante que existe um vínculo entre cliente e vendedor
 * @param tx - Transação ativa
 * @param clienteId - ID do cliente
 * @param vendedorId - ID do vendedor
 */
export async function ensureClienteVendedorLink(
  tx: DbConn,
  clienteId: number,
  vendedorId: number
): Promise<void> {
  assertRequiredPayload(tx, "Transação obrigatória");
  assertRequiredId(clienteId, "clienteId");
  assertRequiredId(vendedorId, "vendedorId");
  const existing = await tx
    .select({ id: clienteVendedores.id })
    .from(clienteVendedores)
    .where(and(eq(clienteVendedores.clienteId, clienteId), eq(clienteVendedores.vendedorId, vendedorId)))
    .limit(1);

  if (existing.length === 0) {
    await tx.insert(clienteVendedores).values({
      clienteId,
      vendedorId,
      tipo: "SECUNDARIO",
      createdAt: new Date(),
    } as ClienteVendedor);
  }
}
export async function deleteCliente(tenantId: number, actor: ServiceActor, id: number): Promise<{ success: boolean }> {
  try {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredId(id, "clienteId");
    const dbConn = await getDb();
    if (!dbConn) throw new Error("Banco de dados indisponível");

    const cliente = await dbConn.select().from(clientes).where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, id))).limit(1);
    if (!cliente.length) throw new Error("Cliente não encontrado");
    const c0 = ensureObject(cliente[0]);
    if (!userCanMutateCliente(actor)) {
      throw new Error("Acesso negado: você não tem permissão para excluir este cliente");
    }
    
    // 1. Verificar se existem pedidos vinculados
    const pedidosCount = await dbConn.select({ count: sql`count(*)` })
      .from(pedidos)
      .where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.clienteId, id)));
      
    if (Number(pedidosCount[0]?.count || 0) > 0) {
      throw new Error("Não é possível excluir cliente com pedidos realizados");
    }
    
    // 2. Excluir vínculos com vendedores
    await dbConn.delete(clienteVendedores).where(eq(clienteVendedores.clienteId, id));
    
    // 3. Excluir cliente
    await dbConn.delete(clientes).where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, id)));
    const after = await dbConn.select().from(clientes).where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, id))).limit(1);
    if (after.length > 0) throw new Error("Falha ao excluir cliente");
    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir cliente:", error);
    throw error;
  }
}

/**
 * Busca o vendedor principal de um cliente
 */
export async function getVendedorPrincipalDoCliente(tenantId: number, clienteId: number): Promise<{ vendedorId: number; vendedorNome: string } | null> {
  if (!Number.isInteger(tenantId) || tenantId <= 0) return null;
  if (!Number.isInteger(clienteId) || clienteId <= 0) return null;
  const dbConn = await getDb();
  if (!dbConn) return null;
  
  const result = await dbConn.select({
    vendedorId: clienteVendedores.vendedorId,
    vendedorNome: vendedores.nome
  })
  .from(clienteVendedores)
  .innerJoin(vendedores, eq(clienteVendedores.vendedorId, vendedores.id))
  .where(and(
    eq(clienteVendedores.clienteId, clienteId),
    eq(clienteVendedores.tipo, "PRINCIPAL"),
    eq(vendedores.tenantId, tenantId)
  ))
  .limit(1);
  
  return result.length > 0 ? result[0] : null;
}
export async function removerAssociacaoClienteVendedor(tenantId: number, clienteId: number, vendedorId: number): Promise<void> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredId(clienteId, "clienteId");
  assertRequiredId(vendedorId, "vendedorId");
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  
  // Validar que cliente pertence ao tenant
  const cliente = await dbConn.select().from(clientes).where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, clienteId))).limit(1);
  if (cliente.length === 0) throw new Error("Cliente não encontrado");
  
  await dbConn.delete(clienteVendedores)
    .where(and(eq(clienteVendedores.clienteId, clienteId), eq(clienteVendedores.vendedorId, vendedorId)));
}

/**
 * Lista vendedores associados a um cliente (com validação de tenant)
 * @param tenantId - ID do tenant para validação
 */
export async function getVendedoresByCliente(tenantId: number, clienteId: number): Promise<Array<{
  vendedor: typeof vendedores.$inferSelect;
  associacao: typeof clienteVendedores.$inferSelect;
}>> {
  if (!Number.isInteger(tenantId) || tenantId <= 0) return [];
  if (!Number.isInteger(clienteId) || clienteId <= 0) return [];
  const dbConn = await getDb();
  if (!dbConn) return [];
  
  // Validar que cliente pertence ao tenant
  const cliente = await dbConn.select().from(clientes).where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, clienteId))).limit(1);
  if (cliente.length === 0) return [];
  
  const result = await dbConn.select({
    vendedor: vendedores,
    associacao: clienteVendedores,
  })
    .from(clienteVendedores)
    .innerJoin(vendedores, eq(vendedores.id, clienteVendedores.vendedorId))
    .where(eq(clienteVendedores.clienteId, clienteId))
    .orderBy(desc(clienteVendedores.tipo), asc(vendedores.nome));
    
  // Garantir que o retorno seja sempre um array
  return ensureArray(result as Array<{
    vendedor: typeof vendedores.$inferSelect;
    associacao: typeof clienteVendedores.$inferSelect;
  }>);
}

/**
 * Busca cliente por telefone no tenant; vendedor só se houver vínculo.
 */
export async function getClienteByTelefone(tenantId: number, actor: ServiceActor, telefone: string): Promise<Cliente | null> {
  if (!telefone?.trim()) return null;
  assertRequiredId(tenantId, "tenantId");
  const dbConn = await getDb();
  if (!dbConn) return null;

  const telefoneNormalizado = normalizeTelefone(telefone);
  const base = and(eq(clientes.tenantId, tenantId), eq(clientes.telefone, telefoneNormalizado));

  if (actor.role === "admin") {
    const result = await dbConn.select().from(clientes).where(base).limit(1);
    return result.length > 0 ? result[0] : null;
  }

  assertVendedorActor(actor);
  const result = await dbConn
    .select({ c: clientes })
    .from(clientes)
    .innerJoin(clienteVendedores, eq(clientes.id, clienteVendedores.clienteId))
    .where(and(base, eq(clienteVendedores.vendedorId, actor.vendedorId)))
    .limit(1);
  return result.length > 0 ? result[0].c : null;
}

/**
 * Busca clientes por nome (parcial) no tenant; vendedor só com vínculo.
 */
export async function searchClientesByNome(
  tenantId: number,
  actor: ServiceActor,
  nome: string,
  limite: number = 10
): Promise<Cliente[]> {
  if (!nome?.trim()) return [];
  assertRequiredId(tenantId, "tenantId");
  const dbConn = await getDb();
  if (!dbConn) return [];

  const searchTerm = `%${nome.trim()}%`;
  const nameCond = like(clientes.nome, searchTerm);
  const tenantCond = eq(clientes.tenantId, tenantId);

  if (actor.role === "admin") {
    return ensureArray(
      await dbConn
        .select()
        .from(clientes)
        .where(and(tenantCond, nameCond))
        .orderBy(asc(clientes.nome))
        .limit(limite)
    ) as Cliente[];
  }

  assertVendedorActor(actor);
  const rows = await dbConn
    .select({ c: clientes })
    .from(clientes)
    .innerJoin(clienteVendedores, eq(clientes.id, clienteVendedores.clienteId))
    .where(and(tenantCond, nameCond, eq(clienteVendedores.vendedorId, actor.vendedorId)))
    .orderBy(asc(clientes.nome))
    .limit(limite);
  return rows.map((r) => r.c) as Cliente[];
}

/**
 * Relatório de clientes ativos por período
 */
export async function getReportClientesAtivos(tenantId: number, params: {
  dataInicio: Date;
  dataFim: Date;
  limit: number;
}): Promise<Array<{
  clienteNome: string;
  quantidadePedidos: number;
}>> {
  assertRequiredId(tenantId, "tenantId");
  const db = await getDb();
  if (!db) return [];
  
  try {
    const result = await db
      .select({
        clienteNome: pedidos.clienteNome,
        quantidadePedidos: sql<number>`COUNT(*)`.as('quantidadePedidos')
      })
      .from(pedidos)
      .where(
        and(
          eq(pedidos.tenantId, tenantId),
          sql`${pedidos.createdAt} >= ${params.dataInicio}`,
          sql`${pedidos.createdAt} <= ${params.dataFim}`,
          ne(pedidos.status, PedidoStatus.CANCELADO)
        )
      )
      .groupBy(pedidos.clienteNome)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(params.limit);
    
    // Garantir que o retorno seja sempre um array
    return ensureArray(result as Array<{
      clienteNome: string;
      quantidadePedidos: number;
    }>);
  } catch (error) {
    console.error('Error in getReportClientesAtivos:', error);
    return [];
  }
}

export type LeoClientePedidoMetrics = {
  id: number;
  nome: string | null;
  createdAt: Date;
  totalPedidos: number;
  totalGasto: number;
  avgTicket: number;
};

export async function listClientesComMetricasPedidos(
  tenantId: number,
  actor: ServiceActor,
  limitRows = 500
): Promise<LeoClientePedidoMetrics[]> {
  assertRequiredId(tenantId, "tenantId");
  const dbConn = await getDb();
  if (!dbConn) return [];

  if (actor.role === "vendedor") {
    assertVendedorActor(actor);
    const rows = await dbConn
      .select({
        id: clientes.id,
        nome: clientes.nome,
        createdAt: clientes.createdAt,
        totalPedidos: sql<number>`(SELECT COUNT(*) FROM pedidos WHERE pedidos.cliente_id = ${clientes.id} AND pedidos.vendedor_id = ${actor.vendedorId})`.as(
          "totalPedidos"
        ),
        totalGasto: sql<number>`(SELECT COALESCE(SUM(pedidos.total), 0) FROM pedidos WHERE pedidos.cliente_id = ${clientes.id} AND pedidos.vendedor_id = ${actor.vendedorId})`.as(
          "totalGasto"
        ),
        avgTicket: sql<number>`(SELECT COALESCE(AVG(pedidos.total), 0) FROM pedidos WHERE pedidos.cliente_id = ${clientes.id} AND pedidos.vendedor_id = ${actor.vendedorId})`.as(
          "avgTicket"
        ),
      })
      .from(clientes)
      .innerJoin(clienteVendedores, eq(clientes.id, clienteVendedores.clienteId))
      .where(and(eq(clientes.tenantId, tenantId), eq(clienteVendedores.vendedorId, actor.vendedorId)))
      .limit(limitRows);
    return rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      createdAt: r.createdAt,
      totalPedidos: Number(r.totalPedidos ?? 0),
      totalGasto: Number(r.totalGasto ?? 0),
      avgTicket: Number(r.avgTicket ?? 0),
    }));
  }

  const rows = await dbConn
    .select({
      id: clientes.id,
      nome: clientes.nome,
      createdAt: clientes.createdAt,
      totalPedidos: sql<number>`(SELECT COUNT(*) FROM pedidos WHERE pedidos.cliente_id = ${clientes.id})`.as(
        "totalPedidos"
      ),
      totalGasto: sql<number>`(SELECT COALESCE(SUM(pedidos.total), 0) FROM pedidos WHERE pedidos.cliente_id = ${clientes.id})`.as(
        "totalGasto"
      ),
      avgTicket: sql<number>`(SELECT COALESCE(AVG(pedidos.total), 0) FROM pedidos WHERE pedidos.cliente_id = ${clientes.id})`.as(
        "avgTicket"
      ),
    })
    .from(clientes)
    .where(eq(clientes.tenantId, tenantId))
    .limit(limitRows);
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    createdAt: r.createdAt,
    totalPedidos: Number(r.totalPedidos ?? 0),
    totalGasto: Number(r.totalGasto ?? 0),
    avgTicket: Number(r.avgTicket ?? 0),
  }));
}
