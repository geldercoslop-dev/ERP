/**
 * Serviço de Transações Seguras - Safe Transaction Service
 * 
 * Padroniza a ordem das operações para evitar deadlocks
 * Define ordem fixa: pedido → estoque → financeiro
 */

import { getDb } from '../db/index.js';
import { eq, sql } from 'drizzle-orm';
import { pedidos, produtos, contasReceber, contasPagar } from '../../drizzle/schema.js';
import { ContaPagarStatus, ContaReceberStatus, PedidoStatus, PedidoStatusValues } from "../shared/domain-status.js";
import { validateStatus } from "../shared/guards/domain-guard.js";
import { loggerInstance as logger, logError } from '../utils/logger.js';
import { processStockOperation, StockOperation } from './safe-stock.js';
import { logAuditAction } from './audit-log.service.js';

// Type REAL da transaction Drizzle
import type { Database } from '../db/core.js';
type DbTx = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface TransactionStep {
  type: 'pedido' | 'estoque' | 'financeiro';
  order: number;
  operation: string;
  data: unknown;
}

export interface SafeTransaction {
  id: string;
  steps: TransactionStep[];
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
  createdAt: Date;
  completedAt?: Date;
  results: unknown[];
  errors: string[];
}

export interface PedidoOperation {
  pedidoId: number;
  acao: 'criar' | 'atualizar' | 'cancelar' | 'atualizar_status';
  dados?: Record<string, unknown>;
  tenantId?: number;
  actorUserId?: number;
  actorVendedorId?: number;
}

export interface FinanceiroOperation {
  tipo: 'conta_receber' | 'conta_pagar';
  acao: 'criar' | 'atualizar' | 'baixar' | 'cancelar';
  dados: Record<string, unknown>;
}

/** Resultado bruto de insert/update MySQL2 (Drizzle). */
function readMysqlExecResult(result: unknown): { insertId?: number; affectedRows?: number } {
  if (Array.isArray(result) && result[0] && typeof result[0] === "object") {
    const r = result[0] as Record<string, unknown>;
    return {
      insertId: typeof r.insertId === "number" ? r.insertId : undefined,
      affectedRows: typeof r.affectedRows === "number" ? r.affectedRows : undefined,
    };
  }
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    return {
      insertId: typeof r.insertId === "number" ? r.insertId : undefined,
      affectedRows: typeof r.affectedRows === "number" ? r.affectedRows : undefined,
    };
  }
  return {};
}

/**
 * Ordem padrão das operações para evitar deadlock
 * 1. Pedidos (ordem crescente de ID)
 * 2. Estoque (ordem crescente de produto ID)
 * 3. Financeiro (contas a receber primeiro, depois pagar)
 */
const TRANSACTION_ORDER = {
  pedido: 1,
  estoque: 2,
  financeiro: 3,
} as const;

/**
 * Serviço para gerenciar transações seguras
 */
class SafeTransactionService {
  private static instance: SafeTransactionService;
  private activeTransactions: Map<string, SafeTransaction> = new Map();
  private resourceLocks: Map<string, Promise<SafeTransaction>> = new Map();
  private cleanupTimers: Map<string, NodeJS.Timeout> = new Map();
  
  // TODO: Implementar cleanup automático para prevenir memory leaks
  // - Limpar transações concluídas após timeout
  // - Limitar tamanho máximo do Map
  // - Adicionar verificação periódica

  private constructor() {}

  public static getInstance(): SafeTransactionService {
    if (!SafeTransactionService.instance) {
      SafeTransactionService.instance = new SafeTransactionService();
    }
    return SafeTransactionService.instance;
  }

  /**
   * Processa transação com lock em memória por recurso.
   * Impede execução concorrente sobre o mesmo pedidoId.
   */
  public async processTransaction(
    pedidoOp?: PedidoOperation,
    stockOps?: StockOperation[],
    financeiroOps?: FinanceiroOperation[]
  ): Promise<SafeTransaction> {
    const resourceKey = pedidoOp ? `pedido:${pedidoOp.pedidoId}` : 'global';
    const pending = this.resourceLocks.get(resourceKey);
    const run = (): Promise<SafeTransaction> =>
      this.executeNewTransaction(pedidoOp, stockOps, financeiroOps);
    // Serializa: sempre executa após qualquer tx anterior do mesmo recurso (ok ou erro).
    const chained: Promise<SafeTransaction> = pending ? pending.then(run, run) : run();
    this.resourceLocks.set(resourceKey, chained);
    try {
      return await chained;
    } finally {
      if (this.resourceLocks.get(resourceKey) === chained) {
        this.resourceLocks.delete(resourceKey);
      }
    }
  }

  /**
   * Lógica interna de execução — chamada exclusivamente pelo lock de processTransaction.
   */
  private async executeNewTransaction(
    pedidoOp?: PedidoOperation,
    stockOps?: StockOperation[],
    financeiroOps?: FinanceiroOperation[]
  ): Promise<SafeTransaction> {
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const transaction: SafeTransaction = {
      id: transactionId,
      steps: [],
      status: 'pending',
      createdAt: new Date(),
      results: [],
      errors: [],
    };

    try {
      logger.info('Iniciando transação segura', {
        transactionId,
        hasPedido: !!pedidoOp,
        stockOpsCount: stockOps?.length ?? 0,
        financeiroOpsCount: financeiroOps?.length ?? 0,
      });

      this.activeTransactions.set(transactionId, transaction);

      // Montar steps na ordem correta
      const steps = this.buildTransactionSteps(pedidoOp, stockOps, financeiroOps);
      transaction.steps = steps;

      // Processar transação
      await this.executeTransaction(transaction);

      logger.info('Transação segura concluída', {
        transactionId,
        status: transaction.status,
        stepsCount: steps.length,
        successCount: transaction.results.length,
        errorCount: transaction.errors.length,
      });

      return transaction;

    } catch (error) {
      logError({ message: 'Falha na transação segura' }, error instanceof Error ? error : new Error(String(error)));

      transaction.status = 'failed';
      transaction.errors.push(error instanceof Error ? error.message : 'Erro desconhecido');
      transaction.completedAt = new Date();

      return transaction;
    } finally {
      // Guardar handle para poder cancelar se cleanupOldTransactions agir antes do prazo.
      const cleanupHandle = setTimeout(() => {
        this.activeTransactions.delete(transactionId);
        this.cleanupTimers.delete(transactionId);
      }, 60_000);
      this.cleanupTimers.set(transactionId, cleanupHandle);
    }
  }

  /**
   * Monta steps na ordem correta para evitar deadlock
   */
  private buildTransactionSteps(
    pedidoOp?: PedidoOperation,
    stockOps?: StockOperation[],
    financeiroOps?: FinanceiroOperation[]
  ): TransactionStep[] {
    const steps: TransactionStep[] = [];

    // 1. Pedidos (ordem: 1)
    if (pedidoOp) {
      steps.push({
        type: 'pedido',
        order: TRANSACTION_ORDER.pedido,
        operation: pedidoOp.acao,
        data: pedidoOp,
      });
    }

    // 2. Estoque (ordem: 2) - ordenar por produto ID
    if (stockOps && stockOps.length > 0) {
      const sortedStockOps = [...stockOps].sort((a, b) => a.produtoId - b.produtoId);
      
      sortedStockOps.forEach((stockOp, index) => {
        steps.push({
          type: 'estoque',
          order: TRANSACTION_ORDER.estoque + (index * 0.1), // Ordem relativa
          operation: stockOp.tipo,
          data: stockOp,
        });
      });
    }

    // 3. Financeiro (ordem: 3) - contas a receber primeiro
    if (financeiroOps && financeiroOps.length > 0) {
      const sortedFinanceiroOps = [...financeiroOps].sort((a, b) => {
        // Contas a receber (receber) vêm antes de contas a pagar (pagar)
        if (a.tipo === 'conta_receber' && b.tipo === 'conta_pagar') return -1;
        if (a.tipo === 'conta_pagar' && b.tipo === 'conta_receber') return 1;
        return 0;
      });
      
      sortedFinanceiroOps.forEach((finOp, index) => {
        steps.push({
          type: 'financeiro',
          order: TRANSACTION_ORDER.financeiro + (index * 0.1), // Ordem relativa
          operation: finOp.acao,
          data: finOp,
        });
      });
    }

    // Ordenar final por order
    return steps.sort((a, b) => a.order - b.order);
  }

  /**
   * Executa transação step por step
   */
  private async executeTransaction(transaction: SafeTransaction): Promise<{ success: boolean; error?: string }> {
    transaction.status = 'processing';

    const db = await getDb();
    if (!db) {
      return { success: false, error: 'Database não disponível' };
    }

    await db.transaction(async (tx: DbTx) => {
      for (const step of transaction.steps) {
        try {
          const result = await this.executeStep(tx, step);
          transaction.results.push({
            step: step.type,
            operation: step.operation,
            success: true,
            result,
          });

        } catch (error) {
          const errorMsg = `Erro no step ${step.type}.${step.operation}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`;
          transaction.errors.push(errorMsg);
          
          logError({ message: 'Step falhou na transação' }, error instanceof Error ? error : new Error(String(error)));

          // Continuar processando outros steps (pode ser configurável)
          // Por ora, continuamos para maximizar sucesso parcial
        }
      }
    });

    // Determinar status final
    if (transaction.errors.length === 0) {
      transaction.status = 'completed';
    } else if (transaction.results.length > 0) {
      transaction.status = 'partial'; // Sucesso parcial
    } else {
      transaction.status = 'failed';
    }

    transaction.completedAt = new Date();
    
    return { success: true };
  }

  /**
   * Executa step individual
   */
  private async executeStep(tx: DbTx, step: TransactionStep): Promise<Record<string, unknown>> {
    switch (step.type) {
      case 'pedido':
        return await this.executePedidoStep(tx, step);
      
      case 'estoque':
        return await this.executeEstoqueStep(tx, step);
      
      case 'financeiro':
        return await this.executeFinanceiroStep(tx, step);
      
      default:
        return { success: false, error: `Tipo de step desconhecido: ${step.type}` };
    }
  }

  /**
   * Executa operação de pedido
   */
  private async executePedidoStep(tx: DbTx, step: TransactionStep): Promise<Record<string, unknown>> {
    const pedidoOp = step.data as unknown as PedidoOperation;
    
    switch (step.operation) {
      case 'criar':
        return await this.criarPedido(tx, pedidoOp);
      
      case 'atualizar':
        return await this.atualizarPedido(tx, pedidoOp);
      
      case 'cancelar':
        return await this.cancelarPedido(tx, pedidoOp);
      
      case 'atualizar_status':
        return await this.atualizarStatusPedido(tx, pedidoOp);
      
      default:
        return { success: false, error: `Operação de pedido desconhecida: ${step.operation}` };
    }
  }

  /**
   * Executa operação de estoque
   */
  private async executeEstoqueStep(tx: DbTx, step: TransactionStep): Promise<Record<string, unknown>> {
    const stockOp = step.data as unknown as StockOperation;
    
    // Usar o serviço de estoque seguro dentro da transação
    const result = await processStockOperation(stockOp);
    
    if (!result.success) {
      return { success: false, error: `Falha na operação de estoque: ${result.message}` };
    }
    
    return result as unknown as Record<string, unknown>;
  }

  /**
   * Executa operação financeira
   */
  private async executeFinanceiroStep(tx: DbTx, step: TransactionStep): Promise<Record<string, unknown>> {
    const finOp = step.data as unknown as FinanceiroOperation;
    
    switch (finOp.tipo) {
      case 'conta_receber':
        return await this.executeContaReceberStep(tx, finOp);
      
      case 'conta_pagar':
        return await this.executeContaPagarStep(tx, finOp);
      
      default:
        return { success: false, error: `Tipo financeiro desconhecido: ${finOp.tipo}` };
    }
  }

  /**
   * Criar pedido
   */
  private async criarPedido(tx: DbTx, pedidoOp: PedidoOperation): Promise<Record<string, unknown>> {
    // Implementação específica para criar pedido
    // Por enquanto, simulação
    const result = await tx.insert(pedidos).values({
      ...pedidoOp.dados,
      status: PedidoStatus.GERADO,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const meta = readMysqlExecResult(result);
    
    // Auditoria de criação de pedido
    await logAuditAction(
      "create",
      "pedidos",
      { 
        pedidoId: meta.insertId,
        dados: pedidoOp.dados,
        operation: 'criar_pedido'
      },
      {
        tenantId: pedidoOp.tenantId || 1,
        entityId: meta.insertId != null ? String(meta.insertId) : undefined,
        actorUserId: pedidoOp.actorUserId,
        actorVendedorId: pedidoOp.actorVendedorId
      }
    );
    
    return {
      success: true,
      pedidoId: meta.insertId,
      operation: 'criar_pedido',
    };
  }

  /**
   * Atualizar pedido
   */
  private async atualizarPedido(tx: DbTx, pedidoOp: PedidoOperation): Promise<Record<string, unknown>> {
    const result = await tx
      .update(pedidos)
      .set({
        ...pedidoOp.dados,
        updatedAt: new Date(),
      } as never)
      .where(eq(pedidos.id, pedidoOp.pedidoId));

    const meta = readMysqlExecResult(result);
    
    // Auditoria de atualização de pedido
    await logAuditAction(
      "update",
      "pedidos",
      { 
        pedidoId: pedidoOp.pedidoId,
        dados: pedidoOp.dados,
        operation: 'atualizar_pedido'
      },
      {
        tenantId: pedidoOp.tenantId || 1,
        entityId: pedidoOp.pedidoId.toString(),
        actorUserId: pedidoOp.actorUserId,
        actorVendedorId: pedidoOp.actorVendedorId
      }
    );
    
    return {
      success: true,
      pedidoId: pedidoOp.pedidoId,
      operation: 'atualizar_pedido',
      affectedRows: meta.affectedRows,
    };
  }

  /**
   * Cancelar pedido
   */
  private async cancelarPedido(tx: DbTx, pedidoOp: PedidoOperation): Promise<Record<string, unknown>> {
    const motivo = pedidoOp.dados?.motivo;
    const result = await tx
      .update(pedidos)
      .set({
        status: PedidoStatus.CANCELADO,
        observacoes: typeof motivo === "string" ? motivo : undefined,
        updatedAt: new Date(),
      })
      .where(eq(pedidos.id, pedidoOp.pedidoId));

    const meta = readMysqlExecResult(result);
    
    // Auditoria de cancelamento de pedido
    await logAuditAction(
      "cancel",
      "pedidos",
      { 
        pedidoId: pedidoOp.pedidoId,
        motivo: pedidoOp.dados?.motivo,
        operation: 'cancelar_pedido'
      },
      {
        tenantId: pedidoOp.tenantId || 1,
        entityId: pedidoOp.pedidoId.toString(),
        actorUserId: pedidoOp.actorUserId,
        actorVendedorId: pedidoOp.actorVendedorId
      }
    );
    
    return {
      success: true,
      pedidoId: pedidoOp.pedidoId,
      operation: 'cancelar_pedido',
      affectedRows: meta.affectedRows,
    };
  }

  /**
   * Atualizar status do pedido
   */
  private async atualizarStatusPedido(tx: DbTx, pedidoOp: PedidoOperation): Promise<Record<string, unknown>> {
    const novoStatus = validateStatus(pedidoOp.dados?.status, PedidoStatusValues, "pedido.status");
    const result = await tx
      .update(pedidos)
      .set({
        status: novoStatus,
        updatedAt: new Date(),
      })
      .where(eq(pedidos.id, pedidoOp.pedidoId));

    const meta = readMysqlExecResult(result);
    return {
      success: true,
      pedidoId: pedidoOp.pedidoId,
      operation: 'atualizar_status_pedido',
      affectedRows: meta.affectedRows,
    };
  }

  /**
   * Executar operação de conta a receber
   */
  private async executeContaReceberStep(tx: DbTx, finOp: FinanceiroOperation): Promise<Record<string, unknown>> {
    switch (finOp.acao) {
      case 'criar':
        const result = await tx.insert(contasReceber).values({
          ...finOp.dados,
          status: ContaReceberStatus.PENDENTE,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as never);
        const meta = readMysqlExecResult(result);
        return {
          success: true,
          contaId: meta.insertId,
          operation: 'criar_conta_receber',
        };
      
      case 'baixar': {
        const contaId = finOp.dados.id;
        if (typeof contaId !== "number" || !Number.isInteger(contaId) || contaId <= 0) {
          return { success: false, error: "conta a receber: id inválido" };
        }
        const updateResult = await tx.update(contasReceber).set({
            status: ContaReceberStatus.RECEBIDA,
            dataRecebimento: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(contasReceber.id, contaId));
        const metaUp = readMysqlExecResult(updateResult);
        return {
          success: true,
          operation: 'baixar_conta_receber',
          affectedRows: metaUp.affectedRows,
        };
      }
      
      default:
        return { success: false, error: `Operação de conta a receber desconhecida: ${finOp.acao}` };
    }
  }

  /**
   * Executar operação de conta a pagar
   */
  private async executeContaPagarStep(tx: DbTx, finOp: FinanceiroOperation): Promise<Record<string, unknown>> {
    switch (finOp.acao) {
      case 'criar':
        const result = await tx.insert(contasPagar).values({
          ...finOp.dados,
          status: ContaPagarStatus.PENDENTE,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as never);
        const meta = readMysqlExecResult(result);
        return {
          success: true,
          contaId: meta.insertId,
          operation: 'criar_conta_pagar',
        };
      
      case 'baixar': {
        const contaPagarId = finOp.dados.id;
        if (typeof contaPagarId !== "number" || !Number.isInteger(contaPagarId) || contaPagarId <= 0) {
          return { success: false, error: "conta a pagar: id inválido" };
        }
        const updateResult = await tx.update(contasPagar).set({
            status: ContaPagarStatus.PAGO,
            dataPagamento: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(contasPagar.id, contaPagarId));
        const metaUp = readMysqlExecResult(updateResult);
        return {
          success: true,
          operation: 'baixar_conta_pagar',
          affectedRows: metaUp.affectedRows,
        };
      }
      
      default:
        return { success: false, error: `Operação de conta a pagar desconhecida: ${finOp.acao}` };
    }
  }

  /**
   * Obtém status de uma transação
   */
  public getTransactionStatus(transactionId: string): SafeTransaction | null {
    return this.activeTransactions.get(transactionId) || null;
  }

  /**
   * Lista transações ativas
   */
  public getActiveTransactions(): SafeTransaction[] {
    return Array.from(this.activeTransactions.values());
  }

  /**
   * Limpa transações antigas
   */
  public cleanupOldTransactions(maxAgeMs: number = 3600000): void { // 1 hora padrão
    const cutoffTime = Date.now() - maxAgeMs;
    const toDelete: string[] = [];

    for (const [id, transaction] of Array.from(this.activeTransactions)) {
      if (transaction.createdAt.getTime() < cutoffTime) {
        toDelete.push(id);
      }
    }

    toDelete.forEach(id => {
      const handle = this.cleanupTimers.get(id);
      if (handle !== undefined) {
        clearTimeout(handle);
        this.cleanupTimers.delete(id);
      }
      this.activeTransactions.delete(id);
    });

    if (toDelete.length > 0) {
      logger.info('Transações antigas limpas', {
        count: toDelete.length,
        maxAge: maxAgeMs,
      });
    }
  }
}

// Exportar instância singleton
export const safeTransactionService = SafeTransactionService.getInstance();

// Exportar funções de utilidade
export async function processSafeTransaction(
  pedidoOp?: PedidoOperation,
  stockOps?: StockOperation[],
  financeiroOps?: FinanceiroOperation[]
): Promise<SafeTransaction> {
  return safeTransactionService.processTransaction(pedidoOp, stockOps, financeiroOps);
}
