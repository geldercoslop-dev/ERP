import 'dotenv/config';
import mysql from 'mysql2/promise';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const dbName = new URL(url).pathname.replace('/', '');
  const conn = await mysql.createConnection(url);

  const [rows] = await conn.query(
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

  console.log(`MISSING_TENANT_COUNT=${rows.length}`);
  for (const row of rows) {
    console.log(row.TABLE_NAME);
  }

  await conn.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
