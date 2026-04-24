/**
 * Script para criar banco vendas_app manualmente
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import * as fs from "node:fs";
import * as path from "node:path";
function getConnectionConfig() {
    const host = process.env.DB_HOST?.trim();
    const user = process.env.DB_USER?.trim();
    const password = process.env.DB_PASSWORD;
    if (!host || !user || password === undefined) {
        throw new Error("Credenciais obrigatórias. Defina DB_HOST, DB_USER, DB_PASSWORD.");
    }
    return {
        host,
        port: parseInt(process.env.DB_PORT ?? "3306", 10),
        user,
        password,
    };
}
async function main() {
    const config = getConnectionConfig();
    const connection = await mysql.createConnection(config);
    try {
        // Criar banco vendas_app
        await connection.query("CREATE DATABASE IF NOT EXISTS `vendas_app` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        console.log("[create-vendas-app] Banco 'vendas_app' criado com sucesso!");
        // Atualizar .env
        const envPath = path.join(process.cwd(), ".env");
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, "utf-8");
            const lines = content.split(/\r?\n/);
            const newLine = `DB_NAME=vendas_app`;
            let found = false;
            const out = lines.map((line) => {
                if (/^\s*DB_NAME\s*=/.test(line)) {
                    found = true;
                    return newLine;
                }
                return line;
            });
            if (!found)
                out.push(newLine);
            fs.writeFileSync(envPath, out.join("\n"), "utf-8");
            console.log("[create-vendas-app] .env atualizado: DB_NAME=vendas_app");
        }
    }
    finally {
        await connection.end();
    }
}
main().catch((err) => {
    console.error("[create-vendas-app] Erro:", err.message ?? err);
    process.exit(1);
});
