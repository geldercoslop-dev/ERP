import * as db from "../db/index.js";
import { eq, and, inArray } from "drizzle-orm";
import { boletos, clientes, pedidos } from "../../drizzle/schema.js";
import { assertDbConnection } from "../_core/errors/assertions.js";

/**
 * Serviço de boletos do ERP.
 * Todas as funções são tenant-aware.
 */

/** Lista todos os boletos com nome do cliente (para admin). */
export async function listBoletosAdmin(tenantId: number) {
  const dbConn = await db.getDb();
  assertDbConnection(dbConn);

  return await dbConn
    .select({
      id: boletos.id,
      numeroPedido: boletos.numeroPedido,
      valorOriginal: boletos.valorOriginal,
      valorAberto: boletos.valorAberto,
      dataVencimento: boletos.dataVencimento,
      status: boletos.status,
      createdAt: boletos.createdAt,
      clienteId: boletos.clienteId,
      clienteNome: clientes.nome
    })
    .from(boletos)
    .innerJoin(clientes, eq(boletos.clienteId, clientes.id));
}

/** Verifica se todos os pedidos pertencem ao vendedor. */
export async function validatePedidosVendedor(tenantId: number, pedidosIds: number[], vendedorId: number): Promise<boolean> {
  const dbConn = await db.getDb();
  assertDbConnection(dbConn);

  const rows = await dbConn
    .select({ vendedorId: pedidos.vendedorId })
    .from(pedidos)
    .where(inArray(pedidos.id, pedidosIds));

  return rows.every((r) => r.vendedorId === vendedorId);
}
