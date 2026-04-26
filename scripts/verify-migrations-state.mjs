import mysql from 'mysql2/promise';

const DB_URL = 'mysql://root:root@localhost:3306/erp';

async function verifyMigrationsState() {
  const connection = await mysql.createConnection(DB_URL);
  
  try {
    console.log('🔍 Verificando estado real das migrations no banco...\n');
    
    // 1. Contar migrations na tabela __drizzle_migrations
    const [countResult] = await connection.execute(
      "SELECT COUNT(*) as count FROM __drizzle_migrations"
    );
    const count = countResult[0].count;
    console.log(`✓ Migrations aplicadas no banco: ${count}`);
    
    // 2. Listar todas as migrations
    const [migrations] = await connection.execute(
      "SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY id"
    );
    console.log(`\n✓ Detalhes das migrations:`);
    migrations.forEach((m, i) => {
      console.log(`  [${i}] ID: ${m.id}, Hash: ${m.hash.substring(0, 20)}..., Created: ${m.created_at}`);
    });
    
    // 3. Listar todas as tabelas
    const [tables] = await connection.execute(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME"
    );
    console.log(`\n✓ Total de tabelas no banco: ${tables.length}`);
    console.log(`✓ Tabelas: ${tables.map(t => t.TABLE_NAME).join(', ')}`);
    
    // 4. Verificar estrutura da tabela users
    const [usersColumns] = await connection.execute(
      "SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' ORDER BY ORDINAL_POSITION"
    );
    console.log(`\n✓ Estrutura da tabela users (${usersColumns.length} colunas):`);
    usersColumns.forEach(col => {
      console.log(`  - ${col.COLUMN_NAME}: ${col.COLUMN_TYPE} ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'} ${col.COLUMN_DEFAULT ? `DEFAULT ${col.COLUMN_DEFAULT}` : ''}`);
    });
    
    // 5. Verificar se tenant_id existe em users
    const hasTenantId = usersColumns.some(col => col.COLUMN_NAME === 'tenant_id');
    console.log(`\n✓ users.tenant_id existe: ${hasTenantId ? 'SIM' : 'NÃO'}`);
    
    // 6. Verificar se tenant_id existe em vendedores
    const [vendedoresColumns] = await connection.execute(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendedores' ORDER BY ORDINAL_POSITION"
    );
    const vendedoresHasTenantId = vendedoresColumns.some(col => col.COLUMN_NAME === 'tenant_id');
    console.log(`✓ vendedores.tenant_id existe: ${vendedoresHasTenantId ? 'SIM' : 'NÃO'}`);
    
    // 7. Verificar tabela tenants
    const [tenantsColumns] = await connection.execute(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants' ORDER BY ORDINAL_POSITION"
    );
    console.log(`✓ Tabela tenants existe: ${tenantsColumns.length > 0 ? 'SIM' : 'NÃO'} (${tenantsColumns.length} colunas)`);
    
    console.log('\n✅ Verificação concluída');
    
  } catch (error) {
    console.error('❌ Erro:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

verifyMigrationsState().catch(console.error);
