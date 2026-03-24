import mysql from 'mysql2/promise';

async function testDatabase() {
  console.log('🔍 TESTE MANUAL DE CONEXÃO COM BANCO');
  
  const config = {
    host: process.env.DB_HOST || process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DB_PORT || process.env.DATABASE_PORT || 3306),
    user: process.env.DB_USER || process.env.DATABASE_USER || 'vendas',
    password: process.env.DB_PASSWORD || process.env.DATABASE_PASSWORD || 'vendas123',
    database: process.env.DB_NAME || process.env.DATABASE_NAME || 'vendas_app',
    ssl: process.env.DATABASE_SSL === 'true'
  };

  console.log('📋 CONFIG USADA:', {
    ...config,
    password: config.password ? '***' : undefined
  });

  try {
    console.log('🔌 Tentando conectar...');
    const connection = await mysql.createConnection(config);
    
    console.log('✅ Conexão bem-sucedida!');
    
    const [rows] = await connection.execute('SELECT 1 as test');
    console.log('✅ Query test:', rows);
    
    await connection.end();
    console.log('✅ Conexão fechada com sucesso');
    
  } catch (error: any) {
    console.error('❌ ERRO DE CONEXÃO:');
    console.error('Message:', error.message);
    console.error('Code:', error.code);
    console.error('Errno:', error.errno);
    console.error('SQL State:', error.sqlState);
    console.error('Stack:', error.stack);
    
    process.exit(1);
  }
}

testDatabase();
