/**
 * Rotas de teste de concorrência
 * APENAS PARA TESTES - NÃO USAR EM PRODUÇÃO
 */

import express from 'express';
import { processStockOperation } from '../services/safe-stock.js';
import { createPedidoSafe } from '../services/orders.service.js';
import { runStockTransaction } from '../services/db-transaction.js';
import { getDb } from '../db/index.js';
import { produtos } from '../../drizzle/schema.js';
import { eq } from 'drizzle-orm';

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
      produtoId,
      quantidade: Number(quantidade),
      tipo: tipo === 'entrada' ? 'entrada' : 'saida',
      motivo: motivo || 'Teste de concorrência',
      traceId: `test_${Date.now()}`
    });
    
    return res.json(result);
  } catch (error) {
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
    
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database não disponível' });
    }
    
    // Usar prepared statement para evitar SQL injection
    const rows = await db
      .select({ id: produtos.id, estoque: produtos.estoque })
      .from(produtos)
      .where(eq(produtos.id, produtoId))
      .limit(1);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Produto não encontrado' });
    }

    const produto = rows[0];
    
    return res.json({
      produtoId,
      saldo: Number(produto.estoque || 0),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
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
    
    const result = await createPedidoSafe(
      pedidoData.tenantId,
      pedidoData,
      { vendedorId: pedidoData.vendedorId }
    );
    
    return res.json(result);
  } catch (error) {
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
    
    // Tentar operação que poderia causar deadlock
    const result = await runStockTransaction(async (tx) => {
      // Garantir ordem consistente para evitar deadlock
      const [firstId, secondId] = [produtoId1, produtoId2].sort((a, b) => a - b);
      
      // Bloquear primeiro produto
      await tx.query("SELECT * FROM produtos WHERE id = ? FOR UPDATE", [firstId]);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await tx.query("SELECT * FROM produtos WHERE id = ? FOR UPDATE", [secondId]);
      const [r1] = await tx.query("SELECT * FROM produtos WHERE id = ? LIMIT 1", [firstId]);
      const [r2] = await tx.query("SELECT * FROM produtos WHERE id = ? LIMIT 1", [secondId]);
      const rows1 = r1 as { id?: number; estoque?: unknown }[];
      const rows2 = r2 as { id?: number; estoque?: unknown }[];
      const p1 = rows1[0] ?? null;
      const p2 = rows2[0] ?? null;
      
      return {
        success: true,
        message: 'Operação concluída sem deadlock',
        produto1: p1,
        produto2: p2
      };
    });
    
    return res.json(result);
  } catch (error) {
    console.error('Erro no teste de deadlock:', error);
    return res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Erro desconhecido' 
    });
  }
});

export default router;