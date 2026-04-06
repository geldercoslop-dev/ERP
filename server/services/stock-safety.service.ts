/**
 * Stock Safety Service
 * 
 * Serviço para operações seguras de estoque com controle de concorrência
 */

import { runStockTransaction } from './db-transaction.js';
import * as db from '../db/index.js';
import { eq, sql, and } from 'drizzle-orm';
import { produtos, itensPedido } from '../../drizzle/schema.js';
import { executeQuery } from '../config/database.js';
import { isRecord } from '../_core/type-guards.js';

type ProdutoRowLock = {
  id: number;
  descricao: string;
  estoque: number;
  /** Ausente quando a query SQL não retorna a coluna `ativo`. */
  ativo?: boolean;
};

function parseProdutoRow(row: unknown): ProdutoRowLock | null {
  if (!isRecord(row)) return null;
  const id = Number(row["id"]);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    descricao: String(row["descricao"] ?? ""),
    estoque: Number(row["estoque"] ?? 0),
    ativo: row["ativo"] === undefined ? undefined : Boolean(row["ativo"]),
  };
}

function mapProdutoRowsToLock(rows: unknown): Map<number, ProdutoRowLock> {
  const m = new Map<number, ProdutoRowLock>();
  const list = Array.isArray(rows) ? rows : [];
  for (const raw of list) {
    const p = parseProdutoRow(raw);
    if (p) m.set(p.id, p);
  }
  return m;
}
import { ensureArray, ensureObject, ensureCreatedResult } from "../_core/service-response.js";

export type StockOperation = {
  produtoId: number;
  quantidade: number;
  tipo: 'entrada' | 'saida';
  motivo: string;
  usuarioId?: number;
  vendedorId?: number;
  pedidoId?: number;
};

export type StockValidation = {
  disponivel: boolean;
  estoqueAtual: number;
  quantidadeSolicitada: number;
  saldoAposOperacao: number;
  erro?: string;
};

export type StockMovement = {
  id: number;
  produtoId: number;
  descricao: string;
  quantidade: number;
  tipo: string;
  estoqueAnterior: number;
  estoqueNovo: number;
  motivo: string;
  usuario: string;
  timestamp: Date;
};

/**
 * Atualiza estoque de forma segura com controle de concorrência
 */
export async function updateStockSafe(
  tenantId: number, // Adicionado para multi-tenant
  produtoId: number,
  quantidade: number,
  operacao: StockOperation
): Promise<{ success: boolean; data?: StockMovement; error?: string }> {
  if (!tenantId) return { success: false, error: "tenantId is required" };
  
  try {
    const out = await runStockTransaction(async (tx) => {
      console.log(`[StockSafety] Iniciando operação segura - Tenant: ${tenantId}, Produto: ${produtoId}, Qtd: ${quantidade}, Tipo: ${operacao.tipo}`);

      // 1. Bloquear o produto para leitura (SELECT FOR UPDATE) com tenantId
      const [produto] = await tx.execute(
        `SELECT id, descricao, estoque, ativo FROM produtos WHERE tenantId = ? AND id = ? FOR UPDATE`,
        [tenantId, produtoId]
      );

      if (!produto || !Array.isArray(produto) || produto.length === 0) {
        return { success: false, error: `PRODUTO_NAO_ENCONTRADO: Produto ${produtoId} não encontrado ou acesso negado` };
      }

      const firstRow = Array.isArray(produto) && produto.length > 0 ? produto[0] : null;
      const produtoData = parseProdutoRow(firstRow);
      if (!produtoData) {
        return { success: false, error: `PRODUTO_NAO_ENCONTRADO: Produto ${produtoId} — linha inválida` };
      }
      
      if (produtoData.estoque === undefined || produtoData.estoque === null) {
        return { success: false, error: `PRODUTO_DADO_CRITICO_AUSENTE: Produto ${produtoId} - estoque ausente` };
      }
      
      const estoqueAtual = Number(produtoData.estoque);

      // 2. Validar se produto está ativo
      if (!produtoData.ativo) {
        return { success: false, error: `PRODUTO_INATIVO: Produto ${produtoData.descricao} está inativo` };
      }

      // 3. Calcular novo estoque
      const novoEstoque = operacao.tipo === 'entrada' 
        ? estoqueAtual + quantidade 
        : estoqueAtual - quantidade;

      // 4. Validar estoque negativo
      if (novoEstoque < 0) {
        return { success: false, error: `ESTOQUE_INSUFICIENTE: Estoque atual (${estoqueAtual}) insuficiente para saída de ${Math.abs(quantidade)}. Saldo seria: ${novoEstoque}` };
      }

      // 5. Validar limite máximo de estoque (opcional)
      const ESTOQUE_MAXIMO = 99999;
      if (novoEstoque > ESTOQUE_MAXIMO) {
        return { success: false, error: `ESTOQUE_EXCEDIDO: Novo estoque (${novoEstoque}) excede limite máximo (${ESTOQUE_MAXIMO})` };
      }

      // 6. Atualizar estoque com verificação adicional de concorrência
      const updateResult = await tx.execute(
        `UPDATE produtos SET estoque = ?, updatedAt = NOW() WHERE tenantId = ? AND id = ? AND estoque = ?`,
        [novoEstoque, tenantId, produtoId, estoqueAtual]
      );

      const affectedRows = Array.isArray(updateResult) && updateResult[0] && 'affectedRows' in updateResult[0] ? 
        updateResult[0].affectedRows : 0;
      if (affectedRows === 0) {
        return { success: false, error: `CONCORRENCIA_DETECTADA: O estoque do produto ${produtoId} foi alterado por outro processo durante a operação` };
      }

      // 7. Registrar movimento no audit log
      const movement: StockMovement = {
        id: 0, // Será preenchido pelo banco
        produtoId,
        descricao: produtoData.descricao,
        quantidade,
        tipo: operacao.tipo,
        estoqueAnterior: estoqueAtual,
        estoqueNovo: novoEstoque,
        motivo: operacao.motivo,
        usuario: operacao.usuarioId ? `user_${operacao.usuarioId}` : 'user_system',
        timestamp: new Date(),
      };

      // Inserir movimento na tabela de auditoria (se existir)
      try {
        await tx.execute(
          `INSERT INTO stock_movements (produtoId, descricao, quantidade, tipo, estoqueAnterior, estoqueNovo, motivo, usuario, timestamp, tenantId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [produtoId, produtoData.descricao, quantidade, operacao.tipo, estoqueAtual, novoEstoque, operacao.motivo, movement.usuario, movement.timestamp, tenantId]
        );
      } catch (auditError) {
        console.warn('[StockSafety] Falha ao registrar movimento no audit log:', auditError);
        // Não falhar a operação principal se o audit log falhar
      }

      console.log(`[StockSafety] Operação concluída com sucesso - Produto: ${produtoId}, Estoque: ${estoqueAtual} → ${novoEstoque}`);
      return movement;
    });

    if (typeof out === 'object' && out !== null && 'success' in out && !out.success) {
      return out as { success: false; error: string };
    }

    return { success: true, data: out as StockMovement };
  } catch (error) {
    console.error('[StockSafety] Erro na operação de estoque:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Valida se há estoque suficiente para uma operação
 */
export async function validateStockAvailability(
  tenantId: number, // Adicionado para multi-tenant
  produtoId: number,
  quantidade: number,
  tipo: 'entrada' | 'saida'
): Promise<{ success: boolean; data?: StockValidation; error?: string }> {
  try {
    const dbConnection = await db.getDb();
    if (!dbConnection) {
      return { success: false, error: "Database connection not available" };
    }

    try {
      const [produto] = await dbConnection.execute(
        `SELECT id, descricao, estoque, ativo FROM produtos WHERE tenantId = ${tenantId} AND id = ${produtoId}`
      );

      if (!produto || !Array.isArray(produto) || produto.length === 0) {
        return { success: true, data: {
          disponivel: false,
          estoqueAtual: 0,
          quantidadeSolicitada: quantidade,
          saldoAposOperacao: tipo === 'entrada' ? quantidade : -quantidade,
          erro: `PRODUTO_NAO_ENCONTRADO: Produto ${produtoId} não encontrado ou acesso negado`
        }};
      }

      const produtoData = parseProdutoRow(Array.isArray(produto) ? produto[0] : produto);
      if (!produtoData) {
        return { success: true, data: {
          disponivel: false,
          estoqueAtual: 0,
          quantidadeSolicitada: quantidade,
          saldoAposOperacao: tipo === 'entrada' ? quantidade : -quantidade,
          erro: `PRODUTO_DADO_CRITICO_AUSENTE: Produto ${produtoId} - dados inválidos`
        }};
      }

      if (produtoData.estoque === undefined || produtoData.estoque === null) {
        return { success: true, data: {
          disponivel: false,
          estoqueAtual: 0,
          quantidadeSolicitada: quantidade,
          saldoAposOperacao: tipo === 'entrada' ? quantidade : -quantidade,
          erro: `PRODUTO_DADO_CRITICO_AUSENTE: Produto ${produtoId} - estoque ausente`
        }};
      }
      
      const estoqueAtual = Number(produtoData.estoque);
      const novoEstoque = tipo === 'entrada' 
        ? estoqueAtual + quantidade 
        : estoqueAtual - quantidade;

      const disponivel = tipo === 'entrada' || novoEstoque >= 0;

      return { success: true, data: {
        disponivel,
        estoqueAtual,
        quantidadeSolicitada: quantidade,
        saldoAposOperacao: novoEstoque,
        erro: disponivel ? undefined : `ESTOQUE_INSUFICIENTE: Estoque atual (${estoqueAtual}) insuficiente para saída de ${quantidade}`
      }};
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Atualiza múltiplos produtos em lote (transação segura)
 */
export async function updateMultipleStockSafe(
  tenantId: number, // Adicionado para multi-tenant
  operacoes: Array<{ produtoId: number; quantidade: number; motivo: string }>
): Promise<{ success: boolean; data?: StockMovement[]; error?: string }> {
  if (!tenantId) return { success: false, error: "tenantId is required" };
  
  try {
    return await runStockTransaction(async (tx) => {
      const movements: StockMovement[] = [];
      
      // 1. Bloquear todos os produtos para leitura
      const produtoIds = operacoes.map(op => op.produtoId);
      const produtosQuery = await tx.execute(
        `SELECT id, descricao, estoque, ativo FROM produtos WHERE tenantId = ? AND id IN (${produtoIds.map(() => '?').join(',')}) FOR UPDATE`,
        [tenantId, ...produtoIds]
      );

      const produtosRows = Array.isArray(produtosQuery) ? produtosQuery[0] : produtosQuery;
      const produtosMap = mapProdutoRowsToLock(produtosRows);

      // 2. Processar cada operação
      for (const operacao of operacoes) {
        const produtoData = produtosMap.get(operacao.produtoId);
        
        if (!produtoData) {
          return { success: false, error: `ESTOQUE_INSUFICIENTE_MULTIPLO: Produto ${operacao.produtoId} não encontrado ou acesso negado` };
        }

        if (produtoData.estoque === undefined || produtoData.estoque === null) {
          return { success: false, error: `PRODUTO_DADO_CRITICO_AUSENTE: Produto ${operacao.produtoId} - estoque ausente` };
        }
        
        const estoqueAtual = Number(produtoData.estoque);
        const novoEstoque = estoqueAtual + operacao.quantidade;

        if (novoEstoque < 0) {
          return { success: false, error: `ESTOQUE_INSUFICIENTE_MULTIPLO: Produto ${produtoData.descricao} - Estoque insuficiente` };
        }

        // Atualizar estoque
        await tx.execute(
          `UPDATE produtos SET estoque = ?, updatedAt = NOW() WHERE tenantId = ? AND id = ? AND estoque = ?`,
          [novoEstoque, tenantId, operacao.produtoId, estoqueAtual]
        );

        // Registrar movimento
        const movement: StockMovement = {
          id: 0,
          produtoId: operacao.produtoId,
          descricao: produtoData.descricao,
          quantidade: operacao.quantidade,
          tipo: operacao.quantidade >= 0 ? 'entrada' : 'saida',
          estoqueAnterior: estoqueAtual,
          estoqueNovo: novoEstoque,
          motivo: operacao.motivo,
          usuario: 'batch_operation',
          timestamp: new Date(),
        };

        movements.push(movement);
      }

      return { success: true, data: movements };
    });
  } catch (error) {
    console.error('[StockSafety] Erro na operação em lote:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Reserva estoque para um pedido (transação segura)
 */
export async function reserveStockForOrder(
  tenantId: number, // Adicionado para multi-tenant
  itens: Array<{ produtoId: number; quantidade: number }>,
  pedidoId?: number,
  usuarioId?: number,
  vendedorId?: number
): Promise<{ success: boolean; data?: StockMovement[]; error?: string }> {
  if (!tenantId) return { success: false, error: "tenantId is required" };
  
  try {
    return await runStockTransaction(async (tx) => {
      const movements: StockMovement[] = [];
      
      // 1. Bloquear todos os produtos para leitura
      const produtoIds = itens.map(item => item.produtoId);
      const produtosQuery = await tx.execute(
        `SELECT id, descricao, estoque, ativo FROM produtos WHERE tenantId = ? AND id IN (${produtoIds.map(() => '?').join(',')}) FOR UPDATE`,
        [tenantId, ...produtoIds]
      );

      const produtosRows = Array.isArray(produtosQuery) ? produtosQuery[0] : produtosQuery;
      const produtosMap = mapProdutoRowsToLock(produtosRows);

      // 2. Validar e reservar cada item
      for (const item of itens) {
        const produtoData = produtosMap.get(item.produtoId);
        
        if (!produtoData) {
          return { success: false, error: `ESTOQUE_INSUFICIENTE_PEDIDO: Produto ${item.produtoId} não encontrado ou acesso negado` };
        }

        if (produtoData.estoque === undefined || produtoData.estoque === null) {
          return { success: false, error: `PRODUTO_DADO_CRITICO_AUSENTE: Produto ${item.produtoId} - estoque ausente` };
        }

        const estoqueAtual = Number(produtoData.estoque);

        if (!produtoData.ativo) {
          return { success: false, error: `ESTOQUE_INSUFICIENTE_PEDIDO: Produto ${produtoData.descricao} está inativo` };
        }

        if (estoqueAtual < item.quantidade) {
          return { success: false, error: `ESTOQUE_INSUFICIENTE_PEDIDO: Produto ${produtoData.descricao} - Estoque insuficiente` };
        }

        const novoEstoque = estoqueAtual - item.quantidade;

        // Atualizar estoque
        await tx.execute(
          `UPDATE produtos SET estoque = ?, updatedAt = NOW() WHERE tenantId = ? AND id = ? AND estoque = ?`,
          [novoEstoque, tenantId, item.produtoId, estoqueAtual]
        );

        // Registrar movimento
        const movement: StockMovement = {
          id: 0,
          produtoId: item.produtoId,
          descricao: produtoData.descricao,
          quantidade: -item.quantidade, // Negativo para saída
          tipo: 'saida',
          estoqueAnterior: estoqueAtual,
          estoqueNovo: novoEstoque,
          motivo: pedidoId ? `Reserva para pedido ${pedidoId}` : 'Reserva para pedido não identificado',
          usuario: usuarioId ? `user_${usuarioId}` : 'user_system',
          timestamp: new Date(),
        };

        movements.push(movement);
      }

      return { success: true, data: movements };
    });
  } catch (error) {
    console.error('[StockSafety] Erro na reserva de estoque:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Libera estoque reservado para um pedido
 */
export async function releaseStockForOrder(
  tenantId: number, // Adicionado para multi-tenant
  itens: Array<{ produtoId: number; quantidade: number }>,
  pedidoId?: number,
  usuarioId?: number,
  vendedorId?: number
): Promise<{ success: boolean; data?: StockMovement[]; error?: string }> {
  if (!tenantId) return { success: false, error: "tenantId is required" };
  
  try {
    return await runStockTransaction(async (tx) => {
      const movements: StockMovement[] = [];
      
      // 1. Bloquear todos os produtos para leitura
      const produtoIds = itens.map(item => item.produtoId);
      const produtosQuery = await tx.execute(
        `SELECT id, descricao, estoque, ativo FROM produtos WHERE tenantId = ? AND id IN (${produtoIds.map(() => '?').join(',')}) FOR UPDATE`,
        [tenantId, ...produtoIds]
      );

      const produtosRows = Array.isArray(produtosQuery) ? produtosQuery[0] : produtosQuery;
      const produtosMap = mapProdutoRowsToLock(produtosRows);

      // 2. Liberar estoque de cada item
      for (const item of itens) {
        const produtoData = produtosMap.get(item.produtoId);
        
        if (!produtoData) {
          return { success: false, error: `LIBERACAO_ESTOQUE_FALHOU: Produto ${item.produtoId} não encontrado ou acesso negado` };
        }

        if (produtoData.estoque === undefined || produtoData.estoque === null) {
          return { success: false, error: `PRODUTO_DADO_CRITICO_AUSENTE: Produto ${item.produtoId} - estoque ausente` };
        }

        const estoqueAtual = Number(produtoData.estoque);
        const novoEstoque = estoqueAtual + item.quantidade;

        // Atualizar estoque
        await tx.execute(
          `UPDATE produtos SET estoque = ?, updatedAt = NOW() WHERE tenantId = ? AND id = ? AND estoque = ?`,
          [novoEstoque, tenantId, item.produtoId, estoqueAtual]
        );

        // Registrar movimento
        const movement: StockMovement = {
          id: 0,
          produtoId: item.produtoId,
          descricao: produtoData.descricao,
          quantidade: item.quantidade, // Positivo para entrada
          tipo: 'entrada',
          estoqueAnterior: estoqueAtual,
          estoqueNovo: novoEstoque,
          motivo: pedidoId ? `Liberação de reserva do pedido ${pedidoId}` : 'Liberação de reserva de pedido não identificado',
          usuario: usuarioId ? `user_${usuarioId}` : 'user_system',
          timestamp: new Date(),
        };

        movements.push(movement);
      }

      return { success: true, data: movements };
    });
  } catch (error) {
    console.error('[StockSafety] Erro na liberação de estoque:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Busca movimentos de estoque com filtros
 */
export async function getStockMovements(
  tenantId: number,
  filters: {
    produtoId?: number;
    tipo?: 'entrada' | 'saida';
    dataInicio?: Date;
    dataFim?: Date;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ success: boolean; data?: StockMovement[]; error?: string }> {
  try {
    const dbConnection = await db.getDb();
    if (!dbConnection) {
      return { success: false, error: "Database connection not available" };
    }

    let query = `
      SELECT id, produtoId, descricao, quantidade, tipo, estoqueAnterior, estoqueNovo, motivo, usuario, timestamp 
      FROM stock_movements 
      WHERE tenantId = ?
    `;
    const params: any[] = [tenantId];

    if (filters.produtoId) {
      query += ` AND produtoId = ?`;
      params.push(filters.produtoId);
    }

    if (filters.tipo) {
      query += ` AND tipo = ?`;
      params.push(filters.tipo);
    }

    if (filters.dataInicio) {
      query += ` AND timestamp >= ?`;
      params.push(filters.dataInicio);
    }

    if (filters.dataFim) {
      query += ` AND timestamp <= ?`;
      params.push(filters.dataFim);
    }

    query += ` ORDER BY timestamp DESC`;

    if (filters.limit) {
      query += ` LIMIT ?`;
      params.push(filters.limit);
    }

    if (filters.offset) {
      query += ` OFFSET ?`;
      params.push(filters.offset);
    }

    const [result] = await dbConnection.execute(query);
    const movements = Array.isArray(result) ? result.map((row: any) => ({
      id: row.id,
      produtoId: row.produtoId,
      descricao: row.descricao,
      quantidade: row.quantidade,
      tipo: row.tipo,
      estoqueAnterior: row.estoqueAnterior,
      estoqueNovo: row.estoqueNovo,
      motivo: row.motivo,
      usuario: row.usuario,
      timestamp: new Date(row.timestamp),
    })) : [];

    return { success: true, data: movements };
  } catch (error) {
    console.error('[StockSafety] Erro ao buscar movimentos:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Reconstitui estoque a partir de movimentos registrados
 */
export async function reconstituteStockFromMovements(
  tenantId: number,
  produtoId: number,
  dataReferencia?: Date
): Promise<{ success: boolean; data?: number; error?: string }> {
  try {
    const dbConnection = await db.getDb();
    if (!dbConnection) {
      return { success: false, error: "Database connection not available" };
    }

    let query = `
      SELECT SUM(CASE WHEN tipo = 'entrada' THEN quantidade ELSE -quantidade END) as saldo 
      FROM stock_movements 
      WHERE tenantId = ? AND produtoId = ?
    `;
    const params: any[] = [tenantId, produtoId];

    if (dataReferencia) {
      query += ` AND timestamp <= ?`;
      params.push(dataReferencia);
    }

    const [result] = await dbConnection.execute(query);
    const saldo = Array.isArray(result) && result[0] && typeof result[0].saldo === 'number' 
      ? result[0].saldo 
      : 0;

    return { success: true, data: saldo };
  } catch (error) {
    console.error('[StockSafety] Erro na reconstituição:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Verifica integridade dos dados de estoque vs movimentos
 */
export async function validateStockIntegrity(
  tenantId: number,
  produtoId?: number
): Promise<{ success: boolean; data?: Array<{ produtoId: number; descricao: string; estoqueAtual: number; saldoMovimentos: number; diferenca: number }>; error?: string }> {
  try {
    const dbConnection = await db.getDb();
    if (!dbConnection) {
      return { success: false, error: "Database connection not available" };
    }

    let produtoFilter = "";
    const params: any[] = [tenantId];
    
    if (produtoId) {
      produtoFilter = " AND p.id = ?";
      params.push(produtoId);
    }

    const query = `
      SELECT 
        p.id as produtoId,
        p.descricao,
        p.estoque as estoqueAtual,
        COALESCE(SUM(CASE WHEN sm.tipo = 'entrada' THEN sm.quantidade ELSE -sm.quantidade END), 0) as saldoMovimentos
      FROM produtos p
      LEFT JOIN stock_movements sm ON p.id = sm.produtoId AND sm.tenantId = p.tenantId
      WHERE p.tenantId = ?${produtoFilter}
      GROUP BY p.id, p.descricao, p.estoque
      ORDER BY p.descricao
    `;

    const [result] = await dbConnection.execute(query);
    const discrepancies = Array.isArray(result) ? result.map((row: any) => ({
      produtoId: row.produtoId,
      descricao: row.descricao,
      estoqueAtual: typeof row.estoqueAtual === 'number' ? row.estoqueAtual : 0,
      saldoMovimentos: typeof row.saldoMovimentos === 'number' ? row.saldoMovimentos : 0,
      diferenca: (typeof row.estoqueAtual === 'number' ? row.estoqueAtual : 0) - (typeof row.saldoMovimentos === 'number' ? row.saldoMovimentos : 0),
    })).filter((item: any) => Math.abs(item.diferenca) > 0.01) : [];

    return { success: true, data: discrepancies };
  } catch (error) {
    console.error('[StockSafety] Erro na validação de integridade:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Recupera movimentos de estoque do audit log
 */
export async function recoverStockMovementsFromAudit(
  tenantId: number,
  limit: number = 1000
): Promise<{ success: boolean; data?: StockMovement[]; error?: string }> {
  try {
    const dbConnection = await db.getDb();
    if (!dbConnection) {
      return { success: false, error: "Database connection not available" };
    }

    // Buscar entradas de audit log relacionadas a estoque
    const auditQuery = `
      SELECT id, entity, entityId, action, payloadJson, createdAt
      FROM audit_logs 
      WHERE tenantId = ? 
        AND entity IN ('produtos', 'stock_movements')
        AND action IN ('create', 'update', 'stock_entry', 'stock_exit')
      ORDER BY createdAt DESC
      LIMIT ?
    `;

    const [auditResult] = await dbConnection.execute(`SELECT id, payloadJson FROM audit_logs WHERE tenantId = ${tenantId} ORDER BY createdAt DESC LIMIT ${limit}`);
    const movements: StockMovement[] = [];

    if (Array.isArray(auditResult)) {
      for (const row of auditResult) {
        try {
          const raw = row["payloadJson"];
          
          if (typeof raw !== "string") {
            return { success: false, error: "payloadJson deve ser string" };
          }
          
          if (raw.trim() === "") {
            return { success: false, error: "payloadJson não pode ser vazio" };
          }
          
          const parsed = JSON.parse(raw);

          // Tentar extrair dados de movimento do payload
          if (parsed && typeof parsed === 'object') {
            const movement: StockMovement = {
              id: row.id,
              produtoId: parsed.produtoId || 0,
              descricao: parsed.descricao || parsed.nome || 'Desconhecido',
              quantidade: parsed.quantidade || 0,
              tipo: parsed.tipo || (parsed.quantidade >= 0 ? 'entrada' : 'saida'),
              estoqueAnterior: parsed.estoqueAnterior || 0,
              estoqueNovo: parsed.estoqueNovo || 0,
              motivo: parsed.motivo || row.action,
              usuario: parsed.usuario || 'system',
              timestamp: new Date(row.createdAt),
            };

            movements.push(movement);
          }
        } catch (parseError) {
          console.warn(`[StockSafety] Falha ao parsear movimento do audit log ${row.id}:`, parseError);
          // Continuar com o próximo registro
        }
      }
    }

    return { success: true, data: movements };
  } catch (error) {
    console.error('[StockSafety] Erro na recuperação de movimentos:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
