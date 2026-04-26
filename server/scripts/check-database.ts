/**
 * Script para verificar a conexão e o schema do banco de dados.
 * Uso: npm run check:db
 * FAIL-HARD: DATABASE_URL é obrigatório
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

async function checkDatabase() {
  const config = parseDatabaseUrl();

  console.log("Verificando conexão com o banco de dados...");
  console.log("Configuração:", { host: config.host, port: config.port, user: config.user, database: config.database });

  let connection: mysql.Connection | null = null;
  try {
    connection = await mysql.createConnection(config);
    console.log("Conexão estabelecida.\n");

    const [tables] = await connection.query("SHOW TABLES");
    const tableList = (tables as { [k: string]: string }[]).map((t) => Object.values(t)[0]);
    console.log(`Tabelas (${tableList.length}):`, tableList.join(", ") || "(nenhuma)");

    if (tableList.includes("vendedores")) {
      const [cols] = await connection.query("DESCRIBE vendedores");
      console.log("\nColunas da tabela vendedores:");
      (cols as { Field: string; Type: string; Null: string }[]).forEach((c) =>
        console.log(`  - ${c.Field} ${c.Type} ${c.Null === "YES" ? "NULL" : "NOT NULL"}`)
      );
      const [vendedores] = await connection.query("SELECT id, nome, admin, ativo FROM vendedores LIMIT 5");
      console.log("\nVendedores (até 5):", (vendedores as unknown[]).length);
    }
    return true;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    console.error("Erro:", e.message ?? err);
    if (e.code) console.error("  code:", e.code);
    if ((err as { errno?: number }).errno) console.error("  errno:", (err as { errno: number }).errno);
    return false;
  } finally {
    if (connection) await connection.end();
  }
}

checkDatabase()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
