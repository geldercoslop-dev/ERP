import mysql from 'mysql2/promise';

(async () => {
  const c = await mysql.createConnection({
    host: 'localhost',
    user: 'vendas',
    password: 'vendas123',
    database: 'vendas_app'
  });
  
  try {
    // Insert version 1 into schema_version
    const result = await c.execute(
      'INSERT IGNORE INTO schema_version (id, version) VALUES (?, ?)',
      [1, 1]
    );
    
    console.log('✅ schema_version INSERT successful');
    console.log('Result:', result[0]);
    
    // Verify
    const [rows] = await c.execute('SELECT * FROM schema_version');
    console.log('\nCurrent schema_version:');
    console.log(JSON.stringify(rows, null, 2));
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
  
  await c.end();
})();
