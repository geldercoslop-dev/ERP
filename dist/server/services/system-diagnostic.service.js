import { getDb, insertAuditLog } from "../db/index.js";
export async function checkDiagnosticDatabaseHealth(slowQueries) {
    const startTime = Date.now();
    let status = "connected";
    let connectionTime;
    const db = await getDb();
    if (!db) {
        return { success: false, error: "Database connection failed" };
    }
    try {
        connectionTime = Date.now() - startTime;
        const queryStart = Date.now();
        await db.execute("SELECT 1 as test");
        const queryTime = Date.now() - queryStart;
        const recentSlowQueries = slowQueries.filter((query) => Date.now() - query.timestamp.getTime() < 300_000);
        if (queryTime > 1000) {
            status = "slow";
        }
        return {
            success: true,
            data: {
                status,
                connectionTime,
                avgQueryTime: queryTime,
                slowQueries: recentSlowQueries,
            }
        };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
export async function registerDiagnosticAudit(tenantId, result) {
    await insertAuditLog({
        tenantId,
        action: "update_status",
        entity: "system_diagnostic",
        payloadJson: JSON.stringify({
            timestamp: result.timestamp.toISOString(),
            systemHealth: result.systemHealth,
            databaseHealth: {
                status: result.databaseHealth.status,
                connectionTime: result.databaseHealth.connectionTime,
                slowQueriesCount: result.databaseHealth.slowQueries.length,
            },
            routeHealth: {
                errorRate: result.routeHealth.errorRate,
                errorsCount: result.routeHealth.errors.length,
            },
            queueHealth: result.queueHealth,
            serviceHealth: Object.keys(result.serviceHealth).reduce((acc, key) => {
                acc[key] = result.serviceHealth[key].status;
                return acc;
            }, {}),
        }),
    });
}
