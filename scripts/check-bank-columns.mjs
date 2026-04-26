import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'root',
  database: 'erp'
});

console.log('=== VERIFICANDO COLUNAS NO BANCO ===\n');

// Verificar users.tenant_id
const [usersTenantId] = await connection.query(`
  SELECT COUNT(*) as count 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = 'erp' 
  AND TABLE_NAME = 'users' 
  AND COLUMN_NAME = 'tenant_id'
`);
console.log('users.tenant_id:', usersTenantId[0].count > 0 ? '✓ EXISTE' : '✗ NÃO EXISTE');

// Verificar users.open_id
const [usersOpenId] = await connection.query(`
  SELECT COUNT(*) as count 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = 'erp' 
  AND TABLE_NAME = 'users' 
  AND COLUMN_NAME = 'open_id'
`);
console.log('users.open_id:', usersOpenId[0].count > 0 ? '✓ EXISTE' : '✗ NÃO EXISTE');

// Verificar vendedores.tenant_id
const [vendedoresTenantId] = await connection.query(`
  SELECT COUNT(*) as count 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = 'erp' 
  AND TABLE_NAME = 'vendedores' 
  AND COLUMN_NAME = 'tenant_id'
`);
console.log('vendedores.tenant_id:', vendedoresTenantId[0].count > 0 ? '✓ EXISTE' : '✗ NÃO EXISTE');

// Verificar vendedores.user_id
const [vendedoresUserId] = await connection.query(`
  SELECT COUNT(*) as count 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = 'erp' 
  AND TABLE_NAME = 'vendedores' 
  AND COLUMN_NAME = 'user_id'
`);
console.log('vendedores.user_id:', vendedoresUserId[0].count > 0 ? '✓ EXISTE' : '✗ NÃO EXISTE');

// Verificar tabela tenants
const [tenantsTable] = await connection.query(`
  SELECT COUNT(*) as count 
  FROM INFORMATION_SCHEMA.TABLES 
  WHERE TABLE_SCHEMA = 'erp' 
  AND TABLE_NAME = 'tenants'
`);
console.log('tabela tenants:', tenantsTable[0].count > 0 ? '✓ EXISTE' : '✗ NÃO EXISTE');

// Listar todas as tabelas
const [tables] = await connection.query('SHOW TABLES');
console.log('\n=== TODAS AS TABELAS ===');
tables.forEach(t => console.log(`  - ${Object.values(t)[0]}`));

// Listar colunas de users
const [usersCols] = await connection.query('DESCRIBE users');
console.log('\n=== COLUNAS DE users ===');
usersCols.forEach(c => console.log(`  - ${c.Field}`));

// Listar colunas de vendedores
const [vendedoresCols] = await connection.query('DESCRIBE vendedores');
console.log('\n=== COLUNAS DE vendedores ===');
vendedoresCols.forEach(c => console.log(`  - ${c.Field}`));

await connection.end();
