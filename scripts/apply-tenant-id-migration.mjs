import 'dotenv/config';
import mysql from 'mysql2/promise';

const tables = [
  '__drizzle_migrations',
  'audit_probe',
  'cliente_vendedores',
  'cores',
  'grupos_precificacao',
  'idempotency_keys',
  'job_execution_log',
  'pedidos_carga',
  'pendencias_compra',
  'schema_migrations',
  'tenants',
];

async function hasTenantColumn(conn, dbName, tableName) {
  const [rows] = await conn.query(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'tenant_id'
      LIMIT 1`,
    [dbName, tableName]
  );
  return rows.length > 0;
}

async function hasTenantIndex(conn, dbName, tableName) {
  const [rows] = await conn.query(
    `SELECT 1
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND COLUMN_NAME = 'tenant_id'
      LIMIT 1`,
    [dbName, tableName]
  );
  return rows.length > 0;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  const dbName = new URL(url).pathname.replace('/', '');
  const conn = await mysql.createConnection(url);

  try {
    for (const tableName of tables) {
      const columnExists = await hasTenantColumn(conn, dbName, tableName);
      if (!columnExists) {
        await conn.query(`ALTER TABLE \`${tableName}\` ADD COLUMN tenant_id INT NOT NULL DEFAULT 1`);
        console.log(`ADDED_COLUMN ${tableName}.tenant_id`);
      } else {
        console.log(`COLUMN_EXISTS ${tableName}.tenant_id`);
      }

      const indexExists = await hasTenantIndex(conn, dbName, tableName);
      if (!indexExists) {
        const idx = `${tableName}_tenant_id_idx`;
        await conn.query(`CREATE INDEX \`${idx}\` ON \`${tableName}\` (tenant_id)`);
        console.log(`ADDED_INDEX ${idx}`);
      } else {
        console.log(`INDEX_EXISTS ${tableName}.tenant_id`);
      }
    }

    const [remaining] = await conn.query(
      `SELECT t.TABLE_NAME
         FROM information_schema.TABLES t
         LEFT JOIN information_schema.COLUMNS c
           ON c.TABLE_SCHEMA = t.TABLE_SCHEMA
          AND c.TABLE_NAME = t.TABLE_NAME
          AND c.COLUMN_NAME = 'tenant_id'
        WHERE t.TABLE_SCHEMA = ?
          AND t.TABLE_TYPE = 'BASE TABLE'
          AND c.COLUMN_NAME IS NULL
        ORDER BY t.TABLE_NAME`,
      [dbName]
    );

    console.log(`MISSING_TENANT_AFTER=${remaining.length}`);
    for (const row of remaining) {
      console.log(`MISSING ${row.TABLE_NAME}`);
    }

    if (remaining.length > 0) {
      process.exit(1);
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
