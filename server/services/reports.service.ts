import * as db from "../db/index.js";
import { eq, and, gte, lte, sql, asc } from "drizzle-orm";
import { pedidos } from "../../drizzle/schema.js";
import { assertDbConnection } from "../_core/errors/assertions.js";

/**
 * Serviço de relatórios e análises do ERP.
 * Todas as funções são tenant-aware.
 */

type VendasPeriodoRow = {
  data: string;
  quantidade: number;
  total: number;
};

export async function getVendasPeriodo(tenantId: number, dataInicio: Date, dataFim: Date): Promise<{ success: boolean; data?: VendasPeriodoRow[]; error?: string }> {
  const dbConn = await db.getDb();
  assertDbConnection(dbConn);

  try {
    const result = await dbConn.select({
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

    return { success: true, data: result as VendasPeriodoRow[] };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
