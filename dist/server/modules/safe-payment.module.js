/**
 * Safe Payment Module
 *
 * Módulo para registro de pagamentos com transações seguras
 */
import { runTransaction } from '../services/db-transaction.js';
import { ValidationError } from '../_core/errors/typed-errors.js';
import { insertAuditLog } from '../services/audit-service.js';
import { getPool } from '../db/index.js';
// Type guards para resultados de query
function isQueryResult(obj) {
    return Array.isArray(obj) && obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null && 'totalPago' in obj[0] && typeof obj[0].totalPago === 'number';
}
function isPedidoData(obj) {
    return Array.isArray(obj) && obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null &&
        ('id' in obj[0] || 'numero' in obj[0] || 'status' in obj[0] || 'total' in obj[0] || 'cliente_nome' in obj[0]);
}
/**
 * Registra pagamento de forma segura com validações
 * @param paymentData - Dados de pagamento (tenantId obrigatório)
 * @returns Resultado da operação
 */
export async function registerPaymentSafe(paymentData) {
    return runTransaction(async (tx) => {
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
            const [pedido] = await tx.execute(`SELECT id, numero, status, total, cliente_nome FROM pedidos WHERE id = ? FOR UPDATE`, [paymentData.pedidoId]);
            if (!pedido || !Array.isArray(pedido) || pedido.length === 0) {
                throw new ValidationError('PAGAMENTO_PEDIDO_NAO_ENCONTRADO: Pedido não encontrado');
            }
            const pedidoDataRaw = pedido[0];
            if (typeof pedidoDataRaw.status === 'string' && pedidoDataRaw.status === 'CANCELADO') {
                throw new ValidationError('PAGAMENTO_PEDIDO_CANCELADO: Pedido cancelado não pode receber pagamentos');
            }
            // Validar se valor do pagamento não excede total do pedido
            const [pagamentosExistentes] = await tx.execute(`SELECT COALESCE(SUM(valor), 0) as totalPago FROM contas_receber WHERE pedido_id = ? AND status = 'RECEBIDA'`, [paymentData.pedidoId]);
            const pagamentosRaw = pagamentosExistentes[0];
            const totalPago = typeof pagamentosRaw.totalPago === 'number' ? pagamentosRaw.totalPago : 0;
            const totalPedido = Number(typeof pedidoDataRaw.total === 'number' ? pedidoDataRaw.total : 0);
            if (totalPago + paymentData.valor > totalPedido) {
                throw new ValidationError(`PAGAMENTO_VALOR_EXCEDIDO: Valor excede total do pedido. Total: ${totalPedido}, Já pago: ${totalPago}, Novo pagamento: ${paymentData.valor}`);
            }
        }
        // 3. Inserir pagamento
        const [paymentResult] = await tx.execute(`INSERT INTO contas_${paymentData.tipo === 'receita' ? 'receber' : 'pagar'} (
        ${paymentData.pedidoId ? 'pedido_id' : 'descricao'}, 
        valor, 
        forma, 
        data_pagamento, 
        data_vencimento, 
        status, 
        ${paymentData.tipo === 'despesa' ? 'fornecedor' : 'cliente'}, 
        created_at, 
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`, [
            paymentData.pedidoId || paymentData.descricao || 'Pagamento',
            paymentData.valor,
            paymentData.forma,
            paymentData.dataPagamento || new Date(),
            paymentData.dataVencimento || null,
            paymentData.status || 'pago',
            paymentData.tipo === 'despesa' ? paymentData.fornecedor : paymentData.cliente
        ]);
        const paymentId = Array.isArray(paymentResult) && paymentResult.length > 0 && typeof paymentResult[0] === 'object' && paymentResult[0] !== null && 'insertId' in paymentResult[0] && typeof paymentResult[0].insertId === 'number' ? paymentResult[0].insertId : undefined;
        // 4. Se for pagamento de pedido, atualizar status do pedido se totalmente pago
        if (paymentData.pedidoId) {
            const [pedido] = await tx.execute(`SELECT id, numero, total FROM pedidos WHERE id = ?`, [paymentData.pedidoId]);
            const pedidoDataRaw = pedido[0];
            const totalPedido = Number(typeof pedidoDataRaw.total === 'number' ? pedidoDataRaw.total : 0);
            // Verificar se pedido foi totalmente pago
            const [totalPagoResult] = await tx.execute(`SELECT COALESCE(SUM(valor), 0) as totalPago FROM contas_receber WHERE pedido_id = ? AND status = 'RECEBIDA'`, [paymentData.pedidoId]);
            const totalPagoRaw = totalPagoResult[0];
            const totalPago = typeof totalPagoRaw.totalPago === 'number' ? totalPagoRaw.totalPago : 0;
            if (totalPago >= totalPedido) {
                await tx.execute(`UPDATE pedidos SET status = 'PAGO', updated_at = NOW() WHERE id = ?`, [paymentData.pedidoId]);
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
export async function cancelPaymentSafe(paymentId, motivo = 'Cancelamento', tenantId, usuarioId, vendedorId) {
    return runTransaction(async (tx) => {
        console.log(`[SafePayment] Cancelando pagamento - ID: ${paymentId}`);
        // 1. Buscar pagamento com bloqueio
        const [payment] = await tx.execute(`SELECT id, tipo, valor, status, pedido_id, tenant_id FROM contas_receber WHERE id = ? FOR UPDATE`, [paymentId]);
        if (!payment || !payment[0]) {
            throw new ValidationError('PAGAMENTO_NAO_ENCONTRADO: Pagamento não encontrado');
        }
        const paymentData = payment[0];
        // 2. Validar status
        if (typeof paymentData.status === 'string' && paymentData.status === 'CANCELADO') {
            throw new ValidationError('PAGAMENTO_JA_CANCELADO: Pagamento já está cancelado');
        }
        // 3. Se for pagamento de pedido, verificar impacto no status do pedido
        if (typeof paymentData.pedidoId === 'number' && paymentData.pedidoId > 0) {
            const [pedido] = await tx.execute(`SELECT id, numero, status, total FROM pedidos WHERE id = ? FOR UPDATE`, [paymentData.pedidoId]);
            const pedidoData = pedido[0];
            if (typeof pedidoData.status === 'string' && pedidoData.status === 'PAGO') {
                // Pedido estava pago, vai voltar para status anterior
                await tx.execute(`UPDATE pedidos SET status = 'APROVADO', updated_at = NOW() WHERE id = ?`, [paymentData.pedidoId]);
                console.log(`[SafePayment] Pedido #${pedidoData.numero} voltou para status APROVADO`);
            }
        }
        // 4. Cancelar pagamento
        await tx.execute(`UPDATE contas_receber SET status = ?, updated_at = NOW() WHERE id = ?`, ['CANCELADO', paymentId]);
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
export async function reconcilePaymentsSafe(payments, tenantId, usuarioId, vendedorId) {
    return runTransaction(async (tx) => {
        console.log(`[SafePayment] Conciliando ${payments.length} pagamentos`);
        const reconciliados = [];
        let resolvedTenantId = tenantId ?? null;
        for (const payment of payments) {
            // 1. Buscar pagamento
            const [paymentRecord] = await tx.execute(`SELECT id, valor, status, tenant_id FROM contas_receber WHERE id = ? FOR UPDATE`, [payment.paymentId]);
            if (!paymentRecord || !paymentRecord[0]) {
                console.warn(`[SafePayment] Pagamento ${payment.paymentId} não encontrado`);
                continue;
            }
            const paymentData = paymentRecord[0];
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
            await tx.execute(`UPDATE contas_receber SET status = 'CONCILIADO', dataConciliacao = ?, observacoes = ?, updated_at = NOW() WHERE id = ?`, [payment.dataConciliacao, payment.observacoes || '', payment.paymentId]);
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
export async function getPaymentsReport(filtros) {
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
        const params = [];
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
        const [rows] = await pool.execute(query, params);
        return Array.isArray(rows) ? rows : [];
    }
    catch (error) {
        console.error('[SafePayment] Erro ao gerar relatório:', error);
        return [];
    }
}
/**
 * Valida integridade dos pagamentos
 */
export async function validatePaymentsIntegrity() {
    const pool = await getPool();
    try {
        const erros = [];
        let detalhes = null;
        // 1. Verificar pagamentos com valores negativos
        const [valoresNegativos] = await pool.execute(`SELECT COUNT(*) as total FROM contas_receber WHERE valor < 0`);
        const negArr = Array.isArray(valoresNegativos) ? valoresNegativos : [];
        const totalNegativos = Number(negArr[0]?.total ?? 0);
        if (totalNegativos > 0) {
            erros.push(`${totalNegativos} pagamentos com valores negativos`);
        }
        // 2. Verificar pagamentos sem data
        const [semData] = await pool.execute(`SELECT COUNT(*) as total FROM contas_receber WHERE data_pagamento IS NULL`);
        const semDataArr = Array.isArray(semData) ? semData : [];
        const totalSemData = Number(semDataArr[0]?.total ?? 0);
        if (totalSemData > 0) {
            erros.push(`${totalSemData} pagamentos sem data de pagamento`);
        }
        // 3. Verificar pagamentos de pedidos cancelados
        const [pagamentosPedidosCancelados] = await pool.execute(`SELECT COUNT(*) as total 
       FROM contas_receber cr
       INNER JOIN pedidos p ON cr.pedido_id = p.id
       WHERE p.status = 'CANCELADO' AND cr.status != 'CANCELADO'`);
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
    }
    catch (error) {
        console.error('[SafePayment] Erro na validação:', error);
        return {
            valido: false,
            erros: ['Erro na validação: ' + (error instanceof Error ? error.message : String(error))],
            detalhes: null
        };
    }
}
