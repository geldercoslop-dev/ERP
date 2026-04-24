/**
 * Script para simular falha do banco e testar recuperação
 * Para: MySQL/MariaDB
 */
import "dotenv/config";
import * as mysql from "mysql2/promise";
async function simulateFailureAndRecovery() {
    console.log("🔥 Simulando falha do banco e recuperação...");
    // Configuração sem especificar o banco para forçar erro
    const configWithoutDb = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
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
    const configWithDb = {
        ...configWithoutDb,
        database: process.env.DB_NAME || 'vendas_app',
    };
    console.log("\n1. Testando configuração correta...");
    try {
        const pool = mysql.createPool(configWithDb);
        const conn = await pool.getConnection();
        await conn.ping();
        conn.release();
        await pool.end();
        console.log("✅ Configuração correta OK");
    }
    catch (error) {
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
    }
    catch (error) {
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
    }
    catch (error) {
        console.log("❌ Falha na reconexão:", error instanceof Error ? error.message : error);
    }
    console.log("\n🔥 Teste de falha e recuperação concluído!");
}
simulateFailureAndRecovery().catch(console.error);
