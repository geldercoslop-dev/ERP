import * as db from "../db/index.js";
import { eq, and, gte, lte, sql, asc } from "drizzle-orm";
import { pedidos } from "../../drizzle/schema.js";
import { assertDbConnection } from '../_core/errors/assertions.js';
import { toDbDateStrict } from '../utils/date.js';
export async function getVendasPeriodo(tenantId, dataInicio, dataFim) {
    const dbConn = await db.getDb();
    assertDbConnection(dbConn);
    try {
        const result = await dbConn.select({
            data: sql `DATE(${pedidos.createdAt})`,
            quantidade: sql `COUNT(*)`,
            total: sql `SUM(${pedidos.total})`
        })
            .from(pedidos)
            .where(and(eq(pedidos.tenantId, tenantId), gte(pedidos.createdAt, toDbDateStrict(dataInicio)), lte(pedidos.createdAt, toDbDateStrict(dataFim))))
            .groupBy(sql `DATE(${pedidos.createdAt})`)
            .orderBy(asc(sql `DATE(${pedidos.createdAt})`));
        return { success: true, data: result };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
