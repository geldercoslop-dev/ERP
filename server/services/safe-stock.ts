/**
 * Serviço de Controle de Estoque Seguro - Safe Stock Service
 * 
 * Implementa atomicidade e controle de concorrência para operações de estoque
 * Previne estoque negativo e garante consistência dos dados
 */

import { getDb, getInsertId } from '../db/index.js';
import { eq, sql } from 'drizzle-orm';
import { produtos } from "../../drizzle/schema.ts";
import { logger, logError, logInfo } from '../utils/logger.js';
import { InfrastructureError } from '../_core/errors/typed-errors.js';

// Type REAL da transaction Drizzle
import type { Database } from '../db/core.js';
type DbTx = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface StockOperation {
  tenantId: number;
  produtoId: number;
  quantidade: number;
  tipo: 'entrada' | 'saida';
  motivo?: string;
  usuarioId?: number;
  vendedorId?: number;
  traceId?: string;
}

export interface StockOperationResult {
  success: boolean;
  produtoId: number;
  saldoAnterior: number;
  saldoNovo: number;
  quantidadeProcessada: number;
  message: string;
  traceId?: string;
}

export interface StockLock {
  produtoId: number;
  lockedBy: string;
  lockedAt: Date;
  expiresAt: Date;
}

/**
 * Erro personalizado para operações de estoque
 */
export class StockError extends Error {
  public code: string;
  public produtoId: number;
  public saldoAtual: number;
  public quantidadeSolicitada: number;

  constructor(
    message: string,
    code: string,
    produtoId: number,
    saldoAtual: number,
    quantidadeSolicitada: number
  ) {
    super(message);
    this.name = 'StockError';
    this.code = code;
    this.produtoId = produtoId;
    this.saldoAtual = saldoAtual;
    this.quantidadeSolicitada = quantidadeSolicitada;
  }
}

/**
 * Serviço para controle seguro de estoque
 */
class SafeStockService {
  private static instance: SafeStockService;
  private locks: Map<number, StockLock> = new Map();
  private lockTimeoutMs: number = 30000; // 30 segundos
  
  // TODO: Implementar cleanup automático de locks expirados
  // - Verificar periodicamente locks antigos
  // - Remover locks após timeout
  // - Prevenir memory leak em cenários de alta concorrência

  private constructor() {}

  public static getInstance(): SafeStockService {
    if (!SafeStockService.instance) {
      SafeStockService.instance = new SafeStockService();
    }
    return SafeStockService.instance;
  }

  /**
   * Processa operação de estoque com atomicidade garantida
   */
  public async processStockOperation(operation: StockOperation): Promise<StockOperationResult> {
    const traceId = operation.traceId || `stock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      logInfo('Processando operação de estoque', {
        traceId,
        produtoId: operation.produtoId,
        quantidade: operation.quantidade,
        tipo: operation.tipo,
      });

      const db = await getDb();
      if (!db) {
        return {
          success: false,
          produtoId: operation.produtoId,
          saldoAnterior: 0,
          saldoNovo: 0,
          quantidadeProcessada: 0,
          message: 'Database não disponível',
          traceId
        };
      }

      // Processar dentro de transação
      const result = await db.transaction(async (tx: DbTx) => {
        // 1. Bloquear o produto para evitar concorrência
        const produto = await this.lockProduct(tx, operation.tenantId, operation.produtoId);
        
        if (!produto) {
          throw new StockError(
            `Produto ${operation.produtoId} não encontrado`,
            'PRODUTO_NAO_ENCONTRADO',
            operation.produtoId,
            0,
            operation.quantidade
          );
        }

        const saldoAnterior = Number(produto.estoque || 0);

        // 2. Validar operação
        this.validateOperation(operation, saldoAnterior);

        // 3. Calcular novo saldo
        const saldoNovo = this.calculateNewSaldo(saldoAnterior, operation);

        // 4. Executar update atômico
        const updateResult = await this.executeAtomicUpdate(tx,
          operation.tenantId,
          operation.produtoId,
          saldoAnterior,
          operation.quantidade,
          operation.tipo
        );

        if (!updateResult.success) {
          throw new StockError(
            updateResult.message,
            'FALHA_UPDATE_ATOMIC',
            operation.produtoId,
            saldoAnterior,
            operation.quantidade
          );
        }

        // 5. Retornar resultado
        return {
          success: true,
          produtoId: operation.produtoId,
          saldoAnterior,
          saldoNovo,
          quantidadeProcessada: operation.quantidade,
          message: `Operação ${operation.tipo} processada com sucesso`,
          traceId,
        };
      });

      logInfo('Operação de estoque processada com sucesso', {
        traceId,
        produtoId: operation.produtoId,
        saldoAnterior: result.saldoAnterior,
        saldoNovo: result.saldoNovo,
      });

      return result;

    } catch (error) {
      logError('Falha na operação de estoque', error as Error);

      if (error instanceof StockError) {
        return {
          success: false,
          produtoId: error.produtoId,
          saldoAnterior: error.saldoAtual,
          saldoNovo: error.saldoAtual,
          quantidadeProcessada: 0,
          message: error.message,
          traceId,
        };
      }

      return {
        success: false,
        produtoId: operation.produtoId,
        saldoAnterior: 0,
        saldoNovo: 0,
        quantidadeProcessada: 0,
        message: error instanceof Error ? error.message : 'Erro desconhecido',
        traceId,
      };
    }
  }

  /**
   * Bloqueia produto para operação (SELECT FOR UPDATE)
   */
  private async lockProduct(tx: DbTx, tenantId: number, produtoId: number): Promise<Record<string, unknown> | null> {
    try {
      // Usar prepared statement para maior segurança e controle
      const runner = tx as {
        execute: (q: string, p?: ReadonlyArray<unknown>) => Promise<[unknown, unknown]>;
      };
      const [rows] = await runner.execute(
        "SELECT * FROM produtos WHERE tenant_id = ? AND id = ? FOR UPDATE WAIT 5",
        [tenantId, produtoId]
      );
      
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        return null;
      }
      
      return rows[0] as Record<string, unknown>;
    } catch (error) {
      // Melhorar mensagem de erro para diagnóstico
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Lock wait timeout')) {
        return null;
      }
      return null;
    }
  }

  /**
   * Valida se operação é permitida
   */
  private validateOperation(operation: StockOperation, saldoAtual: number): void {
    if (operation.tipo === 'saida' && operation.quantidade > saldoAtual) {
      throw new StockError(
        `Estoque insuficiente. Saldo atual: ${saldoAtual}, solicitado: ${operation.quantidade}`,
        'ESTOQUE_INSUFICIENTE',
        operation.produtoId,
        saldoAtual,
        operation.quantidade
      );
    }

    if (operation.quantidade <= 0) {
      throw new StockError(
        `Quantidade deve ser positiva. Recebido: ${operation.quantidade}`,
        'QUANTIDADE_INVALIDA',
        operation.produtoId,
        saldoAtual,
        operation.quantidade
      );
    }
  }

  /**
   * Calcula novo saldo baseado na operação
   */
  private calculateNewSaldo(saldoAnterior: number, operation: StockOperation): number {
    if (operation.tipo === 'entrada') {
      return saldoAnterior + operation.quantidade;
    } else {
      return saldoAnterior - operation.quantidade;
    }
  }

  /**
   * Executa update atômico com verificação de concorrência
   */
  private async executeAtomicUpdate(
    tx: DbTx,
    tenantId: number,
    produtoId: number,
    saldoAnterior: number,
    quantidade: number,
    tipo: 'entrada' | 'saida'
  ): Promise<{ success: boolean; message: string }> {
    try {
      let result;

      // Primeiro obter o estoque atual
      const produtoAtual = await tx.select({ estoque: produtos.estoque })
        .from(produtos)
        .where(sql`${produtos.tenantId} = ${tenantId} AND ${produtos.id} = ${produtoId}`)
        .limit(1);
      
      if (produtoAtual.length === 0) {
        return {
          success: false,
          message: `Produto não encontrado: ID ${produtoId}`
        };
      }
      
      const estoqueAtual = Number(produtoAtual[0].estoque || 0);
      
      if (tipo === 'entrada') {
        // Para entrada, simplesmente soma
        const novoEstoque = estoqueAtual + quantidade;
        result = await tx
          .update(produtos)
          .set({ 
            estoque: novoEstoque,
            updatedAt: new Date()
          })
          .where(sql`${produtos.tenantId} = ${tenantId} AND ${produtos.id} = ${produtoId}`);
      } else {
        // Para saída, verifica se ainda tem estoque suficiente
        if (estoqueAtual < quantidade) {
          return {
            success: false,
            message: `Estoque insuficiente: disponível ${estoqueAtual}, solicitado ${quantidade}`
          };
        }
        
        const novoEstoque = estoqueAtual - quantidade;
        result = await tx
          .update(produtos)
          .set({ 
            estoque: novoEstoque,
            updatedAt: new Date()
          })
          .where(sql`${produtos.tenantId} = ${tenantId} AND ${produtos.id} = ${produtoId}`);
      }

      const dbResult = Array.isArray(result) ? result[0] : result;
      const affectedRows = (dbResult && typeof dbResult === "object" && 'affectedRows' in dbResult && typeof dbResult.affectedRows === "number") ? dbResult.affectedRows : 0;

      if (affectedRows === 0) {
        return {
          success: false,
          message: tipo === 'saida' 
            ? 'Estoque insuficiente ou produto não encontrado' 
            : 'Produto não encontrado',
        };
      }

      return {
        success: true,
        message: 'Update executado com sucesso',
      };

    } catch (error) {
      return {
        success: false,
        message: `Erro no update: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      };
    }
  }

  /**
   * Processa múltiplas operações de estoque em lote (transação única)
   */
  public async processBatchStockOperations(
    operations: StockOperation[]
  ): Promise<StockOperationResult[]> {
    const traceId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      logInfo('Processando lote de operações de estoque', {
        traceId,
        operationsCount: operations.length,
      });

      const db = await getDb();
      if (!db) {
        throw new InfrastructureError('Banco de dados indisponível para operações de estoque');
      }

      // IMPORTANTE: Ordenar operações por produtoId para evitar deadlock
      // Esta ordenação é crítica para garantir que locks sejam adquiridos sempre na mesma ordem
      // em todas as transações, evitando deadlocks
      const sortedOperations = [...operations].sort((a: StockOperation, b: StockOperation) => a.produtoId - b.produtoId);

      const results = await db.transaction(async (tx: DbTx) => {
        const batchResults: StockOperationResult[] = [];

        for (const operation of sortedOperations) {
          try {
            const result = await this.processSingleOperationInTransaction(
              tx,
              operation,
              traceId
            );
            batchResults.push(result);
          } catch (error) {
            batchResults.push({
              success: false,
              produtoId: operation.produtoId,
              saldoAnterior: 0,
              saldoNovo: 0,
              quantidadeProcessada: 0,
              message: error instanceof Error ? error.message : 'Erro desconhecido',
              traceId,
            });
          }
        }

        return batchResults;
      });

      const successCount = results.filter((r: StockOperationResult) => r.success).length;
      const failureCount = results.length - successCount;

      logInfo('Lote de operações processado', {
        traceId,
        total: results.length,
        success: successCount,
        failures: failureCount,
      });

      return results;

    } catch (error) {
      logError('Falha no processamento em lote', error as Error);

      // Retornar todos como falha
      return operations.map((op: StockOperation) => ({
        success: false,
        produtoId: op.produtoId,
        saldoAnterior: 0,
        saldoNovo: 0,
        quantidadeProcessada: 0,
        message: error instanceof Error ? error.message : 'Erro no lote',
        traceId,
      }));
    }
  }

  /**
   * Processa operação individual dentro de transação existente
   */
  private async processSingleOperationInTransaction(
    tx: DbTx,
    operation: StockOperation,
    traceId: string
  ): Promise<StockOperationResult> {
    // Bloquear produto
    const produto = await this.lockProduct(tx, operation.tenantId, operation.produtoId);
    
    if (!produto) {
      throw new StockError(
        `Produto ${operation.produtoId} não encontrado`,
        'PRODUTO_NAO_ENCONTRADO',
        operation.produtoId,
        0,
        operation.quantidade
      );
    }

    const saldoAnterior = Number(produto.estoque || 0);

    // Validar
    this.validateOperation(operation, saldoAnterior);

    // Executar update
    const updateResult = await this.executeAtomicUpdate(
      tx,
      operation.tenantId,
      operation.produtoId,
      saldoAnterior,
      operation.quantidade,
      operation.tipo
    );

    if (!updateResult.success) {
      throw new StockError(
        updateResult.message,
        'FALHA_UPDATE_ATOMIC',
        operation.produtoId,
        saldoAnterior,
        operation.quantidade
      );
    }

    const saldoNovo = this.calculateNewSaldo(saldoAnterior, operation);

    return {
      success: true,
      produtoId: operation.produtoId,
      saldoAnterior,
      saldoNovo,
      quantidadeProcessada: operation.quantidade,
      message: `Operação ${operation.tipo} processada com sucesso`,
      traceId,
    };
  }

  /**
   * Verifica saldo atual de um produto
   */
  public async checkStock(tenantId: number, produtoId: number): Promise<{
    produtoId: number;
    saldo: number;
    disponivel: boolean;
  } | null> {
    try {
      const db = await getDb();
      if (!db) return null;

      const produtosData = await db
        .select({ id: produtos.id, estoque: produtos.estoque })
        .from(produtos)
        .where(sql`${produtos.tenantId} = ${tenantId} AND ${produtos.id} = ${produtoId}`)
        .limit(1);

      if (produtosData.length === 0) return null;

      const produto = produtosData[0];
      const saldo = Number(produto.estoque || 0);

      return {
        produtoId,
        saldo,
        disponivel: saldo > 0,
      };

    } catch (error) {
      logError({ message: 'Falha ao verificar estoque' }, error as Error);
      return null;
    }
  }

  /**
   * Limpa locks expirados
   */
  public cleanupExpiredLocks(): void {
    const now = Date.now();
    const expired: number[] = [];

    for (const [produtoId, lock] of Array.from(this.locks)) {
      if (lock.expiresAt.getTime() < now) {
        expired.push(produtoId);
      }
    }

    expired.forEach(produtoId => {
      this.locks.delete(produtoId);
    });

    if (expired.length > 0) {
      logInfo({ message: 'Locks de estoque expirados limpos', count: expired.length, produtos: expired });
    }
  }
}

// Exportar instância singleton
export const safeStockService = SafeStockService.getInstance();

// Exportar funções de utilidade
export async function processStockOperation(
  operation: StockOperation
): Promise<StockOperationResult> {
  return safeStockService.processStockOperation(operation);
}

export async function processBatchStockOperations(
  operations: StockOperation[]
): Promise<StockOperationResult[]> {
  return safeStockService.processBatchStockOperations(operations);
}

export async function checkStock(tenantId: number, produtoId: number): Promise<{
  produtoId: number;
  saldo: number;
  disponivel: boolean;
} | null> {
  return safeStockService.checkStock(tenantId, produtoId);
}
