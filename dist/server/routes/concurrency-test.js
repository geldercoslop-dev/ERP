/**
 * Rotas de teste de concorrência
 * APENAS PARA TESTES - NÃO USAR EM PRODUÇÃO
 */
import { ValidationError } from '../_core/errors/typed-errors.js';
import express from 'express';
import { processStockOperation } from '../services/safe-stock.js';
import { createPedidoSafe } from '../services/orders.service.js';
import { getProdutoById } from '../services/inventory.service.js';
import { testDeadlock } from '../services/concurrency-test.service.js';
const router = express.Router();
// Endpoint para testar operações de estoque
router.post('/stock/update', async (req, res) => {
    try {
        const { tenantId, produtoId, quantidade, tipo, motivo } = req.body;
        if (!produtoId || !quantidade || !tipo) {
            return res.status(400).json({
                success: false,
                message: 'Parâmetros inválidos. Necessário: produtoId, quantidade, tipo'
            });
        }
        const result = await processStockOperation({
            tenantId: Number(tenantId),
            produtoId,
            quantidade: Number(quantidade),
            tipo: tipo === 'entrada' ? 'entrada' : 'saida',
            motivo: motivo || 'Teste de concorrência',
            traceId: `test_${Date.now()}`
        });
        return res.json(result);
    }
    catch (error) {
        console.error('Erro no teste de estoque:', error);
        return res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});
// Endpoint para verificar estoque atual
router.get('/stock/check/:produtoId', async (req, res) => {
    try {
        const produtoId = Number(req.params.produtoId);
        if (!produtoId) {
            return res.status(400).json({ success: false, message: 'ID do produto inválido' });
        }
        if (!req.user) {
            throw new ValidationError("Usuário não autenticado");
        }
        const userTenantId = req.user.tenantId;
        const tenantId = Number(userTenantId ?? req.query.tenantId);
        if (!Number.isInteger(tenantId) || tenantId <= 0) {
            return res.status(400).json({ success: false, message: 'tenantId obrigatório' });
        }
        const produto = await getProdutoById(tenantId, produtoId);
        if (!produto) {
            return res.status(404).json({ success: false, message: 'Produto não encontrado' });
        }
        return res.json({
            produtoId,
            saldo: Number(produto.estoque ?? 0),
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Erro ao verificar estoque:', error);
        return res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});
// Endpoint para criar pedido (teste de geração de número)
router.post('/pedidos', async (req, res) => {
    try {
        const pedidoData = req.body;
        if (!pedidoData.tenantId || !pedidoData.vendedorId || !pedidoData.clienteId) {
            return res.status(400).json({
                success: false,
                message: 'Dados do pedido incompletos'
            });
        }
        const result = await createPedidoSafe(pedidoData.tenantId, pedidoData, { vendedorId: pedidoData.vendedorId });
        return res.json(result);
    }
    catch (error) {
        console.error('Erro ao criar pedido:', error);
        return res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});
// Endpoint para testar deadlock
router.post('/test-deadlock', async (req, res) => {
    try {
        const { produtoId1, produtoId2 } = req.body;
        if (!produtoId1 || !produtoId2) {
            return res.status(400).json({
                success: false,
                message: 'Necessário informar produtoId1 e produtoId2'
            });
        }
        const result = await testDeadlock(Number(produtoId1), Number(produtoId2));
        return res.json(result);
    }
    catch (error) {
        console.error('Erro no teste de deadlock:', error);
        return res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});
export default router;
