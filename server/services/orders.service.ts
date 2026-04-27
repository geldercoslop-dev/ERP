import { eq, and, desc, asc, sql, inArray, ne, gte, lt, SQL } from "drizzle-orm";
import { clientes, vendedores } from "../../drizzle/schema.js";
import { getDb, pedidos, itensPedido, contasReceber, produtos, insertAuditLog, clienteVendedores, counters, idempotencyKeys, pendencias, getInsertId } from "../db/index.js";
import { roundToTwo } from "../utils/financialUtils.js";
import type { Pedido, ItemPedido, Produto } from "../db/index.js";
import type { InsertPedido, InsertItemPedido } from "../db/index.js";
import { nanoid } from "nanoid";
import { auditLog } from "../_core/audit-log.js";
import { createHash } from 'crypto';
import { ensureArray, ensureObject } from "../_core/service-response.js";
import type { ServiceActor } from "../_core/service-actor.js";
import { assertVendedorActor } from "../_core/service-actor.js";
import { assertTenantId, assertDbConnection } from "../_core/errors/assertions.js";
import { ValidationError, InfrastructureError } from "../_core/errors/typed-errors.js";

// Type REAL da transaction Drizzle
import type { Database } from '../db/core.js';
type DbTx = Parameters<Parameters<Database['transaction']>[0]>[0];
type DbConn = Database;
import {
  ContaReceberStatus,
  PedidoStatus,
  PedidoStatusValues,
  PendenciaStatus,
  type PedidoStatusValue,
} from "../shared/domain-status.js";
import { validateStatus } from "../shared/guards/domain-guard.js";

// Types
export type CreatePedidoInput = InsertPedido;
export type CreateItemPedidoInput = InsertItemPedido;
export type UpdatePedidoInput = Partial<InsertPedido>;

/** Erro de domínio para mapear a NOT_FOUND / FORBIDDEN no tRPC. */
export class PedidoAccessError extends Error {
  readonly code: "NOT_FOUND" | "FORBIDDEN";
  constructor(code: "NOT_FOUND" | "FORBIDDEN", message: string) {
    super(message);
    this.name = "PedidoAccessError";
    this.code = code;
  }
}

function isServiceActorForPedidoAccess(actor?: CreatePedidoActorArg): actor is ServiceActor {
  return (
    actor != null &&
    typeof actor === "object" &&
    "role" in actor &&
    (actor.role === "admin" || actor.role === "vendedor")
  );
}

async function loadClienteRowTenant(
  tenantId: number,
  clienteId: number
): Promise<typeof clientes.$inferSelect | null> {
  const dbConn = await getDb();
  assertDbConnection(dbConn);
  const rows = await dbConn
    .select()
    .from(clientes)
    .where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, clienteId)))
    .limit(1);
  return rows.length > 0 ? ensureObject(rows[0]) : null;
}

/**
 * Cliente existe no tenant e o ator pode usá-lo em pedido (admin ou via clienteVendedores).
 */
export async function getClienteRowForPedidoCreate(
  tenantId: number,
  actor: ServiceActor,
  clienteId: number
): Promise<typeof clientes.$inferSelect> {
  const dbConn = await getDb();
  assertDbConnection(dbConn);
  const rows = await dbConn
    .select()
    .from(clientes)
    .where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, clienteId)))
    .limit(1);
  if (rows.length === 0) throw new PedidoAccessError("NOT_FOUND", "Cliente não encontrado.");
  const row = ensureObject(rows[0]);
  if (actor.role === "admin") return row;
  assertVendedorActor(actor);
  
  // Validar acesso via clienteVendedores
  const vendedorAccess = await dbConn
    .select()
    .from(clienteVendedores)
    .where(and(
      eq(clienteVendedores.tenantId, tenantId),
      eq(clienteVendedores.clienteId, clienteId),
      eq(clienteVendedores.vendedorId, actor.vendedorId)
    ))
    .limit(1);
  
  if (vendedorAccess.length === 0) {
    throw new PedidoAccessError("FORBIDDEN", "Acesso negado ao cliente.");
  }
  return row;
}

export async function assertPedidoMutableByActor(
  tenantId: number,
  actor: ServiceActor,
  pedidoId: number
): Promise<void> {
  const p = await getPedidoById(tenantId, pedidoId);
  if (!p) throw new PedidoAccessError("NOT_FOUND", "Pedido não encontrado.");
  await getClienteRowForPedidoCreate(tenantId, actor, p.clienteId);
}

function assertRequiredId(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`${fieldName} obrigatório`);
  }
}

function assertRequiredObject<T>(value: T | null | undefined, message: string): T {
  if (value == null) {
    throw new ValidationError(message);
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
  assertDbConnection(dbConn);
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
  assertDbConnection(dbConn);

  const result = await dbConn.select().from(produtos).where(and(eq(produtos.tenantId, tenantId), eq(produtos.id, id))).limit(1);
  return result.length > 0 ? result[0] : null;
};

/**
 * Cria um pedido com validação atômica de estoque (SELECT ... FOR UPDATE)
 */
export interface CreatePedidoSafeInput {
  vendedorId: number;
  /** ID do registro em `clientes`. Informe `clienteId` ou `clientId`. */
  clienteId?: number;
  /** Alias de `clienteId` (mesmo significado). */
  clientId?: number;
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
    throw new ValidationError("vendedor do pedido (admin): informe trustedVendedorId da sessão; input.vendedorId não é aceito");
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
    throw new ValidationError("Pedido deve ter pelo menos um item");
  }
  const effectiveClienteId =
    (input.clienteId != null && Number(input.clienteId) > 0 ? Number(input.clienteId) : undefined) ??
    (input.clientId != null && Number(input.clientId) > 0 ? Number(input.clientId) : undefined);
  const clienteIdPedido = Number(effectiveClienteId);
  assertRequiredId(clienteIdPedido, "clienteId");

  let clienteSnapshot: typeof clientes.$inferSelect | null = null;
  if (isServiceActorForPedidoAccess(actor)) {
    clienteSnapshot = await getClienteRowForPedidoCreate(tenantId, actor, clienteIdPedido);
  } else {
    clienteSnapshot = await loadClienteRowTenant(tenantId, clienteIdPedido);
  }
  if (!clienteSnapshot) {
    throw new ValidationError("Cliente não encontrado");
  }

  const vendedorIdResolved = resolveVendedorIdForCreate(input, actor, trustedVendedorId);
  assertRequiredId(vendedorIdResolved, "vendedorId");

  const dbConn = await getDb();
  assertDbConnection(dbConn);

  // 1️⃣ IDEMPOTÊNCIA: Gerar e inserir chave ANTES da transação
  const idempotencyKey = generatePedidoIdempotencyKey(
    tenantId,
    vendedorIdResolved,
    clienteIdPedido,
    input.itens
  );

  try {
    await dbConn.insert(idempotencyKeys).values({
      tenantId,
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

  const trxResult = await dbConn.transaction(async (tx: DbTx) => {
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
      throw new InfrastructureError('Falha na geração de número de pedido');
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
        throw new ValidationError("Item do pedido inválido");
      }
      if (!i.tipo) {
        throw new ValidationError("Tipo do item obrigatório");
      }
      if (!Number.isFinite(Number(i.quantidade)) || Number(i.quantidade) <= 0) {
        throw new ValidationError("Quantidade do item inválida");
      }
      if (!Number.isFinite(Number(i.valorUnitario ?? 0))) {
        throw new ValidationError("Valor unitário do item inválido");
      }
      if (!Number.isFinite(Number(i.custo ?? 0))) {
        throw new ValidationError("Custo do item inválido");
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
      clienteId: clienteIdPedido,
      clienteNome: input.cliente?.nome?.trim() || input.clienteNome?.trim() || clienteSnapshot.nome,
      clienteTelefone: input.cliente?.telefone ?? input.clienteTelefone ?? clienteSnapshot.telefone ?? null,
      clienteTelefoneRecado: input.cliente?.telefoneRecado ?? input.clienteTelefoneRecado ?? clienteSnapshot.telefoneRecado ?? null,
      clienteRua: input.cliente?.rua ?? input.clienteRua ?? clienteSnapshot.rua ?? null,
      clienteNumero: input.cliente?.numero ?? input.clienteNumero ?? clienteSnapshot.numero ?? null,
      clienteBairro: input.cliente?.bairro ?? input.clienteBairro ?? clienteSnapshot.bairro ?? null,
      clienteCidade: input.cliente?.cidade ?? input.clienteCidade ?? clienteSnapshot.cidade ?? null,
      clienteUf: input.cliente?.uf ?? input.clienteUf ?? clienteSnapshot.uf ?? null,
      clienteReferencia: input.cliente?.referencia ?? input.clienteReferencia ?? clienteSnapshot.referencia ?? null,
      clienteCondominio: input.cliente?.condominio ?? input.clienteCondominio ?? clienteSnapshot.condominio ?? null,
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

    const pedidoId = getInsertId(pedidoInsert);
    if (!pedidoId) throw new InfrastructureError('Falha ao criar pedido');

    // Criar conta provisória no Contas a Receber (30 dias)
    const venc = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await tx.insert(contasReceber).values({
      tenantId,
      pedidoNumero: numero,
      clienteNome: input.cliente?.nome?.trim() || input.clienteNome?.trim() || clienteSnapshot.nome,
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
          await tx.update(produtos).set({ estoque: novoEstoque }).where(and(eq(produtos.tenantId, tenantId), eq(produtos.id, i.produtoId)));
          
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
    void import("../_core/cache-invalidation.js")
      .then((m) => m.invalidateInventoryCachesForTenant(tenantId))
      .catch(() => {});
  }
  return trxResult;
}

export async function getPedidoById(tenantId: number, id: number): Promise<Pedido | null> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredId(id, "pedidoId");
  const dbConn = await getDb();
  assertDbConnection(dbConn);
  const result = await dbConn.select().from(pedidos).where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.id, id))).limit(1);
  // Se encontrou um resultado, retorna o objeto garantido, caso contrário retorna null
  return result.length > 0 ? ensureObject(result[0]) : null;
}

async function pedidoAcessivelViaCliente(
  tenantId: number,
  actor: ServiceActor,
  clienteId: number
): Promise<boolean> {
  if (actor.role === "admin") return true;
  assertVendedorActor(actor);
  if (actor.userId == null || actor.userId <= 0) return false;
  const dbConn = await getDb();
  assertDbConnection(dbConn);
  const rows = await dbConn
    .select({ id: clientes.id })
    .from(clientes)
    .where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, clienteId)))
    .limit(1);
  const row = rows[0];
  
  if (!row) return false;
  
  // Validar via clienteVendedores
  const vendedorAccess = await dbConn
    .select()
    .from(clienteVendedores)
    .where(and(
      eq(clienteVendedores.tenantId, tenantId),
      eq(clienteVendedores.clienteId, clienteId),
      eq(clienteVendedores.vendedorId, actor.vendedorId)
    ))
    .limit(1);
    
  return vendedorAccess.length > 0;
}

/** Leitura com escopo: vendedor só vê pedido cujo cliente está vinculado via clienteVendedores. */
export async function getPedidoByIdForActor(tenantId: number, actor: ServiceActor, id: number): Promise<Pedido | null> {
  const p = await getPedidoById(tenantId, id);
  if (!p) return null;
  if (actor.role === "admin") return p;
  assertVendedorActor(actor);
  return (await pedidoAcessivelViaCliente(tenantId, actor, p.clienteId)) ? p : null;
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
  assertDbConnection(dbConn);
  const result = await dbConn
    .select()
    .from(pedidos)
    .where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.numero, numero)))
    .limit(1);
  const p = result.length > 0 ? ensureObject(result[0]) : null;
  if (!p) return null;
  if (actor.role === "admin") return p;
  assertVendedorActor(actor);
  return (await pedidoAcessivelViaCliente(tenantId, actor, p.clienteId)) ? p : null;
}

export async function getItensPedido(tenantId: number, pedidoId: number): Promise<ItemPedido[]> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredId(pedidoId, "pedidoId");
  const dbConn = await getDb();
  assertDbConnection(dbConn);
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
  /** Alias de `clienteId` em listagens. */
  clientId?: number;
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
  assertDbConnection(dbConn);

  const safeParams = params ?? {};
  const { page = 1, pageSize = 50, status, busca, vendedorId, clienteId, clientId, dataInicio, dataFim } = safeParams;
  const filterClienteId = clienteId ?? clientId;
  const offset = (page - 1) * pageSize;

  const conditions = [eq(pedidos.tenantId, tenantId)];
  if (status && status !== "TODOS") {
    conditions.push(eq(pedidos.status, validateStatus(status, PedidoStatusValues, "listPedidos.status")));
  }

  if (actor.role === "vendedor") {
    assertVendedorActor(actor);
    if (actor.userId == null || actor.userId <= 0) {
      throw new ValidationError("userId do ator obrigatório para listar pedidos");
    }
    conditions.push(
      sql`exists (select 1 from clientes c where c.id = ${pedidos.clienteId} and c.user_id = ${actor.userId})`
    );
  } else if (vendedorId != null && Number.isInteger(vendedorId) && vendedorId > 0) {
    conditions.push(eq(pedidos.vendedorId, vendedorId));
  }

  if (filterClienteId) conditions.push(eq(pedidos.clienteId, filterClienteId));
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

export type ListPedidosTrpcFilters = {
  status?: (typeof PedidoStatusValues)[number] | "TODOS";
  busca?: string;
  clienteId?: number;
  clientId?: number;
  dataInicio?: Date;
  dataFim?: Date;
  page?: number;
  pageSize?: number;
};

/**
 * Listagem paginada com join em cliente/vendedor — uso exclusivo do router tRPC (sem SQL no router).
 */
export async function listPedidosTrpcPage(
  tenantId: number,
  actor: ServiceActor,
  input: ListPedidosTrpcFilters | undefined
): Promise<{
  items: Array<{
    id: number;
    numero: number;
    clienteNome: string;
    clienteCidade: string | null;
    clienteUf: string | null;
    vendedorId: number;
    vendedorNome: string | null;
    total: string;
    status: string;
    formaPagamento: string | null;
    createdAt: Date;
    dataEntrega: Date | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}> {
  assertRequiredId(tenantId, "tenantId");
  const dbConn = await getDb();
  assertDbConnection(dbConn);

  const filters = [eq(pedidos.tenantId, tenantId)];
  if (actor.role === "vendedor") {
    assertVendedorActor(actor);
    // Validar via clienteVendedores
    if (actor.vendedorId) {
      const clienteVendedorSubquery = dbConn
        .select({ clienteId: clienteVendedores.clienteId })
        .from(clienteVendedores)
        .where(and(
          eq(clienteVendedores.tenantId, tenantId),
          eq(clienteVendedores.vendedorId, actor.vendedorId)
        ));
      
      filters.push(inArray(pedidos.clienteId, clienteVendedorSubquery));
    }
  }

  const st = input?.status;
  if (st && st !== "TODOS") {
    filters.push(eq(pedidos.status, validateStatus(st, PedidoStatusValues, "listPedidosTrpc.status")));
  }

  if (input?.busca?.trim()) {
    const term = `%${input.busca.trim()}%`;
    filters.push(
      sql`(${pedidos.clienteNome} LIKE ${term} OR ${pedidos.numero} LIKE ${term})`
    );
  }

  if (input?.dataInicio) {
    filters.push(sql`${pedidos.createdAt} >= ${input.dataInicio}`);
  }
  if (input?.dataFim) {
    const end = new Date(input.dataFim);
    end.setHours(23, 59, 59, 999);
    filters.push(sql`${pedidos.createdAt} <= ${end}`);
  }

  const filtroCliente = input?.clienteId ?? input?.clientId;
  if (filtroCliente != null) {
    filters.push(eq(pedidos.clienteId, filtroCliente));
  }

  const whereSql = filters.length === 1 ? filters[0] : and(...filters);

  const sel = {
    id: pedidos.id,
    numero: pedidos.numero,
    clienteNome: pedidos.clienteNome,
    clienteCidade: pedidos.clienteCidade,
    clienteUf: pedidos.clienteUf,
    vendedorId: pedidos.vendedorId,
    vendedorNome: vendedores.nome,
    total: pedidos.total,
    status: pedidos.status,
    formaPagamento: pedidos.formaPagamento,
    createdAt: pedidos.createdAt,
    dataEntrega: pedidos.dataEntrega,
  };

  const MAX_PAGE_SIZE = 100;
  const page = input?.page ?? 1;
  const pageSize = Math.min(input?.pageSize ?? 50, MAX_PAGE_SIZE);

  const fromBase = dbConn
    .select(sel)
    .from(pedidos)
    .innerJoin(clientes, eq(pedidos.clienteId, clientes.id))
    .innerJoin(vendedores, eq(pedidos.vendedorId, vendedores.id));
  const fromOrdered = (whereSql === undefined ? fromBase : fromBase.where(whereSql)).orderBy(
    desc(pedidos.createdAt)
  );

  const countBase = dbConn
    .select({ count: sql<number>`count(*)` })
    .from(pedidos)
    .innerJoin(clientes, eq(pedidos.clienteId, clientes.id))
    .innerJoin(vendedores, eq(pedidos.vendedorId, vendedores.id));
  const countResult = await (whereSql === undefined ? countBase : countBase.where(whereSql));
  const total = Number((countResult[0] as { count?: unknown } | undefined)?.count ?? 0);
  const rows = await fromOrdered.limit(pageSize).offset((page - 1) * pageSize);
  const items = ensureArray(rows) as Array<{
    id: number;
    numero: number;
    clienteNome: string;
    clienteCidade: string | null;
    clienteUf: string | null;
    vendedorId: number;
    vendedorNome: string | null;
    total: string;
    status: string;
    formaPagamento: string | null;
    createdAt: Date;
    dataEntrega: Date | null;
  }>;

  return {
    items,
    total,
    page,
    pageSize,
    hasMore: (page - 1) * pageSize + items.length < total,
  };
}

export async function getPedidoWithItensForActor(
  tenantId: number,
  actor: ServiceActor,
  pedidoId: number
): Promise<{ pedido: Pedido; itens: ItemPedido[] } | null> {
  const pedido = await getPedidoByIdForActor(tenantId, actor, pedidoId);
  if (!pedido) return null;
  const itens = await getItensPedido(tenantId, pedido.id);
  return { pedido, itens };
}

export async function updatePedido(
  tenantId: number,
  actor: ServiceActor,
  id: number,
  data: Partial<Pedido>
): Promise<{ success: boolean }> {
  try {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredId(id, "pedidoId");
    assertRequiredObject(data, "Dados do pedido obrigatórios");
    await assertPedidoMutableByActor(tenantId, actor, id);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const pedido = await getPedidoById(tenantId, id);
    if (!pedido) throw new PedidoAccessError("NOT_FOUND", "Pedido não encontrado.");
    await dbConn.update(pedidos).set({ ...data, updatedAt: new Date() }).where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.id, id)));
    const after = await getPedidoById(tenantId, id);
    if (!after) throw new InfrastructureError("Falha ao atualizar pedido");
    return { success: true };
  } catch (error) {
    console.error("Erro ao atualizar pedido:", error);
    throw error;
  }
}

export async function deletePedido(tenantId: number, actor: ServiceActor, id: number): Promise<{ success: boolean }> {
  try {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredId(id, "pedidoId");
    await assertPedidoMutableByActor(tenantId, actor, id);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const pedido = await getPedidoById(tenantId, id);
    if (!pedido) throw new PedidoAccessError("NOT_FOUND", "Pedido não encontrado.");
    if (String(pedido.status) === PedidoStatus.ENTREGUE) {
      throw new ValidationError("Pedido ENTREGUE não pode ser excluído.");
    }
    await dbConn.delete(pedidos).where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.id, id)));
    const after = await getPedidoById(tenantId, id);
    if (after) throw new InfrastructureError("Falha ao excluir pedido");
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
  assertTenantId(tenantId);
  const dbConn = await getDb();
  assertDbConnection(dbConn);
  const pedido = await getPedidoById(tenantId, id);
  if (!pedido) throw new ValidationError("Pedido não encontrado");

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

export async function buscarPedidos(
  tenantId: number,
  actor: ServiceActor,
  query?: string
): Promise<{ pedidos: Array<{
    id: number;
    numero: number;
    clienteNome: string;
    clienteCidade: string | null;
    clienteUf: string | null;
    vendedorId: number;
    vendedorNome: string | null;
    total: string;
    status: string;
    formaPagamento: string | null;
    createdAt: Date;
    dataEntrega: Date | null;
  }>; total: number }> {
  assertRequiredId(tenantId, "tenantId");
  const dbConn = await getDb();
  assertDbConnection(dbConn);

  const conditions = [eq(pedidos.tenantId, tenantId)];

  if (actor.role === "vendedor") {
    assertVendedorActor(actor);
    const clienteVendedorSubquery = dbConn
      .select({ clienteId: clienteVendedores.clienteId })
      .from(clienteVendedores)
      .where(and(
        eq(clienteVendedores.tenantId, tenantId),
        eq(clienteVendedores.vendedorId, actor.vendedorId)
      ));
    conditions.push(inArray(pedidos.clienteId, clienteVendedorSubquery));
  }

  if (query?.trim()) {
    const term = `%${query.trim()}%`;
    conditions.push(
      sql`LOWER(${pedidos.clienteNome}) LIKE LOWER(${term}) OR ${pedidos.numero} LIKE ${term}`
    );
  }

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

  const rows = await dbConn
    .select({
      id: pedidos.id,
      numero: pedidos.numero,
      clienteNome: pedidos.clienteNome,
      clienteCidade: pedidos.clienteCidade,
      clienteUf: pedidos.clienteUf,
      vendedorId: pedidos.vendedorId,
      vendedorNome: vendedores.nome,
      total: pedidos.total,
      status: pedidos.status,
      formaPagamento: pedidos.formaPagamento,
      createdAt: pedidos.createdAt,
      dataEntrega: pedidos.dataEntrega,
    })
    .from(pedidos)
    .innerJoin(clientes, eq(pedidos.clienteId, clientes.id))
    .innerJoin(vendedores, eq(pedidos.vendedorId, vendedores.id))
    .where(whereClause)
    .orderBy(desc(pedidos.createdAt));

  return { pedidos: rows, total: rows.length };
}

export async function listPedidosConferencia(
  tenantId: number,
  actor: ServiceActor,
  input?: {
    status?: "TODOS" | "GERADO" | "CONFERIDO";
    busca?: string;
    dataInicio?: Date;
    dataFim?: Date;
    somenteNaoConferidos?: boolean;
    page?: number;
    pageSize?: number;
  }
): Promise<{
  items: Array<{
    id: number;
    numero: number;
    clienteNome: string;
    status: string;
    createdAt: Date;
    conferido: boolean;
  }>;
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}> {
  assertRequiredId(tenantId, "tenantId");
  const dbConn = await getDb();
  assertDbConnection(dbConn);

  const conditions = [eq(pedidos.tenantId, tenantId)];

  if (actor.role === "vendedor") {
    assertVendedorActor(actor);
    const clienteVendedorSubquery = dbConn
      .select({ clienteId: clienteVendedores.clienteId })
      .from(clienteVendedores)
      .where(and(
        eq(clienteVendedores.tenantId, tenantId),
        eq(clienteVendedores.vendedorId, actor.vendedorId)
      ));
    conditions.push(inArray(clientes.id, clienteVendedorSubquery));
  }

  const tab = input?.status ?? "TODOS";
  if (tab === "GERADO") {
    conditions.push(eq(pedidos.status, "GERADO"));
  } else if (tab === "CONFERIDO") {
    conditions.push(eq(pedidos.status, "CONFERIDO"));
  } else {
    conditions.push(inArray(pedidos.status, ["GERADO", "CONFERIDO"]));
  }

  if (input?.somenteNaoConferidos) {
    conditions.push(eq(pedidos.status, "GERADO"));
  }

  if (input?.busca?.trim()) {
    const term = `%${input.busca.trim()}%`;
    conditions.push(
      sql`LOWER(${pedidos.clienteNome}) LIKE LOWER(${term}) OR ${pedidos.numero} LIKE ${term}`
    );
  }

  if (input?.dataInicio) {
    conditions.push(sql`${pedidos.createdAt} >= ${input.dataInicio}`);
  }

  if (input?.dataFim) {
    const end = new Date(input.dataFim);
    end.setHours(23, 59, 59, 999);
    conditions.push(sql`${pedidos.createdAt} <= ${end}`);
  }

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

  const page = input?.page ?? 1;
  const pageSize = Math.min(input?.pageSize ?? 80, 200);

  const rows = await dbConn
    .select({
      id: pedidos.id,
      numero: pedidos.numero,
      clienteNome: pedidos.clienteNome,
      status: pedidos.status,
      createdAt: pedidos.createdAt,
    })
    .from(pedidos)
    .innerJoin(clientes, eq(pedidos.clienteId, clientes.id))
    .innerJoin(vendedores, eq(pedidos.vendedorId, vendedores.id))
    .where(whereClause)
    .orderBy(desc(pedidos.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const items = rows.map((r) => ({
    ...r,
    conferido: r.status === "CONFERIDO",
  }));

  return { items, total: items.length, page, pageSize, hasMore: false };
}

export async function marcarPedidoConferido(
  tenantId: number,
  pedidoId: number,
  tx?: DbTx
): Promise<{ success: boolean }> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredId(pedidoId, "pedidoId");
  const dbConn = tx ?? await getDb();
  assertDbConnection(dbConn);

  await dbConn.update(pedidos).set({ status: "CONFERIDO" }).where(and(eq(pedidos.id, pedidoId), eq(pedidos.tenantId, tenantId)));
  return { success: true };
}

export async function atualizarStatusPedido(
  tenantId: number,
  pedidoId: number,
  novoStatus: string,
  tx?: DbTx
): Promise<{ success: boolean }> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredId(pedidoId, "pedidoId");
  const dbConn = tx ?? await getDb();
  assertDbConnection(dbConn);

  await dbConn.update(pedidos).set({ status: novoStatus }).where(and(eq(pedidos.id, pedidoId), eq(pedidos.tenantId, tenantId)));
  return { success: true };
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
  assertDbConnection(dbConn);

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
  return ensureArray(result);
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
          sql`${pedidos.createdAt} >= ${params.dataInicio.toISOString()}`,
          sql`${pedidos.createdAt} <= ${params.dataFim.toISOString()}`,
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
  if (!db) throw new InfrastructureError('Banco de dados indisponível para relatório de produtos');
  
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
    throw new InfrastructureError('Falha ao gerar relatório de produtos mais vendidos', { cause: error });
  }
}

export async function getSumTotalPedidos(
  tenantId: number,
  opts: { vendedorId?: number; since?: Date }
): Promise<number> {
  assertRequiredId(tenantId, "tenantId");
  const dbConn = await getDb();
  assertDbConnection(dbConn);
  const conditions = [eq(pedidos.tenantId, tenantId)];
  if (opts.vendedorId != null) conditions.push(eq(pedidos.vendedorId, opts.vendedorId));
  if (opts.since) conditions.push(gte(pedidos.createdAt, opts.since));
  const [row] = await dbConn
    .select({
      sumTotal: sql<string>`COALESCE(SUM(${pedidos.total}), 0)`.as("sumTotal"),
    })
    .from(pedidos)
    .where(and(...conditions))
    .limit(1);
  if (!row) {
    throw new InfrastructureError("Não foi possível calcular o total de pedidos");
  }
  return Number(row.sumTotal);
}

export async function aggregateTicketPedidos(
  tenantId: number,
  opts: { vendedorId?: number; since?: Date }
): Promise<{ sumTotal: number; count: number }> {
  assertRequiredId(tenantId, "tenantId");
  const dbConn = await getDb();
  assertDbConnection(dbConn);
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
  assertDbConnection(dbConn);
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
  assertDbConnection(dbConn);
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
  assertDbConnection(dbConn);
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
  assertDbConnection(dbConn);
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
  assertDbConnection(dbConn);
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

/**
 * Helper function for createVenda: generates next pedido number using counter with FOR UPDATE.
 * Preserves the exact logic from the original router implementation.
 */
export async function getNextPedidoNumberInTransaction(
  tx: DbTx,
  tenantId: number
): Promise<number> {
  const readCounterForUpdate = async () => {
    const result = await tx.execute(sql`
      SELECT seq FROM counters
      WHERE tenant_id = ${tenantId} AND name = 'pedidos'
      FOR UPDATE
    `);
    const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : [];
    return rows as Array<{ seq: number | null }>;
  };

  let counterRows = await readCounterForUpdate();
  const currentSeq = Number(counterRows?.[0]?.seq ?? 0);

  let numero: number;
  if (!counterRows || counterRows.length === 0) {
    numero = 1;
    try {
      await tx.insert(counters).values({ tenantId, name: 'pedidos', seq: 1, free: null });
    } catch (e) {
      if (!isDuplicateKeyError(e)) throw e;
      // Race condition: another transaction inserted first
      counterRows = await readCounterForUpdate();
      const seq = Number(counterRows?.[0]?.seq ?? 0);
      numero = seq + 1;
      await tx.update(counters).set({ seq: numero }).where(and(eq(counters.tenantId, tenantId), eq(counters.name, 'pedidos')));
    }
  } else {
    numero = currentSeq + 1;
    await tx.update(counters).set({ seq: numero }).where(and(eq(counters.tenantId, tenantId), eq(counters.name, 'pedidos')));
  }

  return numero;
}

/**
 * Helper function for createVenda: inserts pedido in transaction.
 * Receives the fully constructed payload from the router and inserts it.
 * Returns the insert result in the same format expected by the router.
 */
export async function insertPedidoInTransaction(
  tx: DbTx,
  payload: InsertPedido
) {
  const result = await tx.insert(pedidos).values(payload);
  return result;
}

/**
 * Helper function for createVenda: processes estoque validation, pendências creation, and estoque update.
 * Matches the exact logic from the router's createVenda implementation.
 * Returns { statusPedido, gerouPendencia }
 */
export async function processEstoqueEPendenciasInTransaction(
  tx: DbTx,
  tenantId: number,
  vendedorId: number,
  pedidoId: number,
  itens: Array<Record<string, unknown>>,
  auditContext: {
    actorUserId: number | null;
    actorVendedorId: number | null;
  }
): Promise<{ statusPedido: 'GERADO' | 'PENDENTE_ESTOQUE'; gerouPendencia: boolean }> {
  const catalogIds = Array.from(
    new Set(
      itens
        .filter((x): x is Record<string, unknown> & { produtoId: number } => x.tipo === 'CATALOGO' && typeof x.produtoId === 'number')
        .map((x) => x.produtoId)
    )
  );

  const estoquePorProduto: Record<number, number> = {};
  if (catalogIds.length > 0) {
    const rows = await tx
      .select({ id: produtos.id, estoque: produtos.estoque })
      .from(produtos)
      .where(and(eq(produtos.tenantId, tenantId), inArray(produtos.id, catalogIds)))
      .for("update");
    for (const r of rows) {
      estoquePorProduto[Number(r.id)] = Number(r.estoque ?? 0);
    }
  }

  const itensComFalta: Set<number> = new Set();
  for (const i of itens) {
    if (i.tipo === 'CATALOGO' && typeof i.produtoId === 'number') {
      const estoqueAtual = estoquePorProduto[i.produtoId] ?? 0;
      const quantidade = typeof i.quantidade === 'number' ? i.quantidade : 0;
      if (estoqueAtual < quantidade) itensComFalta.add(i.produtoId);
    }
  }
  const statusPedido = itensComFalta.size > 0 ? 'PENDENTE_ESTOQUE' : 'GERADO';

  let gerouPendencia = false;
  for (const i of itens) {
    if (i.tipo === 'CATALOGO' && typeof i.produtoId === 'number') {
      const estoqueAtual = estoquePorProduto[i.produtoId] ?? 0;
      const quantidade = typeof i.quantidade === 'number' ? i.quantidade : 0;
      const falta = estoqueAtual < quantidade;

      if (statusPedido === 'PENDENTE_ESTOQUE' && falta) {
        gerouPendencia = true;
        const qtdPendente = estoqueAtual > 0 ? quantidade - estoqueAtual : quantidade;
        await tx.insert(pendencias).values({
          tenantId,
          pedidoId,
          vendedorId,
          produtoId: i.produtoId,
          corId: (typeof i.corId === 'number' ? i.corId : null),
          quantidade: qtdPendente,
          status: 'PENDENTE',
        });
      }

      if (statusPedido === 'GERADO' && !falta) {
        const novoEstoque = estoqueAtual - quantidade;
        await tx.update(produtos)
          .set({ estoque: novoEstoque })
          .where(and(eq(produtos.tenantId, tenantId), eq(produtos.id, i.produtoId)));

        await insertAuditLog({
          actorUserId: auditContext.actorUserId,
          actorVendedorId: auditContext.actorVendedorId,
          action: "SAIDA",
          entity: "estoque",
          entityId: String(i.produtoId),
          payloadJson: JSON.stringify({
            pedidoId,
            produtoId: i.produtoId,
            quantidade,
            saldoAnterior: estoqueAtual,
            saldoNovo: novoEstoque,
          }),
          traceId: nanoid(10),
        }, tx);
      }
    }
  }

  // Update pedido status based on estoque result
  await tx.update(pedidos)
    .set({ status: statusPedido })
    .where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.id, pedidoId)));

  return { statusPedido, gerouPendencia };
}

/**
 * Helper function for createVenda: extracts pedidoId from insert result.
 * This replaces direct db.getInsertId call in router.
 */
export function extractPedidoIdFromInsert(pedidoInsert: unknown): number {
  const pedidoId = getInsertId(pedidoInsert);
  if (!pedidoId) {
    throw new InfrastructureError('Falha ao obter pedidoId do insert');
  }
  return pedidoId;
}

/**
 * Helper function for createVenda: inserts itensPedido and contasReceber in transaction.
 * Receives the pedidoId and necessary data.
 */
export async function insertItensPedidoAndContasReceberInTransaction(
  tx: DbTx,
  pedidoId: number,
  tenantId: number,
  numero: number,
  vendedorId: number,
  itens: Array<{
    tipo: string;
    produtoId?: number | null;
    corId?: number | null;
    corNome?: string | null;
    descricao: string;
    marca?: string | null;
    quantidade: number;
    valorUnitario: number;
    custo: number;
    prazoGarantia?: number;
    isPremio?: boolean;
  }>,
  clienteNome: string,
  total: number
): Promise<void> {
  // Insert itensPedido
  const itensPedidoRows = itens.map((i) => ({
    tenantId,
    pedidoId,
    tipo: (i.tipo === 'CATALOGO' ? 'CATALOGO' : 'LIVRE') as 'LIVRE' | 'CATALOGO',
    produtoId: i.produtoId || null,
    corId: i.corId || null,
    corNome: i.corNome || null,
    descricao: `${i.descricao}${i.corNome ? ` ${i.corNome}` : ''}`.trim(),
    marca: i.marca || null,
    quantidade: i.quantidade,
    valorUnitario: i.isPremio ? "0" : roundToTwo(i.valorUnitario).toString(),
    custo: i.custo.toString(),
    prazoGarantia: i.prazoGarantia,
  }));
  await tx.insert(itensPedido).values(itensPedidoRows);

  // Insert contasReceber (provisório)
  const venc = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await tx.insert(contasReceber).values({
    tenantId,
    pedidoNumero: numero,
    clienteNome,
    vendedorId,
    descricao: `Fiado - Pedido #${numero}`,
    valor: roundToTwo(total).toFixed(2),
    dataVencimento: venc,
    status: 'PENDENTE',
    formaPagamento: null,
    observacoes: 'Gerada automaticamente no pedido. Será substituída/ajustada na baixa.',
  });
}
