/**
 * Script para criar banco vendas_app manualmente
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import * as fs from "node:fs";
import * as path from "node:path";

function parseDatabaseUrl(): { host: string; port: number; user: string; password: string } {
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
    };
  } catch (error) {
    throw new Error(`DATABASE_URL inválido: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main(): Promise<void> {
  const config = parseDatabaseUrl();
  const connection = await mysql.createConnection(config);

  try {
    // Criar banco vendas_app
    await connection.query("CREATE DATABASE IF NOT EXISTS `vendas_app` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    console.log("[create-vendas-app] Banco 'vendas_app' criado com sucesso!");

    // Atualizar .env com DATABASE_URL atualizado
    const envPath = path.join(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      const lines = content.split(/\r?\n/);
      const newDatabaseUrl = process.env.DATABASE_URL?.replace(/\/[^/]*$/, "/vendas_app");
      if (!newDatabaseUrl) {
        throw new Error("DATABASE_URL não encontrado");
      }
      const newLine = `DATABASE_URL=${newDatabaseUrl}`;
      let found = false;
      const out = lines.map((line) => {
        if (/^\s*DATABASE_URL\s*=/.test(line)) {
          found = true;
          return newLine;
        }
        return line;
      });
      if (!found) out.push(newLine);
      fs.writeFileSync(envPath, out.join("\n"), "utf-8");
      console.log("[create-vendas-app] .env atualizado: DATABASE_URL aponta para vendas_app");
    }
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error("[create-vendas-app] Erro:", err.message ?? err);
  process.exit(1);
});
