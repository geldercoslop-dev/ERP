/**
 * Script para testar a conexão com o banco de dados
 */
const mysql = require('mysql2/promise');

async function testDatabaseConnection() {
  // Configuração do banco de dados (igual ao DEFAULT_CONFIG em server/config/database.ts)
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'vendas',
    password: process.env.DB_PASSWORD || 'vendas123',
    database: process.env.DB_NAME || 'vendas_app',
    waitForConnections: true,
    connectionLimit: 1,
    queueLimit: 0
  };

  console.log(`Tentando conectar ao banco de dados: ${config.host}:${config.port}/${config.database}`);

  try {
    // Criar pool de conexão
    const pool = mysql.createPool(config);
    
    // Testar conexão
    const [rows] = await pool.query('SELECT 1 AS status');
    console.log('Conexão com o banco de dados estabelecida com sucesso!');
    console.log('Resultado:', rows);
    
    // Fechar pool
    await pool.end();
    
    return true;
  } catch (error) {
    console.error('Erro ao conectar ao banco de dados:', error.message);
    return false;
  }
}

// Executar o teste
testDatabaseConnection()
  .then(success => {
    if (success) {
      console.log('Teste de conexão concluído com sucesso.');
      process.exit(0);
    } else {
      console.error('Teste de conexão falhou.');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Erro inesperado:', error);
    process.exit(1);
  });