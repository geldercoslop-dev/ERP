import { getDb, insertAuditLog } from "../db/index.js";
import type { DiagnosticResult } from "../tools/system-diagnostic.js";

export async function checkDiagnosticDatabaseHealth(
  slowQueries: Array<{ query: string; duration: number; timestamp: Date }>
): Promise<{ success: boolean; data?: DiagnosticResult["databaseHealth"]; error?: string }> {
  const startTime = Date.now();
  let status: "connected" | "disconnected" | "slow" = "connected";
  let connectionTime: number | undefined;

  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database connection failed" };
  }

  try {
    connectionTime = Date.now() - startTime;
    const queryStart = Date.now();
    await db.execute("SELECT 1 as test");
    const queryTime = Date.now() - queryStart;

    const recentSlowQueries = slowQueries.filter(
      (query) => Date.now() - query.timestamp.getTime() < 300_000
    );
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
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function registerDiagnosticAudit(
  tenantId: number,
  result: DiagnosticResult
): Promise<void> {
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
      serviceHealth: Object.keys(result.serviceHealth).reduce<Record<string, string>>((acc, key) => {
        acc[key] = result.serviceHealth[key].status;
        return acc;
      }, {}),
    }),
  });
}