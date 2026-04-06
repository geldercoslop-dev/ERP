import * as db from "../db/index.js";
import { eq, and, inArray, asc, sql } from "drizzle-orm";
import { pendencias, pedidos, vendedores, produtos, cores } from "../../drizzle/schema.js";
import { PendenciaStatus, PendenciaStatusValues, type PendenciaStatusValue } from "../shared/domain-status.js";
import { validateStatus } from "../shared/guards/domain-guard.js";

/**
 * Serviço de pendências do ERP.
 * Todas as funções são tenant-aware.
 */

/** Lista pendências. Se vendedorId for informado, retorna apenas as do vendedor. */
export async function listPendencias(tenantId: number, vendedorId?: number) {
  const dbConn = await db.getDb();
  if (!dbConn) return [];

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
export async function updateStatusPendencia(tenantId: number, id: number, status: PendenciaStatusValue, vendedorId?: number): Promise<{ success: boolean; error?: string }> {
  const dbConn = await db.getDb();
  if (!dbConn) return { success: false, error: "Database not available" };

  try {
    const validated = validateStatus(status, PendenciaStatusValues, "pendencia.status");
    const updateData: { status: PendenciaStatusValue; dataResolvido?: Date } = { status: validated };
    if (validated === PendenciaStatus.RESOLVIDO) {
      updateData.dataResolvido = new Date();
    }

    const conditions = [eq(pendencias.tenantId, tenantId), eq(pendencias.id, id)];
    if (vendedorId != null) {
      conditions.push(eq(pendencias.vendedorId, vendedorId));
    }
    
    await dbConn.update(pendencias).set(updateData).where(and(...conditions));
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Resumo de pendências por produto (tenant-aware)
 */
export async function getPendenciasResumo(tenantId: number, vendedorId?: number) {
  const dbConn = await db.getDb();
  if (!dbConn) return [];

  const conditions = [
    eq(pendencias.tenantId, tenantId),
    eq(pendencias.status, PendenciaStatus.PENDENTE),
    eq(produtos.ativo, true),
  ];
  
  if (vendedorId != null) {
    conditions.push(eq(pendencias.vendedorId, vendedorId));
  }

  return await dbConn.select({
    fornecedor: produtos.fornecedor,
    produtoId: produtos.id,
    descricao: produtos.descricao,
    marca: produtos.marca,
    quantidade: sql<number>`SUM(${pendencias.quantidade})`.as("quantidade"),
    qtdPedidos: sql<number>`COUNT(DISTINCT(${pendencias.pedidoId}))`.as("qtdPedidos"),
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
export async function getPendenciasByProduto(tenantId: number, produtoId: number, vendedorId?: number) {
  const dbConn = await db.getDb();
  if (!dbConn) return [];

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
