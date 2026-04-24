/**
 * Serviço de Transações Seguras - Safe Transaction Service
 *
 * Padroniza a ordem das operações para evitar deadlocks
 * Define ordem fixa: pedido → estoque → financeiro
 */
import { getDb } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { pedidos, contasReceber, contasPagar } from '../../drizzle/schema.js';
import { ContaPagarStatus, ContaReceberStatus, PedidoStatus, PedidoStatusValues } from "../shared/domain-status.js";
import { validateStatus } from "../shared/guards/domain-guard.js";
import { loggerInstance as logger, logError } from '../utils/logger.js';
import { processStockOperation } from './safe-stock.js';
import { logAuditAction } from './audit-log.service.js';
import { ValidationError } from '../_core/errors/typed-errors.js';
/** Resultado bruto de insert/update MySQL2 (Drizzle). */
function readMysqlExecResult(result) {
    if (Array.isArray(result) && result[0] && typeof result[0] === "object") {
        const r = result[0];
        return {
            insertId: typeof r.insertId === "number" ? r.insertId : undefined,
            affectedRows: typeof r.affectedRows === "number" ? r.affectedRows : undefined,
        };
    }
    if (result && typeof result === "object") {
        const r = result;
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
};
/**
 * Serviço para gerenciar transações seguras
 */
class SafeTransactionService {
    static instance;
    activeTransactions = new Map();
    resourceLocks = new Map();
    cleanupTimers = new Map();
    // TODO: Implementar cleanup automático para prevenir memory leaks
    // - Limpar transações concluídas após timeout
    // - Limitar tamanho máximo do Map
    // - Adicionar verificação periódica
    constructor() { }
    static getInstance() {
        if (!SafeTransactionService.instance) {
            SafeTransactionService.instance = new SafeTransactionService();
        }
        return SafeTransactionService.instance;
    }
    /**
     * Processa transação com lock em memória por recurso.
     * Impede execução concorrente sobre o mesmo pedidoId.
     */
    async processTransaction(tenantId, pedidoOp, stockOps, financeiroOps) {
        if (!Number.isInteger(tenantId) || tenantId <= 0) {
            throw new ValidationError("tenantId obrigatório para processTransaction");
        }
        const resourceKey = pedidoOp ? `pedido:${pedidoOp.pedidoId}` : 'global';
        const pending = this.resourceLocks.get(resourceKey);
        const run = () => this.executeNewTransaction(tenantId, pedidoOp, stockOps, financeiroOps);
        // Serializa: sempre executa após qualquer tx anterior do mesmo recurso (ok ou erro).
        const chained = pending ? pending.then(run, run) : run();
        this.resourceLocks.set(resourceKey, chained);
        try {
            return await chained;
        }
        finally {
            if (this.resourceLocks.get(resourceKey) === chained) {
                this.resourceLocks.delete(resourceKey);
            }
        }
    }
    /**
     * Lógica interna de execução — chamada exclusivamente pelo lock de processTransaction.
     */
    async executeNewTransaction(tenantId, pedidoOp, stockOps, financeiroOps) {
        const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const transaction = {
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
            const steps = this.buildTransactionSteps(tenantId, pedidoOp, stockOps, financeiroOps);
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
        }
        catch (error) {
            logError({ message: 'Falha na transação segura' }, error instanceof Error ? error : new Error(String(error)));
            transaction.status = 'failed';
            transaction.errors.push(error instanceof Error ? error.message : 'Erro desconhecido');
            transaction.completedAt = new Date();
            return transaction;
        }
        finally {
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
    buildTransactionSteps(tenantId, pedidoOp, stockOps, financeiroOps) {
        const steps = [];
        // 1. Pedidos (ordem: 1)
        if (pedidoOp) {
            const pedidoOpComTenant = { ...pedidoOp, tenantId };
            steps.push({
                type: 'pedido',
                order: TRANSACTION_ORDER.pedido,
                operation: pedidoOp.acao,
                data: pedidoOpComTenant,
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
                if (a.tipo === 'conta_receber' && b.tipo === 'conta_pagar')
                    return -1;
                if (a.tipo === 'conta_pagar' && b.tipo === 'conta_receber')
                    return 1;
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
    async executeTransaction(transaction) {
        transaction.status = 'processing';
        const db = await getDb();
        if (!db) {
            return { success: false, error: 'Database não disponível' };
        }
        await db.transaction(async (tx) => {
            for (const step of transaction.steps) {
                try {
                    const result = await this.executeStep(tx, step);
                    transaction.results.push({
                        step: step.type,
                        operation: step.operation,
                        success: true,
                        result,
                    });
                }
                catch (error) {
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
        }
        else if (transaction.results.length > 0) {
            transaction.status = 'partial'; // Sucesso parcial
        }
        else {
            transaction.status = 'failed';
        }
        transaction.completedAt = new Date();
        return { success: true };
    }
    /**
     * Executa step individual
     */
    async executeStep(tx, step) {
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
    async executePedidoStep(tx, step) {
        const pedidoOp = step.data;
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
    async executeEstoqueStep(tx, step) {
        const stockOp = step.data;
        // Usar o serviço de estoque seguro dentro da transação
        const result = await processStockOperation(stockOp);
        if (!result.success) {
            return { success: false, error: `Falha na operação de estoque: ${result.message}` };
        }
        return result;
    }
    /**
     * Executa operação financeira
     */
    async executeFinanceiroStep(tx, step) {
        const finOp = step.data;
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
    async criarPedido(tx, pedidoOp) {
        // Validate tenantId
        if (!pedidoOp.tenantId || !Number.isInteger(pedidoOp.tenantId) || pedidoOp.tenantId <= 0) {
            throw new ValidationError("tenantId obrigatório para criação de pedido");
        }
        // Implementação específica para criar pedido
        // Por enquanto, simulação
        const result = await tx.insert(pedidos).values({
            ...pedidoOp.dados,
            status: PedidoStatus.GERADO,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        const meta = readMysqlExecResult(result);
        // Auditoria de criação de pedido
        await logAuditAction("create", "pedidos", {
            pedidoId: meta.insertId,
            dados: pedidoOp.dados,
            operation: 'criar_pedido'
        }, {
            tenantId: pedidoOp.tenantId,
            entityId: meta.insertId != null ? String(meta.insertId) : undefined,
            actorUserId: pedidoOp.actorUserId,
            actorVendedorId: pedidoOp.actorVendedorId
        });
        return {
            success: true,
            pedidoId: meta.insertId,
            operation: 'criar_pedido',
        };
    }
    /**
     * Atualizar pedido
     */
    async atualizarPedido(tx, pedidoOp) {
        // Validate tenantId
        if (!pedidoOp.tenantId || !Number.isInteger(pedidoOp.tenantId) || pedidoOp.tenantId <= 0) {
            throw new ValidationError("tenantId obrigatório para atualização de pedido");
        }
        const result = await tx
            .update(pedidos)
            .set({
            ...pedidoOp.dados,
            updatedAt: new Date().toISOString(),
        })
            .where(eq(pedidos.id, pedidoOp.pedidoId));
        const meta = readMysqlExecResult(result);
        // Auditoria de atualização de pedido
        await logAuditAction("update", "pedidos", {
            pedidoId: pedidoOp.pedidoId,
            dados: pedidoOp.dados,
            operation: 'atualizar_pedido'
        }, {
            tenantId: pedidoOp.tenantId,
            entityId: pedidoOp.pedidoId.toString(),
            actorUserId: pedidoOp.actorUserId,
            actorVendedorId: pedidoOp.actorVendedorId
        });
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
    async cancelarPedido(tx, pedidoOp) {
        // Validate tenantId
        if (!pedidoOp.tenantId || !Number.isInteger(pedidoOp.tenantId) || pedidoOp.tenantId <= 0) {
            throw new ValidationError("tenantId obrigatório para cancelamento de pedido");
        }
        const motivo = pedidoOp.dados?.motivo;
        const result = await tx
            .update(pedidos)
            .set({
            status: PedidoStatus.CANCELADO,
            observacoes: typeof motivo === "string" ? motivo : undefined,
            updatedAt: new Date().toISOString(),
        })
            .where(eq(pedidos.id, pedidoOp.pedidoId));
        const meta = readMysqlExecResult(result);
        // Auditoria de cancelamento de pedido
        await logAuditAction("cancel", "pedidos", {
            pedidoId: pedidoOp.pedidoId,
            motivo: pedidoOp.dados?.motivo,
            operation: 'cancelar_pedido'
        }, {
            tenantId: pedidoOp.tenantId,
            entityId: pedidoOp.pedidoId.toString(),
            actorUserId: pedidoOp.actorUserId,
            actorVendedorId: pedidoOp.actorVendedorId
        });
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
    async atualizarStatusPedido(tx, pedidoOp) {
        const novoStatus = validateStatus(pedidoOp.dados?.status, PedidoStatusValues, "pedido.status");
        const result = await tx
            .update(pedidos)
            .set({
            status: novoStatus,
            updatedAt: new Date().toISOString(),
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
    async executeContaReceberStep(tx, finOp) {
        switch (finOp.acao) {
            case 'criar':
                const result = await tx.insert(contasReceber).values({
                    ...finOp.dados,
                    status: ContaReceberStatus.PENDENTE,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                });
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
                    dataRecebimento: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
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
    async executeContaPagarStep(tx, finOp) {
        switch (finOp.acao) {
            case 'criar':
                const result = await tx.insert(contasPagar).values({
                    ...finOp.dados,
                    status: ContaPagarStatus.PENDENTE,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                });
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
                    dataPagamento: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
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
    getTransactionStatus(transactionId) {
        return this.activeTransactions.get(transactionId) || null;
    }
    /**
     * Lista transações ativas
     */
    getActiveTransactions() {
        return Array.from(this.activeTransactions.values());
    }
    /**
     * Limpa transações antigas
     */
    cleanupOldTransactions(maxAgeMs = 3600000) {
        const cutoffTime = Date.now() - maxAgeMs;
        const toDelete = [];
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
export async function processSafeTransaction(tenantId, pedidoOp, stockOps, financeiroOps) {
    return safeTransactionService.processTransaction(tenantId, pedidoOp, stockOps, financeiroOps);
}
