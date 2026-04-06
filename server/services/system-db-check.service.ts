import { getConnectionPool } from "../config/database.js";

export interface ProtectedDatabaseCheckResult {
  connected: true;
  tables: "protected";
  vendedores: "protected";
  timestamp: string;
}

export async function checkProtectedDatabaseConnection(): Promise<{ success: boolean; data?: ProtectedDatabaseCheckResult; error?: string }> {
  const pool = await getConnectionPool();
  if (!pool) {
    return { success: false, error: "Não foi possível obter o pool de conexões" };
  }

  return {
    success: true,
    data: {
      connected: true,
      tables: "protected",
      vendedores: "protected",
      timestamp: new Date().toISOString(),
    }
  };
}