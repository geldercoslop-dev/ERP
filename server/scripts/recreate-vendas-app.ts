/**
 * Script para recriar banco vendas_app do zero
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
    // Dropar banco existente
    await connection.query("DROP DATABASE IF EXISTS `vendas_app`");
    console.log("[recreate-vendas-app] Banco 'vendas_app' removido!");
    
    // Criar banco novo
    await connection.query("CREATE DATABASE `vendas_app` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    console.log("[recreate-vendas-app] Banco 'vendas_app' criado com sucesso!");

    // Atualizar .env com DATABASE_URL
    const envPath = path.join(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      const lines = content.split(/\r?\n/);
      const currentDatabaseUrl = process.env.DATABASE_URL;
      if (!currentDatabaseUrl) {
        throw new Error("DATABASE_URL não encontrado");
      }
      const newDatabaseUrl = currentDatabaseUrl.replace(/\/[^/]*$/, "/vendas_app");
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
      console.log("[recreate-vendas-app] .env atualizado: DATABASE_URL aponta para vendas_app");
    }
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error("[recreate-vendas-app] Erro:", err.message ?? err);
  process.exit(1);
});
