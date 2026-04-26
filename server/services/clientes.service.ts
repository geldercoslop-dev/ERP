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
import { assertDbConnection } from "../_core/errors/assertions.js";

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
  
  // Buscar cliente precisa verificar vendedorId E tenantId
  const row = await dbConn
    .select({ id: clientes.id })
    .from(clientes)
    .where(and(eq(clientes.id, clienteId), eq(clientes.tenantId, tenantId)))
    .limit(1);
  
  if (row.length === 0) return false;
  
  const cliente = row[0];
  
  // Acesso via clienteVendedores (compatibilidade)
  if (actor.vendedorId) {
    return await vendedorLinkedToCliente(dbConn, tenantId, actor.vendedorId, clienteId);
  }
  
  // Usuários comuns podem acessar clientes do próprio tenant
  if (actor.userId) {
    return true;
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
): Promise<{ success: boolean; data?: { id: number }; error?: string }> {
  try {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return { success: false, error: "tenantId obrigatório" };
    }
    if (!data || typeof data !== 'object') {
      return { success: false, error: "Dados do cliente obrigatórios" };
    }
    if (!data.nome) return { success: false, error: "Nome do cliente obrigatório" };
    if (!data.telefone) return { success: false, error: "Telefone do cliente obrigatório" };

    const dbConn = await getDb();
    assertDbConnection(dbConn);
    
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
      return { success: false, error: "Já existe um cliente com este telefone" };
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
    });
    
    const clienteId = getInsertId(result);
    if (!Number.isInteger(Number(clienteId)) || Number(clienteId) <= 0) {
      return { success: false, error: "Falha ao criar cliente" };
    }
    
    // Associar ao vendedor principal se informado
    if (data.vendedorIdPrincipal) {
      if (!Number.isInteger(Number(data.vendedorIdPrincipal)) || Number(data.vendedorIdPrincipal) <= 0) {
        return { success: false, error: "vendedorIdPrincipal obrigatório" };
      }
      
      await dbConn.insert(clienteVendedores).values({
        tenantId,
        clienteId,
        vendedorId: Number(data.vendedorIdPrincipal),
        tipo: "PRINCIPAL",
        createdAt: new Date(),
      });
    }
    
    // Registrar auditoria
    await insertAuditLog({
      tenantId,
      action: "create",
      entity: "cliente",
      entityId: String(clienteId),
      payloadJson: JSON.stringify({ nome: data.nome, telefone, userId }),
      traceId: nanoid(10),
    });
    
    return { success: true, data: { id: Number(clienteId) } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getHistoricoCliente(
  tenantId: number,
  actor: ServiceActor,
  clienteId: number,
  limit = 20
): Promise<{ success: boolean; data?: Array<{ id: number; numero: number; total: string; createdAt: Date; status: string; dataEntrega: Date | null }>; error?: string }> {
  try {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return { success: false, error: "tenantId obrigatório" };
    }
    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return { success: false, error: "clienteId obrigatório" };
    }

    const dbConn = await getDb();
    assertDbConnection(dbConn);

    if (actor.role === "vendedor") {
      if (!actor.vendedorId) {
        return { success: false, error: "Vendedor ID obrigatório" };
      }
      const ok = await vendedorLinkedToCliente(dbConn, tenantId, actor.vendedorId, clienteId);
      if (!ok) return { success: false, error: "Acesso negado" };
    }

    const pedidoConds = [eq(pedidos.tenantId, tenantId), eq(pedidos.clienteId, clienteId)];
    if (actor.role === "vendedor") {
      if (!actor.vendedorId) {
        return { success: false, error: "Vendedor ID obrigatório" };
      }
      pedidoConds.push(eq(pedidos.vendedorId, actor.vendedorId));
    }

    const rows = await dbConn
      .select({
        id: pedidos.id,
        numero: pedidos.numero,
        total: pedidos.total,
        createdAt: pedidos.createdAt,
        status: pedidos.status,
        dataEntrega: pedidos.dataEntrega,
      })
      .from(pedidos)
      .where(and(...pedidoConds))
      .orderBy(desc(pedidos.createdAt))
      .limit(Math.min(Math.max(limit, 1), 50));

    return { success: true, data: ensureArray(rows) as Array<{ id: number; numero: number; total: string; createdAt: Date; status: string; dataEntrega: Date | null }> };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getClienteById(tenantId: number, actor: ServiceActor, id: number): Promise<{ success: boolean; data?: Cliente; error?: string }> {
  try {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return { success: false, error: "tenantId obrigatório" };
    }
    if (!Number.isInteger(id) || id <= 0) {
      return { success: false, error: "clienteId obrigatório" };
    }
    const dbConn = await getDb();
    assertDbConnection(dbConn);

    const result = await dbConn.select().from(clientes).where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, id))).limit(1);
    const row = result.length > 0 ? ensureObject(result[0]) : null;
    if (!row) return { success: false, error: "Cliente não encontrado" };
  
    // Verificar ownership (userId direto OU vendedorID)
    const canAccess = await userCanAccessCliente(dbConn, tenantId, actor, id);
    return { success: true, data: canAccess ? row : undefined };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

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
): Promise<{ success: boolean; data?: { items: Cliente[]; total: number; page: number; pageSize: number }; error?: string }> {
  try {
    // VALIDAÇÃO CRÍTICA DE SEGURANÇA
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return { success: false, error: "tenantId obrigatório" };
    }

    const dbConn = await getDb();
    assertDbConnection(dbConn);

    const safeParams = params ?? {};
    const { page = 1, pageSize = 50, busca } = safeParams;
    const limit = Math.min(pageSize, 100);
    const offset = (page - 1) * pageSize;

    const conditions = [eq(clientes.tenantId, tenantId)];

    let effectiveVendedorFilter: number | undefined;
    let effectiveUserIdFilter: number | undefined;
  
    if (actor.role === "vendedor") {
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
      const vendedorCondition = eq(clienteVendedores.vendedorId, effectiveVendedorFilter);

      // Se temos vendedorCondition, usar JOIN com clienteVendedores
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
      return { success: true, data: { items, total, page, pageSize } };
    }

    // Se só temos vendedorId (compatibilidade com dados antigos)
    if (effectiveVendedorFilter) {
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
        .where(and(...conditions, eq(clienteVendedores.vendedorId, effectiveVendedorFilter)))
        .orderBy(asc(clientes.nome))
        .limit(limit)
        .offset(offset);
      
      const rows = await queryWithJoin;
      const items = ensureArray(rows as Cliente[]);

      const totalResult = await dbConn
        .select({ count: sql<number>`count(*)` })
        .from(clientes)
        .innerJoin(clienteVendedores, eq(clientes.id, clienteVendedores.clienteId))
        .where(and(...conditions, eq(clienteVendedores.vendedorId, effectiveVendedorFilter)));
      
      const total = Number(totalResult[0]?.count ?? 0);
      return { success: true, data: { items, total, page, pageSize } };
    }

    const items = ensureArray(
      await dbConn.select().from(clientes).where(and(...conditions)).orderBy(asc(clientes.nome)).limit(limit).offset(offset)
    );

    const totalResult = await dbConn.select({ count: sql<number>`count(*)` }).from(clientes).where(and(...conditions));
    const total = Number(totalResult[0]?.count || 0);

    return { success: true, data: { items, total, page, pageSize } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateCliente(tenantId: number, actor: ServiceActor, id: number, data: Partial<CreateClienteInput>): Promise<{ success: boolean; error?: string }> {
  try {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return { success: false, error: "tenantId obrigatório" };
    }
    if (!Number.isInteger(id) || id <= 0) {
      return { success: false, error: "clienteId obrigatório" };
    }
    if (!data || typeof data !== 'object') {
      return { success: false, error: "Dados do cliente obrigatórios" };
    }

    const dbConn = await getDb();
    assertDbConnection(dbConn);
    
    // Verificar ownership (novo: userId direto OU via clienteVendedores)
    const canAccess = await userCanAccessCliente(dbConn, tenantId, actor, id);
    if (!canAccess) {
      return { success: false, error: "Acesso negado: você não tem permissão para editar este cliente" };
    }
    
    const clienteAtual = await dbConn.select().from(clientes).where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, id))).limit(1);
    if (clienteAtual.length === 0) {
      return { success: false, error: "Cliente não encontrado" };
    }
    
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
        return { success: false, error: "Já existe um cliente com este telefone" };
      }
      updateData.telefone = telefone;
    }
    
    const fields: (keyof CreateClienteInput)[] = ['telefoneRecado', 'rua', 'numero', 'bairro', 'cidade', 'uf', 'referencia', 'condominio'];
    const updatePayload = updateData as Record<string, string | number | null | Date>;
    for (const f of fields) {
      const v = data[f];
      if (v !== undefined) {
        updatePayload[f] = (typeof v === 'string' ? v.trim() : v) || null;
      }
    }
    
    await dbConn.update(clientes)
      .set(updatePayload)
      .where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, id)));
    
    const after = await dbConn.select().from(clientes).where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, id))).limit(1);
    if (after.length === 0) {
      return { success: false, error: "Falha ao atualizar cliente" };
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function associarClienteVendedor(tenantId: number, clienteId: number, vendedorId: number, principal: boolean = false): Promise<{ success: boolean; error?: string }> {
  try {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return { success: false, error: "tenantId obrigatório" };
    }
    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return { success: false, error: "clienteId obrigatório" };
    }
    if (!Number.isInteger(vendedorId) || vendedorId <= 0) {
      return { success: false, error: "vendedorId obrigatório" };
    }

    const dbConn = await getDb();
    assertDbConnection(dbConn);
  
    // Validar que cliente pertence ao tenant
    const cliente = await dbConn.select().from(clientes).where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, clienteId))).limit(1);
    if (cliente.length === 0) {
      return { success: false, error: "Cliente não encontrado" };
    }
  
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
        tenantId,
        clienteId,
        vendedorId,
        tipo: principal ? "PRINCIPAL" : "SECUNDARIO",
        createdAt: new Date(),
      });
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getOrCreateCliente(
  tenantId: number,
  data: CreateClienteInput & { nome: string; telefone: string },
  tx?: DbConn
): Promise<{ success: boolean; data?: number; error?: string }> {
  try {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return { success: false, error: "tenantId obrigatório" };
    }
    if (!data || typeof data !== 'object') {
      return { success: false, error: "Dados do cliente obrigatórios" };
    }
    if (!data.nome) return { success: false, error: "Nome do cliente obrigatório" };
    if (!data.telefone) return { success: false, error: "Telefone do cliente obrigatório" };

    const dbConn = tx || await getDb();
    assertDbConnection(dbConn);

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
      return { success: true, data: existing[0].id };
    }

    // Criar novo
    const created = await dbConn.insert(clientes).values({
      tenantId,
      nome: data.nome,
      telefone: data.telefone === '' || data.telefone == null ? null : (data.telefone || null),
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
    });

    const clienteId = getInsertId(created);
    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return { success: false, error: "Falha ao criar cliente" };
    }

    return { success: true, data: clienteId };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function ensureClienteVendedorLink(
  tx: DbConn,
  tenantId: number,
  clienteId: number,
  vendedorId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!Number.isInteger(vendedorId) || vendedorId <= 0) {
      return { success: false, error: "vendedorId obrigatório" };
    }
    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return { success: false, error: "clienteId obrigatório" };
    }

    const existing = await tx
      .select({ id: clienteVendedores.id })
      .from(clienteVendedores)
      .where(and(eq(clienteVendedores.clienteId, clienteId), eq(clienteVendedores.vendedorId, vendedorId)))
      .limit(1);

    if (existing.length === 0) {
      await tx.insert(clienteVendedores).values({
        tenantId,
        clienteId,
        vendedorId,
        tipo: "SECUNDARIO",
        createdAt: new Date(),
      });
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteCliente(tenantId: number, actor: ServiceActor, id: number): Promise<{ success: boolean; error?: string }> {
  try {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return { success: false, error: "tenantId obrigatório" };
    }
    if (!Number.isInteger(id) || id <= 0) {
      return { success: false, error: "clienteId obrigatório" };
    }

    const dbConn = await getDb();
    assertDbConnection(dbConn);

    const cliente = await dbConn.select().from(clientes).where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, id))).limit(1);
    if (cliente.length === 0) {
      return { success: false, error: "Cliente não encontrado" };
    }
    const c0 = ensureObject(cliente[0]);
    if (!userCanMutateCliente(actor)) {
      return { success: false, error: "Acesso negado: você não tem permissão para excluir este cliente" };
    }
    
    // 1. Verificar se existem pedidos vinculados
    const pedidosCount = await dbConn.select({ count: sql`count(*)` })
      .from(pedidos)
      .where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.clienteId, id)));
      
    if (Number(pedidosCount[0]?.count || 0) > 0) {
      return { success: false, error: "Não é possível excluir cliente com pedidos realizados" };
    }
    
    // 2. Excluir vínculos com vendedores
    await dbConn.delete(clienteVendedores).where(eq(clienteVendedores.clienteId, id));
    
    // 3. Excluir cliente
    await dbConn.delete(clientes).where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, id)));
    
    const after = await dbConn.select().from(clientes).where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, id))).limit(1);
    if (after.length > 0) {
      return { success: false, error: "Falha ao excluir cliente" };
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getVendedorPrincipalDoCliente(tenantId: number, clienteId: number): Promise<{ success: boolean; data?: { vendedorId: number; vendedorNome: string }; error?: string }> {
  try {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return { success: false, error: "tenantId obrigatório" };
    }
    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return { success: false, error: "clienteId obrigatório" };
    }

    const dbConn = await getDb();
    assertDbConnection(dbConn);
  
    const result = await dbConn.select({
      vendedorId: clienteVendedores.vendedorId,
      vendedorNome: vendedores.nome
    })
      .from(clienteVendedores)
      .innerJoin(vendedores, eq(vendedores.id, clienteVendedores.vendedorId))
      .where(and(
        eq(clienteVendedores.clienteId, clienteId),
        eq(clienteVendedores.tipo, "PRINCIPAL"),
        eq(vendedores.tenantId, tenantId)
      ))
      .limit(1);
  
    return { success: true, data: result.length > 0 ? result[0] : undefined };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function removerAssociacaoClienteVendedor(tenantId: number, clienteId: number, vendedorId: number): Promise<{ success: boolean; error?: string }> {
  try {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return { success: false, error: "tenantId obrigatório" };
    }
    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return { success: false, error: "clienteId obrigatório" };
    }
    if (!Number.isInteger(vendedorId) || vendedorId <= 0) {
      return { success: false, error: "vendedorId obrigatório" };
    }

    const dbConn = await getDb();
    assertDbConnection(dbConn);
  
    // Validar que cliente pertence ao tenant
    const cliente = await dbConn.select().from(clientes).where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, clienteId))).limit(1);
    if (cliente.length === 0) {
      return { success: false, error: "Cliente não encontrado" };
    }
  
    await dbConn.delete(clienteVendedores)
      .where(and(eq(clienteVendedores.clienteId, clienteId), eq(clienteVendedores.vendedorId, vendedorId)));
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getVendedoresByCliente(tenantId: number, clienteId: number): Promise<{ success: boolean; data?: Array<{
  vendedor: typeof vendedores.$inferSelect;
  associacao: typeof clienteVendedores.$inferSelect;
}>; error?: string }> {
  try {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return { success: false, error: "tenantId obrigatório" };
    }
    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return { success: false, error: "clienteId obrigatório" };
    }

    const dbConn = await getDb();
    assertDbConnection(dbConn);
  
    // Validar que cliente pertence ao tenant
    const cliente = await dbConn.select().from(clientes).where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, clienteId))).limit(1);
    if (cliente.length === 0) {
      return { success: false, error: "Cliente não encontrado" };
    }
  
    const result = await dbConn.select({
      vendedor: vendedores,
      associacao: clienteVendedores,
    })
      .from(clienteVendedores)
      .innerJoin(vendedores, eq(vendedores.id, clienteVendedores.vendedorId))
      .where(eq(clienteVendedores.clienteId, clienteId))
      .orderBy(desc(clienteVendedores.tipo), asc(vendedores.nome));
    
    return { success: true, data: ensureArray(result as Array<{
      vendedor: typeof vendedores.$inferSelect;
      associacao: typeof clienteVendedores.$inferSelect;
    }>) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getClienteByTelefone(tenantId: number, actor: ServiceActor, telefone: string): Promise<{ success: boolean; data?: Cliente; error?: string }> {
  try {
    if (!telefone?.trim()) return { success: false, error: "Telefone obrigatório" };
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return { success: false, error: "tenantId obrigatório" };
    }

    const dbConn = await getDb();
    assertDbConnection(dbConn);

    const telefoneNormalizado = normalizeTelefone(telefone);
    const base = and(eq(clientes.tenantId, tenantId), eq(clientes.telefone, telefoneNormalizado));

    if (actor.role === "admin") {
      const result = await dbConn.select().from(clientes).where(base).limit(1);
      return { success: true, data: result.length > 0 ? result[0] : undefined };
    }

    const result = await dbConn
      .select({ c: clientes })
      .from(clientes)
      .innerJoin(clienteVendedores, eq(clientes.id, clienteVendedores.clienteId))
      .where(and(base, actor.vendedorId ? eq(clienteVendedores.vendedorId, actor.vendedorId) : sql`false`))
      .limit(1);
    
    return { success: true, data: result.length > 0 ? result[0].c : undefined };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function searchClientesByNome(
  tenantId: number,
  actor: ServiceActor,
  nome: string,
  limite: number = 10
): Promise<{ success: boolean; data?: Cliente[]; error?: string }> {
  try {
    if (!nome?.trim()) return { success: false, error: "Nome obrigatório" };
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return { success: false, error: "tenantId obrigatório" };
    }

    const dbConn = await getDb();
    assertDbConnection(dbConn);

    const searchTerm = `%${nome.trim()}%`;
    const nameCond = like(clientes.nome, searchTerm);
    const tenantCond = eq(clientes.tenantId, tenantId);

    if (actor.role === "admin") {
      return { success: true, data: ensureArray(
        await dbConn
          .select()
          .from(clientes)
          .where(and(tenantCond, nameCond))
          .orderBy(asc(clientes.nome))
          .limit(limite)
      ) as Cliente[] };
    }

    const rows = await dbConn
      .select({ c: clientes })
      .from(clientes)
      .innerJoin(clienteVendedores, eq(clientes.id, clienteVendedores.clienteId))
      .where(and(tenantCond, nameCond, actor.vendedorId ? eq(clienteVendedores.vendedorId, actor.vendedorId) : sql`false`))
      .orderBy(asc(clientes.nome))
      .limit(limite);
    
    return { success: true, data: rows.map((r) => r.c) as Cliente[] };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getReportClientesAtivos(tenantId: number, params: {
  dataInicio: Date;
  dataFim: Date;
  limit: number;
}): Promise<{ success: boolean; data?: Array<{
  clienteNome: string;
  quantidadePedidos: number;
}>; error?: string }> {
  try {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return { success: false, error: "tenantId obrigatório" };
    }

    const db = await getDb();
    if (!db) return { success: false, error: "Database not available" };
  
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
    
      return { success: true, data: ensureArray(result as Array<{
        clienteNome: string;
        quantidadePedidos: number;
      }>) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
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
): Promise<{ success: boolean; data?: LeoClientePedidoMetrics[]; error?: string }> {
  try {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return { success: false, error: "tenantId obrigatório" };
    }

    const dbConn = await getDb();
    assertDbConnection(dbConn);

    if (actor.role === "vendedor") {
      if (!actor.vendedorId) {
        return { success: false, error: "Vendedor ID obrigatório" };
      }
      
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
      
      return { success: true, data: rows.map((r) => ({
        id: r.id,
        nome: r.nome,
        createdAt: r.createdAt,
        totalPedidos: Number(r.totalPedidos ?? 0),
        totalGasto: Number(r.totalGasto ?? 0),
        avgTicket: Number(r.avgTicket ?? 0),
      })) };
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
    
    return { success: true, data: rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      createdAt: r.createdAt,
      totalPedidos: Number(r.totalPedidos ?? 0),
      totalGasto: Number(r.totalGasto ?? 0),
      avgTicket: Number(r.avgTicket ?? 0),
    })) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
