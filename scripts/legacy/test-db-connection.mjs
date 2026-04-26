/**
 * Script para testar a conexão com o banco de dados
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

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
    
    // Testar tabelas principais
    console.log('\nVerificando tabelas principais:');
    
    // Verificar tabela de clientes
    try {
      const [clientesRows] = await pool.query('SELECT COUNT(*) AS total FROM clientes');
      console.log(`- Tabela clientes: ${clientesRows[0].total} registros`);
    } catch (error) {
      console.error('- Erro ao verificar tabela clientes:', error.message);
    }
    
    // Verificar tabela de produtos
    try {
      const [produtosRows] = await pool.query('SELECT COUNT(*) AS total FROM produtos');
      console.log(`- Tabela produtos: ${produtosRows[0].total} registros`);
    } catch (error) {
      console.error('- Erro ao verificar tabela produtos:', error.message);
    }
    
    // Verificar tabela de pedidos
    try {
      const [pedidosRows] = await pool.query('SELECT COUNT(*) AS total FROM pedidos');
      console.log(`- Tabela pedidos: ${pedidosRows[0].total} registros`);
    } catch (error) {
      console.error('- Erro ao verificar tabela pedidos:', error.message);
    }
    
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
      console.log('\nTeste de conexão concluído com sucesso.');
      process.exit(0);
    } else {
      console.error('\nTeste de conexão falhou.');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Erro inesperado:', error);
    process.exit(1);
  });