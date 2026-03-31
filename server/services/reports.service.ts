import * as db from "../db/index.js";
import { eq, and, gte, lte, sql, asc } from "drizzle-orm";
import { pedidos } from "../../drizzle/schema.js";

/**
 * Serviço de relatórios e análises do ERP.
 * Todas as funções são tenant-aware.
 */

export async function getVendasPeriodo(tenantId: number, dataInicio: Date, dataFim: Date) {
  const dbConn = await db.getDb();
  if (!dbConn) throw new Error("Database not available");

  return await dbConn.select({
    data: sql<string>`DATE(${pedidos.createdAt})`,
    quantidade: sql<number>`COUNT(*)`,
    total: sql<number>`SUM(${pedidos.total})`
  })
  .from(pedidos)
  .where(and(
    eq(pedidos.tenantId, tenantId),
    gte(pedidos.createdAt, dataInicio),
    lte(pedidos.createdAt, dataFim)
  ))
  .groupBy(sql`DATE(${pedidos.createdAt})`)
  .orderBy(asc(sql`DATE(${pedidos.createdAt})`));
}
