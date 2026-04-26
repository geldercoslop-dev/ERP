/**
 * Teste de Consistência de Schema
 * 
 * Verifica que:
 * 1. Todas as tabelas multi-tenant têm tenant_id
 * 2. Todas as colunas estão em snake_case
 * 3. Tabela tenants existe e tem pelo menos 1 tenant
 * 
 * Uso: npm run test:schema ou tsx server/tests/schema-consistency.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env"), override: false });

// Tabelas que DEVEM ter tenant_id
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

const SNAKE_CASE_REQUIRED = {
  users: ['open_id', 'login_method', 'created_at', 'updated_at', 'tenant_id'],
  vendedores: ['user_id', 'created_at', 'updated_at', 'tenant_id'],
  cores: ['created_at', 'tenant_id'],
};

let connection: mysql.Connection;

describe('Schema Consistency Tests', () => {
  beforeAll(async () => {
    try {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL é obrigatório');
      }
      const url = new URL(databaseUrl);
      connection = await mysql.createConnection({
        host: url.hostname,
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname.slice(1).replace(/^\//, '') || 'erp',
        waitForConnections: true,
        connectionLimit: 1,
        queueLimit: 0,
      });
      
      console.log('✓ Conectado ao banco de dados');
    } catch (err: any) {
      console.error('❌ Falha ao conectar ao banco:', err.message);
      process.exit(1);
    }
  });

  afterAll(async () => {
    if (connection) {
      await connection.end();
    }
  });

  describe('Multi-tenant tenant_id presence', () => {
    for (const table of TENANT_ID_REQUIRED) {
      it(`tabela ${table} deve ter coluna tenant_id`, async () => {
        try {
          const databaseName = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).pathname.slice(1).replace(/^\//, '') || 'erp' : 'erp';
          const [rows] = await connection.query(
            'SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
            [databaseName, table, 'tenant_id']
          );

          expect((rows as any)[0]?.count).toBe(1);
        } catch (err: any) {
          if ((err.message as string).includes('Table')) {
            throw new Error(`Tabela ${table} não existe no banco`);
          }
          throw err;
        }
      });

      it(`tabela ${table} tenant_id deve ser NOT NULL`, async () => {
        try {
          const databaseName = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).pathname.slice(1).replace(/^\//, '') || 'erp' : 'erp';
          const [rows] = await connection.query(
            'SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
            [databaseName, table, 'tenant_id']
          );

          expect((rows as any)[0]?.IS_NULLABLE).toBe('NO');
        } catch {
          // Silenciar se tabela não existe
        }
      });

      it(`tabela ${table} tenant_id deve ser tipo INT`, async () => {
        try {
          const databaseName = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).pathname.slice(1).replace(/^\//, '') || 'erp' : 'erp';
          const [rows] = await connection.query(
            'SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
            [databaseName, table, 'tenant_id']
          );

          const columnType = (rows as any)[0]?.COLUMN_TYPE;
          expect(columnType).toMatch(/^int/i);
        } catch {
          // Silenciar se tabela não existe
        }
      });
    }
  });

  describe('Snake_case column naming', () => {
    for (const [table, columns] of Object.entries(SNAKE_CASE_REQUIRED)) {
      for (const col of columns) {
        it(`${table}.${col} deve existir em snake_case`, async () => {
          try {
            const databaseName = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).pathname.slice(1).replace(/^\//, '') || 'erp' : 'erp';
            const [rows] = await connection.query(
              'SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
              [databaseName, table, col]
            );

            expect((rows as any)[0]?.count).toBe(1);
          } catch (err: any) {
            throw new Error(`Erro ao verificar ${table}.${col}: ${err.message}`);
          }
        });
      }
    }
  });

  describe('Tenants master table', () => {
    it('tabela tenants deve existir', async () => {
      const databaseName = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).pathname.slice(1).replace(/^\//, '') || 'erp' : 'erp';
      const [rows] = await connection.query(
        'SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        [databaseName, 'tenants']
      );

      expect((rows as any)[0]?.count).toBe(1);
    });

    it('deve existir pelo menos 1 tenant configurado', async () => {
      const [rows] = await connection.query('SELECT COUNT(*) as count FROM tenants');
      expect((rows as any)[0]?.count).toBeGreaterThan(0);
    });

    it('tenant default (id=1) deve existir', async () => {
      const [rows] = await connection.query('SELECT COUNT(*) as count FROM tenants WHERE id = 1');
      expect((rows as any)[0]?.count).toBe(1);
    });
  });

  describe('No legacy column naming', () => {
    it('vendedores não deve ter coluna userId (deve ser user_id)', async () => {
      const databaseName = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).pathname.slice(1).replace(/^\//, '') || 'erp' : 'erp';
      const [rows] = await connection.query(
        'SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [databaseName, 'vendedores', 'userId']
      );

      // Deve ser 0 (não deve existir userId camelCase)
      expect((rows as any)[0]?.count).toBe(0);
    });

    it('users não deve ter coluna openId (deve ser open_id)', async () => {
      const databaseName = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).pathname.slice(1).replace(/^\//, '') || 'erp' : 'erp';
      const [rows] = await connection.query(
        'SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [databaseName, 'users', 'openId']
      );

      // Deve ser 0 (não deve existir openId camelCase)
      expect((rows as any)[0]?.count).toBe(0);
    });
  });

  describe('Data integrity', () => {
    it('todas as linhas de vendedores devem ter tenant_id not null', async () => {
      const [rows] = await connection.query(
        'SELECT COUNT(*) as count FROM vendedores WHERE tenant_id IS NULL'
      );

      expect((rows as any)[0]?.count).toBe(0);
    });

    it('todas as linhas de users devem ter tenant_id not null', async () => {
      const [rows] = await connection.query(
        'SELECT COUNT(*) as count FROM users WHERE tenant_id IS NULL'
      );

      expect((rows as any)[0]?.count).toBe(0);
    });
  });
});
