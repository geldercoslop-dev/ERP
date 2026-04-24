import { eq, and, desc, sql, inArray, ne, gte, lt } from "drizzle-orm";
import { clientes, vendedores } from "../../drizzle/schema.js";
import { getDb, pedidos, itensPedido, contasReceber, produtos, insertAuditLog, clienteVendedores, counters, idempotencyKeys, pendencias, getInsertId } from "../db/index.js";
import { nanoid } from "nanoid";
import { auditLog } from "../_core/audit-log.js";
import { createHash } from 'crypto';
import { ensureArray, ensureObject } from "../_core/service-response.js";
import { assertVendedorActor } from "../_core/service-actor.js";
import { assertTenantId, assertDbConnection } from "../_core/errors/assertions.js";
import { ValidationError, InfrastructureError } from "../_core/errors/typed-errors.js";
import { toDbDate, toDbDateStrict } from "../utils/date.js";
import { ContaReceberStatus, PedidoStatus, PedidoStatusValues, PendenciaStatus, } from "../shared/domain-status.js";
import { validateStatus } from "../shared/guards/domain-guard.js";
/** Erro de domínio para mapear a NOT_FOUND / FORBIDDEN no tRPC. */
export class PedidoAccessError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = "PedidoAccessError";
        this.code = code;
    }
}
function isServiceActorForPedidoAccess(actor) {
    return (actor != null &&
        typeof actor === "object" &&
        "role" in actor &&
        (actor.role === "admin" || actor.role === "vendedor"));
}
async function loadClienteRowTenant(tenantId, clienteId) {
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
export async function getClienteRowForPedidoCreate(tenantId, actor, clienteId) {
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const rows = await dbConn
        .select()
        .from(clientes)
        .where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, clienteId)))
        .limit(1);
    if (rows.length === 0)
        throw new PedidoAccessError("NOT_FOUND", "Cliente não encontrado.");
    const row = ensureObject(rows[0]);
    if (actor.role === "admin")
        return row;
    assertVendedorActor(actor);
    // Validar acesso via clienteVendedores
    const vendedorAccess = await dbConn
        .select()
        .from(clienteVendedores)
        .where(and(eq(clienteVendedores.clienteId, clienteId), eq(clienteVendedores.vendedorId, actor.vendedorId)))
        .limit(1);
    if (vendedorAccess.length === 0) {
        throw new PedidoAccessError("FORBIDDEN", "Acesso negado ao cliente.");
    }
    return row;
}
export async function assertPedidoMutableByActor(tenantId, actor, pedidoId) {
    const p = await getPedidoById(tenantId, pedidoId);
    if (!p)
        throw new PedidoAccessError("NOT_FOUND", "Pedido não encontrado.");
    await getClienteRowForPedidoCreate(tenantId, actor, p.clienteId);
}
function assertRequiredId(value, fieldName) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new ValidationError(`${fieldName} obrigatório`);
    }
}
function assertRequiredObject(value, message) {
    if (value == null) {
        throw new ValidationError(message);
    }
    return value;
}
/** Drizzle/MySQL2 podem envolver `ER_DUP_ENTRY` em `cause`; o `message` superficial pode ser só "Failed query: ...". */
export function isDuplicateKeyError(error) {
    let e = error;
    for (let depth = 0; depth < 6 && e != null; depth++) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("Duplicate"))
            return true;
        if (typeof e === "object" && e !== null && "code" in e) {
            const code = String(e.code);
            if (code === "ER_DUP_ENTRY")
                return true;
        }
        if (e instanceof Error && "cause" in e && e.cause) {
            e = e.cause;
            continue;
        }
        break;
    }
    return false;
}
export async function countPedidosByTenant(tenantId) {
    assertRequiredId(tenantId, "tenantId");
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const rows = await dbConn.select({ count: sql `COUNT(*)` }).from(pedidos).where(eq(pedidos.tenantId, tenantId));
    return Number(rows[0]?.count ?? 0);
}
/**
 * Gera chave de idempotência para pedido baseado nos dados principais
 */
function generatePedidoIdempotencyKey(tenantId, vendedorId, clienteId, itens) {
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
export async function getProdutoById(tenantId, id) {
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const result = await dbConn.select().from(produtos).where(and(eq(produtos.tenantId, tenantId), eq(produtos.id, id))).limit(1);
    return result.length > 0 ? result[0] : null;
}
;
/**
 * Quem define o vendedor do pedido:
 * - vendedor: sempre actor.vendedorId (ignora payload).
 * - admin: somente `trustedVendedorId` (sessão/API confiável), nunca input externo/LLM.
 * - legado sem role: vendedorId do ator de servidor ou, se ausente, input (testes/scripts internos).
 */
export function resolveVendedorIdForCreate(input, actor, trustedVendedorId) {
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
    const legacyVid = actor?.vendedorId;
    if (legacyVid != null && Number(legacyVid) > 0) {
        return Number(legacyVid);
    }
    return Number(input.vendedorId);
}
export async function createPedidoSafe(tenantId, input, actor, trustedVendedorId) {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredObject(input, "Input do pedido obrigatório");
    if (!Array.isArray(input.itens) || input.itens.length === 0) {
        throw new ValidationError("Pedido deve ter pelo menos um item");
    }
    const effectiveClienteId = (input.clienteId != null && Number(input.clienteId) > 0 ? Number(input.clienteId) : undefined) ??
        (input.clientId != null && Number(input.clientId) > 0 ? Number(input.clientId) : undefined);
    const clienteIdPedido = Number(effectiveClienteId);
    assertRequiredId(clienteIdPedido, "clienteId");
    let clienteSnapshot = null;
    if (isServiceActorForPedidoAccess(actor)) {
        clienteSnapshot = await getClienteRowForPedidoCreate(tenantId, actor, clienteIdPedido);
    }
    else {
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
    const idempotencyKey = generatePedidoIdempotencyKey(tenantId, vendedorIdResolved, clienteIdPedido, input.itens);
    try {
        await dbConn.insert(idempotencyKeys).values({
            tenantId,
            key: idempotencyKey,
            commandName: 'createPedido',
            traceId: nanoid(10),
            createdAt: toDbDate(new Date()),
        });
    }
    catch (error) {
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
            let numero;
            if (!hit.length) {
                numero = 1;
                await tx.insert(counters).values({
                    tenantId,
                    name: "pedidos",
                    seq: 1,
                    free: null,
                });
            }
            else {
                const currentSeq = Number(hit[0]?.seq ?? 0);
                numero = currentSeq + 1;
                await tx
                    .update(counters)
                    .set({ seq: numero, updatedAt: toDbDate(new Date()) })
                    .where(and(eq(counters.tenantId, tenantId), eq(counters.name, "pedidos")));
            }
            // Verificar se o número foi gerado corretamente
            if (!numero || numero <= 0) {
                throw new InfrastructureError('Falha na geração de número de pedido');
            }
            // 2. Bloquear produtos para atualização (FOR UPDATE)
            const catalogIds = Array.from(new Set(input.itens
                .filter((x) => x.tipo === 'CATALOGO' && x.produtoId)
                .map((x) => x.produtoId)));
            const estoquePorProduto = {};
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
            const itensComFalta = new Set();
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
                    if (estoqueAtual < i.quantidade)
                        itensComFalta.add(i.produtoId);
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
                clienteBloco: input.cliente?.bloco ?? input.clienteBloco ?? clienteSnapshot.bloco ?? null,
                clienteApartamento: input.cliente?.apartamento ?? input.clienteApartamento ?? clienteSnapshot.apartamento ?? null,
                subtotal: input.subtotal.toString(),
                desconto: input.desconto.toString(),
                frete: input.frete.toString(),
                total: input.total.toString(),
                status: statusPedido,
                formaPagamento: input.formaPagamento,
                observacoes: input.observacoes || null,
                createdAt: toDbDate(new Date()),
                updatedAt: toDbDate(new Date()),
            });
            const pedidoId = getInsertId(pedidoInsert);
            if (!pedidoId)
                throw new InfrastructureError('Falha ao criar pedido');
            // Criar conta provisória no Contas a Receber (30 dias)
            const venc = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            await tx.insert(contasReceber).values({
                tenantId,
                pedidoNumero: numero,
                clienteNome: input.cliente?.nome?.trim() || input.clienteNome?.trim() || clienteSnapshot.nome,
                vendedorId: vendedorIdResolved,
                descricao: `Fiado - Pedido #${numero}`,
                valor: input.total.toString(),
                dataVencimento: toDbDateStrict(venc),
                status: ContaReceberStatus.PENDENTE,
                formaPagamento: null,
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
                    tipo: (i.tipo === 'CATALOGO' ? 'CATALOGO' : 'LIVRE'),
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
        }
        catch (error) {
            throw error;
        }
    });
    if (trxResult &&
        typeof trxResult === "object" &&
        trxResult.success &&
        trxResult.pedidoId) {
        void import("../_core/cache-invalidation.js")
            .then((m) => m.invalidateInventoryCachesForTenant(tenantId))
            .catch(() => { });
    }
    return trxResult;
}
export async function getPedidoById(tenantId, id) {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredId(id, "pedidoId");
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const result = await dbConn.select().from(pedidos).where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.id, id))).limit(1);
    // Se encontrou um resultado, retorna o objeto garantido, caso contrário retorna null
    return result.length > 0 ? ensureObject(result[0]) : null;
}
async function pedidoAcessivelViaCliente(tenantId, actor, clienteId) {
    if (actor.role === "admin")
        return true;
    assertVendedorActor(actor);
    if (actor.userId == null || actor.userId <= 0)
        return false;
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const rows = await dbConn
        .select({ id: clientes.id })
        .from(clientes)
        .where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, clienteId)))
        .limit(1);
    const row = rows[0];
    if (!row)
        return false;
    // Validar via clienteVendedores
    const vendedorAccess = await dbConn
        .select()
        .from(clienteVendedores)
        .where(and(eq(clienteVendedores.clienteId, clienteId), eq(clienteVendedores.vendedorId, actor.vendedorId)))
        .limit(1);
    return vendedorAccess.length > 0;
}
/** Leitura com escopo: vendedor só vê pedido cujo cliente está vinculado via clienteVendedores. */
export async function getPedidoByIdForActor(tenantId, actor, id) {
    const p = await getPedidoById(tenantId, id);
    if (!p)
        return null;
    if (actor.role === "admin")
        return p;
    assertVendedorActor(actor);
    return (await pedidoAcessivelViaCliente(tenantId, actor, p.clienteId)) ? p : null;
}
/** Busca por número exibido ao usuário (não confundir com id interno). */
export async function getPedidoByNumeroForActor(tenantId, actor, numero) {
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
    if (!p)
        return null;
    if (actor.role === "admin")
        return p;
    assertVendedorActor(actor);
    return (await pedidoAcessivelViaCliente(tenantId, actor, p.clienteId)) ? p : null;
}
export async function getItensPedido(tenantId, pedidoId) {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredId(pedidoId, "pedidoId");
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const result = await dbConn.select().from(itensPedido).where(eq(itensPedido.pedidoId, pedidoId));
    // Garantir que o retorno seja sempre um array
    return ensureArray(result);
}
export async function listPedidosExtended(tenantId, actor, params) {
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
        conditions.push(sql `exists (select 1 from clientes c where c.id = ${pedidos.clienteId} and c.user_id = ${actor.userId})`);
    }
    else if (vendedorId != null && Number.isInteger(vendedorId) && vendedorId > 0) {
        conditions.push(eq(pedidos.vendedorId, vendedorId));
    }
    if (filterClienteId)
        conditions.push(eq(pedidos.clienteId, filterClienteId));
    if (dataInicio)
        conditions.push(sql `${pedidos.createdAt} >= ${dataInicio}`);
    if (dataFim)
        conditions.push(sql `${pedidos.createdAt} <= ${dataFim}`);
    if (busca) {
        const term = `%${busca}%`;
        conditions.push(sql `(${pedidos.clienteNome} LIKE ${term} OR ${pedidos.numero} LIKE ${term})`);
    }
    const result = await dbConn.select().from(pedidos).where(and(...conditions)).orderBy(desc(pedidos.createdAt)).limit(pageSize).offset(offset);
    // Garantir que items seja sempre um array
    const items = ensureArray(result);
    const totalRes = await dbConn.select({ count: sql `count(*)` }).from(pedidos).where(and(...conditions));
    const total = Number(totalRes[0]?.count || 0);
    return { items, total, page, pageSize };
}
/** Alias para uso em tool-registry e outros consumidores. */
export const listPedidos = listPedidosExtended;
/**
 * Listagem paginada com join em cliente/vendedor — uso exclusivo do router tRPC (sem SQL no router).
 */
export async function listPedidosTrpcPage(tenantId, actor, input) {
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
                .where(and(eq(clienteVendedores.vendedorId, actor.vendedorId)));
            filters.push(inArray(pedidos.clienteId, clienteVendedorSubquery));
        }
    }
    const st = input?.status;
    if (st && st !== "TODOS") {
        filters.push(eq(pedidos.status, validateStatus(st, PedidoStatusValues, "listPedidosTrpc.status")));
    }
    if (input?.busca?.trim()) {
        const term = `%${input.busca.trim()}%`;
        filters.push(sql `(${pedidos.clienteNome} LIKE ${term} OR ${pedidos.numero} LIKE ${term})`);
    }
    if (input?.dataInicio) {
        filters.push(sql `${pedidos.createdAt} >= ${input.dataInicio}`);
    }
    if (input?.dataFim) {
        const end = new Date(input.dataFim);
        end.setHours(23, 59, 59, 999);
        filters.push(sql `${pedidos.createdAt} <= ${end}`);
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
    const fromOrdered = (whereSql === undefined ? fromBase : fromBase.where(whereSql)).orderBy(desc(pedidos.createdAt));
    const countBase = dbConn
        .select({ count: sql `count(*)` })
        .from(pedidos)
        .innerJoin(clientes, eq(pedidos.clienteId, clientes.id))
        .innerJoin(vendedores, eq(pedidos.vendedorId, vendedores.id));
    const countResult = await (whereSql === undefined ? countBase : countBase.where(whereSql));
    const total = Number(countResult[0]?.count ?? 0);
    const rows = await fromOrdered.limit(pageSize).offset((page - 1) * pageSize);
    const items = ensureArray(rows).map(r => ({
        ...r,
        createdAt: new Date(r.createdAt),
        dataEntrega: r.dataEntrega ? new Date(r.dataEntrega) : null,
    }));
    return {
        items,
        total,
        page,
        pageSize,
        hasMore: (page - 1) * pageSize + items.length < total,
    };
}
export async function getPedidoWithItensForActor(tenantId, actor, pedidoId) {
    const pedido = await getPedidoByIdForActor(tenantId, actor, pedidoId);
    if (!pedido)
        return null;
    const itens = await getItensPedido(tenantId, pedido.id);
    return { pedido, itens };
}
export async function updatePedido(tenantId, actor, id, data) {
    try {
        assertRequiredId(tenantId, "tenantId");
        assertRequiredId(id, "pedidoId");
        assertRequiredObject(data, "Dados do pedido obrigatórios");
        await assertPedidoMutableByActor(tenantId, actor, id);
        const dbConn = await getDb();
        assertDbConnection(dbConn);
        const pedido = await getPedidoById(tenantId, id);
        if (!pedido)
            throw new PedidoAccessError("NOT_FOUND", "Pedido não encontrado.");
        await dbConn.update(pedidos).set({ ...data, updatedAt: toDbDate(new Date()) }).where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.id, id)));
        const after = await getPedidoById(tenantId, id);
        if (!after)
            throw new InfrastructureError("Falha ao atualizar pedido");
        return { success: true };
    }
    catch (error) {
        console.error("Erro ao atualizar pedido:", error);
        throw error;
    }
}
export async function deletePedido(tenantId, actor, id) {
    try {
        assertRequiredId(tenantId, "tenantId");
        assertRequiredId(id, "pedidoId");
        await assertPedidoMutableByActor(tenantId, actor, id);
        const dbConn = await getDb();
        assertDbConnection(dbConn);
        const pedido = await getPedidoById(tenantId, id);
        if (!pedido)
            throw new PedidoAccessError("NOT_FOUND", "Pedido não encontrado.");
        if (String(pedido.status) === PedidoStatus.ENTREGUE) {
            throw new ValidationError("Pedido ENTREGUE não pode ser excluído.");
        }
        await dbConn.delete(pedidos).where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.id, id)));
        const after = await getPedidoById(tenantId, id);
        if (after)
            throw new InfrastructureError("Falha ao excluir pedido");
        return { success: true };
    }
    catch (error) {
        console.error("Erro ao excluir pedido:", error);
        throw error;
    }
}
/** Status de pedido (schema pedidos). */
/**
 * Atualiza o status de um pedido
 */
export async function updatePedidoStatus(tenantId, id, status, actor) {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredId(id, "pedidoId");
    assertTenantId(tenantId);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const pedido = await getPedidoById(tenantId, id);
    if (!pedido)
        throw new ValidationError("Pedido não encontrado");
    const statusVal = validateStatus(status, PedidoStatusValues, "pedido.status");
    await dbConn.update(pedidos)
        .set({ status: statusVal, updatedAt: toDbDate(new Date()) })
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
export async function getPedidosByCliente(tenantId, clienteId) {
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
    return ensureArray(result.map(r => ({
        ...r,
        createdAt: new Date(r.createdAt),
        dataEntrega: r.dataEntrega ? new Date(r.dataEntrega) : null,
    })));
}
/**
 * Relatório de vendas por período
 */
export async function getReportVendasPeriodo(tenantId, params) {
    assertRequiredId(tenantId, "tenantId");
    const db = await getDb();
    if (!db)
        return { totalPedidos: 0, totalValor: "0", itens: [] };
    try {
        const result = await db
            .select({
            totalPedidos: sql `COUNT(*)`.as('totalPedidos'),
            totalValor: sql `COALESCE(SUM(${pedidos.total}), 0)`.as('totalValor')
        })
            .from(pedidos)
            .where(and(eq(pedidos.tenantId, tenantId), sql `${pedidos.createdAt} >= ${params.dataInicio}`, sql `${pedidos.createdAt} <= ${params.dataFim}`, ne(pedidos.status, PedidoStatus.CANCELADO)));
        const itens = await db
            .select({
            data: sql `DATE(${pedidos.createdAt})`.as('data'),
            quantidade: sql `COUNT(*)`.as('quantidade'),
            valor: sql `COALESCE(SUM(${pedidos.total}), 0)`.as('valor')
        })
            .from(pedidos)
            .where(and(eq(pedidos.tenantId, tenantId), sql `${pedidos.createdAt} >= ${params.dataInicio}`, sql `${pedidos.createdAt} <= ${params.dataFim}`, ne(pedidos.status, PedidoStatus.CANCELADO)))
            .groupBy(sql `DATE(${pedidos.createdAt})`)
            .orderBy(sql `DATE(${pedidos.createdAt})`);
        return {
            totalPedidos: result[0]?.totalPedidos ?? 0,
            totalValor: result[0]?.totalValor ?? "0",
            itens: itens || []
        };
    }
    catch (error) {
        console.error('Error in getReportVendasPeriodo:', error);
        return { totalPedidos: 0, totalValor: "0", itens: [] };
    }
}
/**
 * Relatório de produtos mais vendidos
 */
export async function getReportProdutosMaisVendidos(tenantId, params) {
    assertRequiredId(tenantId, "tenantId");
    const db = await getDb();
    if (!db)
        throw new InfrastructureError('Banco de dados indisponível para relatório de produtos');
    try {
        const result = await db
            .select({
            descricao: produtos.descricao,
            quantidade: sql `SUM(${itensPedido.quantidade})`.as('quantidade'),
            valorTotal: sql `SUM(${itensPedido.quantidade} * ${itensPedido.valorUnitario})`.as('valorTotal')
        })
            .from(itensPedido)
            .innerJoin(pedidos, eq(pedidos.id, itensPedido.pedidoId))
            .innerJoin(produtos, eq(produtos.id, itensPedido.produtoId))
            .where(and(eq(pedidos.tenantId, tenantId), sql `${pedidos.createdAt} >= ${params.dataInicio}`, sql `${pedidos.createdAt} <= ${params.dataFim}`, ne(pedidos.status, PedidoStatus.CANCELADO)))
            .groupBy(produtos.id, produtos.descricao)
            .orderBy(sql `SUM(${itensPedido.quantidade}) DESC`)
            .limit(params.limit);
        return result || [];
    }
    catch (error) {
        console.error('Error in getReportProdutosMaisVendidos:', error);
        throw new InfrastructureError('Falha ao gerar relatório de produtos mais vendidos', { cause: error });
    }
}
export async function getSumTotalPedidos(tenantId, opts) {
    assertRequiredId(tenantId, "tenantId");
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const conditions = [eq(pedidos.tenantId, tenantId)];
    if (opts.vendedorId != null)
        conditions.push(eq(pedidos.vendedorId, opts.vendedorId));
    if (opts.since)
        conditions.push(gte(pedidos.createdAt, toDbDateStrict(opts.since)));
    const [row] = await dbConn
        .select({
        sumTotal: sql `COALESCE(SUM(${pedidos.total}), 0)`.as("sumTotal"),
    })
        .from(pedidos)
        .where(and(...conditions))
        .limit(1);
    if (!row) {
        throw new InfrastructureError("Não foi possível calcular o total de pedidos");
    }
    return Number(row.sumTotal);
}
export async function aggregateTicketPedidos(tenantId, opts) {
    assertRequiredId(tenantId, "tenantId");
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const conditions = [eq(pedidos.tenantId, tenantId)];
    if (opts.vendedorId != null)
        conditions.push(eq(pedidos.vendedorId, opts.vendedorId));
    if (opts.since)
        conditions.push(gte(pedidos.createdAt, toDbDateStrict(opts.since)));
    const [row] = await dbConn
        .select({
        sumTotal: sql `COALESCE(SUM(${pedidos.total}), 0)`.as("sumTotal"),
        count: sql `COUNT(*)`.as("count"),
    })
        .from(pedidos)
        .where(and(...conditions))
        .limit(1);
    return { sumTotal: Number(row?.sumTotal ?? 0), count: Number(row?.count ?? 0) };
}
export async function sumPedidosTotalBetween(tenantId, startInclusive, endExclusive) {
    assertRequiredId(tenantId, "tenantId");
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const [row] = await dbConn
        .select({ t: sql `COALESCE(SUM(${pedidos.total}), 0)`.as("t") })
        .from(pedidos)
        .where(and(eq(pedidos.tenantId, tenantId), gte(pedidos.createdAt, toDbDateStrict(startInclusive)), lt(pedidos.createdAt, toDbDateStrict(endExclusive))))
        .limit(1);
    return Number(row?.t ?? 0);
}
export async function findPedidoGrandeRecente(tenantId, minTotal, since) {
    assertRequiredId(tenantId, "tenantId");
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const rows = await dbConn
        .select({ numero: pedidos.numero, total: pedidos.total })
        .from(pedidos)
        .where(and(eq(pedidos.tenantId, tenantId), ne(pedidos.status, PedidoStatus.CANCELADO), gte(pedidos.createdAt, toDbDateStrict(since)), sql `${pedidos.total} >= ${String(minTotal)}`))
        .limit(1);
    const r = rows[0];
    return r ? { numero: r.numero, total: String(r.total) } : null;
}
export async function listNumerosPedidosEmRotaAtrasados(tenantId, diasMinimos, limit) {
    assertRequiredId(tenantId, "tenantId");
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const limite = new Date();
    limite.setDate(limite.getDate() - diasMinimos);
    const rows = await dbConn
        .select({ numero: pedidos.numero })
        .from(pedidos)
        .where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.status, "EM_ROTA"), sql `${pedidos.updatedAt} < ${limite}`))
        .limit(limit);
    return rows.map((r) => r.numero);
}
export async function countPedidosParadosGeradoConferido(tenantId, updatedBefore) {
    assertRequiredId(tenantId, "tenantId");
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const [row] = await dbConn
        .select({ c: sql `COUNT(*)`.as("c") })
        .from(pedidos)
        .where(and(eq(pedidos.tenantId, tenantId), inArray(pedidos.status, [PedidoStatus.GERADO, PedidoStatus.CONFERIDO]), sql `${pedidos.updatedAt} < ${updatedBefore}`))
        .limit(1);
    return Number(row?.c ?? 0);
}
export async function leoAggregatePedidosByDayAndVendedor(tenantId, since) {
    assertRequiredId(tenantId, "tenantId");
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const rows = await dbConn
        .select({
        day: sql `DATE(${pedidos.dataCriacao})`.as("day"),
        vendedorId: pedidos.vendedorId,
        count: sql `COUNT(*)`.as("count"),
        total: sql `COALESCE(SUM(${pedidos.total}), 0)`.as("total"),
        avgTicket: sql `COALESCE(AVG(${pedidos.total}), 0)`.as("avgTicket"),
    })
        .from(pedidos)
        .where(and(eq(pedidos.tenantId, tenantId), gte(pedidos.dataCriacao, toDbDateStrict(since))))
        .groupBy(sql `DATE(${pedidos.dataCriacao})`, pedidos.vendedorId)
        .orderBy(desc(sql `DATE(${pedidos.dataCriacao})`));
    return rows.map((r) => ({
        day: String(r.day ?? ""),
        vendedorId: r.vendedorId,
        count: Number(r.count ?? 0),
        total: Number(r.total ?? 0),
        avgTicket: Number(r.avgTicket ?? 0),
    }));
}
/**
 * Cria múltiplos itens de um pedido
 */
export async function createItensPedido(tenantId, itens) {
    assertTenantId(tenantId);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    try {
        const result = await dbConn.insert(itensPedido).values(itens.map(item => ({
            ...item,
            tenantId,
            createdAt: toDbDate(new Date()),
            updatedAt: toDbDate(new Date()),
        })));
        return {
            success: true,
            inserted: result.length || itens.length,
        };
    }
    catch (error) {
        console.error('Erro ao criar itens do pedido:', error);
        throw new InfrastructureError('Falha ao criar itens do pedido');
    }
}
/**
 * Marca um pedido como conferido com auditoria
 */
export async function marcarPedidoConferidoAudit(tx, params) {
    try {
        // Atualiza status do pedido para CONFERIDO
        await tx
            .update(pedidos)
            .set({
            status: 'CONFERIDO',
            updatedAt: toDbDate(new Date())
        })
            .where(eq(pedidos.id, params.pedidoId));
        // Registra auditoria
        await insertAuditLog({
            tenantId: null, // Não disponível na transação
            actorVendedorId: params.actorVendedorId,
            action: 'update',
            entity: 'pedido',
            entityId: params.pedidoId,
            payloadJson: JSON.stringify({
                action: 'marcar_conferido',
                traceId: params.traceId,
                timestamp: new Date().toISOString()
            })
        });
    }
    catch (error) {
        console.error('Erro ao marcar pedido como conferido:', error);
        throw new InfrastructureError('Falha ao marcar pedido como conferido');
    }
}
/**
 * Obtém próximo valor de um contador sequencial
 */
export async function getNextCounter(tenantId, counterName) {
    assertTenantId(tenantId);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    try {
        // Usar transação para garantir atomicidade
        const result = await dbConn.transaction(async (tx) => {
            // Buscar contador atual
            const current = await tx
                .select()
                .from(counters)
                .where(and(eq(counters.tenantId, tenantId), eq(counters.name, counterName)))
                .limit(1);
            let currentValue = 1;
            if (current.length > 0) {
                currentValue = Number(current[0].seq || 0) + 1;
                // Atualizar contador existente
                await tx
                    .update(counters)
                    .set({
                    seq: currentValue,
                    updatedAt: toDbDate(new Date())
                })
                    .where(and(eq(counters.tenantId, tenantId), eq(counters.name, counterName)));
            }
            else {
                // Criar novo contador
                await tx
                    .insert(counters)
                    .values({
                    tenantId,
                    name: counterName,
                    seq: currentValue,
                    updatedAt: toDbDate(new Date()),
                });
            }
            return currentValue;
        });
        return result;
    }
    catch (error) {
        console.error('Erro ao obter próximo contador:', error);
        throw new InfrastructureError('Falha ao obter próximo contador');
    }
}
