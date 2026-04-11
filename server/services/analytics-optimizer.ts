/**
 * Analytics Optimizer Service
 * 
 * Serviço para consultas analíticas otimizadas com performance
 */

import { getDb } from '../db/index.js';
import { executeQuery } from '../config/database.js';
import { sql, eq, and, lt, desc } from 'drizzle-orm';
import { pedidos, itensPedido, produtos, contasReceber, contasPagar } from '../../drizzle/schema.js';
import { ContaPagarStatus, ContaReceberStatus, PedidoStatus } from '../shared/domain-status.js';
import { InfrastructureError } from '../_core/errors/typed-errors.js';
import { assertDbConnection } from '../_core/errors/assertions.js';

/**
 * Queries otimizadas para Sales Analytics
 */
export class SalesAnalyticsQueries {
  
  /**
   * Vendas dos últimos 30 dias - Otimizada com índices e LIMIT
   */
  static async getVendasUltimos30Dias(limit: number = 30): Promise<Record<string, unknown>[]> {
    const dbConnection = await getDb();
    assertDbConnection(dbConnection);

    try {
      const trintaDiasAtras = new Date();
      trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

      // Query otimizada com índices compostos
      const query = `
        SELECT 
          DATE(p.createdAt) as data,
          COUNT(*) as totalPedidos,
          COALESCE(SUM(p.total), 0) as valorTotal
        FROM pedidos p
        WHERE p.createdAt >= ? 
          AND p.status != '${PedidoStatus.CANCELADO}'
          AND p.total > 0
        GROUP BY DATE(p.createdAt)
        ORDER BY DATE(p.createdAt) DESC
        LIMIT ?
      `;

      const [rows] = await executeQuery(query, [trintaDiasAtras, limit]);
      
      return (rows as unknown as Record<string, unknown>[]).map((venda) => {
        const tp = Number(venda.totalPedidos);
        return {
          ...venda,
          ticketMedio: tp > 0 ? Number(venda.valorTotal) / tp : 0,
        };
      });
    } catch (error: unknown) {
      console.error('[SalesAnalyticsQueries] Erro em getVendasUltimos30Dias:', error);
      throw new InfrastructureError('Falha ao obter vendas dos últimos 30 dias', { cause: error });
    }
  }

  /**
   * Produtos mais vendidos - Otimizada com JOIN e índices
   */
  static async getProdutosMaisVendidos(limit: number = 10): Promise<Record<string, unknown>[]> {
    const dbConnection = await getDb();
    assertDbConnection(dbConnection);

    try {
      const trintaDiasAtras = new Date();
      trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

      const query = `
        SELECT 
          ip.produtoId,
          pr.descricao,
          SUM(ip.quantidade) as quantidade,
          SUM(ip.total) as valorTotal,
          COUNT(DISTINCT ip.pedidoId) as numeroPedidos
        FROM itens_pedido ip
        INNER JOIN pedidos p ON ip.pedidoId = p.id
        INNER JOIN produtos pr ON ip.produtoId = pr.id
        WHERE p.createdAt >= ? 
          AND p.status != '${PedidoStatus.CANCELADO}'
          AND ip.quantidade > 0
        GROUP BY ip.produtoId, pr.descricao
        HAVING quantidade > 0
        ORDER BY quantidade DESC, valorTotal DESC
        LIMIT ?
      `;

      const [rows] = await executeQuery(query, [trintaDiasAtras, limit]);
      
      return rows as unknown as Record<string, unknown>[];
    } catch (error: unknown) {
      console.error('[SalesAnalyticsQueries] Erro em getProdutosMaisVendidos:', error);
      throw new InfrastructureError('Falha ao obter produtos mais vendidos', { cause: error });
    }
  }

  /**
   * Clientes mais ativos - Otimizada com GROUP BY e índices
   */
  static async getClientesMaisAtivos(limit: number = 10): Promise<Record<string, unknown>[]> {
    const dbConnection = await getDb();
    assertDbConnection(dbConnection);

    try {
      const trintaDiasAtras = new Date();
      trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

      const query = `
        SELECT 
          p.clienteNome,
          COUNT(*) as quantidadePedidos,
          COALESCE(SUM(p.total), 0) as valorTotal,
          MAX(p.createdAt) as ultimoPedido,
          COUNT(DISTINCT DATE(p.createdAt)) as diasCompras
        FROM pedidos p
        WHERE p.createdAt >= ? 
          AND p.status != '${PedidoStatus.CANCELADO}'
          AND p.clienteNome IS NOT NULL
          AND p.clienteNome != ''
        GROUP BY p.clienteNome
        HAVING quantidadePedidos > 0
        ORDER BY quantidadePedidos DESC, valorTotal DESC
        LIMIT ?
      `;

      const [rows] = await executeQuery(query, [trintaDiasAtras, limit]);
      
      return (rows as unknown as Record<string, unknown>[]).map((cliente) => {
        const dias = Number(cliente.diasCompras);
        return {
          ...cliente,
          frequencia: dias >= 20 ? "Alta" : dias >= 10 ? "Média" : "Baixa",
        };
      });
    } catch (error: unknown) {
      console.error('[SalesAnalyticsQueries] Erro em getClientesMaisAtivos:', error);
      throw new InfrastructureError('Falha ao obter clientes mais ativos', { cause: error });
    }
  }
}

/**
 * Queries otimizadas para Stock Analytics
 */
export class StockAnalyticsQueries {
  
  /**
   * Estoque crítico - Otimizada com índices e filtros
   */
  static async getEstoqueCritico(limit: number = 50): Promise<Record<string, unknown>[]> {
    const dbConnection = await getDb();
    assertDbConnection(dbConnection);

    try {
      const query = `
        SELECT 
          p.id,
          p.descricao,
          p.estoque,
          p.valorVenda,
          p.custo,
          (p.estoque * p.valorVenda) as valorTotal,
          CASE 
            WHEN p.estoque = 0 THEN 'ESGOTADO'
            WHEN p.estoque <= 5 THEN 'CRITICO'
            WHEN p.estoque <= 10 THEN 'BAIXO'
            ELSE 'NORMAL'
          END as status,
          DATEDIFF(NOW(), p.updatedAt) as diasSemMovimento
        FROM produtos p
        WHERE p.ativo = 1
          AND p.estoque <= 10
        ORDER BY p.estoque ASC
        LIMIT ?
      `;

      const [rows] = await executeQuery(query, [limit]);
      return rows as unknown as Record<string, unknown>[];
    } catch (error: unknown) {
      console.error('[StockAnalyticsQueries] Erro em getEstoqueCritico:', error);
      throw new InfrastructureError('Falha ao obter estoque crítico', { cause: error });
    }
  }

  /**
   * Produtos sem giro - Otimizada com subquery
   */
  static async getProdutosSemGiro(dias: number = 60, limit: number = 50): Promise<Record<string, unknown>[]> {
    const dbConnection = await getDb();
    assertDbConnection(dbConnection);

    try {
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - dias);

      const query = `
        SELECT 
          p.id,
          p.descricao,
          p.estoque,
          p.valorVenda,
          p.custo,
          (p.estoque * p.custo) as valorInvestido,
          COALESCE(vendas.ultima_venda, 'NUNCA') as ultimaVenda,
          DATEDIFF(NOW(), COALESCE(vendas.ultima_venda, p.createdAt)) as diasSemVenda
        FROM produtos p
        LEFT JOIN (
          SELECT 
            ip.produtoId,
            MAX(p.createdAt) as ultima_venda
          FROM itens_pedido ip
          INNER JOIN pedidos p ON ip.pedidoId = p.id
          WHERE p.status != '${PedidoStatus.CANCELADO}'
            AND p.createdAt >= ?
          GROUP BY ip.produtoId
        ) vendas ON p.id = vendas.produtoId
        WHERE p.ativo = 1
          AND p.estoque > 0
          AND (vendas.ultima_venda IS NULL OR vendas.ultima_venda < ?)
        ORDER BY valorInvestido DESC
        LIMIT ?
      `;

      const [rows] = await executeQuery(query, [dataLimite, dataLimite, limit]);
      return rows as unknown as Record<string, unknown>[];
    } catch (error: unknown) {
      console.error('[StockAnalyticsQueries] Erro em getProdutosSemGiro:', error);
      throw new InfrastructureError('Falha ao obter produtos sem giro', { cause: error });
    }
  }

  /**
   * Produtos com alto giro - Otimizada com CTE
   */
  static async getProdutosAltoGiro(dias: number = 30, limit: number = 20): Promise<Record<string, unknown>[]> {
    const dbConnection = await getDb();
    assertDbConnection(dbConnection);

    try {
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - dias);

      const query = `
        WITH vendas_periodo AS (
          SELECT 
            ip.produtoId,
            SUM(ip.quantidade) as quantidade_vendida,
            SUM(ip.total) as valor_vendido,
            COUNT(DISTINCT ip.pedidoId) as numero_vendas
          FROM itens_pedido ip
          INNER JOIN pedidos p ON ip.pedidoId = p.id
          WHERE p.createdAt >= ?
            AND p.status != '${PedidoStatus.CANCELADO}'
          GROUP BY ip.produtoId
        )
        SELECT 
          p.id,
          p.descricao,
          p.estoque,
          p.valorVenda,
          vp.quantidade_vendida,
          vp.valor_vendido,
          vp.numero_vendas,
          CASE 
            WHEN p.estoque > 0 THEN ROUND(vp.quantidade_vendida / p.estoque, 2)
            ELSE vp.quantidade_vendida
          END as giro,
          CASE 
            WHEN p.estoque > 0 AND vp.quantidade_vendida > 0 
            THEN ROUND(p.estoque / (vp.quantidade_vendida / ?), 1)
            ELSE 999
          END as diasEstoque
        FROM produtos p
        INNER JOIN vendas_periodo vp ON p.id = vp.produtoId
        WHERE p.ativo = 1
          AND vp.quantidade_vendida > 0
        ORDER BY vp.quantidade_vendida DESC, giro DESC
        LIMIT ?
      `;

      const [rows] = await executeQuery(query, [dataLimite, dias, limit]);
      return rows as unknown as Record<string, unknown>[];
    } catch (error: unknown) {
      console.error('[StockAnalyticsQueries] Erro em getProdutosAltoGiro:', error);
      throw new InfrastructureError('Falha ao obter produtos com alto giro', { cause: error });
    }
  }
}

/**
 * Queries otimizadas para Financial Insights
 */
export class FinancialInsightsQueries {
  
  /**
   * Faturamento diário - Otimizada com índices e cache
   */
  static async getFaturamentoDiario(dias: number = 30, limit: number = 100): Promise<Record<string, unknown>[]> {
    const dbConnection = await getDb();
    assertDbConnection(dbConnection);

    try {
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - dias);

      const query = `
        SELECT 
          DATE(p.createdAt) as data,
          COUNT(*) as totalPedidos,
          COALESCE(SUM(p.total), 0) as faturamento,
          COALESCE(AVG(p.total), 0) as ticketMedio,
          COUNT(DISTINCT p.clienteNome) as clientesDistintos
        FROM pedidos p
        WHERE p.createdAt >= ? 
          AND p.status != '${PedidoStatus.CANCELADO}'
          AND p.total > 0
        GROUP BY DATE(p.createdAt)
        ORDER BY DATE(p.createdAt) DESC
        LIMIT ?
      `;

      const [rows] = await executeQuery(query, [dataLimite, limit] as unknown as Record<string, unknown>[]);
      return rows as unknown as Record<string, unknown>[];
    } catch (error: unknown) {
      console.error('[FinancialInsightsQueries] Erro em getFaturamentoDiario:', error);
      throw new InfrastructureError('Falha ao obter faturamento diário', { cause: error });
    }
  }

  /**
   * Fluxo de caixa - Otimizada com UNION ALL e índices
   */
  static async getFluxoCaixa(dias: number = 30, limit: number = 50): Promise<Record<string, unknown>[]> {
    const dbConnection = await getDb();
    assertDbConnection(dbConnection);

    try {
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - dias);

      const query = `
        SELECT 
          DATE(dataPagamento) as data,
          'ENTRADA' as tipo,
          COALESCE(SUM(valor), 0) as valor,
          COUNT(*) as transacoes
        FROM contas_receber
        WHERE dataPagamento >= ? 
          AND status = '${ContaReceberStatus.RECEBIDA}'
          AND valor > 0
        GROUP BY DATE(dataPagamento)
        
        UNION ALL
        
        SELECT 
          DATE(dataPagamento) as data,
          'SAIDA' as tipo,
          COALESCE(SUM(valor), 0) as valor,
          COUNT(*) as transacoes
        FROM contas_pagar
        WHERE dataPagamento >= ? 
          AND status = '${ContaPagarStatus.PAGO}'
          AND valor > 0
        GROUP BY DATE(dataPagamento)
        
        ORDER BY data DESC, tipo
        LIMIT ?
      `;

      const [rows] = await executeQuery(query, [dataLimite, dataLimite, limit]);
      return rows as unknown as Record<string, unknown>[];
    } catch (error: unknown) {
      console.error('[FinancialInsightsQueries] Erro em getFluxoCaixa:', error);
      throw new InfrastructureError('Falha ao obter fluxo de caixa', { cause: error });
    }
  }

  /**
   * Indicadores financeiros - Otimizada com subqueries
   */
  static async getIndicadoresFinanceiros(): Promise<Record<string, unknown> | null> {
    const dbConnection = await getDb();
    if (!dbConnection) return null;

    try {
      const query = `
        SELECT 
          -- Faturamento período atual
          (SELECT COALESCE(SUM(total), 0) 
           FROM pedidos 
           WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY) 
             AND status != '${PedidoStatus.CANCELADO}') as faturamento30dias,
          
          -- Faturamento período anterior
          (SELECT COALESCE(SUM(total), 0) 
           FROM pedidos 
           WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 60 DAY) 
             AND createdAt < DATE_SUB(NOW(), INTERVAL 30 DAY)
             AND status != '${PedidoStatus.CANCELADO}') as faturamento60dias,
          
          -- Contas a receber
          (SELECT COALESCE(SUM(valor), 0) 
           FROM contas_receber 
           WHERE status = '${ContaReceberStatus.PENDENTE}') as contasReceber,
          
          -- Contas a pagar
          (SELECT COALESCE(SUM(valor), 0) 
           FROM contas_pagar 
           WHERE status = '${ContaPagarStatus.PENDENTE}') as contasPagar,
          
          -- Ticket médio geral
          (SELECT COALESCE(AVG(total), 0) 
           FROM pedidos 
           WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY) 
             AND status != '${PedidoStatus.CANCELADO}') as ticketMedio,
          
          -- Total de pedidos no período
          (SELECT COUNT(*) 
           FROM pedidos 
           WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY) 
             AND status != '${PedidoStatus.CANCELADO}') as totalPedidos
      `;

      const [rows] = await dbConnection.execute(query);
      const data = (rows as unknown as Record<string, unknown>[])[0];

      if (!data) return null;

      const fat30 = Number(data.faturamento30dias);
      const fat60 = Number(data.faturamento60dias);
      const contasRec = Number(data.contasReceber);
      const ticket = Number(data.ticketMedio);
      const totalPed = Number(data.totalPedidos);

      // Calcular métricas derivadas
      const crescimento = fat60 > 0 ? ((fat30 - fat60) / fat60) * 100 : 0;

      const margemBruta = fat30 > 0 ? ((fat30 - fat30 * 0.7) / fat30) * 100 : 0;

      return {
        faturamento30dias: fat30,
        faturamento60dias: fat60,
        crescimentoPercentual: Number(crescimento.toFixed(2)),
        contasReceber: contasRec,
        contasPagar: Number(data.contasPagar),
        saldoCaixa: contasRec - Number(data.contasPagar),
        ticketMedio: ticket,
        totalPedidos: totalPed,
        margemBruta: Number(margemBruta.toFixed(2)),
        healthScore: Math.min(
          100,
          Math.max(
            0,
            (contasRec > 0 ? 30 : 0) +
              (crescimento > 0 ? 30 : 0) +
              (ticket > 100 ? 20 : 0) +
              (totalPed > 10 ? 20 : 0)
          )
        ),
      };
    } catch (error: unknown) {
      console.error('[FinancialInsightsQueries] Erro em getIndicadoresFinanceiros:', error);
      return null;
    }
  }
}

/**
 * Índices recomendados para performance
 */
export const RECOMMENDED_INDEXES = [
  // Pedidos
  'CREATE INDEX IF NOT EXISTS idx_pedidos_created_status ON pedidos(createdAt, status)',
  'CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_created ON pedidos(clienteNome, createdAt)',
  'CREATE INDEX IF NOT EXISTS idx_pedidos_total_status ON pedidos(total, status)',
  
  // Itens Pedido
  'CREATE INDEX IF NOT EXISTS idx_itens_pedido_produto ON itens_pedido(produtoId)',
  'CREATE INDEX IF NOT EXISTS idx_itens_pedido_pedido ON itens_pedido(pedidoId)',
  'CREATE INDEX IF NOT EXISTS idx_itens_pedido_produto_pedido ON itens_pedido(produtoId, pedidoId)',
  
  // Produtos
  'CREATE INDEX IF NOT EXISTS idx_produtos_estoque_ativo ON produtos(estoque, ativo)',
  'CREATE INDEX IF NOT EXISTS idx_produtos_updated_at ON produtos(updatedAt)',
  'CREATE INDEX IF NOT EXISTS idx_produtos_descricao ON produtos(descricao)',
  
  // Contas
  'CREATE INDEX IF NOT EXISTS idx_contas_receber_status_data ON contas_receber(status, dataPagamento)',
  'CREATE INDEX IF NOT EXISTS idx_contas_pagar_status_data ON contas_pagar(status, dataPagamento)',
  'CREATE INDEX IF NOT EXISTS idx_contas_receber_pedido ON contas_receber(pedidoId)',
  
  // Audit Log
  'CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(createdAt)',
  'CREATE INDEX IF NOT EXISTS idx_audit_log_entity_created ON audit_log(entity, createdAt)',
  'CREATE INDEX IF NOT EXISTS idx_audit_log_action_created ON audit_log(action, createdAt)',
  
  // Cargas
  'CREATE INDEX IF NOT EXISTS idx_cargas_status ON cargas(status)',
  'CREATE INDEX IF NOT EXISTS idx_cargas_created ON cargas(createdAt)',
  'CREATE INDEX IF NOT EXISTS idx_pedidos_carga_pedido ON pedidos_carga(pedidoId)',
  'CREATE INDEX IF NOT EXISTS idx_pedidos_carga_carga ON pedidos_carga(cargaId)'
];

/**
 * Função para criar índices recomendados
 */
export async function createRecommendedIndexes(): Promise<void> {
  const dbConnection = await getDb();
  if (!dbConnection) return;

  try {
    console.log('[QueryOptimizer] Criando índices recomendados...');
    
    for (const indexSql of RECOMMENDED_INDEXES) {
      try {
        await dbConnection.execute(indexSql);
        console.log(`[QueryOptimizer] Índice criado: ${indexSql.substring(0, 50)}...`);
      } catch (error: unknown) {
        // Índice já existe ou erro - ignorar
        console.log(`[QueryOptimizer] Índice já existe ou erro: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    console.log('[QueryOptimizer] Índices recomendados processados');
  } catch (error: unknown) {
    console.error('[QueryOptimizer] Erro ao criar índices:', error);
  }
}
