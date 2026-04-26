import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'root',
  database: 'erp'
});

console.log('Conectado ao MySQL');

// Verificar se tabela existe via SHOW TABLES
const [tables] = await connection.query('SHOW TABLES');
console.log('\n=== TABELAS NO BANCO ===');
console.log(tables);

// Verificar via information_schema
const [infoResult] = await connection.query(`
  SELECT COUNT(*) as count
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = '__drizzle_migrations'
`);
console.log('\n=== VERIFICAÇÃO INFORMATION_SCHEMA ===');
console.log(infoResult);

// Verificar database atual
const [dbResult] = await connection.query('SELECT DATABASE() as current_db');
console.log('\n=== DATABASE ATUAL ===');
console.log(dbResult);

// Tentar SELECT na tabela
try {
  const [migrations] = await connection.query('SELECT * FROM __drizzle_migrations');
  console.log('\n=== CONTEÚDO __drizzle_migrations ===');
  console.log(migrations);
} catch (e) {
  console.log('\n=== ERRO AO LER TABELA ===');
  console.log(e.message);
}

await connection.end();
