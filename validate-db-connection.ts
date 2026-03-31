#!/usr/bin/env tsx
/**
 * Script: Validar conexão com banco de dados
 * Testa:
 * - Conexão TCP ao MySQL
 * - Execução simples (SELECT 1)
 * - Status do pool
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Carregar variáveis de ambiente
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

async function validateDBConnection() {
  try {
    console.log("╔════════════════════════════════════════╗");
    console.log("║ 🔍 Validando Conexão com Banco de Dados║");
    console.log("╚════════════════════════════════════════╝\n");

    // Importar pool após env estar carregado
    const { getPool } = await import("./server/db/core.ts");

    const pool = getPool();
    console.log("✓ Pool criado com sucesso");
    console.log(`  - Max Connections: 100`);
    console.log(`  - Queue Limit: 200\n`);

    // Tentar conexão simples
    console.log("📡 Testando conexão TCP...");
    const connection = await pool.getConnection();
    console.log("✓ Conexão adquirida do pool\n");

    // Teste simples
    console.log("🧪 Executando SELECT 1...");
    const result = await connection.execute("SELECT 1 as success");
    console.log("✓ Query executada com sucesso");
    console.log(`  - Resultado: ${JSON.stringify(result[0])}\n`);

    // Liberar conexão
    connection.release();
    console.log("✓ Conexão liberada\n");

    // Teste de variáveis
    console.log("📋 Variáveis de Ambiente:");
    console.log(`  - DATABASE_URL: ${process.env.DATABASE_URL?.split("@")[1] || "NÃO DEFINIDA"}`);
    console.log(`  - REDIS_URL: ${process.env.REDIS_URL || "NÃO DEFINIDA"}`);
    console.log(`  - NODE_ENV: ${process.env.NODE_ENV || "production"}\n`);

    console.log("╔════════════════════════════════════════╗");
    console.log("║ ✅ VALIDAÇÃO CONCLUÍDA COM SUCESSO    ║");
    console.log("╚════════════════════════════════════════╝\n");
    process.exit(0);
  } catch (error) {
    console.error("\n╔════════════════════════════════════════╗");
    console.error("║ ❌ ERRO NA VALIDAÇÃO                  ║");
    console.error("╚════════════════════════════════════════╝\n");
    console.error("Erro:", error instanceof Error ? error.message : error);
    console.error("\nDicas:");
    console.error("  1. Verificar se MySQL está rodando: docker ps");
    console.error("  2. Verificar logs: docker compose logs vendas-mysql");
    console.error("  3. Verificar .env: DATABASE_URL deve usar host vendas-mysql:3306 (nome do serviço no compose)");
    process.exit(1);
  }
}

validateDBConnection();
