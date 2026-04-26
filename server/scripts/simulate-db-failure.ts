/**
 * Script para simular falha do banco e testar recuperação
 * Para: MySQL/MariaDB
 */
import "dotenv/config";
import * as mysql from "mysql2/promise";

async function simulateFailureAndRecovery() {
  console.log("🔥 Simulando falha do banco e recuperação...");
  
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const url = new URL(databaseUrl);
  const database = url.pathname.slice(1).replace(/^\//, "") || "vendas_app";
  
  // Configuração sem especificar o banco para forçar erro
  const configWithoutDb: mysql.PoolOptions = {
    host: url.hostname,
    port: parseInt(url.port || "3306", 10),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 30000,
    connectTimeout: 3000,
    maxIdle: 10,
    idleTimeout: 60000,
  };

  // Configuração correta
  const configWithDb: mysql.PoolOptions = {
    ...configWithoutDb,
    database,
  };

  console.log("\n1. Testando configuração correta...");
  try {
    const pool = mysql.createPool(configWithDb);
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    await pool.end();
    console.log("✅ Configuração correta OK");
  } catch (error) {
    console.log("❌ Erro na configuração correta:", error instanceof Error ? error.message : error);
  }

  console.log("\n2. Simulando falha (banco inexistente)...");
  try {
    const pool = mysql.createPool({
      ...configWithDb,
      database: 'database_inexistente_que_nao_existe'
    });
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    await pool.end();
    console.log("❌ Não deveria conectar!");
  } catch (error) {
    console.log("✅ Falha simulada com sucesso:", error instanceof Error ? error.message : error);
  }

  console.log("\n3. Testando reconexão com banco correto...");
  try {
    const pool = mysql.createPool(configWithDb);
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    await pool.end();
    console.log("✅ Reconexão bem-sucedida!");
  } catch (error) {
    console.log("❌ Falha na reconexão:", error instanceof Error ? error.message : error);
  }

  console.log("\n🔥 Teste de falha e recuperação concluído!");
}

simulateFailureAndRecovery().catch(console.error);
