/**
 * Safe Payment Module
 * 
 * Módulo para registro de pagamentos com transações seguras
 */

import { runTransaction } from '../services/db-transaction.js';
import type { TransactionConnection } from '../types/transaction.types.js';
import { insertAuditLog } from '../services/audit-service.js';
import { getPool } from '../db/index.js';
import * as db from '../db/index.js';
import { eq, sql } from 'drizzle-orm';

export type PaymentData = {
  tenantId: number; // MANDATORY: Multi-tenant isolation
  contaId?: number;
  pedidoId?: number;
  tipo: 'receita' | 'despesa';
  valor: number;
  forma: 'dinheiro' | 'pix' | 'boleto' | 'cartao' | 'transferencia';
  dataPagamento?: Date;
  dataVencimento?: Date;
  descricao?: string;
  categoria?: string;
  fornecedor?: string;
  cliente?: string;
  status?: 'pendente' | 'pago' | 'vencido' | 'cancelado';
  usuarioId?: number;
  vendedorId?: number;
  ip?: string;
  userAgent?: string;
};

export type PaymentResult = {
  success: boolean;
  paymentId?: number;
  message: string;
  auditRecord?: Record<string, unknown>;
};

/**
 * Registra pagamento de forma segura com validações
 * @param paymentData - Dados de pagamento (tenantId obrigatório)
 * @returns Resultado da operação
 */
export async function registerPaymentSafe(paymentData: PaymentData): Promise<PaymentResult> {
  return runTransaction(async (tx: TransactionConnection) => {
    console.log(`[SafePayment] Registrando pagamento - Tipo: ${paymentData.tipo}, Valor: ${paymentData.valor}`);

    // 1. Validar dados obrigatórios
    if (!paymentData.valor || paymentData.valor <= 0) {
      throw new Error('PAGAMENTO_VALOR_INVALIDO: Valor deve ser maior que 0');
    }

    if (!paymentData.forma) {
      throw new Error('PAGAMENTO_FORMA_OBRIGATORIA: Forma de pagamento é obrigatória');
    }

    // 2. Se for pagamento de pedido, validar existência e status
    if (paymentData.pedidoId) {
      const [pedido] = await tx.execute(
        `SELECT id, numero, status, total, cliente_nome FROM pedidos WHERE id = ? FOR UPDATE`,
        [paymentData.pedidoId]
      );

      if (!pedido || !(pedido as any[])[0]) {
        throw new Error('PAGAMENTO_PEDIDO_NAO_ENCONTRADO: Pedido não encontrado');
      }

      const pedidoData = (pedido as any[])[0];

      if (pedidoData.status === 'CANCELADO') {
        throw new Error('PAGAMENTO_PEDIDO_CANCELADO: Pedido cancelado não pode receber pagamentos');
      }

      // Validar se valor do pagamento não excede total do pedido
      const [pagamentosExistentes] = await tx.execute(
        `SELECT COALESCE(SUM(valor), 0) as totalPago FROM contas_receber WHERE pedido_id = ? AND status = 'RECEBIDA'`,
        [paymentData.pedidoId]
      );

      const totalPago = Number((pagamentosExistentes as any[])[0]?.totalPago || 0);
      const totalPedido = Number(pedidoData.total || 0);

      if (totalPago + paymentData.valor > totalPedido) {
        throw new Error(`PAGAMENTO_VALOR_EXCEDIDO: Valor excede total do pedido. Total: ${totalPedido}, Já pago: ${totalPago}, Novo pagamento: ${paymentData.valor}`);
      }
    }

    // 3. Inserir pagamento
    const [paymentResult] = await tx.execute(
      `INSERT INTO contas_${
        paymentData.tipo === 'receita' ? 'receber' : 'pagar'
      } (
        ${paymentData.pedidoId ? 'pedido_id' : 'descricao'}, 
        valor, 
        forma, 
        data_pagamento, 
        data_vencimento, 
        status, 
        ${paymentData.tipo === 'despesa' ? 'fornecedor' : 'cliente'}, 
        created_at, 
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        paymentData.pedidoId || paymentData.descricao || 'Pagamento',
        paymentData.valor,
        paymentData.forma,
        paymentData.dataPagamento || new Date(),
        paymentData.dataVencimento || null,
        paymentData.status || 'pago',
        paymentData.tipo === 'despesa' ? paymentData.fornecedor : paymentData.cliente
      ]
    );

    const paymentId = (paymentResult as any).insertId;

    // 4. Se for pagamento de pedido, atualizar status do pedido se totalmente pago
    if (paymentData.pedidoId) {
      const [pedido] = await tx.execute(
        `SELECT id, numero, total FROM pedidos WHERE id = ?`,
        [paymentData.pedidoId]
      );

      const pedidoData = (pedido as any[])[0];
      const totalPedido = Number(pedidoData.total || 0);

      // Verificar se pedido foi totalmente pago
      const [totalPagoResult] = await tx.execute(
        `SELECT COALESCE(SUM(valor), 0) as totalPago FROM contas_receber WHERE pedido_id = ? AND status = 'RECEBIDA'`,
        [paymentData.pedidoId]
      );

      const totalPago = Number((totalPagoResult as any[])[0]?.totalPago || 0);

      if (totalPago >= totalPedido) {
        await tx.execute(
          `UPDATE pedidos SET status = 'PAGO', updated_at = NOW() WHERE id = ?`,
          [paymentData.pedidoId]
        );

        console.log(`[SafePayment] Pedido #${pedidoData.numero} marcado como PAGO`);
      }
    }

    // 5. Registrar auditoria
    if (!paymentData.tenantId || paymentData.tenantId <= 0) {
      throw new Error('TENANT_ID_OBRIGATORIO: tenantId é obrigatório para auditoria de pagamento');
    }
    const auditRecord = await insertAuditLog({
      tenantId: paymentData.tenantId,
      action: 'PAGAMENTO_REGISTRO',
      entity: 'pagamento',
      entityId: String(paymentId),
      payloadJson: JSON.stringify({
        id: paymentId,
        contaId: paymentData.contaId,
        tipo: paymentData.tipo,
        valor: paymentData.valor,
        forma: paymentData.forma,
        dataPagamento: paymentData.dataPagamento,
        status: paymentData.status || 'pago'
      }),
      actorUserId: paymentData.usuarioId,
      actorVendedorId: paymentData.vendedorId,
      traceId: `PAYMENT_${paymentId}_${Date.now()}`
    });

    console.log(`[SafePayment] Pagamento registrado com sucesso - ID: ${paymentId}`);

    return {
      success: true,
      paymentId,
      message: 'Pagamento registrado com sucesso',
      auditRecord
    };
  }, 'SERIALIZABLE');
}

/**
 * Cancela pagamento de forma segura
 */
export async function cancelPaymentSafe(
  paymentId: number,
  motivo: string = 'Cancelamento',
  tenantId?: number,
  usuarioId?: number,
  vendedorId?: number
): Promise<PaymentResult> {
  return runTransaction(async (tx: TransactionConnection) => {
    console.log(`[SafePayment] Cancelando pagamento - ID: ${paymentId}`);

    // 1. Buscar pagamento com bloqueio
    const [payment] = await tx.execute(
      `SELECT id, tipo, valor, status, pedido_id, tenant_id FROM contas_receber WHERE id = ? FOR UPDATE`,
      [paymentId]
    );

    if (!payment || !(payment as any[])[0]) {
      throw new Error('PAGAMENTO_NAO_ENCONTRADO: Pagamento não encontrado');
    }

    const paymentData = (payment as any[])[0];

    // 2. Validar status
    if (paymentData.status === 'CANCELADO') {
      throw new Error('PAGAMENTO_JA_CANCELADO: Pagamento já está cancelado');
    }

    // 3. Se for pagamento de pedido, verificar impacto no status do pedido
    if (paymentData.pedidoId) {
      const [pedido] = await tx.execute(
        `SELECT id, numero, status, total FROM pedidos WHERE id = ? FOR UPDATE`,
        [paymentData.pedidoId]
      );

      const pedidoData = (pedido as any[])[0];

      if (pedidoData.status === 'PAGO') {
        // Pedido estava pago, vai voltar para status anterior
        await tx.execute(
          `UPDATE pedidos SET status = 'APROVADO', updated_at = NOW() WHERE id = ?`,
          [paymentData.pedidoId]
        );

        console.log(`[SafePayment] Pedido #${pedidoData.numero} voltou para status APROVADO`);
      }
    }

    // 4. Cancelar pagamento
    await tx.execute(
      `UPDATE contas_receber SET status = ?, updated_at = NOW() WHERE id = ?`,
      ['CANCELADO', paymentId]
    );

    const auditTenantId = tenantId ?? Number(paymentData.tenant_id ?? 0);
    if (!auditTenantId || auditTenantId <= 0) {
      throw new Error('TENANT_ID_OBRIGATORIO: tenantId indisponível para auditoria de cancelamento');
    }
    await insertAuditLog({
      tenantId: auditTenantId,
      action: 'PAGAMENTO_CANCELAMENTO',
      entity: 'pagamento',
      entityId: String(paymentId),
      payloadJson: JSON.stringify({
        paymentId,
        tipo: paymentData.tipo,
        valor: paymentData.valor,
        motivo,
        statusAnterior: paymentData.status,
        statusNovo: 'CANCELADO'
      }),
      actorUserId: usuarioId,
      actorVendedorId: vendedorId,
      traceId: `CANCEL_${paymentId}_${Date.now()}`
    });

    console.log(`[SafePayment] Pagamento cancelado com sucesso - ID: ${paymentId}`);

    return {
      success: true,
      paymentId,
      message: 'Pagamento cancelado com sucesso'
    };
  }, 'SERIALIZABLE');
}

/**
 * Concilia pagamentos com extrato bancário
 */
export async function reconcilePaymentsSafe(
  payments: Array<{
    paymentId: number;
    valorConciliado: number;
    dataConciliacao: Date;
    observacoes?: string;
  }>,
  tenantId?: number,
  usuarioId?: number,
  vendedorId?: number
): Promise<{ success: boolean; message: string; reconciliados: number[] }> {
  return runTransaction(async (tx: TransactionConnection) => {
    console.log(`[SafePayment] Conciliando ${payments.length} pagamentos`);

    const reconciliados: number[] = [];

    let resolvedTenantId: number | null = tenantId ?? null;
    for (const payment of payments) {
      // 1. Buscar pagamento
      const [paymentRecord] = await tx.execute(
        `SELECT id, valor, status, tenant_id FROM contas_receber WHERE id = ? FOR UPDATE`,
        [payment.paymentId]
      );

      if (!paymentRecord || !(paymentRecord as any[])[0]) {
        console.warn(`[SafePayment] Pagamento ${payment.paymentId} não encontrado`);
        continue;
      }

      const paymentData = (paymentRecord as any[])[0];
      const itemTenantId = Number(paymentData.tenant_id ?? 0);
      if (!resolvedTenantId && itemTenantId > 0) {
        resolvedTenantId = itemTenantId;
      }

      // 2. Validar status
      if (paymentData.status !== 'pago') {
        console.warn(`[SafePayment] Pagamento ${payment.paymentId} não está pago`);
        continue;
      }

      // 3. Validar valor
      if (Math.abs(paymentData.valor - payment.valorConciliado) > 0.01) {
        console.warn(`[SafePayment] Diverença de valor no pagamento ${payment.paymentId}: ${paymentData.valor} vs ${payment.valorConciliado}`);
        continue;
      }

      // 4. Marcar como conciliado
      await tx.execute(
        `UPDATE contas_receber SET status = 'CONCILIADO', dataConciliacao = ?, observacoes = ?, updated_at = NOW() WHERE id = ?`,
        [payment.dataConciliacao, payment.observacoes || '', payment.paymentId]
      );

      reconciliados.push(payment.paymentId);
    }

    // 5. Registrar auditoria
    if (!resolvedTenantId || resolvedTenantId <= 0) {
      throw new Error('TENANT_ID_OBRIGATORIO: tenantId indisponível para auditoria de conciliação');
    }
    await insertAuditLog({
      tenantId: resolvedTenantId,
      action: 'CONCILIACAO_PAGAMENTOS',
      entity: 'pagamento',
      payloadJson: JSON.stringify({
        totalProcessados: payments.length,
        totalReconciliados: reconciliados.length,
        paymentIds: reconciliados
      }),
      actorUserId: usuarioId,
      actorVendedorId: vendedorId,
      traceId: `RECONCILE_${Date.now()}`
    });

    console.log(`[SafePayment] Conciliação concluída - ${reconciliados.length}/${payments.length} reconciliados`);

    return {
      success: true,
      message: `Conciliação concluída: ${reconciliados.length} de ${payments.length} pagamentos reconciliados`,
      reconciliados
    };
  }, 'SERIALIZABLE');
}

/**
 * Gera relatório de pagamentos com filtros
 */
export async function getPaymentsReport(
  filtros: {
    tipo?: 'receita' | 'despesa';
    status?: string;
    dataInicio?: Date;
    dataFim?: Date;
    forma?: string;
    cliente?: string;
    fornecedor?: string;
    limit?: number;
    offset?: number;
  }
): Promise<Record<string, unknown>[]> {
  const pool = await getPool();
  try {
    let query = `
      SELECT 
        cr.id,
        cr.pedido_id,
        cr.descricao,
        cr.valor,
        cr.forma,
        cr.data_pagamento,
        cr.data_vencimento,
        cr.status,
        cr.cliente,
        cr.fornecedor,
        cr.created_at,
        cr.updated_at,
        p.numero as pedidoNumero,
        p.cliente_nome as pedidoCliente
      FROM contas_receber cr
      LEFT JOIN pedidos p ON cr.pedido_id = p.id
      WHERE 1=1
    `;

    const params: (string | number | Date)[] = [];

    // Aplicar filtros
    if (filtros.tipo) {
      query += ` AND cr.tipo = ?`;
      params.push(filtros.tipo);
    }

    if (filtros.status) {
      query += ` AND cr.status = ?`;
      params.push(filtros.status);
    }

    if (filtros.dataInicio) {
      query += ` AND cr.data_pagamento >= ?`;
      params.push(filtros.dataInicio);
    }

    if (filtros.dataFim) {
      query += ` AND cr.data_pagamento <= ?`;
      params.push(filtros.dataFim);
    }

    if (filtros.forma) {
      query += ` AND cr.forma = ?`;
      params.push(filtros.forma);
    }

    if (filtros.cliente) {
      query += ` AND cr.cliente LIKE ?`;
      params.push(`%${filtros.cliente}%`);
    }

    if (filtros.fornecedor) {
      query += ` AND cr.fornecedor LIKE ?`;
      params.push(`%${filtros.fornecedor}%`);
    }

    query += ` ORDER BY cr.data_pagamento DESC`;

    if (filtros.limit) {
      query += ` LIMIT ?`;
      params.push(filtros.limit);
    }

    if (filtros.offset) {
      query += ` OFFSET ?`;
      params.push(filtros.offset);
    }

    const [rows] = await pool.execute(query, params) as [Record<string, unknown>[], unknown];
    return Array.isArray(rows) ? rows : [];
  } catch (error: unknown) {
    console.error('[SafePayment] Erro ao gerar relatório:', error);
    return [];
  }
}

/**
 * Valida integridade dos pagamentos
 */
export async function validatePaymentsIntegrity(): Promise<{
  valido: boolean;
  erros: string[];
  detalhes: Record<string, unknown> | null;
}> {
  const pool = await getPool();

  try {
    const erros: string[] = [];
    let detalhes: Record<string, unknown> | null = null;

    // 1. Verificar pagamentos com valores negativos
    const [valoresNegativos] = await pool.execute(
      `SELECT COUNT(*) as total FROM contas_receber WHERE valor < 0`
    ) as [Record<string, unknown>[], unknown];

    const negArr = Array.isArray(valoresNegativos) ? valoresNegativos : [];
    const totalNegativos = Number(negArr[0]?.total ?? 0);
    if (totalNegativos > 0) {
      erros.push(`${totalNegativos} pagamentos com valores negativos`);
    }

    // 2. Verificar pagamentos sem data
    const [semData] = await pool.execute(
      `SELECT COUNT(*) as total FROM contas_receber WHERE data_pagamento IS NULL`
    ) as [Record<string, unknown>[], unknown];

    const semDataArr = Array.isArray(semData) ? semData : [];
    const totalSemData = Number(semDataArr[0]?.total ?? 0);
    if (totalSemData > 0) {
      erros.push(`${totalSemData} pagamentos sem data de pagamento`);
    }

    // 3. Verificar pagamentos de pedidos cancelados
    const [pagamentosPedidosCancelados] = await pool.execute(
      `SELECT COUNT(*) as total 
       FROM contas_receber cr
       INNER JOIN pedidos p ON cr.pedido_id = p.id
       WHERE p.status = 'CANCELADO' AND cr.status != 'CANCELADO'`
    ) as [Record<string, unknown>[], unknown];

    const canceladosArr = Array.isArray(pagamentosPedidosCancelados) ? pagamentosPedidosCancelados : [];
    const totalPedidosCancelados = Number(canceladosArr[0]?.total ?? 0);
    if (totalPedidosCancelados > 0) {
      erros.push(`${totalPedidosCancelados} pagamentos de pedidos cancelados`);
    }

    detalhes = {
      valoresNegativos: totalNegativos,
      semData: totalSemData,
      pedidosCancelados: totalPedidosCancelados
    };

    return {
      valido: erros.length === 0,
      erros,
      detalhes
    };
  } catch (error: unknown) {
    console.error('[SafePayment] Erro na validação:', error);
    return {
      valido: false,
      erros: ['Erro na validação: ' + (error instanceof Error ? error.message : String(error))],
      detalhes: null
    };
  }
}
