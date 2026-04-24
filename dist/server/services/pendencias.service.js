import * as db from "../db/index.js";
import { eq, and, inArray, asc, sql } from "drizzle-orm";
import { pendencias, pedidos, vendedores, produtos, cores } from "../../drizzle/schema.js";
import { PendenciaStatus, PendenciaStatusValues } from "../shared/domain-status.js";
import { validateStatus } from "../shared/guards/domain-guard.js";
import { assertDbConnection } from "../_core/errors/assertions.js";
import { toDbDate } from "../utils/date.js";
/**
 * Serviço de pendências do ERP.
 * Todas as funções são tenant-aware.
 */
/** Lista pendências. Se vendedorId for informado, retorna apenas as do vendedor. */
export async function listPendencias(tenantId, vendedorId) {
    const dbConn = await db.getDb();
    assertDbConnection(dbConn);
    const statusFilter = inArray(pendencias.status, [PendenciaStatus.PENDENTE, PendenciaStatus.COMPRADO]);
    const conditions = [eq(pendencias.tenantId, tenantId), statusFilter];
    if (vendedorId != null) {
        conditions.push(eq(pendencias.vendedorId, vendedorId));
    }
    return await dbConn.select({
        id: pendencias.id,
        pedidoId: pendencias.pedidoId,
        pedidoNumero: pedidos.numero,
        vendedorNome: vendedores.nome,
        clienteNome: pedidos.clienteNome,
        produtoDescricao: produtos.descricao,
        produtoMarca: produtos.marca,
        corNome: cores.nome,
        quantidade: pendencias.quantidade,
        status: pendencias.status,
        dataPedido: pendencias.dataPedido,
    })
        .from(pendencias)
        .innerJoin(pedidos, eq(pendencias.pedidoId, pedidos.id))
        .innerJoin(vendedores, eq(pendencias.vendedorId, vendedores.id))
        .innerJoin(produtos, eq(pendencias.produtoId, produtos.id))
        .leftJoin(cores, eq(pendencias.corId, cores.id))
        .where(and(...conditions))
        .orderBy(asc(pendencias.dataPedido));
}
/** Atualiza status da pendência. Se vendedorId for informado, só atualiza se a pendência for desse vendedor. */
export async function updateStatusPendencia(tenantId, id, status, vendedorId) {
    const dbConn = await db.getDb();
    assertDbConnection(dbConn);
    try {
        const validated = validateStatus(status, PendenciaStatusValues, "pendencia.status");
        const updateData = { status: validated };
        if (validated === PendenciaStatus.RESOLVIDO) {
            updateData.dataResolvido = toDbDate(new Date());
        }
        const conditions = [eq(pendencias.tenantId, tenantId), eq(pendencias.id, id)];
        if (vendedorId != null) {
            conditions.push(eq(pendencias.vendedorId, vendedorId));
        }
        await dbConn.update(pendencias).set(updateData).where(and(...conditions));
        return { success: true };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
/**
 * Resumo de pendências por produto (tenant-aware)
 */
export async function getPendenciasResumo(tenantId, vendedorId) {
    const dbConn = await db.getDb();
    assertDbConnection(dbConn);
    const conditions = [
        eq(pendencias.tenantId, tenantId),
        eq(pendencias.status, PendenciaStatus.PENDENTE),
        eq(produtos.ativo, 1),
    ];
    if (vendedorId != null) {
        conditions.push(eq(pendencias.vendedorId, vendedorId));
    }
    return await dbConn.select({
        fornecedor: produtos.fornecedor,
        produtoId: produtos.id,
        descricao: produtos.descricao,
        marca: produtos.marca,
        quantidade: sql `SUM(${pendencias.quantidade})`.as("quantidade"),
        qtdPedidos: sql `COUNT(DISTINCT(${pendencias.pedidoId}))`.as("qtdPedidos"),
    })
        .from(pendencias)
        .innerJoin(produtos, eq(produtos.id, pendencias.produtoId))
        .where(and(...conditions))
        .groupBy(produtos.id, produtos.fornecedor, produtos.descricao, produtos.marca)
        .orderBy(asc(produtos.fornecedor), asc(produtos.descricao));
}
/**
 * Lista pendências detalhadas de um produto específico (tenant-aware)
 */
export async function getPendenciasByProduto(tenantId, produtoId, vendedorId) {
    const dbConn = await db.getDb();
    assertDbConnection(dbConn);
    const conditions = [
        eq(pendencias.tenantId, tenantId),
        eq(pendencias.produtoId, produtoId),
        eq(pendencias.status, PendenciaStatus.PENDENTE),
    ];
    if (vendedorId != null) {
        conditions.push(eq(pendencias.vendedorId, vendedorId));
    }
    return await dbConn.select({
        id: pendencias.id,
        pedidoId: pendencias.pedidoId,
        pedidoNumero: pedidos.numero,
        vendedorNome: vendedores.nome,
        clienteNome: pedidos.clienteNome,
        corNome: cores.nome,
        quantidade: pendencias.quantidade,
        dataPedido: pendencias.dataPedido,
    })
        .from(pendencias)
        .innerJoin(pedidos, eq(pendencias.pedidoId, pedidos.id))
        .innerJoin(vendedores, eq(pendencias.vendedorId, vendedores.id))
        .leftJoin(cores, eq(pendencias.corId, cores.id))
        .where(and(...conditions))
        .orderBy(asc(pendencias.dataPedido));
}
