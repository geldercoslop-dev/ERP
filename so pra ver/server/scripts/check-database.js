// Script para verificar a conexão com o banco de dados
const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkDatabase() {
  console.log('Verificando conexão com o banco de dados...');
  
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'vendas_db',
  };
  
  console.log('Configuração de conexão:', {
    host: config.host,
    port: config.port,
    user: config.user,
    database: config.database,
    password: config.password ? '********' : '(vazio)'
  });
  
  let connection;
  try {
    console.log('Tentando conectar...');
    connection = await mysql.createConnection(config);
    console.log('Conexão estabelecida com sucesso!');
    
    // Verificar tabelas
    console.log('Verificando tabelas...');
    const [tables] = await connection.query('SHOW TABLES');
    console.log(`${tables.length} tabelas encontradas:`);
    
    for (const table of tables) {
      const tableName = Object.values(table)[0];
      console.log(`- ${tableName}`);
    }
    
    // Verificar vendedores
    console.log('\nVerificando vendedores...');
    try {
      const [vendedores] = await connection.query('SELECT id, nome, admin, ativo FROM vendedores');
      console.log(`${vendedores.length} vendedores encontrados:`);
      
      for (const v of vendedores) {
        console.log(`- ID: ${v.id}, Nome: ${v.nome}, Admin: ${v.admin ? 'Sim' : 'Não'}, Ativo: ${v.ativo ? 'Sim' : 'Não'}`);
      }
    } catch (err) {
      console.error('Erro ao verificar vendedores:', err.message);
    }
    
    return true;
  } catch (err) {
    console.error('Erro ao conectar ao banco de dados:', err);
    return false;
  } finally {
    if (connection) {
      console.log('Fechando conexão...');
      await connection.end();
    }
  }
}

// Executar verificação
checkDatabase()
  .then(success => {
    if (success) {
      console.log('\nVerificação concluída com sucesso!');
      process.exit(0);
    } else {
      console.error('\nVerificação falhou!');
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('Erro durante a verificação:', err);
    process.exit(1);
  });