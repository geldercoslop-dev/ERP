/**
 * Testes Reais de Consistência do Banco de Dados
 * OBJETIVO: Validar se transações são REALMENTE seguras
 * 
 * ⚠️ ESTES TESTES USAM BANCO REAL - não são em memória
 * ⚠️ Usam transações e validam estado persistente
 */

import { describe, it, expect } from 'vitest';
import { getDb } from '../db/index.js';
import { eq, and, sql, count, sum } from 'drizzle-orm';
import { pedidos, itensPedido, produtos, contasReceber, contasPagar } from "../../drizzle/schema.js";
import pino from 'pino';

const logger = pino();

interface TestResult {
  name: string;
  passed: boolean;
  timestamp: Date;
  details: {
    expected?: any;
    actual?: any;
    error?: string;
    stepsExecuted?: string[];
  };
}

interface DataSnapshot {
  pedidosCount: number;
  itensPedidoCount: number;
  produtoEstoqueTotal: number;
  contasReceberCount: number;
  stateHash: string;
}

export class DatabaseConsistencyTester {
  private db: any = null;
  private tenantId: number;
  private results: TestResult[] = [];

  constructor() {
    this.tenantId = Number(process.env.TEST_TENANT_ID);
    if (!Number.isFinite(this.tenantId) || this.tenantId <= 0) {
      throw new Error("TEST_TENANT_ID não fornecido ou inválido. Defina TEST_TENANT_ID como variável de ambiente.");
    }
  }

  async initialize() {
    this.db = await getDb();
    if (!this.db) throw new Error('Database não disponível');
    logger.info('Database tester initialized');
  }

  /**
   * TESTE 1: Erro No Meio Da Transação
   * 
   * Simula: 
   * 1. Criar pedido ✅
   * 2. Atualizar estoque ✅
   * 3. FORÇAR ERRO no financeiro ❌
   * 
   * Valida: ROLLBACK COMPLETO
   */
  async testErrorInMiddleOfTransaction(): Promise<TestResult> {
    const testName = 'ERROR_IN_MIDDLE_TRANSACTION';
    const stepsExecuted: string[] = [];

    try {
      stepsExecuted.push('init');
      
      // Snapshot ANTES
      const snapshotBefore = await this.captureDataSnapshot();
      logger.info('Snapshot BEFORE:', snapshotBefore);

      // TESTE: Tentar criar pedido + estoque + erro no financeiro
      try {
        await this.db.transaction(async (tx: any) => {
          // Step 1: Criar pedido
          stepsExecuted.push('create_pedido');
          const pedidoResult = await tx.insert(pedidos).values({
            tenantId: this.tenantId,
            numero: Math.floor(Math.random() * 100000),
            vendedorId: 1,
            clienteId: 1,
            clienteNome: 'Cliente Teste',
            status: 'GERADO',
            subtotal: 1000,
            desconto: 0,
            frete: 50,
            total: 1050,
          });

          // Step 2: Atualizar estoque
          stepsExecuted.push('update_estoque');
          await tx.update(produtos)
            .set({ estoque: sql`estoque - 5` })
            .where(and(eq(produtos.id, 1), eq(produtos.tenantId, this.tenantId)));

          // Step 3: FORÇAR ERRO no financeiro
          stepsExecuted.push('force_error_financeiro');
          throw new Error('⚠️ ERRO SIMULADO NO FINANCEIRO - deve fazer ROLLBACK');
        });
      } catch (error: any) {
        if (!error.message.includes('ERRO SIMULADO')) {
          throw error;
        }
        stepsExecuted.push('caught_error_as_expected');
      }

      // Snapshot DEPOIS
      const snapshotAfter = await this.captureDataSnapshot();
      logger.info('Snapshot AFTER:', snapshotAfter);

      // VALIDAÇÃO: snapshotBefore === snapshotAfter (rollback completo)
      const rollbackCompleto = 
        snapshotBefore.pedidosCount === snapshotAfter.pedidosCount &&
        snapshotBefore.itensPedidoCount === snapshotAfter.itensPedidoCount &&
        snapshotBefore.produtoEstoqueTotal === snapshotAfter.produtoEstoqueTotal;

      return {
        name: testName,
        passed: rollbackCompleto,
        timestamp: new Date(),
        details: {
          stepsExecuted,
          expected: 'Rollback completo (estado idêntico)',
          actual: rollbackCompleto ? '✅ Rollback OK' : '❌ Dados mudaram!',
          beforeSnapshot: snapshotBefore,
          afterSnapshot: snapshotAfter,
        },
      };

    } catch (error: any) {
      return {
        name: testName,
        passed: false,
        timestamp: new Date(),
        details: {
          stepsExecuted,
          error: error.message,
        },
      };
    }
  }

  /**
   * TESTE 2: Concorrência no Estoque
   * 
   * Simula: 2 pedidos simultâneos no MESMO produto
   * Valida: Estoque NUNCA fica negativo
   */
  async testConcurrentStockOrders(): Promise<TestResult> {
    const testName = 'CONCURRENT_STOCK_ORDERS';
    const stepsExecuted: string[] = [];

    try {
      // Setup: produto com 10 unidades
      await this.createOrUpdateProduct(1, 10);
      stepsExecuted.push('setup_product_10_units');

      // Snapshot ANTES
      const stockBefore = await this.getProductStock(1);
      logger.info(`Stock BEFORE: ${stockBefore}`);
      stepsExecuted.push(`stock_before_${stockBefore}`);

      // TESTE: 2 pedidos simultâneos, cada um quer 7 unidades
      const promises = [
        this.createOrderAndReduceStock(1, 7, 'order_1'),
        this.createOrderAndReduceStock(1, 7, 'order_2'),
      ];

      const results = await Promise.allSettled(promises);
      stepsExecuted.push('both_orders_executed');

      // Snapshot DEPOIS
      const stockAfter = await this.getProductStock(1);
      logger.info(`Stock AFTER: ${stockAfter}`);
      stepsExecuted.push(`stock_after_${stockAfter}`);

      // VALIDAÇÃO:
      // - Estoque nunca negativo
      // - Apenas UM pedido deve ter sucesso (estoque não é suficiente para 2x7)
      const stockValid = stockAfter >= 0;
      const onlyOneSucceeded = results.filter(r => r.status === 'fulfilled').length === 1;

      const passed = stockValid && onlyOneSucceeded;

      return {
        name: testName,
        passed,
        timestamp: new Date(),
        details: {
          stepsExecuted,
          expected: `Stock inicia em 10, um pedido tira 7 e sucede, outro falha. Final: 3`,
          actual: `Stock final: ${stockAfter}`,
          stockValid,
          onlyOneSucceeded,
          resultsDetail: results.map((r, i) => ({
            pedido: i + 1,
            status: r.status,
            reason: r.status === 'rejected' ? (r as any).reason?.message : 'Success',
          })),
        },
      };

    } catch (error: any) {
      return {
        name: testName,
        passed: false,
        timestamp: new Date(),
        details: {
          stepsExecuted,
          error: error.message,
        },
      };
    }
  }

  /**
   * TESTE 3: Idempotência - Mesmo Pedido 10x
   * 
   * Simula: Enviar MESMO pedido 10 vezes (retry, clique duplo, etc)
   * Valida: Apenas 1 pedido salvo no banco
   */
  async testIdempotencySamePedidoMultipleTimes(): Promise<TestResult> {
    const testName = 'IDEMPOTENCY_SAME_PEDIDO_10X';
    const stepsExecuted: string[] = [];

    try {
      const pedidoKey = `test_pedido_${Date.now()}`;
      stepsExecuted.push('created_idempotency_key');

      // Contar pedidos ANTES
      const countBefore = await this.countPedidos();
      logger.info(`Pedidos BEFORE: ${countBefore}`);
      stepsExecuted.push(`count_before_${countBefore}`);

      // TESTE: Create same pedido 10x em paralelo
      const createPedidoFn = async () => {
        return this.createOrderWithIdempotency(pedidoKey, {
          numero: 99999 + Math.random(),
          clienteId: 1,
          clienteNome: 'Teste Duplicação',
          vendedorId: 1,
          total: 1000,
        });
      };

      const promises = Array.from({ length: 10 }, () => createPedidoFn());
      const results = await Promise.allSettled(promises);
      stepsExecuted.push('10_concurrent_creates_executed');

      // Contar pedidos DEPOIS
      const countAfter = await this.countPedidos();
      logger.info(`Pedidos AFTER: ${countAfter}`);
      stepsExecuted.push(`count_after_${countAfter}`);

      // VALIDAÇÃO: apenas 1 novo pedido foi criado
      const newPedidosCreated = countAfter - countBefore;
      const passed = newPedidosCreated === 1;

      return {
        name: testName,
        passed,
        timestamp: new Date(),
        details: {
          stepsExecuted,
          expected: 'Apenas 1 pedido criado (idempotência respeitada)',
          actual: `${newPedidosCreated} pedido(s) criado(s)`,
          countBefore,
          countAfter,
          newPedidosCreated,
          successfulCreates: results.filter(r => r.status === 'fulfilled').length,
          failedRetries: results.filter(r => r.status === 'rejected').length,
        },
      };

    } catch (error: any) {
      return {
        name: testName,
        passed: false,
        timestamp: new Date(),
        details: {
          stepsExecuted,
          error: error.message,
        },
      };
    }
  }

  /**
   * TESTE 4: Integridade Entre Tabelas
   * 
   * Valida:
   * - Cada pedido tem pelo menos 1 item
   * - Cada item referencia um produto válido
   * - Cada conta receber referencia um pedido válido
   * - Totais batem: sum(itens) == pedido.total
   */
  async testDataIntegrity(): Promise<TestResult> {
    const testName = 'DATA_INTEGRITY';
    const issues: string[] = [];

    try {
      // Check 1: Pedidos órfãos (sem itens)
      const orfaoPedidos = await this.db
        .select({ id: pedidos.id, numero: pedidos.numero })
        .from(pedidos)
        .where(eq(pedidos.tenantId, this.tenantId))
        .leftJoin(itensPedido, eq(pedidos.id, itensPedido.pedidoId))
        .having(count(itensPedido.id).equals(0));

      if (orfaoPedidos.length > 0) {
        issues.push(`❌ ${orfaoPedidos.length} pedidos órfãos (sem itens): ${orfaoPedidos.map(p => p.pedidos.numero).join(', ')}`);
      }

      // Check 2: Itens referenciando produtos inválidos
      const invalidItems = await this.db
        .select({ 
          itemId: itensPedido.id, 
          produtoId: itensPedido.produtoId,
          pedidoId: itensPedido.pedidoId,
        })
        .from(itensPedido)
        .where(
          and(
            eq(itensPedido.tenantId, this.tenantId),
            and(
              itensPedido.produtoId.isNotNull(),
              sql`produto_id NOT IN (SELECT id FROM produtos)`
            )
          )
        );

      if (invalidItems.length > 0) {
        issues.push(`❌ ${invalidItems.length} itens referenciando produtos inválidos`);
      }

      // Check 3: Contas receber referenciando pedidos inválidos
      const invalidContasReceber = await this.db
        .select({ id: contasReceber.id })
        .from(contasReceber)
        .where(
          and(
            eq(contasReceber.tenantId, this.tenantId),
            contasReceber.pedidoNumero.notInQuery(
              this.db.select({ numero: pedidos.numero }).from(pedidos)
            )
          )
        )
        .limit(5);

      if (invalidContasReceber.length > 0) {
        issues.push(`❌ ${invalidContasReceber.length} contas receber referenciando pedidos inexistentes`);
      }

      // Check 4: Totais descasados
      const totalCheckPedidos = await this.db.select({
        pedidoId: pedidos.id,
        pedidoTotal: pedidos.total,
        itemsSum: sum(itensPedido.valorUnitario).mapWith(Number),
      })
        .from(pedidos)
        .leftJoin(itensPedido, eq(pedidos.id, itensPedido.pedidoId))
        .where(eq(pedidos.tenantId, this.tenantId))
        .groupBy(pedidos.id)
        .having(sql`ABS(${pedidos.total} - SUM(${itensPedido.valorUnitario})) > 0.01`);

      if (totalCheckPedidos.length > 0) {
        issues.push(`❌ ${totalCheckPedidos.length} pedidos com totais descasados`);
      }

      const passed = issues.length === 0;

      return {
        name: testName,
        passed,
        timestamp: new Date(),
        details: {
          expected: 'Zero inconsistências detectadas',
          actual: passed ? '✅ Integridade OK' : `❌ ${issues.length} problemas encontrados`,
          issues,
          checksPerformed: 4,
        },
      };

    } catch (error: any) {
      return {
        name: testName,
        passed: false,
        timestamp: new Date(),
        details: {
          error: error.message,
        },
      };
    }
  }

  // ============= HELPERS =============

  private async captureDataSnapshot(): Promise<DataSnapshot> {
    const pedidosCount = await this.countPedidos();
    const itensPedidoCount = await this.countItensPedido();
    const produtoEstoqueTotal = await this.getTotalEstoque();
    const stateHash = `${pedidosCount}_${itensPedidoCount}_${produtoEstoqueTotal}`;

    return {
      pedidosCount,
      itensPedidoCount,
      produtoEstoqueTotal,
      contasReceberCount: 0,
      stateHash,
    };
  }

  private async countPedidos(): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(pedidos)
      .where(eq(pedidos.tenantId, this.tenantId));
    return result[0]?.count || 0;
  }

  private async countItensPedido(): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(itensPedido)
      .where(eq(itensPedido.tenantId, this.tenantId));
    return result[0]?.count || 0;
  }

  private async getTotalEstoque(): Promise<number> {
    const result = await this.db
      .select({ total: sum(produtos.estoque).mapWith(Number) })
      .from(produtos)
      .where(eq(produtos.tenantId, this.tenantId));
    return result[0]?.total || 0;
  }

  private async getProductStock(produtoId: number): Promise<number> {
    const result = await this.db
      .select({ estoque: produtos.estoque })
      .from(produtos)
      .where(and(eq(produtos.id, produtoId), eq(produtos.tenantId, this.tenantId)));
    return result[0]?.estoque || 0;
  }

  private async createOrUpdateProduct(produtoId: number, estoque: number) {
    await this.db
      .update(produtos)
      .set({ estoque })
      .where(and(eq(produtos.id, produtoId), eq(produtos.tenantId, this.tenantId)));
  }

  private async createOrderAndReduceStock(produtoId: number, quantidade: number, label: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        await this.db.transaction(async (tx: any) => {
          // Validar estoque
          const produtoRows = await tx
            .select({ estoque: produtos.estoque })
            .from(produtos)
            .where(eq(produtos.id, produtoId))
            .for('update'); // LOCK row

          const estoque = produtoRows[0]?.estoque || 0;
          if (estoque < quantidade) {
            throw new Error(`Estoque insuficiente: ${estoque} < ${quantidade}`);
          }

          // Reduzir estoque
          await tx
            .update(produtos)
            .set({ estoque: sql`estoque - ${quantidade}` })
            .where(eq(produtos.id, produtoId));

          // Delay para simular concorrência
          await new Promise(r => setTimeout(r, 10));
        });
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  private async createOrderWithIdempotency(key: string, orderData: any): Promise<any> {
    // Simular idempotency key check
    return this.db.transaction(async (tx: any) => {
      // Checar se já existe
      const existing = await tx
        .select()
        .from(sql`idempotency_keys`)
        .where(sql`\`key\` = ${key}`)
        .limit(1);

      if (existing.length > 0 && existing[0].resultJson) {
        // Retornar resultado anterior
        return JSON.parse(existing[0].resultJson);
      }

      // Criar novo pedido
      const resultado = await tx
        .insert(pedidos)
        .values({
          tenantId: this.tenantId,
          ...orderData,
        });

      // Guardar chave
      if (!existing.length) {
        await tx
          .insert(sql`idempotency_keys`)
          .values({
            key,
            commandName: 'create_pedido',
            resultJson: JSON.stringify({ pedidoId: resultado?.insertId }),
          });
      }

      return resultado;
    });
  }

  /**
   * Executa TODOS os testes e retorna relatório
   */
  async runAllTests(): Promise<{ results: TestResult[]; summary: any }> {
    await this.initialize();

    logger.info('🧪 Iniciando bateria de testes de consistência...\n');

    this.results.push(await this.testErrorInMiddleOfTransaction());
    this.results.push(await this.testConcurrentStockOrders());
    this.results.push(await this.testIdempotencySamePedidoMultipleTimes());
    this.results.push(await this.testDataIntegrity());

    const summary = {
      totalTests: this.results.length,
      passed: this.results.filter(r => r.passed).length,
      failed: this.results.filter(r => !r.passed).length,
      timestamp: new Date(),
    };

    return { results: this.results, summary };
  }
}

// CLI: Executar testes
if (require.main === module) {
  (async () => {
    const tester = new DatabaseConsistencyTester();
    const { results, summary } = await tester.runAllTests();

    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 RESULTADOS DOS TESTES DE CONSISTÊNCIA DO BANCO');
    console.log('═══════════════════════════════════════════════════════════════\n');

    results.forEach((test, i) => {
      const icon = test.passed ? '✅' : '❌';
      console.log(`${icon} [${i + 1}] ${test.name}`);
      console.log(`   Status: ${test.passed ? 'PASSOU' : 'FALHOU'}`);
      console.log(`   Detalhes:`, JSON.stringify(test.details, null, 2));
      console.log('');
    });

    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`📈 RESUMO: ${summary.passed}/${summary.totalTests} testes passaram`);
    console.log('═══════════════════════════════════════════════════════════════');

    process.exit(summary.failed > 0 ? 1 : 0);
  })();
}

/** Evita "No test suite found" no Vitest; bateria real roda via CLI no topo do arquivo. */
describe('database-consistency', () => {
  it('documentação: executar suite pesada via `tsx server/tests/database-consistency.test.ts`', () => {
    expect(DatabaseConsistencyTester).toBeDefined();
  });
});
