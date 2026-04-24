/**
 * Script para verificar a conexão e o schema do banco de dados.
 * Uso: npm run check:db
 */
import "dotenv/config";
import mysql from "mysql2/promise";
async function checkDatabase() {
    let config;
    if (process.env.DATABASE_URL) {
        try {
            const url = new URL(process.env.DATABASE_URL);
            config = {
                host: url.hostname,
                port: parseInt(url.port || "3306", 10),
                user: url.username,
                password: url.password,
                database: url.pathname.slice(1).replace(/^\//, "") || "vendas_app",
            };
        }
        catch (_) {
            config = {
                host: process.env.DB_HOST || "localhost",
                port: parseInt(process.env.DB_PORT || "3306", 10),
                user: process.env.DB_USER || "vendas",
                password: process.env.DB_PASSWORD || process.env.DB_PASS || "vendas123",
                database: process.env.DB_NAME || "vendas_app",
            };
        }
    }
    else {
        config = {
            host: process.env.DB_HOST || "localhost",
            port: parseInt(process.env.DB_PORT || "3306", 10),
            user: process.env.DB_USER || "vendas",
            password: process.env.DB_PASSWORD || process.env.DB_PASS || "vendas123",
            database: process.env.DB_NAME || "vendas_app",
        };
    }
    console.log("Verificando conexão com o banco de dados...");
    console.log("Configuração:", { host: config.host, port: config.port, user: config.user, database: config.database });
    let connection = null;
    try {
        connection = await mysql.createConnection(config);
        console.log("Conexão estabelecida.\n");
        const [tables] = await connection.query("SHOW TABLES");
        const tableList = tables.map((t) => Object.values(t)[0]);
        console.log(`Tabelas (${tableList.length}):`, tableList.join(", ") || "(nenhuma)");
        if (tableList.includes("vendedores")) {
            const [cols] = await connection.query("DESCRIBE vendedores");
            console.log("\nColunas da tabela vendedores:");
            cols.forEach((c) => console.log(`  - ${c.Field} ${c.Type} ${c.Null === "YES" ? "NULL" : "NOT NULL"}`));
            const [vendedores] = await connection.query("SELECT id, nome, admin, ativo FROM vendedores LIMIT 5");
            console.log("\nVendedores (até 5):", vendedores.length);
        }
        return true;
    }
    catch (err) {
        const e = err;
        console.error("Erro:", e.message ?? err);
        if (e.code)
            console.error("  code:", e.code);
        if (err.errno)
            console.error("  errno:", err.errno);
        return false;
    }
    finally {
        if (connection)
            await connection.end();
    }
}
checkDatabase()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((err) => {
    console.error(err);
    process.exit(1);
});
