#!/usr/bin/env tsx

import mysql from 'mysql2/promise';

const DB_CONFIG = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'root',
};

async function resetDatabase() {
  console.log('🔄 Conectando ao MySQL...');
  
  const connection = await mysql.createConnection(DB_CONFIG);
  
  try {
    console.log('🗑️  Dropando banco erp...');
    await connection.execute('DROP DATABASE IF EXISTS erp');
    
    console.log('✨ Criando banco erp...');
    await connection.execute('CREATE DATABASE erp');
    
    console.log('✅ Banco resetado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao resetar banco:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

resetDatabase().catch((error) => {
  console.error(error);
  process.exit(1);
});
