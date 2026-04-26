/**
 * Script para dropar tabelas problemáticas do vendas_app
 */
import "dotenv/config";
import mysql from "mysql2/promise";

function parseDatabaseUrl(): { host: string; port: number; user: string; password: string; database: string } {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL é obrigatório");
  }

  try {
    const url = new URL(databaseUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port || "3306", 10),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1).replace(/^\//, "") || "vendas_app",
    };
  } catch (error) {
    throw new Error(`DATABASE_URL inválido: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main(): Promise<void> {
  const config = parseDatabaseUrl();
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
