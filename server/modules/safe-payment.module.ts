/**
 * Safe Payment Module
 * 
 * Módulo para registro de pagamentos com transações seguras
 */

import { runTransaction } from '../services/db-transaction.js';
import { ValidationError } from '../_core/errors/typed-errors.js';
import type { TransactionConnection } from '../types/transaction.types.js';
import { insertAuditLog } from '../services/audit-service.js';
import * as db from '../db/index.js';
import { eq, sql } from '../db/index.js';

// Tipos explícitos para retorno de queries MySQL
type PedidoQueryResult = Array<{
  id?: number;
  numero?: string;
  status?: string;
  total?: number;
  cliente_nome?: string;
}>;

type PagamentoQueryResult = Array<{
  id?: number;
  tipo?: string;
  valor?: number;
  status?: string;
  pedidoId?: number;
  tenantId?: number;
}>;

type TotalPagoQueryResult = Array<{
  totalPago?: number;
}>;

// Type guards para resultados de query
function isQueryResult(obj: unknown): obj is { totalPago?: number } {
  return Array.isArray(obj) && obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null && 'totalPago' in obj[0] && typeof obj[0].totalPago === 'number';
}

function isPedidoData(obj: unknown): obj is { id?: number; numero?: string; status?: string; total?: number; cliente_nome?: string } {
  return Array.isArray(obj) && obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null && 
    ('id' in obj[0] || 'numero' in obj[0] || 'status' in obj[0] || 'total' in obj[0] || 'cliente_nome' in obj[0]);
}

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
      throw new ValidationError('PAGAMENTO_VALOR_INVALIDO: Valor deve ser maior que 0');
    }

    if (!paymentData.forma) {
      throw new ValidationError('PAGAMENTO_FORMA_OBRIGATORIA: Forma de pagamento é obrigatória');
    }

    // 2. Se for pagamento de pedido, validar existência e status
    if (paymentData.pedidoId) {
      const [pedido] = await tx.execute(
        `SELECT id, numero, status, total, cliente_nome FROM pedidos WHERE id = ? FOR UPDATE`,
        [paymentData.pedidoId]
      );

      if (!pedido || !Array.isArray(pedido) || pedido.length === 0) {
        throw new ValidationError('PAGAMENTO_PEDIDO_NAO_ENCONTRADO: Pedido não encontrado');
      }

      const pedidoDataRaw = (pedido as PedidoQueryResult)[0];

      if (typeof pedidoDataRaw.status === 'string' && pedidoDataRaw.status === 'CANCELADO') {
        throw new ValidationError('PAGAMENTO_PEDIDO_CANCELADO: Pedido cancelado não pode receber pagamentos');
      }

      // Validar se valor do pagamento não excede total do pedido
      const [pagamentosExistentes] = await tx.execute(
        `SELECT COALESCE(SUM(valor), 0) as totalPago FROM contas_receber WHERE pedido_id = ? AND status = 'RECEBIDA'`,
        [paymentData.pedidoId]
      );

      const pagamentosRaw = (pagamentosExistentes as TotalPagoQueryResult)[0];
      const totalPago = typeof pagamentosRaw.totalPago === 'number' ? pagamentosRaw.totalPago : 0;
      const totalPedido = Number(typeof pedidoDataRaw.total === 'number' ? pedidoDataRaw.total : 0);

      if (totalPago + paymentData.valor > totalPedido) {
        throw new ValidationError(`PAGAMENTO_VALOR_EXCEDIDO: Valor excede total do pedido. Total: ${totalPedido}, Já pago: ${totalPago}, Novo pagamento: ${paymentData.valor}`);
      }
    }

    // 3. Inserir pagamento
    const fornecedorOuClienteRaw = paymentData.tipo === 'despesa' ? paymentData.fornecedor : paymentData.cliente;
    const fornecedorOuClienteForAudit: string | null = fornecedorOuClienteRaw === undefined ? null : fornecedorOuClienteRaw;

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
        fornecedorOuClienteForAudit
      ]
    );

    const paymentId = Array.isArray(paymentResult) && paymentResult.length > 0 && typeof paymentResult[0] === 'object' && paymentResult[0] !== null && 'insertId' in paymentResult[0] && typeof paymentResult[0].insertId === 'number' ? paymentResult[0].insertId : undefined;

    // 4. Se for pagamento de pedido, atualizar status do pedido se totalmente pago
    if (paymentData.pedidoId) {
      const [pedido] = await tx.execute(
        `SELECT id, numero, total FROM pedidos WHERE id = ?`,
        [paymentData.pedidoId]
      );

      const pedidoDataRaw = (pedido as PedidoQueryResult)[0];
      const totalPedido = Number(typeof pedidoDataRaw.total === 'number' ? pedidoDataRaw.total : 0);

      // Verificar se pedido foi totalmente pago
      const [totalPagoResult] = await tx.execute(
        `SELECT COALESCE(SUM(valor), 0) as totalPago FROM contas_receber WHERE pedido_id = ? AND status = 'RECEBIDA'`,
        [paymentData.pedidoId]
      );

      const totalPagoRaw = (totalPagoResult as TotalPagoQueryResult)[0];
      const totalPago = typeof totalPagoRaw.totalPago === 'number' ? totalPagoRaw.totalPago : 0;

      if (totalPago >= totalPedido) {
        await tx.execute(
          `UPDATE pedidos SET status = 'PAGO', updated_at = NOW() WHERE id = ?`,
          [paymentData.pedidoId]
        );

        console.log(`[SafePayment] Pedido #${pedidoDataRaw.numero} marcado como PAGO`);
      }
    }

    // 5. Registrar auditoria
    if (!paymentData.tenantId || paymentData.tenantId <= 0) {
      throw new ValidationError('TENANT_ID_OBRIGATORIO: tenantId é obrigatório para auditoria de pagamento');
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

    if (!payment || !(payment as unknown[])[0]) {
      throw new ValidationError('PAGAMENTO_NAO_ENCONTRADO: Pagamento não encontrado');
    }

    const paymentData = (payment as PagamentoQueryResult)[0];

    // 2. Validar status
    if (typeof paymentData.status === 'string' && paymentData.status === 'CANCELADO') {
      throw new ValidationError('PAGAMENTO_JA_CANCELADO: Pagamento já está cancelado');
    }

    // 3. Se for pagamento de pedido, verificar impacto no status do pedido
    if (typeof paymentData.pedidoId === 'number' && paymentData.pedidoId > 0) {
      const [pedido] = await tx.execute(
        `SELECT id, numero, status, total FROM pedidos WHERE id = ? FOR UPDATE`,
        [paymentData.pedidoId]
      );

      const pedidoData = (pedido as PedidoQueryResult)[0];

      if (typeof pedidoData.status === 'string' && pedidoData.status === 'PAGO') {
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

    const auditTenantId = tenantId ?? Number(paymentData.tenantId ?? 0);
    if (!auditTenantId || auditTenantId <= 0) {
      throw new ValidationError('TENANT_ID_OBRIGATORIO: tenantId indisponível para auditoria de cancelamento');
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

    let resolvedTenantId: number | undefined = tenantId;
    for (const payment of payments) {
      // 1. Buscar pagamento
      const [paymentRecord] = await tx.execute(
        `SELECT id, valor, status, tenant_id FROM contas_receber WHERE id = ? FOR UPDATE`,
        [payment.paymentId]
      );

      if (!paymentRecord || !(paymentRecord as unknown[])[0]) {
        console.warn(`[SafePayment] Pagamento ${payment.paymentId} não encontrado`);
        continue;
      }

      const paymentData = (paymentRecord as PagamentoQueryResult)[0];
      const itemTenantId = Number(typeof paymentData.tenantId === 'number' ? paymentData.tenantId : 0);
      if (!resolvedTenantId && itemTenantId > 0) {
        resolvedTenantId = itemTenantId;
      }

      // 2. Validar status
      if (typeof paymentData.status !== 'string' || paymentData.status !== 'pago') {
        console.warn(`[SafePayment] Pagamento ${payment.paymentId} não está pago`);
        continue;
      }

      // 3. Validar tenant
      if (!paymentData.tenantId || typeof paymentData.tenantId !== 'number' || paymentData.tenantId <= 0) {
        throw new ValidationError('TENANT_ID_INVALIDO: TenantId inválido no pagamento');
      }

      resolvedTenantId = typeof paymentData.tenantId === 'number' ? paymentData.tenantId : 0;

      // 4. Marcar como conciliado
      await tx.execute(
        `UPDATE contas_receber SET status = 'CONCILIADO', dataConciliacao = ?, observacoes = ?, updated_at = NOW() WHERE id = ?`,
        [payment.dataConciliacao, payment.observacoes || '', payment.paymentId]
      );

      reconciliados.push(payment.paymentId);
    }

    // 5. Registrar auditoria
    if (!resolvedTenantId || resolvedTenantId <= 0) {
      throw new ValidationError('TENANT_ID_OBRIGATORIO: tenantId indisponível para auditoria de conciliação');
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
  throw new Error(
    "Função legacy desativada: não é tenant-aware. Recriar via service com tenantId obrigatório."
  );
}

/**
 * Valida integridade dos pagamentos
 */
export async function validatePaymentsIntegrity(): Promise<{
  valido: boolean;
  erros: string[];
  detalhes: Record<string, unknown> | null;
}> {
  throw new Error(
    "Função legacy desativada: não é tenant-aware. Recriar via service com tenantId obrigatório."
  );
}
