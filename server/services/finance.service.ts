import { eq, and, desc, asc, sql, inArray, ne, getTableColumns } from "drizzle-orm";
import { getDb, getInsertId, contasReceber, contasPagar, comissoes, pedidos, boletos, clientes, planoContas, contasFixas, insertAuditLog, caixaMensal, clienteVendedores } from "../db/index.js";
import { nanoid } from "nanoid";
import { auditLog } from "../_core/audit-log.js";
import { ensureArray, ensureObject, ensureCreatedResult } from "../_core/service-response.js";
import { 
  financialIdempotencyCheck, 
  executeWithIdempotency, 
  generateIdempotencyKey,
  markOperationProcessed
} from "./financial-idempotency.js";
import {
  BoletoStatus,
  BoletoStatusValues,
  ComissaoStatus,
  ContaPagarStatus,
  ContaPagarStatusValues,
  type ContaPagarStatusValue,
  ContaReceberStatus,
  ContaReceberStatusValues,
  type ContaReceberStatusValue,
  PedidoStatus,
} from "../shared/domain-status.js";
import { validateStatus } from "../shared/guards/domain-guard.js";
import type { ServiceActor } from "../_core/service-actor.js";
import { assertVendedorActor, financeScopeVendedorId } from "../_core/service-actor.js";

/** Opções de baixa de pedido (transação interna + ator para isolamento). */
export type BaixarPedidoDiretoOptions = {
  tx?: unknown;
  /** Obrigatório em fluxos autenticados; use ADMIN_ACTOR em operações internas/admin. */
  actor?: ServiceActor;
};

// Tipos inferidos do schema (sem duplicar imports)
export type Boleto = typeof boletos.$inferSelect;
/** Listagem de boletos com nome do cliente (join com `clientes`). */
export type BoletoComClienteNome = Boleto & { clienteNome: string };
export type CaixaMensal = typeof caixaMensal.$inferSelect;
export type PlanoConta = typeof planoContas.$inferSelect;
export type ContaFixa = typeof contasFixas.$inferSelect;
export type Comissao = typeof comissoes.$inferSelect;
export type ContaReceber = typeof contasReceber.$inferSelect;
export type ContaPagar = typeof contasPagar.$inferSelect;

// Types
export type BaixaPedidoInput = {
  entradaForma: 'PIX' | 'BOLETO' | 'CARTAO' | 'DINHEIRO';
  entradaValor?: number;
  segundaForma?: 'PIX' | 'CARTAO' | 'DINHEIRO';
  segundaValor?: number;
  boletoParcelas?: number;
  boletoVencimentos?: Date[];
  boletoPrimeiroVencimento?: Date;
  dataPagamento?: string;
  observacoes?: string;
};

export type CreateContaReceberInput = {
  clienteNome: string;
  /** Opcional quando admin cria conta sem vínculo imediato a vendedor */
  vendedorId?: number | null;
  descricao: string;
  valor: number;
  dataVencimento: Date;
  status: ContaReceberStatusValue;
  observacoes?: string;
  pedidoNumero?: number;
};

export type CreateContaPagarInput = {
  fornecedor: string;
  descricao: string;
  valor: number;
  dataVencimento: Date;
  status: ContaPagarStatusValue;
  observacoes?: string;
  planoContasId?: number;
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

// Type REAL da transaction Drizzle
import type { Database } from '../db/core.js';
type DbTx = Parameters<Parameters<Database['transaction']>[0]>[0];

function hasTransaction(v: unknown): v is { transaction: <T>(fn: (tx: DbTx) => Promise<T>) => Promise<T> } {
  return typeof v === "object" && v !== null && "transaction" in v;
}

/**
 * BAIXA DIRETA DE PEDIDO (SEM CARGA)
 * Usado pela tela "Meus Pedidos": marca ENTREGUE e integra Financeiro (contas a receber + caixa) e comissão.
 */
export async function baixarPedidoDireto(
  tenantId: number,
  pedidoId: number,
  data: BaixaPedidoInput,
  options?: BaixarPedidoDiretoOptions
): Promise<{ success: boolean; boletoIds: number[]; pedidoNumero: number; clienteNome: string }> {
  const tx = options?.tx;
  const actor = options?.actor;

  assertRequiredId(tenantId, "tenantId");
  assertRequiredId(pedidoId, "pedidoId");
  assertRequiredPayload(data, "Dados de baixa obrigatórios");
  if (!data.entradaForma) throw new Error("Forma de entrada obrigatória");

  const dbTx = tx ?? await getDb();
  if (!dbTx) throw new Error("Banco de dados indisponível");

  const boletoIds: number[] = [];

  if (!hasTransaction(dbTx)) throw new Error("Transação indisponível para baixa de pedido");
  return await dbTx.transaction(async (tx: DbTx) => {
    // 1. Buscar dados do pedido
    const pedidoRows = await tx.select().from(pedidos).where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.id, pedidoId))).for("update").limit(1);
    if (pedidoRows.length === 0) throw new Error('Pedido não encontrado');
    const pedido = pedidoRows[0];

    if (actor?.role === "vendedor") {
      assertVendedorActor(actor);
      // ✅ HARDENING: Validar por clienteVendedores (fonte oficial)
      const clienteRows = await tx.select({ clienteId: clienteVendedores.clienteId })
        .from(clienteVendedores)
        .where(and(
          eq(clienteVendedores.vendedorId, actor.vendedorId)
        )).limit(1);
      if (clienteRows.length === 0) {
        throw new Error("Cliente não encontrado.");
      }
      const cliente = clienteRows[0];
      if (cliente.clienteId !== pedido.clienteId) {
        throw new Error("Acesso negado: cliente de outro proprietário.");
      }
    }

    const valorTotal = parseFloat(pedido.total.toString());
    const entradaValor = typeof data.entradaValor === 'number' ? data.entradaValor : valorTotal;
    
    if (typeof data.segundaValor !== 'number' || data.segundaValor < 0) {
      throw new Error("segundaValor deve ser número >= 0");
    }
    
    const segundaValor = data.segundaValor;
    
    if (typeof data.boletoParcelas !== 'number' || data.boletoParcelas <= 0) {
      throw new Error("boletoParcelas deve ser número > 0");
    }
    
    const boletoParcelas = Math.max(1, Math.floor(data.boletoParcelas));
    
    if (data.boletoPrimeiroVencimento === undefined) {
      throw new Error("boletoPrimeiroVencimento é obrigatório");
    }
    
    const boletoPrimeiroVenc = data.boletoPrimeiroVencimento;

    // 2. Atualizar status do pedido para ENTREGUE
    await tx.update(pedidos)
      .set({ 
        status: PedidoStatus.ENTREGUE,
        dataEntrega: new Date(),
        updatedAt: new Date()
      })
      .where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.id, pedidoId)));

    // 3. Remover conta provisória existente
    await tx.delete(contasReceber)
      .where(and(
        eq(contasReceber.tenantId, tenantId),
        eq(contasReceber.pedidoNumero, pedido.numero),
        sql`${contasReceber.descricao} LIKE '%Conta Provisória%'`
      ));

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
          dataVencimento: vencDate,
          status: BoletoStatus.ABERTO,
        });
        const boletoId = getInsertId(result);
        if (!Number.isInteger(boletoId) || boletoId <= 0) {
          throw new Error("Falha ao gerar boleto");
        }
        boletoIds.push(boletoId);
      }
    } else {
      // Pagamento à vista (PIX, CARTAO, DINHEIRO)
      await tx.insert(contasReceber).values({
        tenantId,
        clienteNome: pedido.clienteNome,
        vendedorId: pedido.vendedorId,
        pedidoNumero: pedido.numero,
        descricao: `Pedido #${pedido.numero} - ${data.entradaForma}`,
        valor: entradaValor.toString(),
        dataVencimento: new Date(),
        dataRecebimento: new Date(),
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
        dataVencimento: new Date(),
        dataRecebimento: new Date(),
        status: ContaReceberStatus.RECEBIDA,
        formaPagamento: data.segundaForma,
        observacoes: data.observacoes ?? null,
      });

      await atualizarCaixaMensal(tenantId, new Date().toISOString().slice(0, 7), data.segundaForma, segundaValor, tx);
    }

    // 5. Comissão (valor opcional; pedidos não têm comissaoValor no schema)
    const pedidoComComissao = pedido as { comissaoValor?: string };
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
        createdAt: new Date(),
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

export async function baixarBoletoParcial(
  tenantId: number, 
  boletoId: number, 
  valorPago: number
): Promise<{ success: boolean; novoAberto: number; novoStatus: string; idempotencyKey?: string }> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredId(boletoId, "boletoId");
  if (!Number.isFinite(valorPago) || valorPago <= 0) {
    throw new Error("valorPago obrigatório");
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
    
    throw new Error("Boleto não encontrado");
  }

  const dbTx = await getDb();
  if (!dbTx) throw new Error("Banco de dados indisponível");

  if (!hasTransaction(dbTx)) throw new Error("Transação indisponível para baixa de boleto");
  
  // 2. EXECUTAR COM IDEMPOTÊNCIA E LOCK FOR UPDATE
  return await executeWithIdempotency(
    tenantId,
    'BAIXA_BOLETO',
    boletoId,
    async () => {
      return await dbTx.transaction(async (transaction) => {
        // 3. LOCK FOR UPDATE: Selecionar boleto com bloqueio pessimista
        const bRows = await transaction.select().from(boletos)
          .where(and(eq(boletos.tenantId, tenantId), eq(boletos.id, boletoId)))
          .for("update")
          .limit(1);
        
        if (!bRows.length) throw new Error("Boleto não encontrado");
        const b = bRows[0];

        // 4. VALIDAR STATUS: Bloquear se não estiver ABERTO
        if (b.status !== BoletoStatus.ABERTO && b.status !== BoletoStatus.PARCIAL) {
          throw new Error(`Boleto não pode ser baixado. Status atual: ${b.status}. Status esperado: ABERTO ou PARCIAL`);
        }

        // 5. VALIDAR VALOR: Não permitir pagar mais que o valor aberto
        const valorAbertoAtual = Number(b.valorAberto);
        if (valorPago > valorAbertoAtual) {
          throw new Error(`Valor pago (${valorPago}) maior que valor aberto (${valorAbertoAtual})`);
        }

        const novoAberto = Math.max(0, valorAbertoAtual - valorPago);
        const novoStatus: (typeof BoletoStatusValues)[number] = novoAberto <= 0 ? BoletoStatus.PAGO : BoletoStatus.PARCIAL;
        
        if (!BoletoStatusValues.includes(novoStatus)) {
          throw new Error("Status inválido de boleto");
        }

        // 6. ATUALIZAR BOLETO
        await transaction.update(boletos)
          .set({ 
            valorAberto: novoAberto.toString(), 
            status: novoStatus, 
            updatedAt: new Date()
          })
          .where(and(eq(boletos.tenantId, tenantId), eq(boletos.id, boletoId)));

        // 7. CAIXA COM IDEMPOTÊNCIA: Verificar se crédito já foi aplicado
        const caixaKey = generateIdempotencyKey('CREDITO_CAIXA', boletoId, { valorPago, mes: new Date().toISOString().slice(0, 7) });
        const caixaCheck = await financialIdempotencyCheck(tenantId, 'CREDITO_CAIXA', boletoId, { valorPago, mes: new Date().toISOString().slice(0, 7) });
        
        if (caixaCheck.allowed) {
          // Aplicar crédito no caixa apenas se ainda não foi feito
          await atualizarCaixaMensal(
            tenantId, 
            new Date().toISOString().slice(0, 7), 
            'PIX', 
            valorPago, 
            transaction,
            caixaKey
          );
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
    },
    { valorPago }
  ).then(result => ({
    ...result.result,
    idempotencyKey: result.idempotencyKey
  }));
}

export async function getBoletosByVendedor(
  tenantId: number, 
  vendedorId: number, 
  opts?: { page?: number; pageSize?: number; }
): Promise<{ items: BoletoComClienteNome[]; total: number; page: number; pageSize: number; }> {
  if (!Number.isInteger(tenantId) || tenantId <= 0) return { items: [], total: 0, page: 1, pageSize: 50 };
  if (!Number.isInteger(vendedorId) || vendedorId <= 0) return { items: [], total: 0, page: 1, pageSize: 50 };
  const dbConn = await getDb();
  if (!dbConn) return { items: [], total: 0, page: 1, pageSize: 50 };

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
    .select({ count: sql`count(*)` })
    .from(boletos)
    .where(and(eq(boletos.tenantId, tenantId), eq(boletos.vendedorId, vendedorId)));
  const total = Number(totalResult[0]?.count ?? 0);
  
  return { items: ensureArray(items), total, page, pageSize };
}

export async function getBoletoById(tenantId: number, id: number): Promise<Boleto | null> {
  if (!Number.isInteger(tenantId) || tenantId <= 0) return null;
  if (!Number.isInteger(id) || id <= 0) return null;
  const dbConn = await getDb();
  if (!dbConn) return null;
  const rows = await dbConn.select().from(boletos).where(and(eq(boletos.tenantId, tenantId), eq(boletos.id, id))).limit(1);
  // Se encontrou um resultado, retorna o objeto garantido, caso contrário retorna null
  return rows.length > 0 ? ensureObject(rows[0]) : null;
}

export async function marcarContaRecebida(
  tenantId: number, 
  id: number, 
  dataRecebimento: string, 
  formaPagamento: string
): Promise<{ success: boolean }> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredId(id, "contaReceberId");
  if (!dataRecebimento) throw new Error("dataRecebimento obrigatória");
  if (!formaPagamento?.trim()) throw new Error("formaPagamento obrigatória");
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Banco de dados indisponível");
  const conta = await dbConn.select().from(contasReceber).where(and(eq(contasReceber.tenantId, tenantId), eq(contasReceber.id, id))).limit(1);
  if (!conta.length) throw new Error("Conta a receber não encontrada");
  await dbConn.update(contasReceber)
    .set({
      status: ContaReceberStatus.RECEBIDA,
      dataRecebimento: new Date(dataRecebimento),
      formaPagamento: formaPagamento as 'PIX' | 'BOLETO' | 'CARTAO' | 'DINHEIRO',
    })
    .where(and(eq(contasReceber.tenantId, tenantId), eq(contasReceber.id, id)));
  const after = await dbConn.select().from(contasReceber).where(and(eq(contasReceber.tenantId, tenantId), eq(contasReceber.id, id))).limit(1);
  if (!after.length || after[0]?.status !== ContaReceberStatus.RECEBIDA) throw new Error("Falha ao marcar conta como recebida");

  // Auditoria Logger
  auditLog({
    action: "update",
    module: "financeiro",
    resourceId: id,
    details: { action: "marcar_conta_recebida", formaPagamento }
  });

  return { success: true };
}

export async function deleteContaReceber(tenantId: number, id: number): Promise<{ success: boolean }> {
  try {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredId(id, "contaReceberId");
    const dbConn = await getDb();
    if (!dbConn) throw new Error("Banco de dados indisponível");
    const conta = await dbConn.select().from(contasReceber).where(and(eq(contasReceber.tenantId, tenantId), eq(contasReceber.id, id))).limit(1);
    if (!conta.length) throw new Error("Conta a receber não encontrada");
    await dbConn.delete(contasReceber).where(and(eq(contasReceber.tenantId, tenantId), eq(contasReceber.id, id)));

    // Auditoria Logger
    auditLog({
      action: "delete",
      module: "financeiro",
      resourceId: id,
      details: { action: "delete_conta_receber" }
    });

    const after = await dbConn.select().from(contasReceber).where(and(eq(contasReceber.tenantId, tenantId), eq(contasReceber.id, id))).limit(1);
    if (after.length > 0) throw new Error("Falha ao excluir conta a receber");
    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir conta a receber:", error);
    throw error;
  }
}

export async function getCaixaMensal(
  tenantId: number,
  mesAno?: string, 
  opts?: { page?: number; pageSize?: number; }
): Promise<{ items: CaixaMensal[]; total: number; page: number; pageSize: number; }> {
  assertRequiredId(tenantId, "tenantId");
  const dbConn = await getDb();
  if (!dbConn) return { items: [], total: 0, page: 1, pageSize: 50 };
  
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
    .select({ count: sql`count(*)` })
    .from(caixaMensal)
    .where(and(...conditions));
  const total = Number(totalResult[0]?.count ?? 0);
  
  return { items: ensureArray(items) as CaixaMensal[], total, page, pageSize };
}

export async function getAllCaixaMensal(tenantId: number): Promise<CaixaMensal[]> {
  const { items } = await getCaixaMensal(tenantId);
  // Garantir que o retorno seja sempre um array
  return ensureArray(items);
}

export async function getPlanoContas(
  tenantId: number,
  tipo?: 'RECEITA' | 'DESPESA',
  opts?: { page?: number; pageSize?: number; }
): Promise<{ items: PlanoConta[]; total: number; page: number; pageSize: number; }> {
  assertRequiredId(tenantId, "tenantId");
  const dbConn = await getDb();
  if (!dbConn) return { items: [], total: 0, page: 1, pageSize: 50 };
  
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
    .select({ count: sql`count(*)` })
    .from(planoContas)
    .where(and(...conditions));
  const total = Number(totalResult[0]?.count ?? 0);
  
  return { items: ensureArray(items) as PlanoConta[], total, page, pageSize };
}

export async function createPlanoContas(tenantId: number, data: Omit<PlanoConta, 'id'>): Promise<{ id: number }> {
  try {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredPayload(data, "Dados do plano de contas obrigatórios");
    const dbConn = await getDb();
    if (!dbConn) throw new Error("Banco de dados indisponível");
    const result = await dbConn.insert(planoContas).values({ ...data, tenantId });
    const id = getInsertId(result);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("Falha ao criar plano de contas");
    }
    // Garantir que o retorno tenha um ID válido
    return ensureCreatedResult({ id });
  } catch (error) {
    console.error("Erro ao criar plano de contas:", error);
    throw error;
  }
}

export async function pagarConta(tenantId: number, id: number, valorPago: number): Promise<{ success: boolean }> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredId(id, "contaPagarId");
  if (!Number.isFinite(valorPago) || valorPago <= 0) {
    throw new Error("valorPago obrigatório");
  }
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Banco de dados indisponível");
  const conta = await dbConn.select().from(contasPagar).where(and(eq(contasPagar.tenantId, tenantId), eq(contasPagar.id, id))).limit(1);
  if (!conta.length) throw new Error("Conta a pagar não encontrada");
  await dbConn.update(contasPagar)
    .set({ status: ContaPagarStatus.PAGO, dataPagamento: new Date() })
    .where(and(eq(contasPagar.tenantId, tenantId), eq(contasPagar.id, id)));
  const after = await dbConn.select().from(contasPagar).where(and(eq(contasPagar.tenantId, tenantId), eq(contasPagar.id, id))).limit(1);
  if (!after.length || after[0]?.status !== ContaPagarStatus.PAGO) throw new Error("Falha ao pagar conta");
  return { success: true };
}

export async function deleteContaPagar(tenantId: number, id: number): Promise<{ success: boolean }> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredId(id, "contaPagarId");
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Banco de dados indisponível");
  const conta = await dbConn.select().from(contasPagar).where(and(eq(contasPagar.tenantId, tenantId), eq(contasPagar.id, id))).limit(1);
  if (!conta.length) throw new Error("Conta a pagar não encontrada");
  await dbConn.delete(contasPagar).where(and(eq(contasPagar.tenantId, tenantId), eq(contasPagar.id, id)));
  const after = await dbConn.select().from(contasPagar).where(and(eq(contasPagar.tenantId, tenantId), eq(contasPagar.id, id))).limit(1);
  if (after.length > 0) throw new Error("Falha ao excluir conta a pagar");
  return { success: true };
}

export async function listContasFixas(
  tenantId: number,
  opts?: { page?: number; pageSize?: number; }
): Promise<{ items: ContaFixa[]; total: number; page: number; pageSize: number; }> {
  assertRequiredId(tenantId, "tenantId");
  const dbConn = await getDb();
  if (!dbConn) return { items: [], total: 0, page: 1, pageSize: 50 };
  
  const page = opts?.page ?? 1;
  const pageSize = Math.min(opts?.pageSize ?? 50, 100);
  const offset = (page - 1) * pageSize;
  
  const items = await dbConn
    .select()
    .from(contasFixas)
    .where(and(eq(contasFixas.tenantId, tenantId), eq(contasFixas.ativo, true)))
    .limit(pageSize)
    .offset(offset);
    
  const totalResult = await dbConn
    .select({ count: sql`count(*)` })
    .from(contasFixas)
    .where(and(eq(contasFixas.tenantId, tenantId), eq(contasFixas.ativo, true)));
  const total = Number(totalResult[0]?.count ?? 0);
  
  return { items: items as ContaFixa[], total, page, pageSize };
}

export async function createContaFixa(tenantId: number, data: Omit<ContaFixa, 'id' | 'ativo'>): Promise<{ id: number }> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredPayload(data, "Dados da conta fixa obrigatórios");
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Banco de dados indisponível");
  const result = await dbConn.insert(contasFixas).values({ ...data, tenantId, ativo: true });
  const id = getInsertId(result);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Falha ao criar conta fixa");
  }
  return { id };
}

export async function gerarContasFixasMes(tenantId: number, mesAno: string): Promise<{ success: boolean; count: number }> {
  assertRequiredId(tenantId, "tenantId");
  if (!mesAno?.trim()) throw new Error("mesAno obrigatório");
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Banco de dados indisponível");

  const { items: fixas } = await listContasFixas(tenantId, { page: 1, pageSize: 500 });
  const results: Awaited<ReturnType<typeof createContaPagar>>[] = [];

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

export async function getAllComissoes(tenantId: number): Promise<Comissao[]> {
  if (!Number.isInteger(tenantId) || tenantId <= 0) return [];
  const dbConn = await getDb();
  if (!dbConn) return [];
  return await dbConn.select().from(comissoes).where(eq(comissoes.tenantId, tenantId)).orderBy(desc(comissoes.createdAt)) as Comissao[];
}

export async function getComissoesByVendedor(tenantId: number, vendedorId: number): Promise<Comissao[]> {
  if (!Number.isInteger(tenantId) || tenantId <= 0) return [];
  if (!Number.isInteger(vendedorId) || vendedorId <= 0) return [];
  const dbConn = await getDb();
  if (!dbConn) return [];
  return await dbConn.select().from(comissoes).where(and(eq(comissoes.tenantId, tenantId), eq(comissoes.vendedorId, vendedorId))).orderBy(desc(comissoes.createdAt)) as Comissao[];
}

export async function marcarComissaoPaga(tenantId: number, id: number): Promise<{ success: boolean }> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredId(id, "comissaoId");
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Banco de dados indisponível");
  const comissao = await dbConn.select().from(comissoes).where(and(eq(comissoes.tenantId, tenantId), eq(comissoes.id, id))).limit(1);
  if (!comissao.length) throw new Error("Comissão não encontrada");
  await dbConn.update(comissoes)
    .set({ status: ComissaoStatus.PAGA, dataPagamento: new Date() })
    .where(and(eq(comissoes.tenantId, tenantId), eq(comissoes.id, id)));
  return { success: true };
}

/**
 * EXISTING METHODS (MANTIDOS)
 */

export async function createContaReceber(tenantId: number, data: CreateContaReceberInput): Promise<{ id: number }> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredPayload(data, "Dados da conta a receber obrigatórios");
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Banco de dados indisponível");
  
  const statusCr = validateStatus(data.status, ContaReceberStatusValues, "contaReceber.status");
  const result = await dbConn.insert(contasReceber).values({
    tenantId,
    clienteNome: data.clienteNome,
    vendedorId: data.vendedorId ?? null,
    descricao: data.descricao,
    valor: String(data.valor),
    dataVencimento: data.dataVencimento,
    status: statusCr,
    observacoes: data.observacoes ?? null,
    pedidoNumero: data.pedidoNumero ?? null,
  });
  const contaId = getInsertId(result);
  if (!Number.isInteger(Number(contaId)) || Number(contaId) <= 0) {
    throw new Error("Falha ao criar conta a receber");
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

export async function createContaPagar(tenantId: number, data: CreateContaPagarInput): Promise<{ id: number }> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredPayload(data, "Dados da conta a pagar obrigatórios");
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Banco de dados indisponível");
  
  const statusCp = validateStatus(data.status, ContaPagarStatusValues, "contaPagar.status");
  const result = await dbConn.insert(contasPagar).values({
    tenantId,
    fornecedor: data.fornecedor,
    descricao: data.descricao,
    valor: String(data.valor),
    dataVencimento: data.dataVencimento,
    status: statusCp,
    planoContasId: data.planoContasId ?? null,
  });
  const contaId = getInsertId(result);
  if (!Number.isInteger(Number(contaId)) || Number(contaId) <= 0) {
    throw new Error("Falha ao criar conta a pagar");
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

export type ListContasReceberFiltros = {
  status?: string;
  dataInicio?: Date;
  dataFim?: Date;
  page?: number;
  pageSize?: number;
};

/** Conta a receber por id com isolamento de tenant (LEO / fluxos com ownership). */
export async function getContaReceberByIdForTenant(
  tenantId: number,
  id: number
): Promise<ContaReceber | null> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredId(id, "contaReceberId");
  const dbConn = await getDb();
  if (!dbConn) return null;
  const rows = await dbConn
    .select()
    .from(contasReceber)
    .where(and(eq(contasReceber.tenantId, tenantId), eq(contasReceber.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listContasReceber(
  tenantId: number,
  actor: ServiceActor,
  filtros?: ListContasReceberFiltros
): Promise<{ items: ContaReceber[]; total: number; page: number; pageSize: number }> {
  if (!tenantId) return { items: [], total: 0, page: 1, pageSize: 50 };
  const dbConn = await getDb();
  if (!dbConn) return { items: [], total: 0, page: 1, pageSize: 50 };

  const scope = financeScopeVendedorId(actor);

  const conditions = [eq(contasReceber.tenantId, tenantId)];
  if (scope !== null) {
    conditions.push(eq(contasReceber.vendedorId, scope));
  }
  if (filtros?.status) {
    conditions.push(eq(contasReceber.status, validateStatus(filtros.status, ContaReceberStatusValues, "filtros.status")));
  }
  if (filtros?.dataInicio) {
    conditions.push(sql`${contasReceber.dataVencimento} >= ${filtros.dataInicio}`);
  }
  if (filtros?.dataFim) {
    conditions.push(sql`${contasReceber.dataVencimento} <= ${filtros.dataFim}`);
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
    .select({ count: sql`count(*)` })
    .from(contasReceber)
    .where(and(...conditions));
  const total = Number(totalResult[0]?.count ?? 0);

  return { items: items as ContaReceber[], total, page, pageSize };
}

export type ListContasPagarFiltros = {
  status?: string;
  fornecedor?: string;
  dataInicio?: Date;
  dataFim?: Date;
  page?: number;
  pageSize?: number;
};

/** Contas a pagar são despesas globais do tenant (sem vendedor_id): vendedor não vê linhas. */
export async function listContasPagar(
  tenantId: number,
  actor: ServiceActor,
  filtros?: ListContasPagarFiltros
): Promise<{ items: ContaPagar[]; total: number; page: number; pageSize: number }> {
  const page = filtros?.page ?? 1;
  const pageSize = Math.min(filtros?.pageSize ?? 50, 100);
  if (!tenantId) return { items: [], total: 0, page: 1, pageSize: 50 };
  if (actor.role === "vendedor") {
    return { items: [], total: 0, page, pageSize };
  }

  const dbConn = await getDb();
  if (!dbConn) return { items: [], total: 0, page: 1, pageSize: 50 };

  const conditions = [eq(contasPagar.tenantId, tenantId)];
  if (filtros?.status) {
    conditions.push(eq(contasPagar.status, validateStatus(filtros.status, ContaPagarStatusValues, "filtros.status")));
  }
  if (filtros?.fornecedor) {
    conditions.push(sql`${contasPagar.fornecedor} LIKE ${`%${filtros.fornecedor}%`}`);
  }
  if (filtros?.dataInicio) {
    conditions.push(sql`${contasPagar.dataVencimento} >= ${filtros.dataInicio}`);
  }
  if (filtros?.dataFim) {
    conditions.push(sql`${contasPagar.dataVencimento} <= ${filtros.dataFim}`);
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
    .select({ count: sql`count(*)` })
    .from(contasPagar)
    .where(and(...conditions));
  const total = Number(totalResult[0]?.count ?? 0);

  return { items: items as ContaPagar[], total, page, pageSize };
}

export async function atualizarCaixaMensal(
  tenantId: number,
  mesAno: string,
  formaPagamento: 'PIX' | 'BOLETO' | 'CARTAO' | 'DINHEIRO',
  valor: number,
  tx?: unknown,
  idempotencyKey?: string // Chave para evitar duplicação
): Promise<void> {
  assertRequiredId(tenantId, "tenantId");
  if (!mesAno?.trim()) throw new Error("mesAno obrigatório");
  if (!Number.isFinite(valor) || valor < 0) throw new Error("valor inválido");
  const dbTx = tx ?? await getDb();
  if (!dbTx) throw new Error("Database not available");

  // IDEMPOTÊNCIA: Verificar se operação já foi processada
  if (idempotencyKey) {
    const caixaCheck = await financialIdempotencyCheck(tenantId, 'CREDITO_CAIXA', parseInt(idempotencyKey.split(':')[1]), { mesAno, formaPagamento, valor });
    
    if (!caixaCheck.allowed) {
      console.log(`[FINANCE] Crédito no caixa já processado: ${idempotencyKey}`);
      return; // Não fazer nada se já foi processado
    }
  }

  const existing = await (dbTx as DbTx).select()
    .from(caixaMensal)
    .where(and(eq(caixaMensal.tenantId, tenantId), eq(caixaMensal.mesAno, mesAno)))
    .limit(1) as Array<typeof caixaMensal.$inferSelect>;

  if (existing.length > 0) {
    const updateData:
      | { totalPix: ReturnType<typeof sql> }
      | { totalBoleto: ReturnType<typeof sql> }
      | { totalCartao: ReturnType<typeof sql> }
      | { totalDinheiro: ReturnType<typeof sql> } =
      formaPagamento === 'PIX' ? { totalPix: sql`${caixaMensal.totalPix} + ${valor}` }
      : formaPagamento === 'BOLETO' ? { totalBoleto: sql`${caixaMensal.totalBoleto} + ${valor}` }
      : formaPagamento === 'CARTAO' ? { totalCartao: sql`${caixaMensal.totalCartao} + ${valor}` }
      : { totalDinheiro: sql`${caixaMensal.totalDinheiro} + ${valor}` };

    await (dbTx as DbTx).update(caixaMensal)
      .set({
        ...updateData,
        totalGeral: sql`${caixaMensal.totalGeral} + ${valor}`,
        updatedAt: new Date()
      })
      .where(and(eq(caixaMensal.tenantId, tenantId), eq(caixaMensal.mesAno, mesAno)));
  } else {
    const newData = {
      tenantId,
      mesAno,
      totalPix: formaPagamento === 'PIX' ? String(valor) : "0",
      totalBoleto: formaPagamento === 'BOLETO' ? String(valor) : "0",
      totalCartao: formaPagamento === 'CARTAO' ? String(valor) : "0",
      totalDinheiro: formaPagamento === 'DINHEIRO' ? String(valor) : "0",
      totalGeral: String(valor),
      updatedAt: new Date()
    };
    await (dbTx as DbTx).insert(caixaMensal).values(newData);
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

export async function getResumoFinanceiro(
  tenantId: number,
  actor: ServiceActor
): Promise<{ aReceber: number; aPagar: number; vencidas: number; aVencer: number }> {
  if (!tenantId) return { aReceber: 0, aPagar: 0, vencidas: 0, aVencer: 0 };
  const dbConn = await getDb();
  if (!dbConn) return { aReceber: 0, aPagar: 0, vencidas: 0, aVencer: 0 };

  const scope = financeScopeVendedorId(actor);

  const hoje = new Date();
  const daqui30dias = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);

  const receberConditions = [
    eq(contasReceber.tenantId, tenantId),
    ne(contasReceber.status, ContaReceberStatus.RECEBIDA),
    sql`${contasReceber.dataVencimento} <= ${daqui30dias}`,
  ];
  if (scope !== null) {
    receberConditions.push(eq(contasReceber.vendedorId, scope));
  }

  const contasReceberRows = (await dbConn
    .select()
    .from(contasReceber)
    .where(and(...receberConditions))) as ContaReceber[];

  const aReceber = contasReceberRows.reduce((sum: number, conta: ContaReceber) => sum + Number(conta.valor), 0);
  const vencidas = contasReceberRows
    .filter((conta: ContaReceber) => new Date(conta.dataVencimento) < hoje)
    .reduce((sum: number, conta: ContaReceber) => sum + Number(conta.valor), 0);

  if (scope !== null) {
    return { aReceber, aPagar: 0, vencidas, aVencer: 0 };
  }

  const contasPagarRows = (await dbConn
    .select()
    .from(contasPagar)
    .where(
      and(
        eq(contasPagar.tenantId, tenantId),
        ne(contasPagar.status, ContaPagarStatus.PAGO),
        sql`${contasPagar.dataVencimento} <= ${daqui30dias}`
      )
    )) as ContaPagar[];

  const aPagar = contasPagarRows.reduce((sum: number, conta: ContaPagar) => sum + Number(conta.valor), 0);
  const aVencer = contasPagarRows
    .filter((conta: ContaPagar) => new Date(conta.dataVencimento) >= hoje)
    .reduce((sum: number, conta: ContaPagar) => sum + Number(conta.valor), 0);

  return { aReceber, aPagar, vencidas, aVencer };
}
