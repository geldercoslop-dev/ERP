/**
 * Cache inteligente para consultas frequentes do ERP.
 * Extende o cache base com métodos específicos para dados do negócio.
 */
import { getOrSet } from './api-cache.js';
import * as db from '../db/index.js';
import { eq, or, like, gte, lte, and, lt, sql, produtos, clientes, pedidos, cargas, contasReceber, contasPagar } from '../db/index.js';
import { toDbDateStrict } from '../utils/date.js';
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
    estoque: 5 * 60 * 1000, // 5 minutos (mudança rápida)
    vendas: 2 * 60 * 1000, // 2 minutos (alta frequência)
    relatorios: 30 * 60 * 1000, // 30 minutos
    cargas: 20 * 60 * 1000, // 20 minutos
    financeiro: 10 * 60 * 1000, // 10 minutos
};
export async function getProdutosCache(busca) {
    const key = `produtos:${busca || 'todos'}`;
    return getOrSet(key, async () => {
        const dbConnection = await db.getDb();
        if (!dbConnection)
            return [];
        const baseQuery = dbConnection.select().from(produtosTable);
        if (busca) {
            const produtosData = await baseQuery
                .where(or(like(produtosTable.descricao, `%${busca}%`), like(produtosTable.marca, `%${busca}%`)))
                .limit(100)
                .orderBy(produtosTable.descricao);
            return produtosData;
        }
        const produtosData = await baseQuery.limit(100).orderBy(produtosTable.descricao);
        return produtosData;
    }, CACHE_TTL.produtos);
}
/**
 * Cache para clientes com busca por nome e telefone.
 */
export async function getClientesCache(busca) {
    const key = `clientes:${busca || 'todos'}`;
    return getOrSet(key, async () => {
        const dbConnection = await db.getDb();
        if (!dbConnection)
            return [];
        const baseQuery = dbConnection.select().from(clientesTable);
        if (busca) {
            const clientesData = await baseQuery
                .where(or(like(clientesTable.nome, `%${busca}%`), like(clientesTable.telefone, `%${busca}%`)))
                .limit(100)
                .orderBy(clientesTable.nome);
            return clientesData;
        }
        const clientesData = await baseQuery.limit(100).orderBy(clientesTable.nome);
        return clientesData;
    }, CACHE_TTL.clientes);
}
/**
 * Cache para vendas do dia (crítico para LEO).
 */
export async function getVendasHojeCache(data) {
    const dataStr = data?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0];
    const key = `vendas:dia:${dataStr}`;
    return getOrSet(key, async () => {
        const dbConnection = await db.getDb();
        if (!dbConnection)
            return { quantidade: 0, total: 0, pedidos: [] };
        const inicioDia = new Date(dataStr + 'T00:00:00.000Z');
        const fimDia = new Date(dataStr + 'T23:59:59.999Z');
        const pedidos = await dbConnection
            .select()
            .from(pedidosTable)
            .where(and(gte(pedidosTable.createdAt, toDbDateStrict(inicioDia)), lte(pedidosTable.createdAt, toDbDateStrict(fimDia)), sql `${pedidosTable.status} != 'CANCELADO'`));
        const quantidade = pedidos.length;
        const total = Number(pedidos.reduce((sum, p) => sum + Number(Number(p.total || 0)), 0));
        return { quantidade, total, pedidos };
    }, CACHE_TTL.vendas);
}
/**
 * Cache para estoque baixo (crítico para alertas do LEO).
 */
export async function getEstoqueBaixoCache() {
    const key = `estoque:baixo:${new Date().toISOString().split('T')[0]}`;
    return getOrSet(key, async () => {
        const dbConnection = await db.getDb();
        if (!dbConnection)
            return [];
        const produtos = await dbConnection
            .select({
            id: produtosTable.id,
            descricao: produtosTable.descricao,
            estoque: produtosTable.estoque,
            marca: produtosTable.marca,
        })
            .from(produtosTable)
            .where(and(lt(produtosTable.estoque, sql `5`), // TODO: usar coluna estoque_minimo quando existir
        eq(produtosTable.ativo, 1)))
            .orderBy(produtosTable.estoque)
            .limit(20);
        return produtos;
    }, CACHE_TTL.estoque);
}
/**
 * Cache para resumo financeiro (contas a pagar/receber).
 */
export async function getFinanceiroResumoCache() {
    return getOrSet('financeiro:resumo', async () => {
        const dbConnection = await db.getDb();
        if (!dbConnection)
            return { aPagar: 0, aReceber: 0, vencidas: 0, aVencer: 0 };
        const hoje = new Date();
        const daqui30dias = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);
        // Contas a receber
        const contasReceber = await dbConnection
            .select()
            .from(contasReceberTable)
            .where(and(sql `${contasReceberTable.status} != 'RECEBIDA'`, lte(contasReceberTable.dataVencimento, toDbDateStrict(daqui30dias))));
        // Contas a pagar
        const contasPagar = await dbConnection
            .select()
            .from(contasPagarTable)
            .where(and(sql `${contasPagarTable.status} != 'PAGO'`, lte(contasPagarTable.dataVencimento, toDbDateStrict(daqui30dias))));
        const aReceber = Number(contasReceber.reduce((sum, c) => sum + Number(Number(c.valor || 0)), 0));
        const aPagar = Number(contasPagar.reduce((sum, c) => sum + Number(Number(c.valor || 0)), 0));
        return {
            aReceber,
            aPagar,
            vencidas: 0, // TODO: calcular vencidas
            aVencer: 0, // TODO: calcular a vencer
        };
    }, CACHE_TTL.financeiro);
}
// Exportações para compatibilidade com LEO router já estão disponíveis acima
