/**
 * Stock Safety Service
 * 
 * Serviço para operações seguras de estoque com controle de concorrência
 */

import { runStockTransaction } from './db-transaction';
import * as db from '../db/index';
import { eq, sql, and } from 'drizzle-orm';
import { produtos, itensPedido } from '../../drizzle/schema';
import { executeQuery } from '../config/database';
import { isRecord } from '../_core/type-guards';

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
import { ensureArray, ensureObject, ensureCreatedResult } from "../_core/service-response";

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
): Promise<StockMovement> {
  if (!tenantId) throw new Error("tenantId is required");
  const out = await runStockTransaction(async (tx) => {
    console.log(`[StockSafety] Iniciando operação segura - Tenant: ${tenantId}, Produto: ${produtoId}, Qtd: ${quantidade}, Tipo: ${operacao.tipo}`);

    // 1. Bloquear o produto para leitura (SELECT FOR UPDATE) com tenantId
    const [produto] = await tx.execute(
      `SELECT id, descricao, estoque, ativo FROM produtos WHERE tenantId = ? AND id = ? FOR UPDATE`,
      [tenantId, produtoId]
    );

    if (!produto || !Array.isArray(produto) || produto.length === 0) {
      throw new Error(`PRODUTO_NAO_ENCONTRADO: Produto ${produtoId} não encontrado ou acesso negado`);
    }

    const firstRow = Array.isArray(produto) && produto.length > 0 ? produto[0] : null;
    const produtoData = parseProdutoRow(firstRow);
    if (!produtoData) {
      throw new Error(`PRODUTO_NAO_ENCONTRADO: Produto ${produtoId} — linha inválida`);
    }
    const estoqueAtual = Number(produtoData.estoque || 0);

    // 2. Validar se produto está ativo
    if (!produtoData.ativo) {
      throw new Error(`PRODUTO_INATIVO: Produto ${produtoData.descricao} está inativo`);
    }

    // 3. Calcular novo estoque
    const quantidadeAjustada = operacao.tipo === 'saida' ? -Math.abs(quantidade) : Math.abs(quantidade);
    const novoEstoque = estoqueAtual + quantidadeAjustada;

    // 4. Validar estoque negativo
    if (novoEstoque < 0) {
      throw new Error(`ESTOQUE_INSUFICIENTE: Estoque atual (${estoqueAtual}) insuficiente para saída de ${Math.abs(quantidade)}. Saldo seria: ${novoEstoque}`);
    }

    // 5. Validar limite máximo de estoque (opcional)
    const ESTOQUE_MAXIMO = 99999;
    if (novoEstoque > ESTOQUE_MAXIMO) {
      throw new Error(`ESTOQUE_EXCEDIDO: Novo estoque (${novoEstoque}) excede limite máximo (${ESTOQUE_MAXIMO})`);
    }

    // 6. Atualizar estoque com verificação adicional de concorrência
    // Usamos a condição WHERE para garantir que o estoque não mudou desde que lemos
    const updateResult = await tx.execute(
      `UPDATE produtos SET estoque = ?, updatedAt = NOW() 
       WHERE tenantId = ? AND id = ? AND estoque = ?`,
      [novoEstoque, tenantId, produtoId, estoqueAtual]
    );
    
    // Verificar se o update realmente afetou alguma linha
    const affectedRows = Array.isArray(updateResult) && updateResult[0] && 'affectedRows' in updateResult[0] ? 
      updateResult[0].affectedRows : 0;
    if (affectedRows === 0) {
      throw new Error(`CONCORRENCIA_DETECTADA: O estoque do produto ${produtoId} foi alterado por outro processo durante a operação`);
    }

    // 7. Registrar movimento no audit log
    await db.insertAuditLog({
      tenantId,
      actorUserId: operacao.usuarioId,
      actorVendedorId: operacao.vendedorId,
      action: operacao.tipo === 'entrada' ? 'ENTRADA' : 'SAIDA',
      entity: 'produto',
      entityId: produtoId,
      payloadJson: JSON.stringify({
        produtoId,
        descricao: produtoData.descricao,
        quantidade,
        tipo: operacao.tipo,
        motivo: operacao.motivo,
        estoqueAnterior: estoqueAtual,
        estoqueNovo: novoEstoque,
        pedidoId: operacao.pedidoId
      }),
      traceId: `STOCK_${Date.now()}`
    }, tx);

    const movementId = Date.now(); // movementId não é mais usado para retorno real de insertAuditLog que é void

    console.log(`[StockSafety] Operação concluída - ID: ${movementId}, Estoque: ${estoqueAtual} → ${novoEstoque}`);

    return {
      id: movementId,
      produtoId,
      descricao: produtoData.descricao,
      quantidade: quantidadeAjustada,
      tipo: operacao.tipo,
      estoqueAnterior: estoqueAtual,
      estoqueNovo: novoEstoque,
      motivo: operacao.motivo,
      usuario: operacao.usuarioId ? `User-${operacao.usuarioId}` : `Vendedor-${operacao.vendedorId}`,
      timestamp: new Date()
    };
  });
  void import("../_core/cache-invalidation")
    .then((m) => m.invalidateInventoryCachesForTenant(tenantId))
    .catch(() => {});
  return out;
}

/**
 * Valida disponibilidade de estoque sem alterar
 */
export async function validateStockAvailability(
  tenantId: number, // Adicionado para multi-tenant
  produtoId: number,
  quantidade: number
): Promise<StockValidation> {
  const dbConnection = await db.getDb();
  if (!dbConnection) {
    throw new Error("Database connection not available");
  }

  try {
    const [produto] = await dbConnection
      .select({
        id: db.produtos.id,
        descricao: db.produtos.descricao,
        estoque: db.produtos.estoque,
        ativo: db.produtos.ativo
      })
      .from(db.produtos)
      .where(and(eq(db.produtos.tenantId, tenantId), eq(db.produtos.id, produtoId)));

    if (!produto) {
      return {
        disponivel: false,
        estoqueAtual: 0,
        quantidadeSolicitada: quantidade,
        saldoAposOperacao: -quantidade,
        erro: `Produto ${produtoId} não encontrado ou acesso negado`
      };
    }

    const estoqueAtual = Number(produto.estoque || 0);
    const saldoAposOperacao = estoqueAtual - quantidade;

    return {
      disponivel: produto.ativo && saldoAposOperacao >= 0,
      estoqueAtual,
      quantidadeSolicitada: quantidade,
      saldoAposOperacao,
      erro: !produto.ativo ? 'Produto inativo' : 
             saldoAposOperacao < 0 ? 'Estoque insuficiente' : undefined
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[StockSafety] Erro na validação:', errorMsg);
    throw error;
  }
}

/**
 * Atualiza múltiplos produtos em uma única transação
 */
export async function updateMultipleStockSafe(
  tenantId: number, // Adicionado para multi-tenant
  operacoes: Array<{ produtoId: number; quantidade: number; motivo: string }>
): Promise<StockMovement[]> {
  if (!tenantId) throw new Error("tenantId is required");
  return runStockTransaction(async (tx) => {
    const movements: StockMovement[] = [];
    
    // Otimização N+1: Buscar todos os produtos envolvidos de uma vez
    const produtoIds = Array.from(new Set(operacoes.map(o => o.produtoId)));
    const placeholders = produtoIds.map(() => '?').join(',');
    const [produtosRows] = await tx.execute(
      `SELECT id, descricao, estoque FROM produtos WHERE tenantId = ? AND id IN (${placeholders}) FOR UPDATE`,
      [tenantId, ...produtoIds]
    );

    const produtosMap = mapProdutoRowsToLock(produtosRows);

    for (const operacao of operacoes) {
      const produtoData = produtosMap.get(operacao.produtoId);
      
      if (!produtoData) {
        throw new Error(`ESTOQUE_INSUFICIENTE_MULTIPLO: Produto ${operacao.produtoId} não encontrado ou acesso negado`);
      }

      const estoqueAtual = Number(produtoData.estoque || 0);
      const novoEstoque = estoqueAtual + operacao.quantidade;

      if (novoEstoque < 0) {
        throw new Error(`ESTOQUE_INSUFICIENTE_MULTIPLO: Produto ${produtoData.descricao} - Estoque insuficiente`);
      }

      // Atualizar estoque
      await tx.execute(
        `UPDATE produtos SET estoque = ?, updatedAt = NOW() WHERE tenantId = ? AND id = ?`,
        [novoEstoque, tenantId, operacao.produtoId]
      );

      // Atualizar mapa local para operações subsequentes no mesmo lote
      produtosMap.set(operacao.produtoId, { ...produtoData, estoque: novoEstoque });

      movements.push({
        id: 0, // Será gerado pelo audit log (opcional registrar audit em lote aqui)
        produtoId: operacao.produtoId,
        descricao: produtoData.descricao,
        quantidade: operacao.quantidade,
        tipo: operacao.quantidade >= 0 ? 'entrada' : 'saida',
        estoqueAnterior: estoqueAtual,
        estoqueNovo: novoEstoque,
        motivo: operacao.motivo,
        usuario: 'BATCH_OPERATION',
        timestamp: new Date()
      });
    }

    return movements;
  });
}

/**
 * Reserva estoque para um pedido (bloqueia temporariamente)
 */
export async function reserveStockForOrder(
  tenantId: number, // Adicionado para multi-tenant
  itensPedido: Array<{ produtoId: number; quantidade: number }>,
  pedidoId: number,
  usuarioId?: number,
  vendedorId?: number
): Promise<StockMovement[]> {
  if (!tenantId) throw new Error("tenantId is required");
  return runStockTransaction(async (tx) => {
    const movements: StockMovement[] = [];
    
    // Otimização N+1: Buscar todos os produtos envolvidos de uma vez
    const produtoIds = Array.from(new Set(itensPedido.map(i => i.produtoId)));
    const placeholders = produtoIds.map(() => '?').join(',');
    const [produtosRows] = await tx.execute(
      `SELECT id, descricao, estoque, ativo FROM produtos WHERE tenantId = ? AND id IN (${placeholders}) FOR UPDATE`,
      [tenantId, ...produtoIds]
    );

    const produtosMap = mapProdutoRowsToLock(produtosRows);

    for (const item of itensPedido) {
      const produtoData = produtosMap.get(item.produtoId);
      
      if (!produtoData) {
        throw new Error(`ESTOQUE_INSUFICIENTE_PEDIDO: Produto ${item.produtoId} não encontrado ou acesso negado`);
      }

      const estoqueAtual = Number(produtoData.estoque || 0);

      if (!produtoData.ativo) {
        throw new Error(`ESTOQUE_INSUFICIENTE_PEDIDO: Produto ${produtoData.descricao} está inativo`);
      }

      if (estoqueAtual < item.quantidade) {
        throw new Error(`ESTOQUE_INSUFICIENTE_PEDIDO: Produto ${produtoData.descricao} - Estoque insuficiente`);
      }

      const novoEstoque = estoqueAtual - item.quantidade;

      // Atualizar estoque (reserva)
      await tx.execute(
        `UPDATE produtos SET estoque = ?, updatedAt = NOW() WHERE tenantId = ? AND id = ?`,
        [novoEstoque, tenantId, item.produtoId]
      );

      // Atualizar mapa local
      produtosMap.set(item.produtoId, { ...produtoData, estoque: novoEstoque });

      // Registrar movimento de reserva
      await db.insertAuditLog({
        tenantId,
        actorUserId: usuarioId,
        actorVendedorId: vendedorId,
        action: 'SAIDA',
        entity: 'produto',
        entityId: item.produtoId,
        payloadJson: JSON.stringify({
          produtoId: item.produtoId,
          descricao: produtoData.descricao,
          quantidade: item.quantidade,
          pedidoId,
          estoqueAnterior: estoqueAtual,
          estoqueNovo: novoEstoque,
          motivo: 'Reserva para pedido'
        }),
        traceId: `RESERVA_${pedidoId}_${Date.now()}`
      }, tx);

      movements.push({
        id: Date.now(),
        produtoId: item.produtoId,
        descricao: produtoData.descricao,
        quantidade: -item.quantidade,
        tipo: 'reserva',
        estoqueAnterior: estoqueAtual,
        estoqueNovo: novoEstoque,
        motivo: `Reserva para pedido #${pedidoId}`,
        usuario: usuarioId ? `User-${usuarioId}` : `Vendedor-${vendedorId}`,
        timestamp: new Date()
      });
    }

    return movements;
  });
}

/**
 * Libera estoque reservado (cancelamento de pedido)
 */
export async function releaseReservedStock(
  tenantId: number, // Adicionado para multi-tenant
  itensPedido: Array<{ produtoId: number; quantidade: number }>,
  pedidoId: number,
  motivo: string = 'Cancelamento de pedido',
  usuarioId?: number,
  vendedorId?: number
): Promise<StockMovement[]> {
  if (!tenantId) throw new Error("tenantId is required");
  return runStockTransaction(async (tx) => {
    const movements: StockMovement[] = [];
    
    // Otimização N+1: Buscar todos os produtos envolvidos de uma vez
    const produtoIds = Array.from(new Set(itensPedido.map(i => i.produtoId)));
    const placeholders = produtoIds.map(() => '?').join(',');
    const [produtosRows] = await tx.execute(
      `SELECT id, descricao, estoque FROM produtos WHERE tenantId = ? AND id IN (${placeholders}) FOR UPDATE`,
      [tenantId, ...produtoIds]
    );

    const produtosMap = mapProdutoRowsToLock(produtosRows);

    for (const item of itensPedido) {
      const produtoData = produtosMap.get(item.produtoId);
      
      if (!produtoData) {
        throw new Error(`LIBERACAO_ESTOQUE_FALHOU: Produto ${item.produtoId} não encontrado ou acesso negado`);
      }

      const estoqueAtual = Number(produtoData.estoque || 0);
      const novoEstoque = estoqueAtual + item.quantidade;

      // Devolver estoque ao reservar
      await tx.execute(
        `UPDATE produtos SET estoque = ?, updatedAt = NOW() WHERE tenantId = ? AND id = ?`,
        [novoEstoque, tenantId, item.produtoId]
      );

      // Atualizar mapa local
      produtosMap.set(item.produtoId, { ...produtoData, estoque: novoEstoque });

      // Registrar movimento de liberação
      await db.insertAuditLog({
        tenantId,
        actorUserId: usuarioId,
        actorVendedorId: vendedorId,
        action: 'ENTRADA',
        entity: 'produto',
        entityId: item.produtoId,
        payloadJson: JSON.stringify({
          produtoId: item.produtoId,
          descricao: produtoData.descricao,
          quantidade: item.quantidade,
          pedidoId,
          estoqueAnterior: estoqueAtual,
          estoqueNovo: novoEstoque,
          motivo
        }),
        traceId: `LIBERACAO_${pedidoId}_${Date.now()}`
      }, tx);

      movements.push({
        id: Date.now(),
        produtoId: item.produtoId,
        descricao: produtoData.descricao,
        quantidade: item.quantidade,
        tipo: 'liberacao',
        estoqueAnterior: estoqueAtual,
        estoqueNovo: novoEstoque,
        motivo: `${motivo} - Pedido #${pedidoId}`,
        usuario: usuarioId ? `User-${usuarioId}` : `Vendedor-${vendedorId}`,
        timestamp: new Date()
      });
    }

    return movements;
  });
}

/**
 * Obtém histórico de movimentações de um produto
 */
export async function getStockMovements(
  tenantId: number, // Adicionado para multi-tenant
  produtoId: number,
  limit: number = 100
): Promise<StockMovement[]> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return [];

  try {
    const [rows] = await executeQuery(`
      SELECT
        al.id,
        al.payloadJson,
        al.createdAt,
        al.action,
        al.actorUserId,
        al.actorVendedorId
      FROM audit_log al
      WHERE al.tenantId = ?
        AND al.entity = 'produto' 
        AND al.entityId = ?
        AND al.action LIKE 'STOCK_%'
      ORDER BY al.createdAt DESC
      LIMIT ?`,
      [tenantId, produtoId, limit]
    );

    const rawList = Array.isArray(rows) ? rows : [];
    const result = rawList.map((row: unknown) => {
      const r = isRecord(row) ? row : {};
      let payload: Record<string, unknown> = {};
      try {
        const raw = r["payloadJson"];
        const parsed: unknown = typeof raw === "string" ? JSON.parse(raw || "{}") : {};
        payload = isRecord(parsed) ? parsed : {};
      } catch {
        payload = {};
      }
      const action = String(r["action"] ?? "");
      const created = r["createdAt"];
      const ts = created instanceof Date ? created : new Date(String(created ?? ""));
      return {
        id: Number(r["id"] ?? 0),
        produtoId,
        descricao: String(payload["descricao"] ?? ""),
        quantidade: Number(payload["quantidade"] ?? 0),
        tipo: action.replace("STOCK_", "").toLowerCase(),
        estoqueAnterior: Number(payload["estoqueAnterior"] ?? 0),
        estoqueNovo: Number(payload["estoqueNovo"] ?? 0),
        motivo: String(payload["motivo"] ?? ""),
        usuario: r["actorUserId"]
          ? `User-${r["actorUserId"]}`
          : r["actorVendedorId"]
            ? `Vendedor-${r["actorVendedorId"]}`
            : "System",
        timestamp: ts,
      };
    });
    
    // Garantir que o retorno seja sempre um array
    return ensureArray(result);
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[StockSafety] Erro ao obter movimentações:', errorMsg);
    return [];
  }
}
