import mysql from 'mysql2/promise';

(async () => {
  const c = await mysql.createConnection({
    host: 'localhost',
    user: 'vendas',
    password: 'vendas123',
    database: 'vendas_app'
  });
  
  const [rows] = await c.execute('SELECT * FROM schema_version');
  console.log('Current schema_version:');
  console.log(JSON.stringify(rows, null, 2));
  
  await c.end();
})();
