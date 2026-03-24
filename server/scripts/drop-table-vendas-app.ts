/**
 * Script para dropar tabelas problemáticas do vendas_app
 */
import "dotenv/config";
import mysql from "mysql2/promise";

function getConnectionConfig(): { host: string; port: number; user: string; password: string; database: string } {
  const host = process.env.DB_HOST?.trim();
  const user = process.env.DB_USER?.trim();
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME?.trim() || "vendas_app";
  
  if (!host || !user || password === undefined) {
    throw new Error("Credenciais obrigatórias. Defina DB_HOST, DB_USER, DB_PASSWORD.");
  }
  
  return {
    host,
    port: parseInt(process.env.DB_PORT ?? "3306", 10),
    user,
    password,
    database,
  };
}

async function main(): Promise<void> {
  const config = getConnectionConfig();
  const connection = await mysql.createConnection(config);

  try {
    // Dropar tabelas problemáticas
    const tablesToDrop = [
      "leo_learning_log",
      "leo_activity_log", 
      "app_screens"
    ];
    
    for (const table of tablesToDrop) {
      try {
        await connection.query(`DROP TABLE IF EXISTS \`${table}\``);
        console.log(`[drop-tables] Tabela '${table}' removida com sucesso!`);
      } catch (error) {
        console.log(`[drop-tables] Tabela '${table}' não existe ou erro:`, error instanceof Error ? error.message : error);
      }
    }
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error("[drop-tables] Erro:", err.message ?? err);
  process.exit(1);
});
