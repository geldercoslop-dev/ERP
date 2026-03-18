import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";
import { getDb, getInsertId, contasReceber, contasPagar, caixaMensal, comissoes, pedidos, boletos, planoContas, contasFixas, insertAuditLog } from "../db/index";
import { nanoid } from "nanoid";
import { auditLog } from "../_core/audit-log";
import { ensureArray, ensureObject, ensureCreatedResult, ensureUpdateResult, ensureDeleteResult } from "../_core/service-response";

// Tipos inferidos do schema (sem duplicar imports)
export type Boleto = typeof boletos.$inferSelect;
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
  vendedorId: number;
  descricao: string;
  valor: number;
  dataVencimento: Date;
  status: 'PENDENTE' | 'RECEBIDA' | 'VENCIDA';
  observacoes?: string;
  pedidoNumero?: number;
};

export type CreateContaPagarInput = {
  fornecedor: string;
  descricao: string;
  valor: number;
  dataVencimento: Date;
  status: 'PENDENTE' | 'PAGO' | 'VENCIDA';
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

/**
 * BAIXA DIRETA DE PEDIDO (SEM CARGA)
 * Usado pela tela "Meus Pedidos": marca ENTREGUE e integra Financeiro (contas a receber + caixa) e comissão.
 */
export async function baixarPedidoDireto(
  tenantId: number, 
  pedidoId: number, 
  data: BaixaPedidoInput, 
  tx?: unknown
): Promise<{ success: boolean; boletoIds: number[]; pedidoNumero: number; clienteNome: string }> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredId(pedidoId, "pedidoId");
  assertRequiredPayload(data, "Dados de baixa obrigatórios");
  if (!data.entradaForma) throw new Error("Forma de entrada obrigatória");

  const dbTx = tx ?? await getDb();
  if (!dbTx) throw new Error("Banco de dados indisponível");

  const boletoIds: number[] = [];

  return await (dbTx as any).transaction?.(async (tx: any) => {
    // 1. Buscar dados do pedido
    const pedidoRows = await tx.select().from(pedidos).where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.id, pedidoId))).limit(1);
    if (pedidoRows.length === 0) throw new Error('Pedido não encontrado');
    const pedido = pedidoRows[0];

    const valorTotal = parseFloat(pedido.total.toString());
    const entradaValor = typeof data.entradaValor === 'number' ? data.entradaValor : valorTotal;
    const segundaValor = typeof data.segundaValor === 'number' ? data.segundaValor : 0;
    const boletoParcelas = Math.max(1, Math.floor(data.boletoParcelas || 1));
    const boletoPrimeiroVenc = data.boletoPrimeiroVencimento || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // 2. Atualizar status do pedido para ENTREGUE
    await tx.update(pedidos)
      .set({ 
        status: 'ENTREGUE',
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
        const venc = data.boletoVencimentos?.[i] || new Date(boletoPrimeiroVenc.getTime() + i * 30 * 24 * 60 * 60 * 1000);
        const result = await tx.insert(boletos).values({
          tenantId,
          pedidoId: pedido.id,
          numeroPedido: pedido.numero,
          clienteId: pedido.clienteId,
          vendedorId: pedido.vendedorId,
          valorOriginal: valorParcela,
          valorAberto: valorParcela,
          dataVencimento: venc,
          status: 'ABERTO',
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
        status: 'RECEBIDA',
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
        status: 'RECEBIDA',
        formaPagamento: data.segundaForma,
        observacoes: data.observacoes ?? null,
      });

      await atualizarCaixaMensal(tenantId, new Date().toISOString().slice(0, 7), data.segundaForma, segundaValor, tx);
    }

    // 5. Comissão (valor opcional; pedidos não têm comissaoValor no schema, usar 0 se ausente)
    const valorComissao = Number((pedido as { comissaoValor?: string }).comissaoValor) || 0;
    
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
        status: 'PENDENTE',
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
): Promise<{ success: boolean; novoAberto: number; novoStatus: string }> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredId(boletoId, "boletoId");
  if (!Number.isFinite(valorPago) || valorPago <= 0) {
    throw new Error("valorPago obrigatório");
  }
  const dbTx = await getDb();
  if (!dbTx) throw new Error("Banco de dados indisponível");

  return await dbTx.transaction?.(async (transaction: any) => {
    const bRows = await transaction.select().from(boletos).where(and(eq(boletos.tenantId, tenantId), eq(boletos.id, boletoId))).limit(1);
    if (!bRows.length) throw new Error("Boleto não encontrado");
    const b = bRows[0];

    const novoAberto = Math.max(0, Number(b.valorAberto) - valorPago);
    const novoStatus = novoAberto <= 0 ? 'PAGO' : 'PARCIAL';

    await transaction.update(boletos)
      .set({ valorAberto: novoAberto.toString(), status: novoStatus, updatedAt: new Date() })
      .where(and(eq(boletos.tenantId, tenantId), eq(boletos.id, boletoId)));

    // Lógica de caixa (simplificada: assume PIX para baixas avulsas)
    await atualizarCaixaMensal(tenantId, new Date().toISOString().slice(0, 7), 'PIX', valorPago, transaction);

    // Auditoria Logger
    auditLog({
      action: "update",
      module: "financeiro",
      resourceId: boletoId,
      details: { action: "baixa_boleto_parcial", valorPago, novoStatus, novoAberto }
    });

    return { success: true, novoAberto, novoStatus };
  });
}

export async function getBoletosByVendedor(
  tenantId: number, 
  vendedorId: number, 
  opts?: { page?: number; pageSize?: number; }
): Promise<{ items: Boleto[]; total: number; page: number; pageSize: number; }> {
  if (!Number.isInteger(tenantId) || tenantId <= 0) return { items: [], total: 0, page: 1, pageSize: 50 };
  if (!Number.isInteger(vendedorId) || vendedorId <= 0) return { items: [], total: 0, page: 1, pageSize: 50 };
  const dbConn = await getDb();
  if (!dbConn) return { items: [], total: 0, page: 1, pageSize: 50 };

  const page = opts?.page ?? 1;
  const pageSize = Math.min(opts?.pageSize ?? 50, 100);
  const offset = (page - 1) * pageSize;

  const items = await dbConn
    .select()
    .from(boletos)
    .where(and(eq(boletos.tenantId, tenantId), eq(boletos.vendedorId, vendedorId)))
    .orderBy(desc(boletos.dataVencimento))
    .limit(pageSize)
    .offset(offset);
    
  const totalResult = await dbConn
    .select({ count: sql`count(*)` })
    .from(boletos)
    .where(and(eq(boletos.tenantId, tenantId), eq(boletos.vendedorId, vendedorId)));
  const total = Number(totalResult[0]?.count ?? 0);
  
  return { items: ensureArray(items) as Boleto[], total, page, pageSize };
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
      status: 'RECEBIDA',
      dataRecebimento: new Date(dataRecebimento),
      formaPagamento: formaPagamento as 'PIX' | 'BOLETO' | 'CARTAO' | 'DINHEIRO',
    })
    .where(and(eq(contasReceber.tenantId, tenantId), eq(contasReceber.id, id)));

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

    // Garantir que o retorno tenha success: true
    return ensureDeleteResult();
  } catch (error) {
    console.error("Erro ao excluir conta a receber:", error);
    throw error;
  }
}

export async function getCaixaMensal(
  _tenantId: number, 
  mesAno?: string, 
  opts?: { page?: number; pageSize?: number; }
): Promise<{ items: CaixaMensal[]; total: number; page: number; pageSize: number; }> {
  const dbConn = await getDb();
  if (!dbConn) return { items: [], total: 0, page: 1, pageSize: 50 };
  
  const page = opts?.page ?? 1;
  const pageSize = Math.min(opts?.pageSize ?? 50, 100);
  const offset = (page - 1) * pageSize;
  
  const filter = mesAno ? eq(caixaMensal.mesAno, mesAno) : sql`1=1`;
  
  const items = await dbConn
    .select()
    .from(caixaMensal)
    .where(filter)
    .orderBy(desc(caixaMensal.mesAno))
    .limit(pageSize)
    .offset(offset);
    
  const totalResult = await dbConn
    .select({ count: sql`count(*)` })
    .from(caixaMensal)
    .where(filter);
  const total = Number(totalResult[0]?.count ?? 0);
  
  return { items: ensureArray(items) as CaixaMensal[], total, page, pageSize };
}

export async function getAllCaixaMensal(tenantId: number): Promise<CaixaMensal[]> {
  const result = await getCaixaMensal(tenantId);
  // Garantir que o retorno seja sempre um array
  return ensureArray(result.items);
}

export async function getPlanoContas(
  _tenantId: number, 
  tipo?: 'RECEITA' | 'DESPESA',
  opts?: { page?: number; pageSize?: number; }
): Promise<{ items: PlanoConta[]; total: number; page: number; pageSize: number; }> {
  const dbConn = await getDb();
  if (!dbConn) return { items: [], total: 0, page: 1, pageSize: 50 };
  
  const page = opts?.page ?? 1;
  const pageSize = Math.min(opts?.pageSize ?? 50, 100);
  const offset = (page - 1) * pageSize;
  
  const filter = tipo ? eq(planoContas.tipo, tipo) : sql`1=1`;
  
  const items = await dbConn
    .select()
    .from(planoContas)
    .where(filter)
    .orderBy(asc(planoContas.nome))
    .limit(pageSize)
    .offset(offset);
    
  const totalResult = await dbConn
    .select({ count: sql`count(*)` })
    .from(planoContas)
    .where(filter);
  const total = Number(totalResult[0]?.count ?? 0);
  
  return { items: ensureArray(items) as PlanoConta[], total, page, pageSize };
}

export async function createPlanoContas(tenantId: number, data: Omit<PlanoConta, 'id'>): Promise<{ id: number }> {
  try {
    assertRequiredId(tenantId, "tenantId");
    assertRequiredPayload(data, "Dados do plano de contas obrigatórios");
    const dbConn = await getDb();
    if (!dbConn) throw new Error("Banco de dados indisponível");
    const result = await dbConn.insert(planoContas).values({ ...data });
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
    .set({ status: 'PAGO', dataPagamento: new Date() })
    .where(and(eq(contasPagar.tenantId, tenantId), eq(contasPagar.id, id)));
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
  return { success: true };
}

export async function listContasFixas(
  _tenantId: number,
  opts?: { page?: number; pageSize?: number; }
): Promise<{ items: ContaFixa[]; total: number; page: number; pageSize: number; }> {
  const dbConn = await getDb();
  if (!dbConn) return { items: [], total: 0, page: 1, pageSize: 50 };
  
  const page = opts?.page ?? 1;
  const pageSize = Math.min(opts?.pageSize ?? 50, 100);
  const offset = (page - 1) * pageSize;
  
  const items = await dbConn
    .select()
    .from(contasFixas)
    .where(eq(contasFixas.ativo, true))
    .limit(pageSize)
    .offset(offset);
    
  const totalResult = await dbConn
    .select({ count: sql`count(*)` })
    .from(contasFixas)
    .where(eq(contasFixas.ativo, true));
  const total = Number(totalResult[0]?.count ?? 0);
  
  return { items: items as ContaFixa[], total, page, pageSize };
}

export async function createContaFixa(tenantId: number, data: Omit<ContaFixa, 'id' | 'ativo'>): Promise<{ id: number }> {
  assertRequiredId(tenantId, "tenantId");
  assertRequiredPayload(data, "Dados da conta fixa obrigatórios");
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Banco de dados indisponível");
  const result = await dbConn.insert(contasFixas).values({ ...data, ativo: true });
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

  const fixas = await listContasFixas(tenantId);
  const results = [];

  for (const fixa of fixas) {
    const vcto = new Date(`${mesAno}-${String(fixa.diaVencimento).padStart(2, '0')}T12:00:00Z`);
    const res = await createContaPagar(tenantId, {
      fornecedor: fixa.descricao,
      descricao: `CONTA FIXA: ${fixa.descricao} - ${mesAno}`,
      valor: Number(fixa.valor),
      dataVencimento: vcto,
      status: 'PENDENTE',
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
    .set({ status: 'PAGA', dataPagamento: new Date() })
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
  
  const statusCr: 'PENDENTE' | 'RECEBIDA' = data.status === 'RECEBIDA' ? 'RECEBIDA' : 'PENDENTE';
  const result = await dbConn.insert(contasReceber).values({
    tenantId,
    clienteNome: data.clienteNome,
    vendedorId: data.vendedorId,
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
  
  const statusCp: 'PENDENTE' | 'PAGO' = data.status === 'PAGO' ? 'PAGO' : 'PENDENTE';
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

export async function listContasReceber(tenantId: number, filtros?: {
  status?: string;
  vendedorId?: number;
  dataInicio?: Date;
  dataFim?: Date;
  page?: number;
  pageSize?: number;
}): Promise<{ items: ContaReceber[]; total: number; page: number; pageSize: number }> {
  if (!tenantId) return { items: [], total: 0, page: 1, pageSize: 50 };
  const dbConn = await getDb();
  if (!dbConn) return { items: [], total: 0, page: 1, pageSize: 50 };

  const conditions = [eq(contasReceber.tenantId, tenantId)];
  if (filtros?.status) {
    conditions.push(eq(contasReceber.status, filtros.status));
  }
  if (filtros?.vendedorId) {
    conditions.push(eq(contasReceber.vendedorId, filtros.vendedorId));
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

export async function listContasPagar(tenantId: number, filtros?: {
  status?: string;
  fornecedor?: string;
  dataInicio?: Date;
  dataFim?: Date;
  page?: number;
  pageSize?: number;
}): Promise<{ items: ContaPagar[]; total: number; page: number; pageSize: number }> {
  if (!tenantId) return { items: [], total: 0, page: 1, pageSize: 50 };
  const dbConn = await getDb();
  if (!dbConn) return { items: [], total: 0, page: 1, pageSize: 50 };

  const conditions = [eq(contasPagar.tenantId, tenantId)];
  if (filtros?.status) {
    conditions.push(eq(contasPagar.status, filtros.status));
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

  const page = filtros?.page ?? 1;
  const pageSize = Math.min(filtros?.pageSize ?? 50, 100);
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
  tx?: unknown
): Promise<void> {
  assertRequiredId(tenantId, "tenantId");
  if (!mesAno?.trim()) throw new Error("mesAno obrigatório");
  if (!Number.isFinite(valor) || valor < 0) throw new Error("valor inválido");
  const dbTx = tx ?? await getDb();
  if (!dbTx) throw new Error("Database not available");

  const existing = await (dbTx as any).select?.()
    .from(caixaMensal)
    .where(eq(caixaMensal.mesAno, mesAno))
    .limit(1) ?? [];

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

    await (dbTx as any).update?.(caixaMensal)
      .set(updateData)
      .where(eq(caixaMensal.mesAno, mesAno));
  } else {
    const newData = {
      mesAno,
      totalPix: formaPagamento === 'PIX' ? String(valor) : "0",
      totalBoleto: formaPagamento === 'BOLETO' ? String(valor) : "0",
      totalCartao: formaPagamento === 'CARTAO' ? String(valor) : "0",
      totalDinheiro: formaPagamento === 'DINHEIRO' ? String(valor) : "0",
      totalGeral: String(valor),
    };
    await (dbTx as any).insert?.(caixaMensal).values(newData);
  }

  await insertAuditLog({
    tenantId,
    action: "update",
    entity: "caixa_mensal",
    entityId: `${mesAno}-${formaPagamento}`,
    payloadJson: JSON.stringify({ tenantId, mesAno, formaPagamento, valor }),
    traceId: nanoid(10),
  });
}

export async function getResumoFinanceiro(tenantId: number): Promise<{ aReceber: number; aPagar: number; vencidas: number; aVencer: number }> {
  if (!tenantId) return { aReceber: 0, aPagar: 0, vencidas: 0, aVencer: 0 };
  const dbConn = await getDb();
  if (!dbConn) return { aReceber: 0, aPagar: 0, vencidas: 0, aVencer: 0 };

  const hoje = new Date();
  const daqui30dias = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);
  
  const contasReceberRows = await dbConn
    .select()
    .from(contasReceber)
    .where(
      and(
        eq(contasReceber.tenantId, tenantId),
        sql`${contasReceber.status} != 'RECEBIDA'`,
        sql`${contasReceber.dataVencimento} <= ${daqui30dias}`
      )
    ) as ContaReceber[];

  const aReceber = contasReceberRows.reduce((sum: number, conta: ContaReceber) => sum + Number(conta.valor), 0);
  const vencidas = contasReceberRows
    .filter((conta: ContaReceber) => new Date(conta.dataVencimento) < hoje)
    .reduce((sum: number, conta: ContaReceber) => sum + Number(conta.valor), 0);

  const contasPagarRows = await dbConn
    .select()
    .from(contasPagar)
    .where(
      and(
        eq(contasPagar.tenantId, tenantId),
        sql`${contasPagar.status} != 'PAGO'`,
        sql`${contasPagar.dataVencimento} <= ${daqui30dias}`
      )
    ) as ContaPagar[];

  const aPagar = contasPagarRows.reduce((sum: number, conta: ContaPagar) => sum + Number(conta.valor), 0);
  const aVencer = contasPagarRows
    .filter((conta: ContaPagar) => new Date(conta.dataVencimento) >= hoje)
    .reduce((sum: number, conta: ContaPagar) => sum + Number(conta.valor), 0);

  return { aReceber, aPagar, vencidas, aVencer };
}
