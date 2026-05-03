/**
 * Safe Order Module
 * 
 * Módulo para criação e gestão de pedidos com transações seguras
 * Tipos explícitos - ZERO ANY
 */

import type { TransactionConnection } from '../types/transaction.types.js';
import { runTransaction } from '../services/db-transaction.js';
import { reserveStockForOrder } from '../services/stock-safety.service.js';
import { insertAuditLog } from '../services/audit-service.js';
import { logInfo } from '../_core/logger.js';
import { ValidationError } from '../_core/errors/typed-errors.js';
import { updateOrderStatusSafe as updateOrderStatusSafeService } from '../services/orders.service.js';

/**
 * Item de pedido
 */
export interface OrderItem {
  produtoId: number;
  quantidade: number;
  valorUnitario: number;
  total: number;
  descricao?: string;
  id?: number;
}

/**
 * Dados para criar pedido - tenantId OBRIGATÓRIO
 */
export interface CreateOrderData {
  tenantId: number; // MANDATORY
  numero?: number;
  clienteNome: string;
  clienteId?: number;
  formaPagamento: string;
  entradaForma?: string;
  entradaValor?: number;
  segundaForma?: string;
  segundaValor?: number;
  boletoParcelas?: number;
  boletoVencimentos?: Date[];
  status?: string;
  itens: OrderItem[];
  usuarioId?: number;
  vendedorId?: number;
  ip?: string;
  userAgent?: string;
}

/**
 * Resultado de criação de pedido
 */
export interface OrderResult {
  pedidoId: number;
  numero: number;
  status: string;
  total: number;
  itens: OrderItem[];
  movimentacoesEstoque: { success: boolean; data?: Record<string, unknown>[]; error?: string };
  auditRecord: Record<string, unknown>;
};

/**
 * Cria pedido de forma segura com transação completa
 */
export async function createOrderSafe(orderData: CreateOrderData): Promise<OrderResult> {
  return runTransaction(async (tx: TransactionConnection) => {
    logInfo(`[SafeOrder] Iniciando criação segura do pedido - Cliente: ${orderData.clienteNome}`);

    // 1. Validar itens do pedido
    if (!orderData.itens || orderData.itens.length === 0) {
      throw new ValidationError('PEDIDO_SEM_ITENS: Pedido deve conter pelo menos um item');
    }

    // 2. Validar disponibilidade de estoque para todos os itens (Otimização N+1)
    const produtoIds = Array.from(new Set(orderData.itens.map(i => i.produtoId)));
    const placeholders = produtoIds.map(() => '?').join(',');
    const [produtosRows] = await tx.execute(
      `SELECT id, descricao, estoque, ativo FROM produtos WHERE tenantId = ? AND id IN (${placeholders}) FOR UPDATE`,
      [orderData.tenantId, ...produtoIds]
    );

    const produtosMap = new Map<number, Record<string, unknown>>();
    
    if (Array.isArray(produtosRows)) {
      for (const p of produtosRows) {
        if (typeof p === 'object' && p !== null) {
          const row = p as Record<string, unknown>;
          const id = typeof row.id === 'number' ? row.id : 0;
          produtosMap.set(id, row);
        }
      }
    }

    for (const item of orderData.itens) {
      const produtoData = produtosMap.get(item.produtoId);

      if (!produtoData) {
        throw new ValidationError(`PRODUTO_NAO_ENCONTRADO: Produto ${item.produtoId} não encontrado ou acesso negado`);
      }

      const estoqueAtual = Number(produtoData.estoque || 0);

      if (!produtoData.ativo) {
        throw new ValidationError(`PRODUTO_INATIVO: Produto ${produtoData.descricao} está inativo`);
      }

      if (estoqueAtual < item.quantidade) {
        throw new ValidationError(`ESTOQUE_INSUFICIENTE: Produto ${produtoData.descricao} - Estoque: ${estoqueAtual}, Solicitado: ${item.quantidade}`);
      }

      // Validar preço unitário
      if (item.valorUnitario <= 0) {
        throw new ValidationError(`PRECO_INVALIDO: Produto ${produtoData.descricao} - Preço unitário deve ser maior que 0`);
      }
    }

    // 3. Calcular totais
    const totalItens = orderData.itens.reduce((sum, item) => sum + item.total, 0);
    const totalEntradas = (orderData.entradaValor || 0) + (orderData.segundaValor || 0);
    const totalPedido = totalItens;

    // 4. Validar consistência financeira
    if (totalEntradas > totalPedido) {
      throw new ValidationError(`VALOR_ENTRADA_EXCEDIDO: Total de entradas (${totalEntradas}) maior que total do pedido (${totalPedido})`);
    }

    // 5. Gerar número do pedido se não fornecido
    let pedidoNumero = orderData.numero;
    if (!pedidoNumero) {
      const [numeroResult] = await tx.execute(
        `SELECT COALESCE(MAX(numero), 0) + 1 as proximoNumero FROM pedidos WHERE tenantId = ?`,
        [orderData.tenantId]
      );
      pedidoNumero = (numeroResult as Array<{ proximoNumero?: number }>)[0]?.proximoNumero || 1;
    }

    // 6. Inserir pedido
    const [pedidoResult] = await tx.execute(
      `INSERT INTO pedidos (
        tenantId, numero, clienteNome, clienteId, formaPagamento, 
        entradaForma, entradaValor, segundaForma, segundaValor,
        boletoParcelas, status, total, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        orderData.tenantId,
        pedidoNumero,
        orderData.clienteNome,
        orderData.clienteId || null,
        orderData.formaPagamento,
        orderData.entradaForma || null,
        orderData.entradaValor || null,
        orderData.segundaForma || null,
        orderData.segundaValor || null,
        orderData.boletoParcelas || null,
        orderData.status || 'PENDENTE',
        totalPedido
      ]
    );

    const pedidoId = (pedidoResult as { insertId?: number }).insertId ?? 0;

    // 7. Inserir itens do pedido
    const itensInseridos: OrderItem[] = [];
    for (const item of orderData.itens) {
      const [itemResult] = await tx.execute(
        `INSERT INTO itens_pedido (
          tenant_id, pedidoId, produtoId, quantidade, valorUnitario, descricao, tipo, custo, prazoGarantia, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, 'LIVRE', 0, 90, NOW())`,
        [orderData.tenantId, pedidoId, item.produtoId, item.quantidade, item.valorUnitario, item.descricao ?? '']
      );

      itensInseridos.push({
        ...item,
        id: (itemResult as { insertId?: number }).insertId
      } as OrderItem);
    }

    // 8. Reservar estoque (baixa do estoque)
    const movimentacoesEstoque = await reserveStockForOrder(
      orderData.tenantId,
      orderData.itens.map(item => ({
        produtoId: item.produtoId,
        quantidade: item.quantidade
      })),
      pedidoId,
      orderData.usuarioId,
      orderData.vendedorId
    );

    // 9. Registrar auditoria
    const auditRecord = await insertAuditLog({
      tenantId: orderData.tenantId,
      action: 'PEDIDO_CRIACAO',
      entity: 'pedido',
      entityId: String(pedidoId),
      payloadJson: JSON.stringify({
        id: pedidoId,
        numero: pedidoNumero,
        clienteNome: orderData.clienteNome,
        total: totalPedido,
        status: orderData.status || 'PENDENTE',
        formaPagamento: orderData.formaPagamento
      }),
      actorUserId: orderData.usuarioId,
      actorVendedorId: orderData.vendedorId,
      traceId: `CREATE_${pedidoId}_${Date.now()}`
    });

    logInfo(`[SafeOrder] Pedido criado com sucesso - ID: ${pedidoId}, Número: ${pedidoNumero}`);

    return {
      pedidoId,
      numero: pedidoNumero || 0,
      status: orderData.status || 'PENDENTE',
      total: totalPedido,
      itens: itensInseridos,
      movimentacoesEstoque,
      auditRecord
    };
  }, 'SERIALIZABLE'); // Usar isolamento serializável para evitar race conditions
}

/**
 * Atualiza status do pedido com validações
 * Delegado para orders.service.ts
 */
export async function updateOrderStatusSafe(
  tenantId: number,
  pedidoId: number,
  novoStatus: string,
  motivo?: string,
  usuarioId?: number,
  vendedorId?: number
): Promise<{ success: boolean; message: string }> {
  return updateOrderStatusSafeService(tenantId, pedidoId, novoStatus, motivo, usuarioId, vendedorId);
}

/**
 * Valida integridade de um pedido
 * @deprecated Função legacy desativada: recriar via orders.service.ts com tenantId obrigatório.
 */
export async function validateOrderIntegrity(tenantId: number, pedidoId: number): Promise<{
  valido: boolean;
  erros: string[];
  detalhes: Record<string, unknown>;
}> {
  throw new Error("Função legacy desativada: recriar via orders.service.ts com tenantId obrigatório.");
}
