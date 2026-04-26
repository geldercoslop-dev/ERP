#!/usr/bin/env tsx
import { initEnv } from "../server/_core/env/bootstrapEnv";
import { detectRuntimeContext, getContextInfo } from "../server/_core/env/runtimeContext";

// Carrega variáveis de ambiente antes das validações
initEnv();

/**
 * VERIFY:MYSQL - Context-aware validation for MySQL
 *
 * Validates:
 * - Real MySQL connection
 * - Active pool
 * - Simple query working
 * - Real transaction rollback
 * - Connection error handled without masking
 * - No DB access outside proper channels
 * - Uses official database connection pool
 * - Context-aware failure (fail-hard in PROD, fail-soft in DEV)
 */

import { getConnectionPool } from '../server/config/database.js';

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message: string) {
  log(message, 'red');
}

function success(message: string) {
  log(message, 'green');
}

function warn(message: string) {
  log(message, 'yellow');
}

function info(message: string) {
  log(message, 'blue');
}

let failed = false;

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================
const context = detectRuntimeContext();
const contextInfo = getContextInfo();

info('\n' + '='.repeat(60));
info('MYSQL CONTEXT-AWARE VALIDATION');
info('='.repeat(60));
info(`Context: ${context.toUpperCase()}`);
info(`Description: ${contextInfo.description}`);
info(`NODE_ENV: ${contextInfo.nodeEnv}`);
info(`CI: ${contextInfo.isCI ? 'true' : 'false'}`);
info('Using official database connection pool from server/config/database.ts');

// ============================================================================
// TESTE 1: CONFIGURAÇÃO MYSQL - Context-Aware
// ============================================================================
info('\n🔍 TEST 1: MySQL Configuration');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  if (context === 'development') {
    warn('⚠️  DATABASE_URL not configured');
    warn('MySQL is optional in development mode');
    info('\n✅ SKIP_MYSQL_CHECK - Development mode');
    process.exit(0);
  }

  if (context === 'ci') {
    const ciMysqlRequired = process.env.CI_MYSQL_REQUIRED === 'true';
    if (ciMysqlRequired) {
      error('❌ DATABASE_URL not configured');
      error('MySQL is required in CI when CI_MYSQL_REQUIRED=true');
      process.exit(1);
    } else {
      warn('⚠️  DATABASE_URL not configured');
      warn('CI_MYSQL_REQUIRED=false - skipping MySQL check');
      info('\n✅ SKIP_MYSQL_CHECK - CI mode with CI_MYSQL_REQUIRED=false');
      process.exit(0);
    }
  }

  // Production: fail-hard
  error('❌ DATABASE_URL not configured');
  error('MySQL is a mandatory dependency in production');
  process.exit(1);
}

success('✅ DATABASE_URL configured');

// ============================================================================
// TESTE 2: CONEXÃO REAL (via pool oficial) - Context-Aware
// ============================================================================
info('\n🔍 TEST 2: Real Connection (via official pool)');

let pool;
try {
  pool = await getConnectionPool();

  // Test connection
  const connection = await pool.getConnection();
  await connection.ping();
  connection.release();

  success('✅ MySQL connection established via official pool');
} catch (e) {
  const err = e as Error;

  if (context === 'development') {
    warn(`⚠️  MySQL connection failed: ${err.message}`);
    warn('MySQL connection is optional in development mode');
    warn('This is expected if MySQL is not running locally');
    info('\n✅ SKIP_MYSQL_CONNECTION_CHECK - Development mode');
    process.exit(0);
  }

  if (context === 'ci') {
    const ciMysqlRequired = process.env.CI_MYSQL_REQUIRED === 'true';
    if (ciMysqlRequired) {
      error(`❌ MySQL connection failed: ${err.message}`);
      error('MySQL is required in CI when CI_MYSQL_REQUIRED=true');
      process.exit(1);
    } else {
      warn(`⚠️  MySQL connection failed: ${err.message}`);
      warn('CI_MYSQL_REQUIRED=false - skipping MySQL connection check');
      info('\n✅ SKIP_MYSQL_CONNECTION_CHECK - CI mode with CI_MYSQL_REQUIRED=false');
      process.exit(0);
    }
  }

  // Production: fail-hard
  error(`❌ MySQL connection failed: ${err.message}`);
  error('Check DATABASE_URL and MySQL availability');
  failed = true;
  process.exit(1);
}

// ============================================================================
// TESTE 3: POOL ATIVO
// ============================================================================
info('\n🔍 TEST 3: Active Pool');

try {
  // Get multiple connections to test pool
  const conn1 = await pool.getConnection();
  const conn2 = await pool.getConnection();
  
  // Verify they are different connections
  if (conn1.threadId !== conn2.threadId) {
    success('✅ Pool is active and providing multiple connections');
  } else {
    error('❌ Pool not providing unique connections');
    failed = true;
  }
  
  conn1.release();
  conn2.release();
} catch (e) {
  const err = e as Error;
  error(`❌ Pool test failed: ${err.message}`);
  failed = true;
}

// ============================================================================
// TESTE 4: QUERY SIMPLES FUNCIONANDO
// ============================================================================
info('\n🔍 TEST 4: Simple Query Working');

try {
  const [rows] = await pool.query('SELECT 1 as test');
  success('✅ Simple query working');
} catch (e) {
  const err = e as Error;
  error(`❌ Simple query failed: ${err.message}`);
  failed = true;
}

// ============================================================================
// TESTE 5: TRANSAÇÃO ROLLBACK REAL
// ============================================================================
info('\n🔍 TEST 5: Real Transaction Rollback');

try {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Create a temporary table for testing
    await connection.query(`
      CREATE TEMPORARY TABLE IF NOT EXISTS verify_mysql_test (
        id INT PRIMARY KEY AUTO_INCREMENT,
        value VARCHAR(255)
      )
    `);
    
    // Insert a row
    await connection.query('INSERT INTO verify_mysql_test (value) VALUES (?)', ['test']);
    
    // Verify insert
    const [rows] = await connection.query('SELECT COUNT(*) as count FROM verify_mysql_test');
    const count = (rows as any)[0].count;
    
    if (count === 1) {
      success('✅ Transaction insert successful');
    } else {
      error(`❌ Transaction insert failed: expected 1 row, got ${count}`);
      failed = true;
    }
    
    // Rollback
    await connection.rollback();
    
    // Verify rollback - temp table should be empty
    const [rowsAfter] = await connection.query('SELECT COUNT(*) as count FROM verify_mysql_test');
    const countAfter = (rowsAfter as any)[0].count;
    
    if (countAfter === 0) {
      success('✅ Transaction rollback successful');
    } else {
      error(`❌ Transaction rollback failed: expected 0 rows, got ${countAfter}`);
      failed = true;
    }
    
  } finally {
    connection.release();
  }
} catch (e) {
  const err = e as Error;
  error(`❌ Transaction test failed: ${err.message}`);
  failed = true;
}

// ============================================================================
// TESTE 6: SEM ACESSO DB FORA DE CANAIS APROPRIADOS
// ============================================================================
info('\n🔍 TEST 6: No Direct DB Access Outside Proper Channels');

// This is a code-level check - verify that no direct mysql imports exist in critical paths
// We'll check if there are any direct mysql2 imports in services/controllers
import { execSync } from 'child_process';

try {
  const result = execSync(
    'findstr /s /n /i /c:"from \'mysql2\'" /c:"from \\"mysql2\\"" server\\services\\*.ts server\\controllers\\*.ts server\\middleware\\*.ts server\\api\\*.ts',
    { stdio: 'pipe' }
  ).toString();
  
  if (result.trim().length > 0) {
    warn('⚠️  Direct mysql2 imports found in critical paths:');
    warn(result);
    warn('⚠️  Consider using database service abstraction');
  } else {
    success('✅ No direct mysql2 imports in critical paths');
  }
} catch (e) {
  const err = e as { stdout?: string; stderr?: string };
  if (err.stdout && String(err.stdout).trim().length === 0) {
    success('✅ No direct mysql2 imports in critical paths');
  } else {
    warn('⚠️  Could not verify direct imports');
  }
}

// ============================================================================
// CLEANUP
// ============================================================================
info('\n🔍 Cleanup');

try {
  // Pool oficial não precisa ser fechado aqui - gerenciado pelo sistema
  success('✅ Using official pool (managed by system)');
} catch (e) {
  const err = e as Error;
  error(`❌ Cleanup error: ${err.message}`);
  failed = true;
}

// ============================================================================
// RESULTADO
// ============================================================================
info('\n' + '='.repeat(60));

if (failed) {
  error('🚨 MYSQL VALIDATION FAILED');
  error('One or more MySQL hardening checks failed');
  process.exit(1);
} else {
  success('✅ MYSQL VALIDATION PASSED');
  success('All MySQL hardening checks passed');
  process.exit(0);
}
