const mysql = require('mysql2/promise');

async function checkSchema() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'vendas',
    password: 'vendas123',
    database: 'vendas_app'
  });

  console.log('\n=== TABELAS NO BANCO ===\n');
  
  try {
    // Get all tables
    const [tables] = await conn.execute('SHOW TABLES');
    const tableNames = tables.map(t => Object.values(t)[0]);
    
    console.log(`Total de tabelas: ${tableNames.length}\n`);
    tableNames.forEach(t => console.log(`  - ${t}`));

    // Get detailed info for each table
    console.log('\n=== ESTRUTURA DETALHADA ===\n');
    
    for (const tableName of tableNames) {
      const [columns] = await conn.execute(`DESCRIBE ${tableName}`);
      console.log(`\n📋 ${tableName}`);
      console.log(JSON.stringify(columns, null, 2));
    }
    
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
  
  await conn.end();
}

checkSchema();
