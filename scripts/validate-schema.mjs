#!/usr/bin/env node

/**
 * Validação de Schema - Build-time
 * Garante que o banco de dados está em sync com o Drizzle schema
 * 
 * Uso: node scripts/validate-schema.mjs [--check-only]
 *   --check-only: Apenas verifica, não quebra o build (modo CI/warning)
 */

import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env — alinhado ao servidor: apenas `.env` (sem cadeia .env.production).
dotenv.config({ path: path.join(__dirname, '../.env'), override: false });

const checkOnly = process.argv.includes('--check-only');

/**
 * Config de conexão: DATABASE_URL tem precedência; senão DB_* (compatível com .env.production).
 */
function getMysqlConnectionOptions() {
  const raw = process.env.DATABASE_URL?.trim();
  if (raw) {
    try {
      const u = new URL(raw);
      if (u.protocol !== 'mysql:' && !raw.startsWith('mysql://')) {
        throw new Error('DATABASE_URL deve usar protocolo mysql://');
      }
      const database = (u.pathname || '').replace(/^\//, '').split('?')[0];
      if (!database) {
        throw new Error('DATABASE_URL sem nome do banco no path');
      }
      return {
        host: u.hostname,
        port: u.port ? Number(u.port) : 3306,
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        database,
      };
    } catch (e) {
      throw new Error(`DATABASE_URL inválida: ${e.message}`);
    }
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'erp',
  };
}

/**
 * Tabelas que DEVEM ter tenant_id (multi-tenant)
 */
const TENANT_ID_REQUIRED = [
  'users',
  'vendedores',
  'cargas',
  'clientes',
  'cores',
  'produtos',
  'pedidos',
  'comissoes',
  'contas_fixas',
  'contas_pagar',
  'contas_receber',
  'counters',
  'grupos_precificacao',
  'itens_pedido',
  'plano_contas',
  'pedidos_carga',
];

/**
 * Tabelas que NÃO devem ter tenant_id (system/junction)
 */
const TENANT_ID_NOT_ALLOWED = [
  '__drizzle_migrations',
  'tenants',
  'cliente_vendedores',
  'idempotency_keys',
  'job_execution_log',
  'pendencias_compra',
  'fornecedores',
];

/**
 * Colunas que DEVEM estar em snake_case
 */
const SNAKE_CASE_COLUMNS = {
  users: ['open_id', 'login_method', 'created_at', 'updated_at', 'last_signed_in', 'tenant_id'],
  vendedores: ['user_id', 'created_at', 'updated_at', 'tenant_id'],
  cores: ['created_at', 'tenant_id'],
};

async function validateSchema() {
  const errors = [];
  const warnings = [];
  let connOpts;
  try {
    connOpts = getMysqlConnectionOptions();
  } catch (e) {
    console.error('💥 Configuração de banco inválida:');
    console.error(e.message);
    console.error('\n⚠️  Defina DATABASE_URL ou DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
    process.exit(1);
  }
  const dbName = connOpts.database;

  try {
    const connection = await mysql.createConnection(connOpts);

    console.log('🔍 Validando schema do banco de dados...\n');

    // 1. Verificar presença de tenant_id nas tabelas críticas
    console.log('📋 Verificando tenant_id em tabelas multi-tenant...');
    for (const table of TENANT_ID_REQUIRED) {
      try {
        const [rows] = await connection.query(
          'SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
          [dbName, table, 'tenant_id']
        );

        if (rows[0]?.count === 0) {
          errors.push(`❌ Tabela '${table}' NÃO possui coluna 'tenant_id'`);
        } else {
          console.log(`  ✓ ${table} tem tenant_id`);
        }
      } catch (err) {
        warnings.push(`⚠️  Tabela '${table}' não existe (yet).`);
      }
    }

    // 2. Verificar snake_case em colunas críticas
    console.log('\n📝 Verificando nomenclatura em snake_case...');
    for (const [table, cols] of Object.entries(SNAKE_CASE_COLUMNS)) {
      for (const col of cols) {
        try {
          const [rows] = await connection.query(
            'SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
            [dbName, table, col]
          );

          if (rows[0]?.count === 0) {
            errors.push(`❌ Coluna '${table}.${col}' não existe (esperado snake_case)`);
          } else {
            console.log(`  ✓ ${table}.${col} ✓`);
          }
        } catch (err) {
          // Silenciar erros de tabelas que não existem
        }
      }
    }

    // 3. Verificar que tenant_id NÃO existe em tabelas que não devem ter
    console.log('\n🔒 Verificando que tabelas sistema não têm tenant_id...');
    for (const table of TENANT_ID_NOT_ALLOWED) {
      try {
        const [rows] = await connection.query(
          'SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
          [dbName, table, 'tenant_id']
        );

        if (rows[0]?.count > 0) {
          warnings.push(`⚠️  Tabela '${table}' deveria NÃO ter tenant_id (tabela de sistema)`);
        } else {
          console.log(`  ✓ ${table} ✓ (sem tenant_id - correto)`);
        }
      } catch (err) {
        // Silenciar erros
      }
    }

    // 4. Verificar que tenants table existe
    console.log('\n🏢 Verificando tabela tenants...');
    try {
      const [rows] = await connection.query('SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [dbName, 'tenants']);
      if (rows[0]?.count === 0) {
        errors.push('❌ Tabela "tenants" não existe');
      } else {
        console.log('  ✓ Tabela tenants existe');

        // Verificar se tem pelo menos 1 tenant
        const [tenants] = await connection.query('SELECT COUNT(*) as count FROM tenants');
        if (tenants[0]?.count === 0) {
          errors.push('❌ Nenhum tenant configurado (pelo menos 1 obrigatório)');
        } else {
          console.log(`  ✓ ${tenants[0]?.count} tenant(s) configurado(s)`);
        }
      }
    } catch (err) {
      // Silenciar
    }

    await connection.end();

    // Print resultado
    console.log('\n' + '='.repeat(60));
    if (errors.length > 0) {
      console.error('\n🚨 ERROS ENCONTRADOS:\n');
      errors.forEach(e => console.error(e));
      console.error('\n');

      if (!checkOnly) {
        console.error('💥 BUILD FALHOU: Schema inválido\n');
        process.exit(1);
      } else {
        console.warn('⚠️  Erros encontrados, mas -check-only ativo (apenas warning)\n');
      }
    }

    if (warnings.length > 0) {
      console.warn('\n⚠️  AVISOS:\n');
      warnings.forEach(w => console.warn(w));
      console.warn('\n');
    }

    if (errors.length === 0) {
      console.log('\n✅ SCHEMA VÁLIDO E CONSISTENTE!\n');
      process.exit(0);
    }
  } catch (err) {
    console.error('💥 Erro ao conectar ao banco ou validar schema:');
    console.error(err.message);
    console.error('\n⚠️  Verifique DATABASE_URL ou DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
    process.exit(1);
  }
}

validateSchema();
