import * as mysql from 'mysql2/promise';

async function testDirectConnection() {
  console.log('🔍 TESTE DIRETO DB - SELECT 1');
  console.log('================================');
  
  const config = {
    host: 'localhost',
    port: 3306,
    user: 'vendas',
    password: 'vendas123',
    database: 'vendas_app'
  };
  
  console.log('Config:', {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password ? '***' : 'EMPTY',
    database: config.database
  });
  
  let connection: mysql.Connection | null = null;
  
  try {
    console.log('\n📡 Tentando conectar...');
    connection = await mysql.createConnection(config);
    console.log('✅ Conectado com sucesso!');
    
    console.log('\n🎯 Executando SELECT 1...');
    const [rows] = await connection.execute('SELECT 1 AS test_result');
    console.log('✅ Query executada:', rows);
    
    console.log('\n🎯 Testando banco específico...');
    const [dbInfo] = await connection.execute('SELECT DATABASE() as current_db');
    console.log('✅ Banco atual:', dbInfo);
    
    console.log('\n🎯 Verificando tabelas...');
    const [tables] = await connection.execute('SHOW TABLES');
    console.log('✅ Tabelas encontradas:', tables);
    
  } catch (error) {
    console.error('\n❌ ERRO:', error);
    const err = error as any;
    
    if (err.code === 'ECONNREFUSED') {
      console.error('\n🔧 SOLUÇÃO POSSÍVEL:');
      console.error('- MySQL não está rodando');
      console.error('- Porta errada (verifique se não é 3005/3006)');
      console.error('- Execute: netstat -an | findstr :3306');
    }
    
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\n🔧 SOLUÇÃO POSSÍVEL:');
      console.error('- Usuário/senha incorretos');
      console.error('- Verifique credenciais no .env');
    }
    
    if (err.code === 'ER_BAD_DB_ERROR') {
      console.error('\n🔧 SOLUÇÃO POSSÍVEL:');
      console.error('- Banco "vendas_app" não existe');
      console.error('- Execute: CREATE DATABASE vendas_app;');
    }
    
    process.exit(1);
    
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Conexão fechada');
    }
  }
  
  console.log('\n🎉 TESTE CONCLUÍDO COM SUCESSO!');
}

testDirectConnection();
