import { eq, and, desc, asc, sql, inArray, ne, getTableColumns } from "drizzle-orm";
import { getDb, getInsertId, contasReceber, contasPagar, comissoes, pedidos, boletos, clientes, planoContas, contasFixas, insertAuditLog, caixaMensal, clienteVendedores } from "../db/index.js";
import { nanoid } from "nanoid";
import { auditLog } from "../_core/audit-log.js";
import { ensureArray, ensureObject, ensureCreatedResult } from "../_core/service-response.js";
import { toDbDate, toDbDateStrict } from "../utils/date.js";
import { financialIdempotencyCheck, executeWithIdempotency, generateIdempotencyKey, markOperationProcessed } from "./financial-idempotency.js";
import { assertTenantId, assertDbConnection } from "../_core/errors/assertions.js";
import { ValidationError, InfrastructureError } from "../_core/errors/typed-errors.js";
import { BoletoStatus, BoletoStatusValues, ComissaoStatus, ContaPagarStatus, ContaPagarStatusValues, ContaReceberStatus, ContaReceberStatusValues, PedidoStatus, } from "../shared/domain-status.js";
import { validateStatus } from "../shared/guards/domain-guard.js";
import { assertVendedorActor, financeScopeVendedorId } from "../_core/service-actor.js";
function assertRequiredId(value, fieldName) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new ValidationError(`${fieldName} obrigatório`);
    }
}
function assertRequiredPayload(value, message) {
    if (value == null) {
        throw new ValidationError(message);
    }
    return value;
}
function hasTransaction(v) {
    return typeof v === "object" && v !== null && "transaction" in v;
}
/**
 * BAIXA DIRETA DE PEDIDO (SEM CARGA)
 * Usado pela tela "Meus Pedidos": marca ENTREGUE e integra Financeiro (contas a receber + caixa) e comissão.
 */
export async function baixarPedidoDireto(tenantId, pedidoId, data, options) {
    const tx = options?.tx;
    const actor = options?.actor;
    assertRequiredId(tenantId, "tenantId");
    assertRequiredId(pedidoId, "pedidoId");
    assertRequiredPayload(data, "Dados de baixa obrigatórios");
    if (!data.entradaForma)
        throw new ValidationError("Forma de entrada obrigatória");
    const dbTx = tx ?? await getDb();
    if (!dbTx)
        throw new InfrastructureError("Banco de dados indisponível");
    const boletoIds = [];
    if (!hasTransaction(dbTx))
        throw new InfrastructureError("Transação indisponível para baixa de pedido");
    return await dbTx.transaction(async (tx) => {
        // 1. Buscar dados do pedido
        const pedidoRows = await tx.select().from(pedidos).where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.id, pedidoId))).for("update").limit(1);
        if (pedidoRows.length === 0)
            throw new ValidationError('Pedido não encontrado');
        const pedido = pedidoRows[0];
        if (actor?.role === "vendedor") {
            assertVendedorActor(actor);
            // ✅ HARDENING: Validar por clienteVendedores (fonte oficial)
            const clienteRows = await tx.select({ clienteId: clienteVendedores.clienteId })
                .from(clienteVendedores)
                .where(and(eq(clienteVendedores.vendedorId, actor.vendedorId))).limit(1);
            if (clienteRows.length === 0) {
                throw new ValidationError("Cliente não encontrado.");
            }
            const cliente = clienteRows[0];
            if (cliente.clienteId !== pedido.clienteId) {
                throw new ValidationError("Acesso negado: cliente de outro proprietário.");
            }
        }
        const valorTotal = parseFloat(pedido.total.toString());
        const entradaValor = typeof data.entradaValor === 'number' ? data.entradaValor : valorTotal;
        if (typeof data.segundaValor !== 'number' || data.segundaValor < 0) {
            throw new ValidationError("segundaValor deve ser número >= 0");
        }
        const segundaValor = data.segundaValor;
        if (typeof data.boletoParcelas !== 'number' || data.boletoParcelas <= 0) {
            throw new ValidationError("boletoParcelas deve ser número > 0");
        }
        const boletoParcelas = Math.max(1, Math.floor(data.boletoParcelas));
        if (data.boletoPrimeiroVencimento === undefined) {
            throw new ValidationError("boletoPrimeiroVencimento é obrigatório");
        }
        const boletoPrimeiroVenc = data.boletoPrimeiroVencimento;
        // 2. Atualizar status do pedido para ENTREGUE
        await tx.update(pedidos)
            .set({
            status: PedidoStatus.ENTREGUE,
            dataEntrega: toDbDate(new Date()),
            updatedAt: toDbDate(new Date())
        })
            .where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.id, pedidoId)));
        // 3. Remover conta provisória existente
        await tx.delete(contasReceber)
            .where(and(eq(contasReceber.tenantId, tenantId), eq(contasReceber.pedidoNumero, pedido.numero), sql `${contasReceber.descricao} LIKE '%Conta Provisória%'`));
        // 4. Processar pagamentos
        if (data.entradaForma === 'BOLETO') {
            // Gerar boletos
            const valorParcela = (valorTotal / boletoParcelas).toFixed(2);
            for (let i = 0; i < boletoParcelas; i++) {
                const venc = data.boletoVencimentos?.[i];
                const vencDate = venc instanceof Date ? venc : new Date(boletoPrimeiroVenc.getTime() + i * 30 * 24 * 60 * 60 * 1000);
                const result = await tx.insert(boletos).values({
                    tenantId,
                    pedidoId: pedido.id,
                    numeroPedido: pedido.numero,
                    clienteId: pedido.clienteId,
                    vendedorId: pedido.vendedorId,
                    valorOriginal: valorParcela,
                    valorAberto: valorParcela,
                    dataVencimento: toDbDateStrict(vencDate),
                    status: BoletoStatus.ABERTO,
                });
                const boletoId = getInsertId(result);
                if (!Number.isInteger(boletoId) || boletoId <= 0) {
                    throw new InfrastructureError("Falha ao gerar boleto");
                }
                boletoIds.push(boletoId);
            }
        }
        else {
            // Pagamento à vista (PIX, CARTAO, DINHEIRO)
            await tx.insert(contasReceber).values({
                tenantId,
                clienteNome: pedido.clienteNome,
                vendedorId: pedido.vendedorId,
                pedidoNumero: pedido.numero,
                descricao: `Pedido #${pedido.numero} - ${data.entradaForma}`,
                valor: entradaValor.toString(),
                dataVencimento: toDbDateStrict(new Date()),
                dataRecebimento: toDbDateStrict(new Date()),
                status: ContaReceberStatus.RECEBIDA,
                formaPagamento: data.entradaForma,
                observacoes: data.observacoes ?? null,
            });
            await atualizarCaixaMensal(tenantId, new Date().toISOString().slice(0, 7), data.entradaForma, entradaValor, tx);
        }
        if (data.segundaForma && segundaValor > 0) {
            await tx.insert(contasReceber).values({
                tenantId,
                clienteNome: pedido.clienteNome,
                vendedorId: pedido.vendedorId,
                pedidoNumero: pedido.numero,
                descricao: `Pedido #${pedido.numero} - ${data.segundaForma} (Complemento)`,
                valor: segundaValor.toString(),
                dataVencimento: toDbDateStrict(new Date()),
                dataRecebimento: toDbDateStrict(new Date()),
                status: ContaReceberStatus.RECEBIDA,
                formaPagamento: data.segundaForma,
                observacoes: data.observacoes ?? null,
            });
            await atualizarCaixaMensal(tenantId, new Date().toISOString().slice(0, 7), data.segundaForma, segundaValor, tx);
        }
        // 5. Comissão (valor opcional; pedidos não têm comissaoValor no schema)
        const pedidoComComissao = pedido;
        let valorComissao = 0;
        if (pedidoComComissao.comissaoValor !== undefined && pedidoComComissao.comissaoValor !== null) {
            const parsed = Number(pedidoComComissao.comissaoValor);
            if (!Number.isNaN(parsed) && parsed >= 0) {
                valorComissao = parsed;
            }
        }
        // Auditoria Logger
        auditLog({
            action: "update",
            module: "financeiro",
            resourceId: pedido.id,
            details: { pedidoNumero: pedido.numero, valorTotal, entradaForma: data.entradaForma }
        });
        if (valorComissao > 0) {
            await tx.insert(comissoes).values({
                tenantId,
                vendedorId: pedido.vendedorId,
                pedidoId: pedido.id,
                valorVenda: pedido.total.toString(),
                percentualComissao: "0",
                valorComissao: valorComissao.toString(),
                status: ComissaoStatus.PENDENTE,
                createdAt: toDbDate(new Date()),
            });
        }
        // 6. Auditoria
        await insertAuditLog({
            tenantId,
            action: "BAIXA",
            entity: "pedido",
            entityId: String(pedidoId),
            payloadJson: JSON.stringify(data),
            traceId: nanoid(10),
        });
        return {
            success: true,
            boletoIds,
            pedidoNumero: pedido.numero,
            clienteNome: pedido.clienteNome
        };
    });
}
/**
 * FINANCEIRO - MÉTODOS ADICIONAIS
 */
export async function baixarBoletoParcial(tenantId, boletoId, valorPago) {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredId(boletoId, "boletoId");
    if (!Number.isFinite(valorPago) || valorPago <= 0) {
        throw new ValidationError("valorPago obrigatório");
    }
    // 1. IDEMPOTÊNCIA: Verificar se operação já foi processada
    const idempotencyKey = generateIdempotencyKey('BAIXA_BOLETO', boletoId, { valorPago });
    const idempotencyCheck = await financialIdempotencyCheck(tenantId, 'BAIXA_BOLETO', boletoId, { valorPago });
    if (!idempotencyCheck.allowed) {
        // Retornar status atual sem processar novamente
        const db = await getDb();
        const currentBoleto = await db.select()
            .from(boletos)
            .where(and(eq(boletos.tenantId, tenantId), eq(boletos.id, boletoId)))
            .limit(1);
        if (currentBoleto.length > 0) {
            return {
                success: true,
                novoAberto: Number(currentBoleto[0].valorAberto),
                novoStatus: currentBoleto[0].status,
                idempotencyKey
            };
        }
        throw new ValidationError("Boleto não encontrado");
    }
    const dbTx = await getDb();
    if (!dbTx)
        throw new InfrastructureError("Banco de dados indisponível");
    if (!hasTransaction(dbTx))
        throw new InfrastructureError("Transação indisponível para baixa de boleto");
    // 2. EXECUTAR COM IDEMPOTÊNCIA E LOCK FOR UPDATE
    return await executeWithIdempotency(tenantId, 'BAIXA_BOLETO', boletoId, async () => {
        return await dbTx.transaction(async (transaction) => {
            // 3. LOCK FOR UPDATE: Selecionar boleto com bloqueio pessimista
            const bRows = await transaction.select().from(boletos)
                .where(and(eq(boletos.tenantId, tenantId), eq(boletos.id, boletoId)))
                .for("update")
                .limit(1);
            if (!bRows.length)
                throw new ValidationError("Boleto não encontrado");
            const b = bRows[0];
            // 4. VALIDAR STATUS: Bloquear se não estiver ABERTO
            if (b.status !== BoletoStatus.ABERTO && b.status !== BoletoStatus.PARCIAL) {
                throw new ValidationError(`Boleto não pode ser baixado. Status atual: ${b.status}. Status esperado: ABERTO ou PARCIAL`);
            }
            // 5. VALIDAR VALOR: Não permitir pagar mais que o valor aberto
            const valorAbertoAtual = Number(b.valorAberto);
            if (valorPago > valorAbertoAtual) {
                throw new ValidationError(`Valor pago (${valorPago}) maior que valor aberto (${valorAbertoAtual})`);
            }
            const novoAberto = Math.max(0, valorAbertoAtual - valorPago);
            const novoStatus = novoAberto <= 0 ? BoletoStatus.PAGO : BoletoStatus.PARCIAL;
            if (!BoletoStatusValues.includes(novoStatus)) {
                throw new ValidationError("Status inválido de boleto");
            }
            // 6. ATUALIZAR BOLETO
            await transaction.update(boletos)
                .set({
                valorAberto: novoAberto.toString(),
                status: novoStatus,
                updatedAt: toDbDate(new Date())
            })
                .where(and(eq(boletos.tenantId, tenantId), eq(boletos.id, boletoId)));
            // 7. CAIXA COM IDEMPOTÊNCIA: Verificar se crédito já foi aplicado
            const caixaKey = generateIdempotencyKey('CREDITO_CAIXA', boletoId, { valorPago, mes: new Date().toISOString().slice(0, 7) });
            const caixaCheck = await financialIdempotencyCheck(tenantId, 'CREDITO_CAIXA', boletoId, { valorPago, mes: new Date().toISOString().slice(0, 7) });
            if (caixaCheck.allowed) {
                // Aplicar crédito no caixa apenas se ainda não foi feito
                await atualizarCaixaMensal(tenantId, new Date().toISOString().slice(0, 7), 'PIX', valorPago, transaction, caixaKey);
            }
            // 8. AUDITORIA
            auditLog({
                action: "update",
                module: "financeiro",
                resourceId: boletoId,
                details: {
                    action: "baixa_boleto_parcial",
                    valorPago,
                    novoStatus,
                    novoAberto,
                    idempotencyKey,
                    caixaCreditado: caixaCheck.allowed
                }
            });
            return { success: true, novoAberto, novoStatus };
        });
    }, { valorPago }).then(result => ({
        ...result.result,
        idempotencyKey: result.idempotencyKey
    }));
}
export async function getBoletosByVendedor(tenantId, vendedorId, opts) {
    if (!Number.isInteger(tenantId) || tenantId <= 0)
        return { items: [], total: 0, page: 1, pageSize: 50 };
    if (!Number.isInteger(vendedorId) || vendedorId <= 0)
        return { items: [], total: 0, page: 1, pageSize: 50 };
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const page = opts?.page ?? 1;
    const pageSize = Math.min(opts?.pageSize ?? 50, 100);
    const offset = (page - 1) * pageSize;
    const items = await dbConn
        .select({
        ...getTableColumns(boletos),
        clienteNome: clientes.nome,
    })
        .from(boletos)
        .innerJoin(clientes, and(eq(boletos.clienteId, clientes.id), eq(clientes.tenantId, tenantId)))
        .where(and(eq(boletos.tenantId, tenantId), eq(boletos.vendedorId, vendedorId)))
        .orderBy(desc(boletos.dataVencimento))
        .limit(pageSize)
        .offset(offset);
    const totalResult = await dbConn
        .select({ count: sql `count(*)` })
        .from(boletos)
        .where(and(eq(boletos.tenantId, tenantId), eq(boletos.vendedorId, vendedorId)));
    const total = Number(totalResult[0]?.count ?? 0);
    return { items: ensureArray(items), total, page, pageSize };
}
export async function getBoletoById(tenantId, id) {
    if (!Number.isInteger(tenantId) || tenantId <= 0)
        return null;
    if (!Number.isInteger(id) || id <= 0)
        return null;
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const rows = await dbConn.select().from(boletos).where(and(eq(boletos.tenantId, tenantId), eq(boletos.id, id))).limit(1);
    // Se encontrou um resultado, retorna o objeto garantido, caso contrário retorna null
    return rows.length > 0 ? ensureObject(rows[0]) : null;
}
export async function marcarContaRecebida(tenantId, id, dataRecebimento, formaPagamento) {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredId(id, "contaReceberId");
    if (!dataRecebimento)
        throw new ValidationError("dataRecebimento obrigatória");
    if (!formaPagamento?.trim())
        throw new ValidationError("formaPagamento obrigatória");
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const conta = await dbConn.select().from(contasReceber).where(and(eq(contasReceber.tenantId, tenantId), eq(contasReceber.id, id))).limit(1);
    if (!conta.length)
        throw new ValidationError("Conta a receber não encontrada");
    await dbConn.update(contasReceber)
        .set({
        status: ContaReceberStatus.RECEBIDA,
        dataRecebimento: toDbDate(new Date(dataRecebimento)),
        formaPagamento: formaPagamento,
    })
        .where(and(eq(contasReceber.tenantId, tenantId), eq(contasReceber.id, id)));
    const after = await dbConn.select().from(contasReceber).where(and(eq(contasReceber.tenantId, tenantId), eq(contasReceber.id, id))).limit(1);
    if (!after.length || after[0]?.status !== ContaReceberStatus.RECEBIDA)
        throw new InfrastructureError("Falha ao marcar conta como recebida");
    // Auditoria Logger
    auditLog({
        action: "update",
        module: "financeiro",
        resourceId: id,
        details: { action: "marcar_conta_recebida", formaPagamento }
    });
    return { success: true };
}
export async function deleteContaReceber(tenantId, id) {
    try {
        assertRequiredId(tenantId, "tenantId");
        assertRequiredId(id, "contaReceberId");
        const dbConn = await getDb();
        assertDbConnection(dbConn);
        const conta = await dbConn.select().from(contasReceber).where(and(eq(contasReceber.tenantId, tenantId), eq(contasReceber.id, id))).limit(1);
        if (!conta.length)
            throw new ValidationError("Conta a receber não encontrada");
        await dbConn.delete(contasReceber).where(and(eq(contasReceber.tenantId, tenantId), eq(contasReceber.id, id)));
        // Auditoria Logger
        auditLog({
            action: "delete",
            module: "financeiro",
            resourceId: id,
            details: { action: "delete_conta_receber" }
        });
        const after = await dbConn.select().from(contasReceber).where(and(eq(contasReceber.tenantId, tenantId), eq(contasReceber.id, id))).limit(1);
        if (after.length > 0)
            throw new InfrastructureError("Falha ao excluir conta a receber");
        return { success: true };
    }
    catch (error) {
        console.error("Erro ao excluir conta a receber:", error);
        throw error;
    }
}
export async function getCaixaMensal(tenantId, mesAno, opts) {
    assertRequiredId(tenantId, "tenantId");
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const page = opts?.page ?? 1;
    const pageSize = Math.min(opts?.pageSize ?? 50, 100);
    const offset = (page - 1) * pageSize;
    const conditions = [eq(caixaMensal.tenantId, tenantId)];
    if (mesAno) {
        conditions.push(eq(caixaMensal.mesAno, mesAno));
    }
    const items = await dbConn
        .select()
        .from(caixaMensal)
        .where(and(...conditions))
        .orderBy(desc(caixaMensal.mesAno))
        .limit(pageSize)
        .offset(offset);
    const totalResult = await dbConn
        .select({ count: sql `count(*)` })
        .from(caixaMensal)
        .where(and(...conditions));
    const total = Number(totalResult[0]?.count ?? 0);
    return { items: ensureArray(items), total, page, pageSize };
}
export async function getAllCaixaMensal(tenantId) {
    const { items } = await getCaixaMensal(tenantId);
    // Garantir que o retorno seja sempre um array
    return ensureArray(items);
}
export async function getPlanoContas(tenantId, tipo, opts) {
    assertRequiredId(tenantId, "tenantId");
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const page = opts?.page ?? 1;
    const pageSize = Math.min(opts?.pageSize ?? 50, 100);
    const offset = (page - 1) * pageSize;
    const conditions = [eq(planoContas.tenantId, tenantId)];
    if (tipo) {
        conditions.push(eq(planoContas.tipo, tipo));
    }
    const items = await dbConn
        .select()
        .from(planoContas)
        .where(and(...conditions))
        .orderBy(asc(planoContas.nome))
        .limit(pageSize)
        .offset(offset);
    const totalResult = await dbConn
        .select({ count: sql `count(*)` })
        .from(planoContas)
        .where(and(...conditions));
    const total = Number(totalResult[0]?.count ?? 0);
    return { items: ensureArray(items), total, page, pageSize };
}
export async function createPlanoContas(tenantId, data) {
    try {
        assertRequiredId(tenantId, "tenantId");
        assertRequiredPayload(data, "Dados do plano de contas obrigatórios");
        const dbConn = await getDb();
        assertDbConnection(dbConn);
        const result = await dbConn.insert(planoContas).values({ ...data, tenantId });
        const id = getInsertId(result);
        if (!Number.isInteger(id) || id <= 0) {
            throw new InfrastructureError("Falha ao criar plano de contas");
        }
        // Garantir que o retorno tenha um ID válido
        return ensureCreatedResult({ id });
    }
    catch (error) {
        console.error("Erro ao criar plano de contas:", error);
        throw error;
    }
}
export async function updatePlanoContas(tenantId, id, data) {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredId(id, "id");
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    await dbConn.update(planoContas).set({ nome: data.nome, tipo: data.tipo }).where(and(eq(planoContas.tenantId, tenantId), eq(planoContas.id, id)));
}
export async function deletePlanoContas(tenantId, id) {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredId(id, "id");
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    await dbConn.delete(planoContas).where(and(eq(planoContas.tenantId, tenantId), eq(planoContas.id, id)));
}
export async function pagarConta(tenantId, id, valorPago) {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredId(id, "contaPagarId");
    if (!Number.isFinite(valorPago) || valorPago <= 0) {
        throw new ValidationError("valorPago obrigatório");
    }
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const conta = await dbConn.select().from(contasPagar).where(and(eq(contasPagar.tenantId, tenantId), eq(contasPagar.id, id))).limit(1);
    if (!conta.length)
        throw new ValidationError("Conta a pagar não encontrada");
    await dbConn.update(contasPagar)
        .set({ status: ContaPagarStatus.PAGO, dataPagamento: toDbDate(new Date()) })
        .where(and(eq(contasPagar.tenantId, tenantId), eq(contasPagar.id, id)));
    const after = await dbConn.select().from(contasPagar).where(and(eq(contasPagar.tenantId, tenantId), eq(contasPagar.id, id))).limit(1);
    if (!after.length || after[0]?.status !== ContaPagarStatus.PAGO)
        throw new InfrastructureError("Falha ao pagar conta");
    return { success: true };
}
export async function deleteContaPagar(tenantId, id) {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredId(id, "contaPagarId");
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const conta = await dbConn.select().from(contasPagar).where(and(eq(contasPagar.tenantId, tenantId), eq(contasPagar.id, id))).limit(1);
    if (!conta.length)
        throw new ValidationError("Conta a pagar não encontrada");
    await dbConn.delete(contasPagar).where(and(eq(contasPagar.tenantId, tenantId), eq(contasPagar.id, id)));
    const after = await dbConn.select().from(contasPagar).where(and(eq(contasPagar.tenantId, tenantId), eq(contasPagar.id, id))).limit(1);
    if (after.length > 0)
        throw new InfrastructureError("Falha ao excluir conta a pagar");
    return { success: true };
}
export async function listContasFixas(tenantId, opts) {
    assertRequiredId(tenantId, "tenantId");
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const page = opts?.page ?? 1;
    const pageSize = Math.min(opts?.pageSize ?? 50, 100);
    const offset = (page - 1) * pageSize;
    const items = await dbConn
        .select()
        .from(contasFixas)
        .where(and(eq(contasFixas.tenantId, tenantId), eq(contasFixas.ativo, 1)))
        .limit(pageSize)
        .offset(offset);
    const totalResult = await dbConn
        .select({ count: sql `count(*)` })
        .from(contasFixas)
        .where(and(eq(contasFixas.tenantId, tenantId), eq(contasFixas.ativo, 1)));
    const total = Number(totalResult[0]?.count ?? 0);
    return { items: items, total, page, pageSize };
}
export async function createContaFixa(tenantId, data) {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredPayload(data, "Dados da conta fixa obrigatórios");
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const result = await dbConn.insert(contasFixas).values({ ...data, tenantId, ativo: 1 });
    const id = getInsertId(result);
    if (!Number.isInteger(id) || id <= 0) {
        throw new InfrastructureError("Falha ao criar conta fixa");
    }
    return { id };
}
export async function gerarContasFixasMes(tenantId, mesAno) {
    assertRequiredId(tenantId, "tenantId");
    if (!mesAno?.trim())
        throw new ValidationError("mesAno obrigatório");
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const { items: fixas } = await listContasFixas(tenantId, { page: 1, pageSize: 500 });
    const results = [];
    for (const fixa of fixas) {
        const vcto = new Date(`${mesAno}-${String(fixa.diaVencimento).padStart(2, '0')}T12:00:00Z`);
        const res = await createContaPagar(tenantId, {
            fornecedor: fixa.descricao || '',
            descricao: `CONTA FIXA: ${fixa.descricao} - ${mesAno}`,
            valor: Number(fixa.valor),
            dataVencimento: vcto,
            status: ContaPagarStatus.PENDENTE,
            planoContasId: fixa.planoContasId ?? undefined
        });
        results.push(res);
    }
    return { success: true, count: results.length };
}
/**
 * COMISSÕES
 */
export async function getAllComissoes(tenantId) {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
        throw new ValidationError("tenantId is required");
    }
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    ;
    return await dbConn.select().from(comissoes).where(eq(comissoes.tenantId, tenantId)).orderBy(desc(comissoes.createdAt));
}
export async function getComissoesByVendedor(tenantId, vendedorId) {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
        throw new ValidationError("tenantId is required");
    }
    if (!Number.isInteger(vendedorId) || vendedorId <= 0) {
        throw new ValidationError("vendedorId is required");
    }
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    ;
    return await dbConn.select().from(comissoes).where(and(eq(comissoes.tenantId, tenantId), eq(comissoes.vendedorId, vendedorId))).orderBy(desc(comissoes.createdAt));
}
export async function marcarComissaoPaga(tenantId, id) {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredId(id, "comissaoId");
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const comissao = await dbConn.select().from(comissoes).where(and(eq(comissoes.tenantId, tenantId), eq(comissoes.id, id))).limit(1);
    if (!comissao.length)
        throw new ValidationError("Comissão não encontrada");
    await dbConn.update(comissoes)
        .set({ status: ComissaoStatus.PAGA, dataPagamento: toDbDate(new Date()) })
        .where(and(eq(comissoes.tenantId, tenantId), eq(comissoes.id, id)));
    return { success: true };
}
/**
 * EXISTING METHODS (MANTIDOS)
 */
export async function createContaReceber(tenantId, data) {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredPayload(data, "Dados da conta a receber obrigatórios");
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const statusCr = validateStatus(data.status, ContaReceberStatusValues, "contaReceber.status");
    const result = await dbConn.insert(contasReceber).values({
        tenantId,
        clienteNome: data.clienteNome,
        vendedorId: data.vendedorId ?? null,
        descricao: data.descricao,
        valor: String(data.valor),
        dataVencimento: toDbDateStrict(data.dataVencimento),
        status: statusCr,
        observacoes: data.observacoes ?? null,
        pedidoNumero: data.pedidoNumero ?? null,
    });
    const contaId = getInsertId(result);
    if (!Number.isInteger(Number(contaId)) || Number(contaId) <= 0) {
        throw new InfrastructureError("Falha ao criar conta a receber");
    }
    // Registrar auditoria
    await insertAuditLog({
        tenantId,
        action: "create",
        entity: "conta_receber",
        entityId: String(contaId),
        payloadJson: JSON.stringify(data),
        traceId: nanoid(10),
    });
    return { id: Number(contaId) };
}
export async function createContaPagar(tenantId, data) {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredPayload(data, "Dados da conta a pagar obrigatórios");
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const statusCp = validateStatus(data.status, ContaPagarStatusValues, "contaPagar.status");
    const result = await dbConn.insert(contasPagar).values({
        tenantId,
        fornecedor: data.fornecedor,
        descricao: data.descricao,
        valor: String(data.valor),
        dataVencimento: toDbDateStrict(data.dataVencimento),
        status: statusCp,
        planoContasId: data.planoContasId ?? null,
    });
    const contaId = getInsertId(result);
    if (!Number.isInteger(Number(contaId)) || Number(contaId) <= 0) {
        throw new InfrastructureError("Falha ao criar conta a pagar");
    }
    // Registrar auditoria
    await insertAuditLog({
        tenantId,
        action: "create",
        entity: "conta_pagar",
        entityId: String(contaId),
        payloadJson: JSON.stringify(data),
        traceId: nanoid(10),
    });
    return { id: Number(contaId) };
}
/** Conta a receber por id com isolamento de tenant (LEO / fluxos com ownership). */
export async function getContaReceberByIdForTenant(tenantId, id) {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredId(id, "contaReceberId");
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const rows = await dbConn
        .select()
        .from(contasReceber)
        .where(and(eq(contasReceber.tenantId, tenantId), eq(contasReceber.id, id)))
        .limit(1);
    return rows[0] ?? null;
}
export async function listContasReceber(tenantId, actor, filtros) {
    assertTenantId(tenantId);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    ;
    const scope = financeScopeVendedorId(actor);
    const conditions = [eq(contasReceber.tenantId, tenantId)];
    if (scope !== null) {
        conditions.push(eq(contasReceber.vendedorId, scope));
    }
    if (filtros?.status) {
        conditions.push(eq(contasReceber.status, validateStatus(filtros.status, ContaReceberStatusValues, "filtros.status")));
    }
    if (filtros?.dataInicio) {
        conditions.push(sql `${contasReceber.dataVencimento} >= ${filtros.dataInicio}`);
    }
    if (filtros?.dataFim) {
        conditions.push(sql `${contasReceber.dataVencimento} <= ${filtros.dataFim}`);
    }
    const page = filtros?.page ?? 1;
    const pageSize = Math.min(filtros?.pageSize ?? 50, 100);
    const offset = (page - 1) * pageSize;
    const items = await dbConn
        .select()
        .from(contasReceber)
        .where(and(...conditions))
        .orderBy(asc(contasReceber.dataVencimento))
        .limit(pageSize)
        .offset(offset);
    const totalResult = await dbConn
        .select({ count: sql `count(*)` })
        .from(contasReceber)
        .where(and(...conditions));
    const total = Number(totalResult[0]?.count ?? 0);
    return { items: items, total, page, pageSize };
}
/** Contas a pagar são despesas globais do tenant (sem vendedor_id): vendedor não vê linhas. */
export async function listContasPagar(tenantId, actor, filtros) {
    const page = filtros?.page ?? 1;
    const pageSize = Math.min(filtros?.pageSize ?? 50, 100);
    assertTenantId(tenantId);
    if (actor.role === "vendedor") {
        throw new ValidationError("Vendedor não tem acesso a contas a pagar");
    }
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const conditions = [eq(contasPagar.tenantId, tenantId)];
    if (filtros?.status) {
        conditions.push(eq(contasPagar.status, validateStatus(filtros.status, ContaPagarStatusValues, "filtros.status")));
    }
    if (filtros?.fornecedor) {
        conditions.push(sql `${contasPagar.fornecedor} LIKE ${`%${filtros.fornecedor}%`}`);
    }
    if (filtros?.dataInicio) {
        conditions.push(sql `${contasPagar.dataVencimento} >= ${filtros.dataInicio}`);
    }
    if (filtros?.dataFim) {
        conditions.push(sql `${contasPagar.dataVencimento} <= ${filtros.dataFim}`);
    }
    const offset = (page - 1) * pageSize;
    const items = await dbConn
        .select()
        .from(contasPagar)
        .where(and(...conditions))
        .orderBy(asc(contasPagar.dataVencimento))
        .limit(pageSize)
        .offset(offset);
    const totalResult = await dbConn
        .select({ count: sql `count(*)` })
        .from(contasPagar)
        .where(and(...conditions));
    const total = Number(totalResult[0]?.count ?? 0);
    return { items: items, total, page, pageSize };
}
export async function atualizarCaixaMensal(tenantId, mesAno, formaPagamento, valor, tx, idempotencyKey // Chave para evitar duplicação
) {
    assertRequiredId(tenantId, "tenantId");
    if (!mesAno?.trim())
        throw new ValidationError("mesAno obrigatório");
    if (!Number.isFinite(valor) || valor < 0)
        throw new ValidationError("valor inválido");
    const dbTx = tx ?? await getDb();
    if (!dbTx)
        throw new InfrastructureError("Database not available");
    // IDEMPOTÊNCIA: Verificar se operação já foi processada
    if (idempotencyKey) {
        const caixaCheck = await financialIdempotencyCheck(tenantId, 'CREDITO_CAIXA', parseInt(idempotencyKey.split(':')[1]), { mesAno, formaPagamento, valor });
        if (!caixaCheck.allowed) {
            console.log(`[FINANCE] Crédito no caixa já processado: ${idempotencyKey}`);
            return; // Não fazer nada se já foi processado
        }
    }
    const existing = await dbTx.select()
        .from(caixaMensal)
        .where(and(eq(caixaMensal.tenantId, tenantId), eq(caixaMensal.mesAno, mesAno)))
        .limit(1);
    if (existing.length > 0) {
        const updateData = formaPagamento === 'PIX' ? { totalPix: sql `${caixaMensal.totalPix} + ${valor}` }
            : formaPagamento === 'BOLETO' ? { totalBoleto: sql `${caixaMensal.totalBoleto} + ${valor}` }
                : formaPagamento === 'CARTAO' ? { totalCartao: sql `${caixaMensal.totalCartao} + ${valor}` }
                    : { totalDinheiro: sql `${caixaMensal.totalDinheiro} + ${valor}` };
        await dbTx.update(caixaMensal)
            .set({
            ...updateData,
            totalGeral: sql `${caixaMensal.totalGeral} + ${valor}`,
            updatedAt: toDbDate(new Date())
        })
            .where(and(eq(caixaMensal.tenantId, tenantId), eq(caixaMensal.mesAno, mesAno)));
    }
    else {
        const newData = {
            tenantId,
            mesAno,
            totalPix: formaPagamento === 'PIX' ? String(valor) : "0",
            totalBoleto: formaPagamento === 'BOLETO' ? String(valor) : "0",
            totalCartao: formaPagamento === 'CARTAO' ? String(valor) : "0",
            totalDinheiro: formaPagamento === 'DINHEIRO' ? String(valor) : "0",
            totalGeral: String(valor),
            updatedAt: toDbDate(new Date())
        };
        await dbTx.insert(caixaMensal).values(newData);
    }
    // Marcar como processado se tiver chave de idempotência
    if (idempotencyKey) {
        await markOperationProcessed(tenantId, idempotencyKey, 'CREDITO_CAIXA', { mesAno, formaPagamento, valor });
    }
    await insertAuditLog({
        tenantId,
        action: "update",
        entity: "caixa_mensal",
        entityId: `${mesAno}-${formaPagamento}`,
        payloadJson: JSON.stringify({ tenantId, mesAno, formaPagamento, valor, idempotencyKey }),
        traceId: nanoid(10),
    });
}
export async function getResumoFinanceiro(tenantId, actor) {
    assertTenantId(tenantId);
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    ;
    const scope = financeScopeVendedorId(actor);
    const hoje = new Date();
    const daqui30dias = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);
    const receberConditions = [
        eq(contasReceber.tenantId, tenantId),
        ne(contasReceber.status, ContaReceberStatus.RECEBIDA),
        sql `${contasReceber.dataVencimento} <= ${daqui30dias}`,
    ];
    if (scope !== null) {
        receberConditions.push(eq(contasReceber.vendedorId, scope));
    }
    const contasReceberRows = (await dbConn
        .select()
        .from(contasReceber)
        .where(and(...receberConditions)));
    const aReceber = contasReceberRows.reduce((sum, conta) => sum + Number(conta.valor), 0);
    const vencidas = contasReceberRows
        .filter((conta) => new Date(conta.dataVencimento) < hoje)
        .reduce((sum, conta) => sum + Number(conta.valor), 0);
    if (scope !== null) {
        return { aReceber, aPagar: 0, vencidas, aVencer: 0 };
    }
    const contasPagarRows = (await dbConn
        .select()
        .from(contasPagar)
        .where(and(eq(contasPagar.tenantId, tenantId), ne(contasPagar.status, ContaPagarStatus.PAGO), sql `${contasPagar.dataVencimento} <= ${daqui30dias}`)));
    const aPagar = contasPagarRows.reduce((sum, conta) => sum + Number(conta.valor), 0);
    const aVencer = contasPagarRows
        .filter((conta) => new Date(conta.dataVencimento) >= hoje)
        .reduce((sum, conta) => sum + Number(conta.valor), 0);
    return { aReceber, aPagar, vencidas, aVencer };
}
export async function listBoletos(tenantId, params = {}) {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
        throw new ValidationError("tenantId is required");
    }
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    ;
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 100, 100);
    const offset = (page - 1) * pageSize;
    const whereParts = [eq(boletos.tenantId, tenantId)];
    if (params.vendedorId !== undefined) {
        whereParts.push(eq(boletos.vendedorId, params.vendedorId));
    }
    const busca = (params.busca ?? "").trim();
    if (busca) {
        if (/^\d+$/.test(busca)) {
            const n = Number(busca);
            whereParts.push(sql `(${boletos.id} = ${n} OR ${boletos.numeroPedido} = ${n})`);
        }
        else {
            const normalized = busca.replace(/\s/g, "");
            const cleaned = normalized.replace(/\./g, "").replace(",", ".");
            const isMoney = /^\d+(\.\d{1,2})?$/.test(cleaned);
            if (isMoney) {
                const v = Number(cleaned);
                if (Number.isFinite(v)) {
                    const val = v.toFixed(2);
                    whereParts.push(sql `(${boletos.valorOriginal} = ${val} OR ${boletos.valorAberto} = ${val})`);
                }
            }
            else {
                const term = `%${busca}%`;
                whereParts.push(sql `${clientes.nome} LIKE ${term}`);
            }
        }
    }
    const where = whereParts.length === 1 ? whereParts[0] : and(...whereParts);
    return ensureArray(await dbConn
        .select({
        id: boletos.id,
        numeroPedido: boletos.numeroPedido,
        valorOriginal: boletos.valorOriginal,
        valorAberto: boletos.valorAberto,
        dataVencimento: boletos.dataVencimento,
        status: boletos.status,
        createdAt: boletos.createdAt,
        clientId: boletos.clienteId,
        clienteNome: clientes.nome,
    })
        .from(boletos)
        .innerJoin(clientes, eq(boletos.clienteId, clientes.id))
        .where(where)
        .orderBy(desc(boletos.createdAt))
        .limit(pageSize)
        .offset(offset));
}
export async function checkPedidosBelongToVendedor(tenantId, pedidoIds, vendedorId) {
    if (!Number.isInteger(tenantId) || tenantId <= 0)
        return false;
    if (!pedidoIds.length)
        return false;
    const dbConn = await getDb();
    assertDbConnection(dbConn);
    const rows = await dbConn
        .select({ vendedorId: pedidos.vendedorId })
        .from(pedidos)
        .where(and(inArray(pedidos.id, pedidoIds), eq(pedidos.tenantId, tenantId)));
    return rows.every((r) => r.vendedorId === vendedorId);
}
