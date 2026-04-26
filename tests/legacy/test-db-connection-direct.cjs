#!/usr/bin/env node
/**
 * TESTE DE CONEXÃO DIRETA COM MYSQL
 * ⚙️ DevOps + DB Engineer
 * 
 * Valida:
 * ✔ Parâmetros de conexão (.env)
 * ✔ Conectividade ao MySQL
 * ✔ Performance básica
 * ✔ Handshake do servidor
 */

const mysql = require('mysql2/promise');
const path = require('path');

// Cores para output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

function log(color, label, msg = '') {
  const time = new Date().toLocaleTimeString();
  console.log(`${colors[color]}[${time}] ${label}${colors.reset} ${msg}`);
}

async function main() {
  log('bright', '═══════════════════════════════════════════════════════════════');
  log('bright', '🔧 TESTE DE CONEXÃO DIRETA - MYSQL 8.0');
  log('bright', '═══════════════════════════════════════════════════════════════');

  try {
    // 1. VALIDAR PARÂMETROS
    log('cyan', '▶ FASE 1: Validar Parâmetros');
    
    const config = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'vendas',
      password: process.env.DB_PASSWORD || 'vendas123',
      database: process.env.DB_NAME || 'vendas_app',
      debug: false,
    };

    log('green', '  ✔ DB_HOST', config.host);
    log('green', '  ✔ DB_PORT', config.port);
    log('green', '  ✔ DB_USER', config.user);
    log('green', '  ✔ DB_NAME', config.database);
    log('green', '  ✔ DB_PASSWORD', '***' + (config.password || '').slice(-3));

    // 2. TESTE CONEXÃO SIMPLES
    log('cyan', '\n▶ FASE 2: Conectar ao MySQL');
    
    const startConnect = Date.now();
    const connection = await mysql.createConnection(config);
    const connectTime = Date.now() - startConnect;
    
    log('green', `  ✔ Conectado em ${connectTime}ms`);

    // 3. VALIDAR SERVIDOR
    log('cyan', '\n▶ FASE 3: Validar Servidor');
    
    const startSelect = Date.now();
    const [result] = await connection.query('SELECT 1 AS _test');
    const queryTime = Date.now() - startSelect;
    
    log('green', `  ✔ Query SELECT 1: ${queryTime}ms`);
    log('green', `  ✔ Resultado:`, JSON.stringify(result));

    // 4. INFO DO SERVIDOR
    log('cyan', '\n▶ FASE 4: Informações do Servidor');
    
    const [version] = await connection.query('SELECT VERSION() as version');
    log('green', `  ✔ Versão MySQL:`, version[0].version);
    
    const [dbInfo] = await connection.query('SELECT DATABASE() as db, USER() as user');
    log('green', `  ✔ Database:', dbInfo[0].db);
    log('green', `  ✔ User:`, dbInfo[0].user);
    
    const [sessionInfo] = await connection.query(`
      SELECT 
        @@max_connections as max_conn,
        @@max_allowed_packet as max_packet,
        @@interactive_timeout as interactive_timeout,
        @@wait_timeout as wait_timeout
    `);
    log('green', `  ✔ Max Connections:`, sessionInfo[0].max_conn);
    log('green', `  ✔ Max Packet:`, sessionInfo[0].max_packet);
    log('green', `  ✔ Interactive Timeout:`, sessionInfo[0].interactive_timeout + 's');
    log('green', `  ✔ Wait Timeout:`, sessionInfo[0].wait_timeout + 's');

    // 5. LISTAR TABELAS
    log('cyan', '\n▶ FASE 5: Validar Schema');
    
    const [tables] = await connection.query(
      'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?',
      [config.database]
    );
    
    log('green', `  ✔ Tabelas encontradas: ${tables.length}`);
    if (tables.length > 0) {
      tables.slice(0, 5).forEach(t => {
        log('green', `    - ${t.TABLE_NAME}`);
      });
      if (tables.length > 5) {
        log('green', `    ... e mais ${tables.length - 5}`);
      }
    }

    // 6. TESTE DE POOL
    log('cyan', '\n▶ FASE 6: Testar Pool (3 conexões simultâneas)');
    
    const poolConfig = {
      ...config,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 30000,
      connectTimeout: 10000,
    };

    const pool = mysql.createPool(poolConfig);
    
    const startPool = Date.now();
    const promises = Array(3).fill(0).map(async (_, i) => {
      const conn = await pool.getConnection();
      const [res] = await conn.query('SELECT ? as id, SLEEP(0.1)', [i]);
      conn.release();
      return res;
    });

    const poolResults = await Promise.all(promises);
    const poolTime = Date.now() - startPool;
    
    log('green', `  ✔ Pool concluído em ${poolTime}ms (3 queries com 100ms cada)`);
    log('green', `  ✔ Performance: ${(poolResults.length / (poolTime / 1000)).toFixed(2)} req/s`);

    // 7. CLEANUP
    await connection.end();
    await pool.end();

    // RELATÓRIO FINAL
    log('bright', '\n═══════════════════════════════════════════════════════════════');
    log('green', '✅ CONEXÃO VALIDADA COM SUCESSO');
    log('bright', '═══════════════════════════════════════════════════════════════');
    log('green', 'Resumo:');
    log('green', `  • Conectividade: OK (${connectTime}ms)`);
    log('green', `  • Query simples: OK (${queryTime}ms)`);
    log('green', `  • Pool (3 conn): OK (${poolTime}ms)`);
    log('green', `  • Schema: ${tables.length} tabelas`);
    log('green', `  • Pronto para load test`);
    log('bright', '═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    log('red', '❌ ERRO DE CONEXÃO:');
    log('red', '');
    
    if (error.code === 'PROTOCOL_CONNECTION_LOST') {
      log('red', '  CAUSE: Conexão perdida durante operação');
      log('red', '  FIX: Verificar timeout do MySQL ou rede');
    } else if (error.code === 'ECONNREFUSED') {
      log('red', '  CAUSE: MySQL não está rodando');
      log('red', '  FIX: Iniciar MySQL (sudo service mysql start)');
    } else if (error.code === 'ER_ACCESS_DENIED_FOR_USER') {
      log('red', '  CAUSE: Credenciais inválidas');
      log('red', '  FIX: Verificar DB_USER e DB_PASSWORD no .env');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      log('red', '  CAUSE: Database não existe');
      log('red', '  FIX: Criar database vendas_app');
    }
    
    log('red', '  Error:', error.message);
    log('red', '  Code:', error.code);

    process.exit(1);
  }
}

main();
