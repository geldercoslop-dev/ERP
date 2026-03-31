/**
 * Cache inteligente para consultas frequentes do ERP.
 * Extende o cache base com métodos específicos para dados do negócio.
 */
import { getOrSet } from './api-cache.js';
import * as db from '../db/index.js';
import { logInfo } from '../_core/logger.js';
import { eq, or, like, gte, lte, and, lt, sql } from 'drizzle-orm';
import { produtos, clientes, pedidos, cargas, contasReceber, contasPagar } from '../../drizzle/schema.js';

// Alias para evitar conflito de nomes
const produtosTable = produtos;
const clientesTable = clientes;
const pedidosTable = pedidos;
const cargasTable = cargas;
const contasReceberTable = contasReceber;
const contasPagarTable = contasPagar;

// TTL específicos por tipo de dado
const CACHE_TTL = {
  produtos: 10 * 60 * 1000, // 10 minutos
  clientes: 15 * 60 * 1000, // 15 minutos
  estoque: 5 * 60 * 1000,  // 5 minutos (mudança rápida)
  vendas: 2 * 60 * 1000,  // 2 minutos (alta frequência)
  relatorios: 30 * 60 * 1000, // 30 minutos
  cargas: 20 * 60 * 1000,  // 20 minutos
  financeiro: 10 * 60 * 1000, // 10 minutos
} as const;

/**
 * Cache para produtos com busca por descrição.
 */
export async function getProdutosCache(busca?: string): Promise<any[]> {
  const key = `produtos:${busca || 'todos'}`;
  return getOrSet(key, async () => {
    const dbConnection = await db.getDb();
    if (!dbConnection) return [];
    
    let query = dbConnection.select().from(produtosTable) as any;
    
    if (busca) {
      query = query.where(
        or(
          like(produtosTable.descricao, `%${busca}%`),
          like(produtosTable.marca, `%${busca}%`)
        )
      );
    }
    
    const produtosData = await query.limit(100).orderBy(produtosTable.descricao);
    return produtosData;
  }, CACHE_TTL.produtos);
}

/**
 * Cache para clientes com busca por nome e telefone.
 */
export async function getClientesCache(busca?: string): Promise<any[]> {
  const key = `clientes:${busca || 'todos'}`;
  return getOrSet(key, async () => {
    const dbConnection = await db.getDb();
    if (!dbConnection) return [];
    
    let query = dbConnection.select().from(clientesTable) as any;
    
    if (busca) {
      query = query.where(
        or(
          like(clientesTable.nome, `%${busca}%`),
          like(clientesTable.telefone, `%${busca}%`)
        )
      );
    }
    
    const clientesData = await query.limit(100).orderBy(clientesTable.nome);
    return clientesData;
  }, CACHE_TTL.clientes);
}

/**
 * Cache para vendas do dia (crítico para LEO).
 */
export async function getVendasHojeCache(data?: Date): Promise<{ quantidade: number; total: number; pedidos: any[] }> {
  const dataStr = data?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0];
  const key = `vendas:dia:${dataStr}`;
  return getOrSet(key, async () => {
    const dbConnection = await db.getDb();
    if (!dbConnection) return { quantidade: 0, total: 0, pedidos: [] };
    
    const inicioDia = new Date(dataStr + 'T00:00:00.000Z');
    const fimDia = new Date(dataStr + 'T23:59:59.999Z');
    
    const pedidos = await dbConnection
      .select()
      .from(pedidosTable)
      .where(
        and(
          gte(pedidosTable.createdAt, inicioDia),
          lte(pedidosTable.createdAt, fimDia),
          sql`${pedidosTable.status} != 'CANCELADO'`
        )
      );
    
    const quantidade = pedidos.length;
    const total = Number(pedidos.reduce((sum: number, p: any) => sum + Number(p.total || 0), 0));
    
    return { quantidade, total, pedidos };
  }, CACHE_TTL.vendas);
}

/**
 * Cache para estoque baixo (crítico para alertas do LEO).
 */
export async function getEstoqueBaixoCache(): Promise<any[]> {
  const key = `estoque:baixo:${new Date().toISOString().split('T')[0]}`;
  return getOrSet(key, async () => {
    const dbConnection = await db.getDb();
    if (!dbConnection) return [];
    
    const produtos = await dbConnection
      .select({
        id: produtosTable.id,
        descricao: produtosTable.descricao,
        estoque: produtosTable.estoque,
        marca: produtosTable.marca,
      })
      .from(produtosTable)
      .where(
        and(
          lt(produtosTable.estoque, sql`5`), // TODO: usar coluna estoque_minimo quando existir
          eq(produtosTable.ativo, true)
        )
      )
      .orderBy(produtosTable.estoque)
      .limit(20);
    
    return produtos;
  }, CACHE_TTL.estoque);
}

/**
 * Cache para resumo financeiro (contas a pagar/receber).
 */
export async function getFinanceiroResumoCache(): Promise<{ aReceber: number; aPagar: number; vencidas: number; aVencer: number }> {
  return getOrSet('financeiro:resumo', async () => {
    const dbConnection = await db.getDb();
    if (!dbConnection) return { aPagar: 0, aReceber: 0, vencidas: 0, aVencer: 0 };
    
    const hoje = new Date();
    const daqui30dias = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    // Contas a receber
    const contasReceber = await dbConnection
      .select()
      .from(contasReceberTable)
      .where(
        and(
          sql`${contasReceberTable.status} != 'RECEBIDA'`,
          lte(contasReceberTable.dataVencimento, daqui30dias)
        )
      );
    
    // Contas a pagar
    const contasPagar = await dbConnection
      .select()
      .from(contasPagarTable)
      .where(
        and(
          sql`${contasPagarTable.status} != 'PAGO'`,
          lte(contasPagarTable.dataVencimento, daqui30dias)
        )
      );
    
    const aReceber = Number(contasReceber.reduce((sum: number, c: any) => sum + Number(c.valor || 0), 0));
    const aPagar = Number(contasPagar.reduce((sum: number, c: any) => sum + Number(c.valor || 0), 0));
    
    return {
      aReceber,
      aPagar,
      vencidas: 0, // TODO: calcular vencidas
      aVencer: 0, // TODO: calcular a vencer
    };
  }, CACHE_TTL.financeiro);
}

// Exportações para compatibilidade com LEO router já estão disponíveis acima
