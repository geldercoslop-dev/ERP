import { eq, and, desc, asc, sql, inArray, ne, gte, lt } from "drizzle-orm";
import { getDb, getInsertId, pedidos, itensPedido, contasReceber, produtos, insertAuditLog, pendencias, counters, idempotencyKeys } from "../db/index";
import type { Pedido, ItemPedido, Produto } from "../db/index";
import type { InsertPedido, InsertItemPedido } from "../db/index";
import { nanoid } from "nanoid";
import { auditLog } from "../_core/audit-log";
import { createHash } from 'crypto';
import { ensureArray, ensureObject } from "../_core/service-response";
import type { ServiceActor } from "../_core/service-actor";
import { assertVendedorActor } from "../_core/service-actor";
import {
  ContaReceberStatus,
  PedidoStatus,
  PedidoStatusValues,
  PendenciaStatus,
  type PedidoStatusValue,
} from "../shared/domain-status";
import { validateStatus } from "../shared/guards/domain-guard";

// Types
export type CreatePedidoInput = InsertPedido;
export type CreateItemPedidoInput = InsertItemPedido;
export type UpdatePedidoInput = Partial<InsertPedido>;

function assertRequiredId(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} obrigatório`);
  }
}

function assertRequiredObject<T>(value: T | null | undefined, message: string): T {
  if (value == null) {
    throw new Error(message);
  }

  return value;
}

/** Drizzle/MySQL2 podem envolver `ER_DUP_ENTRY` em `cause`; o `message` superficial pode ser só "Failed query: ...". */
export function isDuplicateKeyError(error: unknown): boolean {
  let e: unknown = error;
  for (let depth = 0; depth < 6 && e != null; depth++) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Duplicate")) return true;
    if (typeof e === "object" && e !== null && "code" in e) {
      const code = String((e as { code?: unknown }).code);
      if (code === "ER_DUP_ENTRY") return true;
    }
    if (e instanceof Error && "cause" in e && (e as Error & { cause?: unknown }).cause) {
      e = (e as Error & { cause?: unknown }).cause;
      continue;
    }
    break;
  }
  return false;
}

export async function countPedidosByTenant(tenantId: number): Promise<number> {
  assertRequiredId(tenantId, "tenantId");
  const dbConn = await getDb();
  if (!dbConn) return 0;
  const rows = await dbConn.select({ count: sql<number>`COUNT(*)` }).from(pedidos).where(eq(pedidos.tenantId, tenantId));
  return Number(rows[0]?.count ?? 0);
}

/**
 * Gera chave de idempotência para pedido baseado nos dados principais
 */
function generatePedidoIdempotencyKey(
  tenantId: number,
  vendedorId: number,
  clienteId: number,
  itens: Array<{ produtoId?: number; quantidade: number; valorUnitario: number | string }>
): string {
  const keyData = {
    tenantId,
    vendedorId,
    clienteId,
    itens: itens.map(i => ({
      produtoId: i.produtoId || 0,
      quantidade: i.quantidade,
      valorUnitario: Number(i.valorUnitario || 0)
    })).sort((a, b) => a.produtoId - b.produtoId)
  };
  
  const keyString = JSON.stringify(keyData);
  return createHash('sha256').update(keyString).digest('hex').substring(0, 32);
}

/**
 * Busca produto por ID (interno)
 */
export async function getProdutoById(tenantId: number, id: number) {
  const dbConn = await getDb();
  if (!dbConn) return null;

  const result = await dbConn.select().from(produtos).where(and(eq(produtos.tenantId, tenantId), eq(produtos.id, id))).limit(1);
  return result.length > 0 ? result[0] : null;
};

/**
 * Cria um pedido com validação atômica de estoque (SELECT ... FOR UPDATE)
 */
export interface CreatePedidoSafeInput {
  vendedorId: number;
  clienteId: number;
  clienteNome?: string;
  cliente?: {
    nome?: string;
    telefone?: string | null;
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
  clienteTelefone?: string | null;
  clienteTelefoneRecado?: string | null;
  clienteRua?: string | null;
  clienteNumero?: string | null;
  clienteBairro?: string | null;
  clienteCidade?: string | null;
  clienteUf?: string | null;
  clienteReferencia?: string | null;
  clienteCondominio?: string | null;
  clienteBloco?: string | null;
  clienteApartamento?: string | null;
  subtotal: number | string;
  desconto: number | string;
  frete: number | string;
  total: number | string;
  formaPagamento?: string | null;
  observacoes?: string | null;
  itens: Array<{
    tipo: string;
    produtoId?: number;
    corId?: number | null;
    corNome?: string | null;
    descricao: string;
    marca?: string | null;
    quantidade: number;
    valorUnitario: number | string;
    custo: number | string;
    prazoGarantia?: number;
    isPremio?: boolean;
  }>;
}

/** Ator em criação de pedido: papel explícito ou legado `{ userId?, vendedorId? }` do servidor. */
export type CreatePedidoActorArg =
  | (ServiceActor & { userId?: number })
  | { userId?: number; vendedorId?: number };

/**
 * Quem define o vendedor do pedido:
 * - vendedor: sempre actor.vendedorId (ignora payload).
 * - admin: somente `trustedVendedorId` (sessão/API confiável), nunca input externo/LLM.
 * - legado sem role: vendedorId do ator de servidor ou, se ausente, input (testes/scripts internos).
 */
export function resolveVendedorIdForCreate(
  input: CreatePedidoSafeInput,
  actor?: CreatePedidoActorArg,
  trustedVendedorId?: number
): number {
  if (actor && "role" in actor && actor.role === "vendedor") {
    assertVendedorActor(actor);
    return actor.vendedorId;
  }
  if (actor && "role" in actor && actor.role === "admin") {
    const tid = trustedVendedorId;
    if (tid != null && Number.isFinite(tid) && tid > 0) {
      return Math.floor(tid);
    }
    throw new Error("vendedor do pedido (admin): informe trustedVendedorId da sessão; input.vendedorId não é aceito");
  }
  const legacyVid = (actor as { vendedorId?: number } | undefined)?.vendedorId;
  if (legacyVid != null && Number(legacyVid) > 0) {
    return Number(legacyVid);
  }
  return Number(input.vendedorId);
}

export async function createPedidoSafe(
  tenantId: number,
  input: CreatePedidoSafeInput,
  actor?: CreatePedidoActorArg,
  trustedVendedorId?: number
): Promise<{ success: boolean; id: number; pedidoId: number; numero: number; status: PedidoStatusValue; traceId: string; gerouPendencia: boolean }> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredObject(input, "Input do pedido obrigatório");
  if (!Array.isArray(input.itens) || input.itens.length === 0) {
    throw new Error("Pedido deve ter pelo menos um item");
  }
  assertRequiredId(Number(input.clienteId), "clienteId");

  const vendedorIdResolved = resolveVendedorIdForCreate(input, actor, trustedVendedorId);
  assertRequiredId(vendedorIdResolved, "vendedorId");

  const dbConn = await getDb();
  if (!dbConn) throw new Error("Banco de dados indisponível");

  // 1️⃣ IDEMPOTÊNCIA: Gerar e inserir chave ANTES da transação
  const idempotencyKey = generatePedidoIdempotencyKey(
    tenantId,
    vendedorIdResolved,
    Number(input.clienteId),
    input.itens
  );

  try {
    await dbConn.insert(idempotencyKeys).values({
      key: idempotencyKey,
      commandName: 'createPedido',
      traceId: nanoid(10),
      createdAt: new Date(),
    });
  } catch (error: unknown) {
    // Se erro for de chave duplicada, aborta operação (pedido já foi processado)
    if (isDuplicateKeyError(error)) {
      return {
        success: false,
        id: 0,
        pedidoId: 0,
        numero: 0,
        status: PedidoStatus.GERADO,
        traceId: '',
        gerouPendencia: false
      };
    }
    throw error;
  }

  const trxResult = await dbConn.transaction(async (tx) => {
    try {
    const hit = await tx
      .select({ seq: counters.seq })
      .from(counters)
      .where(and(eq(counters.tenantId, tenantId), eq(counters.name, "pedidos")))
      .for("update")
      .limit(1);

    let numero: number;
    if (!hit.length) {
      numero = 1;
      await tx.insert(counters).values({
        tenantId,
        name: "pedidos",
        seq: 1,
        free: null,
      });
    } else {
      const currentSeq = Number(hit[0]?.seq ?? 0);
      numero = currentSeq + 1;
      await tx
        .update(counters)
        .set({ seq: numero, updatedAt: new Date() })
        .where(and(eq(counters.tenantId, tenantId), eq(counters.name, "pedidos")));
    }
    
    // Verificar se o número foi gerado corretamente
    if (!numero || numero <= 0) {
      throw new Error('Falha na geração de número de pedido');
    }

    // 2. Bloquear produtos para atualização (FOR UPDATE)
    const catalogIds = Array.from(
      new Set(
        input.itens
          .filter((x: { tipo: string; produtoId?: number }) => x.tipo === 'CATALOGO' && x.produtoId)
          .map((x: { produtoId?: number }) => x.produtoId)
      )
    ) as number[];
    const estoquePorProduto: Record<number, number> = {};
    
    if (catalogIds.length > 0) {
      const rows = await tx.select({ id: produtos.id, estoque: produtos.estoque })
        .from(produtos)
        .where(and(eq(produtos.tenantId, tenantId), inArray(produtos.id, catalogIds)))
        .for('update');
      
      for (const r of rows) {
        estoquePorProduto[Number(r.id)] = Number(r.estoque ?? 0);
      }
    }

    // 3. Validar estoque e definir status
    const itensComFalta: Set<number> = new Set();
    for (const i of input.itens) {
      if (!i || typeof i !== "object") {
        throw new Error("Item do pedido inválido");
      }
      if (!i.tipo) {
        throw new Error("Tipo do item obrigatório");
      }
      if (!Number.isFinite(Number(i.quantidade)) || Number(i.quantidade) <= 0) {
        throw new Error("Quantidade do item inválida");
      }
      if (!Number.isFinite(Number(i.valorUnitario ?? 0))) {
        throw new Error("Valor unitário do item inválido");
      }
      if (!Number.isFinite(Number(i.custo ?? 0))) {
        throw new Error("Custo do item inválido");
      }
      if (i.tipo === 'CATALOGO' && i.produtoId) {
        const estoqueAtual = estoquePorProduto[i.produtoId] ?? 0;
        if (estoqueAtual < i.quantidade) itensComFalta.add(i.produtoId);
      }
    }
    const statusPedido = itensComFalta.size > 0 ? PedidoStatus.PENDENTE_ESTOQUE : PedidoStatus.GERADO;

    // 4. Inserir pedido
    const pedidoInsert = await tx.insert(pedidos).values({
      tenantId,
      numero,
      vendedorId: vendedorIdResolved,
      clienteId: input.clienteId,
      clienteNome: input.cliente?.nome || '',
      clienteTelefone: input.cliente?.telefone || null,
      clienteTelefoneRecado: input.cliente?.telefoneRecado || null,
      clienteRua: input.cliente?.rua || null,
      clienteNumero: input.cliente?.numero || null,
      clienteBairro: input.cliente?.bairro || null,
      clienteCidade: input.cliente?.cidade || null,
      clienteUf: input.cliente?.uf || null,
      clienteReferencia: input.cliente?.referencia || null,
      clienteCondominio: input.cliente?.condominio || null,
      clienteBloco: input.cliente?.bloco || null,
      clienteApartamento: input.cliente?.apartamento || null,
      subtotal: input.subtotal.toString(),
      desconto: input.desconto.toString(),
      frete: input.frete.toString(),
      total: input.total.toString(),
      status: statusPedido,
      formaPagamento: input.formaPagamento,
      observacoes: input.observacoes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const pedidoId = getInsertId(pedidoInsert as unknown as Record<string, unknown>);
    if (!pedidoId) throw new Error('Falha ao criar pedido');

    // Criar conta provisória no Contas a Receber (30 dias)
    const venc = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await tx.insert(contasReceber).values({
      tenantId,
      pedidoNumero: numero,
      clienteNome: input.cliente?.nome || '',
      vendedorId: vendedorIdResolved,
      descricao: `Fiado - Pedido #${numero}`,
      valor: input.total.toString(),
      dataVencimento: venc,
      status: ContaReceberStatus.PENDENTE,
      formaPagamento: undefined,
      observacoes: 'Gerada automaticamente no pedido. Será substituída/ajustada na baixa.',
    });

    // Auditoria Logger
    auditLog({
      userId: actor?.userId || actor?.vendedorId,
      action: "create",
      module: "pedidos",
      resourceId: pedidoId,
      details: { numero, status: statusPedido }
    });

    // 5. Inserir itens e atualizar estoque/pendências
    let gerouPendencia = false;
    for (const i of input.itens) {
      await tx.insert(itensPedido).values({
        tenantId,
        pedidoId,
        tipo: (i.tipo === 'CATALOGO' ? 'CATALOGO' : 'LIVRE') as 'LIVRE' | 'CATALOGO',
        produtoId: i.produtoId || null,
        corId: i.corId || null,
        corNome: i.corNome || null,
        descricao: `${i.descricao}${i.corNome ? ` ${i.corNome}` : ''}`.trim(),
        marca: i.marca || null,
        quantidade: i.quantidade,
        valorUnitario: i.isPremio ? "0" : i.valorUnitario.toString(),
        custo: i.custo.toString(),
        prazoGarantia: i.prazoGarantia,
      });

      if (i.tipo === 'CATALOGO' && i.produtoId) {
        const estoqueAtual = estoquePorProduto[i.produtoId] ?? 0;
        const falta = estoqueAtual < i.quantidade;
        
        if (statusPedido === PedidoStatus.PENDENTE_ESTOQUE && falta) {
          gerouPendencia = true;
          const qtdPendente = estoqueAtual > 0 ? i.quantidade - estoqueAtual : i.quantidade;
          await tx.insert(pendencias).values({
            tenantId,
            pedidoId,
            vendedorId: vendedorIdResolved,
            produtoId: i.produtoId,
            corId: i.corId ?? null,
            quantidade: qtdPendente,
            status: PendenciaStatus.PENDENTE,
          });
        }
        
        if (statusPedido === PedidoStatus.GERADO && !falta) {
          const novoEstoque = estoqueAtual - i.quantidade;
          await tx.update(produtos).set({ estoque: novoEstoque }).where(eq(produtos.id, i.produtoId));
          
          await insertAuditLog({
            tenantId,
            actorUserId: actor?.userId ?? null,
            actorVendedorId: actor?.vendedorId ?? null,
            action: "SAIDA",
            entity: "estoque",
            entityId: String(i.produtoId),
            payloadJson: JSON.stringify({ pedidoId, quantidade: i.quantidade, saldoAnterior: estoqueAtual, saldoNovo: novoEstoque }),
            traceId: nanoid(10),
          }, tx);
        }
      }
    }

    const traceId = nanoid(10);
    
    // Auditoria Logger
    auditLog({
      userId: actor?.userId || actor?.vendedorId,
      action: "create",
      module: "pedidos",
      resourceId: pedidoId,
      details: { numero, status: statusPedido }
    });

    await insertAuditLog({
      tenantId,
      actorUserId: actor?.userId ?? null,
      actorVendedorId: actor?.vendedorId ?? null,
      action: "create",
      entity: "pedido",
      entityId: String(pedidoId),
      payloadJson: JSON.stringify({ numero }),
      traceId,
    }, tx);

    // Garantir que o retorno tenha id e outros campos necessários
    return {
      success: true,
      id: pedidoId,
      pedidoId,
      numero,
      status: statusPedido,
      traceId,
      gerouPendencia,
    };
      } catch (error) {
        throw error;
      }
  });
  if (
    trxResult &&
    typeof trxResult === "object" &&
    (trxResult as { success?: boolean; pedidoId?: number }).success &&
    (trxResult as { pedidoId?: number }).pedidoId
  ) {
    void import("../_core/cache-invalidation")
      .then((m) => m.invalidateInventoryCachesForTenant(tenantId))
      .catch(() => {});
  }
  return trxResult;
}

export async function getPedidoById(tenantId: number, id: number): Promise<Pedido | null> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredId(id, "pedidoId");
  const dbConn = await getDb();
  if (!dbConn) return null;
  const result = await dbConn.select().from(pedidos).where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.id, id))).limit(1);
  // Se encontrou um resultado, retorna o objeto garantido, caso contrário retorna null
  return result.length > 0 ? ensureObject(result[0]) : null;
}

/** Leitura com escopo: vendedor só vê o próprio pedido. */
export async function getPedidoByIdForActor(tenantId: number, actor: ServiceActor, id: number): Promise<Pedido | null> {
  const p = await getPedidoById(tenantId, id);
  if (!p) return null;
  if (actor.role === "admin") return p;
  assertVendedorActor(actor);
  return p.vendedorId === actor.vendedorId ? p : null;
}

/** Busca por número exibido ao usuário (não confundir com id interno). */
export async function getPedidoByNumeroForActor(
  tenantId: number,
  actor: ServiceActor,
  numero: number
): Promise<Pedido | null> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredId(numero, "numero");
  const dbConn = await getDb();
  if (!dbConn) return null;
  const result = await dbConn
    .select()
    .from(pedidos)
    .where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.numero, numero)))
    .limit(1);
  const p = result.length > 0 ? ensureObject(result[0]) : null;
  if (!p) return null;
  if (actor.role === "admin") return p;
  assertVendedorActor(actor);
  return p.vendedorId === actor.vendedorId ? p : null;
}

export async function getItensPedido(tenantId: number, pedidoId: number): Promise<ItemPedido[]> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredId(pedidoId, "pedidoId");
  const dbConn = await getDb();
  if (!dbConn) return [];
  const result = await dbConn.select().from(itensPedido).where(eq(itensPedido.pedidoId, pedidoId));
  // Garantir que o retorno seja sempre um array
  return ensureArray(result as ItemPedido[]);
}

export interface ListPedidosParams {
  page?: number;
  pageSize?: number;
  status?: string;
  busca?: string;
  vendedorId?: number;
  clienteId?: number;
  dataInicio?: Date | string;
  dataFim?: Date | string;
}

export async function listPedidosExtended(
  tenantId: number,
  actor: ServiceActor,
  params?: ListPedidosParams
): Promise<{ items: Pedido[]; total: number; page: number; pageSize: number }> {
  assertRequiredId(tenantId, "tenantId");
  const dbConn = await getDb();
  if (!dbConn) return { items: [], total: 0, page: 1, pageSize: 50 };

  const safeParams = params ?? {};
  const { page = 1, pageSize = 50, status, busca, vendedorId, clienteId, dataInicio, dataFim } = safeParams;
  const offset = (page - 1) * pageSize;

  const conditions = [eq(pedidos.tenantId, tenantId)];
  if (status && status !== "TODOS") {
    conditions.push(eq(pedidos.status, validateStatus(status, PedidoStatusValues, "listPedidos.status")));
  }

  let effectiveVendedorId: number | undefined;
  if (actor.role === "vendedor") {
    assertVendedorActor(actor);
    effectiveVendedorId = actor.vendedorId;
  } else if (vendedorId != null && Number.isInteger(vendedorId) && vendedorId > 0) {
    effectiveVendedorId = vendedorId;
  }
  if (effectiveVendedorId != null) conditions.push(eq(pedidos.vendedorId, effectiveVendedorId));

  if (clienteId) conditions.push(eq(pedidos.clienteId, clienteId));
  if (dataInicio) conditions.push(sql`${pedidos.createdAt} >= ${dataInicio}`);
  if (dataFim) conditions.push(sql`${pedidos.createdAt} <= ${dataFim}`);
  
  if (busca) {
    const term = `%${busca}%`;
    conditions.push(sql`(${pedidos.clienteNome} LIKE ${term} OR ${pedidos.numero} LIKE ${term})`);
  }

  const result = await dbConn.select().from(pedidos).where(and(...conditions)).orderBy(desc(pedidos.createdAt)).limit(pageSize).offset(offset);
  // Garantir que items seja sempre um array
  const items = ensureArray(result as Pedido[]);
  const totalRes = await dbConn.select({ count: sql`count(*)` }).from(pedidos).where(and(...conditions));
  const total = Number(totalRes[0]?.count || 0);

  return { items, total, page, pageSize };
}

/** Alias para uso em tool-registry e outros consumidores. */
export const listPedidos = listPedidosExtended;

export async function updatePedido(tenantId: number, id: number, data: Partial<Pedido>): Promise<{ success: boolean }> {
  try {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredId(id, "pedidoId");
    assertRequiredObject(data, "Dados do pedido obrigatórios");
    const dbConn = await getDb();
    if (!dbConn) throw new Error("Banco de dados indisponível");
    const pedido = await getPedidoById(tenantId, id);
    if (!pedido) throw new Error("Pedido não encontrado");
    await dbConn.update(pedidos).set({ ...data, updatedAt: new Date() }).where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.id, id)));
    const after = await getPedidoById(tenantId, id);
    if (!after) throw new Error("Falha ao atualizar pedido");
    return { success: true };
  } catch (error) {
    console.error("Erro ao atualizar pedido:", error);
    throw error;
  }
}

export async function deletePedido(tenantId: number, id: number): Promise<{ success: boolean }> {
  try {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredId(id, "pedidoId");
    const dbConn = await getDb();
    if (!dbConn) throw new Error("Banco de dados indisponível");
    const pedido = await getPedidoById(tenantId, id);
    if (!pedido) throw new Error("Pedido não encontrado");
    await dbConn.delete(pedidos).where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.id, id)));
    const after = await getPedidoById(tenantId, id);
    if (after) throw new Error("Falha ao excluir pedido");
    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir pedido:", error);
    throw error;
  }
}

/** Status de pedido (schema pedidos). */

/**
 * Atualiza o status de um pedido
 */
export async function updatePedidoStatus(tenantId: number, id: number, status: string, actor?: { userId?: number; vendedorId?: number }): Promise<void> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredId(id, "pedidoId");
  if (!status?.trim()) throw new Error("status obrigatório");
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  const pedido = await getPedidoById(tenantId, id);
  if (!pedido) throw new Error("Pedido não encontrado");

  const statusVal = validateStatus(status, PedidoStatusValues, "pedido.status");
  await dbConn.update(pedidos)
    .set({ status: statusVal, updatedAt: new Date() })
    .where(and(eq(pedidos.id, id), eq(pedidos.tenantId, tenantId)));

  // Auditoria Logger
  auditLog({
    userId: actor?.userId || actor?.vendedorId,
    action: "update",
    module: "pedidos",
    resourceId: id,
    details: { action: "update_status", status }
  });

  await insertAuditLog({
    tenantId,
    actorUserId: actor?.userId ?? null,
    actorVendedorId: actor?.vendedorId ?? null,
    action: "update_status",
    entity: "pedido",
    entityId: String(id),
    payloadJson: JSON.stringify({ status }),
    traceId: nanoid(10),
  });
}

/**
 * Busca pedidos recentes de um cliente
 */
export async function getPedidosByCliente(tenantId: number, clienteId: number): Promise<Array<{
  id: number;
  numero: number;
  total: string;
  status: string;
  createdAt: Date;
  dataEntrega: Date | null;
}>> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredId(clienteId, "clienteId");
  const dbConn = await getDb();
  if (!dbConn) return [];

  const result = await dbConn.select({
    id: pedidos.id,
    numero: pedidos.numero,
    total: pedidos.total,
    status: pedidos.status,
    createdAt: pedidos.createdAt,
    dataEntrega: pedidos.dataEntrega,
  })
  .from(pedidos)
  .where(and(eq(pedidos.clienteId, clienteId), eq(pedidos.tenantId, tenantId)))
  .orderBy(desc(pedidos.createdAt));
  
  // Garantir que o retorno seja sempre um array
  return ensureArray(result as Array<{
    id: number;
    numero: number;
    total: string;
    status: string;
    createdAt: Date;
    dataEntrega: Date | null;
  }>);
}

/**
 * Relatório de vendas por período
 */
export async function getReportVendasPeriodo(tenantId: number, params: { dataInicio: Date; dataFim: Date }): Promise<{
  totalPedidos: number;
  totalValor: string;
  itens: Array<{ data: string; quantidade: number; valor: string }>;
}> {
  assertRequiredId(tenantId, "tenantId");
  const db = await getDb();
  if (!db) return { totalPedidos: 0, totalValor: "0", itens: [] };
  
  try {
    const result = await db
      .select({
        totalPedidos: sql<number>`COUNT(*)`.as('totalPedidos'),
        totalValor: sql<string>`COALESCE(SUM(${pedidos.total}), 0)`.as('totalValor')
      })
      .from(pedidos)
      .where(
        and(
          eq(pedidos.tenantId, tenantId),
          sql`${pedidos.createdAt} >= ${params.dataInicio}`,
          sql`${pedidos.createdAt} <= ${params.dataFim}`,
          ne(pedidos.status, PedidoStatus.CANCELADO)
        )
      );
    
    const itens = await db
      .select({
        data: sql<string>`DATE(${pedidos.createdAt})`.as('data'),
        quantidade: sql<number>`COUNT(*)`.as('quantidade'),
        valor: sql<string>`COALESCE(SUM(${pedidos.total}), 0)`.as('valor')
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
      .groupBy(sql`DATE(${pedidos.createdAt})`)
      .orderBy(sql`DATE(${pedidos.createdAt})`);
    
    return {
      totalPedidos: result[0]?.totalPedidos ?? 0,
      totalValor: result[0]?.totalValor ?? "0",
      itens: itens as Array<{ data: string; quantidade: number; valor: string }> || []
    };
  } catch (error) {
    console.error('Error in getReportVendasPeriodo:', error);
    return { totalPedidos: 0, totalValor: "0", itens: [] };
  }
}

/**
 * Relatório de produtos mais vendidos
 */
export async function getReportProdutosMaisVendidos(tenantId: number, params: {
  dataInicio: Date;
  dataFim: Date;
  limit: number;
}): Promise<Array<{ descricao: string; quantidade: number; valorTotal: string }>> {
  assertRequiredId(tenantId, "tenantId");
  const db = await getDb();
  if (!db) return [];
  
  try {
    const result = await db
      .select({
        descricao: produtos.descricao,
        quantidade: sql<number>`SUM(${itensPedido.quantidade})`.as('quantidade'),
        valorTotal: sql<string>`SUM(${itensPedido.quantidade} * ${itensPedido.valorUnitario})`.as('valorTotal')
      })
      .from(itensPedido)
      .innerJoin(pedidos, eq(pedidos.id, itensPedido.pedidoId))
      .innerJoin(produtos, eq(produtos.id, itensPedido.produtoId))
      .where(
        and(
          eq(pedidos.tenantId, tenantId),
          sql`${pedidos.createdAt} >= ${params.dataInicio}`,
          sql`${pedidos.createdAt} <= ${params.dataFim}`,
          ne(pedidos.status, PedidoStatus.CANCELADO)
        )
      )
      .groupBy(produtos.id, produtos.descricao)
      .orderBy(sql`SUM(${itensPedido.quantidade}) DESC`)
      .limit(params.limit);
    
    return result as Array<{ descricao: string; quantidade: number; valorTotal: string }> || [];
  } catch (error) {
    console.error('Error in getReportProdutosMaisVendidos:', error);
    return [];
  }
}

export async function aggregateTicketPedidos(
  tenantId: number,
  opts: { vendedorId?: number; since?: Date }
): Promise<{ sumTotal: number; count: number }> {
  assertRequiredId(tenantId, "tenantId");
  const dbConn = await getDb();
  if (!dbConn) return { sumTotal: 0, count: 0 };
  const conditions = [eq(pedidos.tenantId, tenantId)];
  if (opts.vendedorId != null) conditions.push(eq(pedidos.vendedorId, opts.vendedorId));
  if (opts.since) conditions.push(gte(pedidos.createdAt, opts.since));
  const [row] = await dbConn
    .select({
      sumTotal: sql<string>`COALESCE(SUM(${pedidos.total}), 0)`.as("sumTotal"),
      count: sql<number>`COUNT(*)`.as("count"),
    })
    .from(pedidos)
    .where(and(...conditions))
    .limit(1);
  return { sumTotal: Number(row?.sumTotal ?? 0), count: Number(row?.count ?? 0) };
}

export async function sumPedidosTotalBetween(
  tenantId: number,
  startInclusive: Date,
  endExclusive: Date
): Promise<number> {
  assertRequiredId(tenantId, "tenantId");
  const dbConn = await getDb();
  if (!dbConn) return 0;
  const [row] = await dbConn
    .select({ t: sql<string>`COALESCE(SUM(${pedidos.total}), 0)`.as("t") })
    .from(pedidos)
    .where(
      and(eq(pedidos.tenantId, tenantId), gte(pedidos.createdAt, startInclusive), lt(pedidos.createdAt, endExclusive))
    )
    .limit(1);
  return Number(row?.t ?? 0);
}

export async function findPedidoGrandeRecente(
  tenantId: number,
  minTotal: number,
  since: Date
): Promise<{ numero: number; total: string } | null> {
  assertRequiredId(tenantId, "tenantId");
  const dbConn = await getDb();
  if (!dbConn) return null;
  const rows = await dbConn
    .select({ numero: pedidos.numero, total: pedidos.total })
    .from(pedidos)
    .where(
      and(
        eq(pedidos.tenantId, tenantId),
        ne(pedidos.status, PedidoStatus.CANCELADO),
        gte(pedidos.createdAt, since),
        sql`${pedidos.total} >= ${String(minTotal)}`
      )
    )
    .limit(1);
  const r = rows[0];
  return r ? { numero: r.numero, total: String(r.total) } : null;
}

export async function listNumerosPedidosEmRotaAtrasados(
  tenantId: number,
  diasMinimos: number,
  limit: number
): Promise<number[]> {
  assertRequiredId(tenantId, "tenantId");
  const dbConn = await getDb();
  if (!dbConn) return [];
  const limite = new Date();
  limite.setDate(limite.getDate() - diasMinimos);
  const rows = await dbConn
    .select({ numero: pedidos.numero })
    .from(pedidos)
    .where(
      and(eq(pedidos.tenantId, tenantId), eq(pedidos.status, "EM_ROTA"), sql`${pedidos.updatedAt} < ${limite}`)
    )
    .limit(limit);
  return rows.map((r) => r.numero);
}

export async function countPedidosParadosGeradoConferido(tenantId: number, updatedBefore: Date): Promise<number> {
  assertRequiredId(tenantId, "tenantId");
  const dbConn = await getDb();
  if (!dbConn) return 0;
  const [row] = await dbConn
    .select({ c: sql<number>`COUNT(*)`.as("c") })
    .from(pedidos)
    .where(
      and(
        eq(pedidos.tenantId, tenantId),
        inArray(pedidos.status, [PedidoStatus.GERADO, PedidoStatus.CONFERIDO]),
        sql`${pedidos.updatedAt} < ${updatedBefore}`
      )
    )
    .limit(1);
  return Number(row?.c ?? 0);
}

export type LeoLearningSalesRow = {
  day: string;
  vendedorId: number;
  count: number;
  total: number;
  avgTicket: number;
};

export async function leoAggregatePedidosByDayAndVendedor(
  tenantId: number,
  since: Date
): Promise<LeoLearningSalesRow[]> {
  assertRequiredId(tenantId, "tenantId");
  const dbConn = await getDb();
  if (!dbConn) return [];
  const rows = await dbConn
    .select({
      day: sql<string>`DATE(${pedidos.dataCriacao})`.as("day"),
      vendedorId: pedidos.vendedorId,
      count: sql<number>`COUNT(*)`.as("count"),
      total: sql<string>`COALESCE(SUM(${pedidos.total}), 0)`.as("total"),
      avgTicket: sql<string>`COALESCE(AVG(${pedidos.total}), 0)`.as("avgTicket"),
    })
    .from(pedidos)
    .where(and(eq(pedidos.tenantId, tenantId), gte(pedidos.dataCriacao, since)))
    .groupBy(sql`DATE(${pedidos.dataCriacao})`, pedidos.vendedorId)
    .orderBy(desc(sql`DATE(${pedidos.dataCriacao})`));
  return rows.map((r) => ({
    day: String(r.day ?? ""),
    vendedorId: r.vendedorId,
    count: Number(r.count ?? 0),
    total: Number(r.total ?? 0),
    avgTicket: Number(r.avgTicket ?? 0),
  }));
}
