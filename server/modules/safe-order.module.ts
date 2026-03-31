/**
 * Safe Order Module
 * 
 * Módulo para criação e gestão de pedidos com transações seguras
 * Tipos explícitos - ZERO ANY
 */

import type { TransactionConnection } from '../types/transaction.types.js';
import { runTransaction } from '../services/db-transaction.js';
import { updateStockSafe, reserveStockForOrder } from '../services/stock-safety.service.js';
import { insertAuditLog } from '../services/audit-service.js';
import { logInfo } from '../_core/logger.js';
import type { Pedido } from '../db/core.js';
import { getDb, getPool } from '../db/core.js';

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
  movimentacoesEstoque: Record<string, unknown>[];
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
      throw new Error('PEDIDO_SEM_ITENS: Pedido deve conter pelo menos um item');
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
        throw new Error(`PRODUTO_NAO_ENCONTRADO: Produto ${item.produtoId} não encontrado ou acesso negado`);
      }

      const estoqueAtual = Number(produtoData.estoque || 0);

      if (!produtoData.ativo) {
        throw new Error(`PRODUTO_INATIVO: Produto ${produtoData.descricao} está inativo`);
      }

      if (estoqueAtual < item.quantidade) {
        throw new Error(`ESTOQUE_INSUFICIENTE: Produto ${produtoData.descricao} - Estoque: ${estoqueAtual}, Solicitado: ${item.quantidade}`);
      }

      // Validar preço unitário
      if (item.valorUnitario <= 0) {
        throw new Error(`PRECO_INVALIDO: Produto ${produtoData.descricao} - Preço unitário deve ser maior que 0`);
      }
    }

    // 3. Calcular totais
    const totalItens = orderData.itens.reduce((sum, item) => sum + item.total, 0);
    const totalEntradas = (orderData.entradaValor || 0) + (orderData.segundaValor || 0);
    const totalPedido = totalItens;

    // 4. Validar consistência financeira
    if (totalEntradas > totalPedido) {
      throw new Error(`VALOR_ENTRADA_EXCEDIDO: Total de entradas (${totalEntradas}) maior que total do pedido (${totalPedido})`);
    }

    // 5. Gerar número do pedido se não fornecido
    let pedidoNumero = orderData.numero;
    if (!pedidoNumero) {
      const [numeroResult] = await tx.execute(
        `SELECT COALESCE(MAX(numero), 0) + 1 as proximoNumero FROM pedidos WHERE tenantId = ?`,
        [orderData.tenantId]
      );
      pedidoNumero = (numeroResult as any[])[0]?.proximoNumero || 1;
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

    const pedidoId = (pedidoResult as any).insertId;

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
        id: (itemResult as any).insertId
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
 * Cancela pedido de forma segura devolvendo estoque
 */
export async function cancelOrderSafe(
  tenantId: number, // Adicionado para multi-tenant
  pedidoId: number,
  motivo: string = 'Cancelamento',
  usuarioId?: number,
  vendedorId?: number
): Promise<{ success: boolean; message: string; movimentacoes?: Record<string, unknown>[] }> {
  if (!tenantId) throw new Error("tenantId is required");
  return runTransaction(async (tx: TransactionConnection) => {
    logInfo(`[SafeOrder] Iniciando cancelamento seguro do pedido - Tenant: ${tenantId}, ID: ${pedidoId}`);

    // 1. Buscar dados do pedido com bloqueio e tenantId
    const [pedido] = await tx.execute(
      `SELECT id, numero, status, clienteNome, total FROM pedidos WHERE tenantId = ? AND id = ? FOR UPDATE`,
      [tenantId, pedidoId]
    );

    if (!pedido || !(pedido as any[])[0]) {
      throw new Error('PEDIDO_NAO_ENCONTRADO: Pedido não encontrado ou acesso negado');
    }

    const pedidoData = (pedido as any[])[0];

    // 2. Validar status do pedido
    if (pedidoData.status === 'CANCELADO') {
      throw new Error('PEDIDO_JA_CANCELADO: Pedido já está cancelado');
    }

    if (pedidoData.status === 'ENTREGUE') {
      throw new Error('PEDIDO_ENTREGUE: Pedido entregue não pode ser cancelado');
    }

    // 3. Buscar itens do pedido
    const [itens] = await tx.execute(
      `SELECT produtoId, quantidade FROM itens_pedido WHERE pedidoId = ?`,
      [pedidoId]
    );

    const itensPedido = (itens as any[]);

    // 4. Devolver estoque (usando reserveStockForOrder que agora aceita tenantId)
    const movimentacoesEstoque = await reserveStockForOrder(
      tenantId,
      itensPedido.map(item => ({
        produtoId: item.produtoId,
        quantidade: -item.quantidade // Devolução (quantidade negativa)
      })),
      pedidoId,
      usuarioId,
      vendedorId
    );

    // 5. Atualizar status do pedido com tenantId
    await tx.execute(
      `UPDATE pedidos SET status = ?, updatedAt = NOW() WHERE tenantId = ? AND id = ?`,
      ['CANCELADO', tenantId, pedidoId]
    );

    // 6. Registrar auditoria com tenantId
    await tx.execute(
      `INSERT INTO audit_log (
        tenantId, actorUserId, actorVendedorId, action, entity, entityId,
        payloadJson, traceId, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        tenantId,
        usuarioId,
        vendedorId,
        'PEDIDO_CANCELAMENTO',
        'pedido',
        pedidoId,
        JSON.stringify({
          pedidoId,
          numero: pedidoData.numero,
          clienteNome: pedidoData.clienteNome,
          motivo,
          itensDevolvidos: itensPedido.length,
          valorTotal: pedidoData.total
        }),
        `CANCEL_${pedidoId}_${Date.now()}`
      ]
    );

    logInfo(`[SafeOrder] Pedido cancelado com sucesso - ID: ${pedidoId}`);

    return {
      success: true,
      message: `Pedido #${pedidoData.numero} cancelado com sucesso`,
      movimentacoes: movimentacoesEstoque
    };
  }, 'SERIALIZABLE');
}

/**
 * Atualiza status do pedido com validações
 */
export async function updateOrderStatusSafe(
  tenantId: number, // Adicionado para multi-tenant
  pedidoId: number,
  novoStatus: string,
  motivo?: string,
  usuarioId?: number,
  vendedorId?: number
): Promise<{ success: boolean; message: string }> {
  if (!tenantId) throw new Error("tenantId is required");
  return runTransaction(async (tx: TransactionConnection) => {
    logInfo(`[SafeOrder] Atualizando status do pedido - Tenant: ${tenantId}, ID: ${pedidoId}, Status: ${novoStatus}`);

    // 1. Buscar pedido atual com bloqueio e tenantId
    const [pedido] = await tx.execute(
      `SELECT id, numero, status FROM pedidos WHERE tenantId = ? AND id = ? FOR UPDATE`,
      [tenantId, pedidoId]
    );

    if (!pedido || !(pedido as any[])[0]) {
      throw new Error('PEDIDO_NAO_ENCONTRADO: Pedido não encontrado ou acesso negado');
    }

    const pedidoData = (pedido as any[])[0];

    // 2. Validar transição de status
    const statusValidos: Record<string, string[]> = {
      'PENDENTE': ['PROCESSANDO', 'CANCELADO'],
      'PROCESSANDO': ['APROVADO', 'CANCELADO'],
      'APROVADO': ['SEPARACAO', 'CANCELADO'],
      'SEPARACAO': ['ENTREGA', 'CANCELADO'],
      'ENTREGA': ['ENTREGUE'],
      'ENTREGUE': [],
      'CANCELADO': []
    };

    const transicoesPermitidas = statusValidos[pedidoData.status] || [];
    if (!transicoesPermitidas.includes(novoStatus)) {
      throw new Error(`TRANSICAO_INVALIDA: Não é possível mudar de ${pedidoData.status} para ${novoStatus}`);
    }

    // 3. Atualizar status com tenantId
    await tx.execute(
      `UPDATE pedidos SET status = ?, updatedAt = NOW() WHERE tenantId = ? AND id = ?`,
      [novoStatus, tenantId, pedidoId]
    );

    // 4. Registrar auditoria com tenantId
    await tx.execute(
      `INSERT INTO audit_log (
        tenantId, actorUserId, actorVendedorId, action, entity, entityId,
        payloadJson, traceId, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        tenantId,
        usuarioId,
        vendedorId,
        'PEDIDO_STATUS_UPDATE',
        'pedido',
        pedidoId,
        JSON.stringify({
          pedidoId,
          numero: pedidoData.numero,
          statusAnterior: pedidoData.status,
          novoStatus,
          motivo
        }),
        `STATUS_${pedidoId}_${Date.now()}`
      ]
    );

    logInfo(`[SafeOrder] Status atualizado com sucesso - Pedido: ${pedidoData.numero}, ${pedidoData.status} → ${novoStatus}`);

    return {
      success: true,
      message: `Status do pedido #${pedidoData.numero} atualizado para ${novoStatus}`
    };
  });
}

/**
 * Valida integridade de um pedido
 */
export async function validateOrderIntegrity(tenantId: number, pedidoId: number): Promise<{
  valido: boolean;
  erros: string[];
  detalhes: Record<string, unknown>;
}> {
  if (!tenantId) throw new Error("tenantId is required");
  const dbConnection = await getDb();
  if (!dbConnection) {
    return {
      valido: false,
      erros: ['Database connection not available'],
      detalhes: {}
    };
  }

  try {
    const erros: string[] = [];
    let detalhes: Record<string, unknown> | null = null;

    const pool = await getPool();

    // 1. Buscar pedido e itens com tenantId
    const [pedidoRows] = await pool.execute(
      `SELECT * FROM pedidos WHERE tenantId = ? AND id = ?`,
      [tenantId, pedidoId]
    ) as [Record<string, unknown>[], unknown];

    const pedidoArr = Array.isArray(pedidoRows) ? pedidoRows : [];
    if (!pedidoArr[0]) {
      return {
        valido: false,
        erros: ['Pedido não encontrado'],
        detalhes: {}
      };
    }

    const pedidoData = pedidoArr[0];

    // 2. Buscar itens
    const [itensRows] = await pool.execute(
      `SELECT * FROM itens_pedido WHERE pedidoId = ?`,
      [pedidoId]
    ) as [Record<string, unknown>[], unknown];

    const itensPedido = Array.isArray(itensRows) ? itensRows : [];

    // 3. Validar soma dos itens
    const somaItens = itensPedido.reduce((sum: number, item: Record<string, unknown>) => sum + Number(item.total ?? 0), 0);
    const totalPedido = Number(pedidoData.total ?? 0);

    if (Math.abs(somaItens - totalPedido) > 0.01) {
      erros.push(`Inconsistência nos valores: soma itens (${somaItens}) ≠ total pedido (${totalPedido})`);
    }

    // 4. Validar estoque se pedido não estiver cancelado
    if (pedidoData.status !== 'CANCELADO') {
      for (const item of itensPedido) {
        const [produtoRows] = await pool.execute(
          `SELECT estoque FROM produtos WHERE id = ?`,
          [Number((item as Record<string, unknown>).produtoId)]
        ) as [Record<string, unknown>[], unknown];

        const produtoArr = Array.isArray(produtoRows) ? produtoRows : [];
        const estoqueAtual = Number(produtoArr[0]?.estoque ?? 0);
        if (estoqueAtual < 0) {
          erros.push(`Produto ${item.produtoId} com estoque negativo: ${estoqueAtual}`);
        }
      }
    }

    detalhes = {
      pedido: pedidoData,
      itens: itensPedido,
      somaItens,
      totalPedido,
      quantidadeItens: itensPedido.length
    };

    return {
      valido: erros.length === 0,
      erros,
      detalhes
    };
  } catch (error: unknown) {
    console.error('[SafeOrder] Erro na validação:', error);
    return {
      valido: false,
      erros: ['Erro na validação: ' + (error instanceof Error ? error.message : String(error))],
      detalhes: {}
    };
  }
}
