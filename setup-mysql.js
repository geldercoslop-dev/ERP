#!/usr/bin/env node
/**
 * Script para setup do MySQL: criar banco e usuário
 */
import mysql from 'mysql2/promise';

async function setupMySQL() {
  let connection;
  try {
    console.log('📶 Conectando ao MySQL como root...');
    
    // Conectar como root (sem senha, padrão no Windows XAMPP)
    connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      port: 3306,
    });
    
    console.log('✅ Conectado como root!');
    console.log('');
    
    // 1. Criar banco de dados
    console.log('1️⃣  Criando banco de dados vendas_app...');
    try {
      await connection.execute(
        `CREATE DATABASE IF NOT EXISTS vendas_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
      console.log('   ✅ Banco de dados criado/já existe');
    } catch (err) {
      console.error('   ❌ Erro ao criar banco:', err.message);
    }
    
    // 2. Criar usuário vendas
    console.log('2️⃣  Criando usuário vendas...');
    try {
      await connection.execute(
        `CREATE USER IF NOT EXISTS 'vendas'@'localhost' IDENTIFIED BY 'vendas123'`
      );
      console.log('   ✅ Usuário criado/já existe');
    } catch (err) {
      console.error('   ❌ Erro ao criar usuário:', err.message);
    }
    
    // 3. Conceder permissões
    console.log('3️⃣  Concedendo permissões...');
    try {
      await connection.execute(
        `GRANT ALL PRIVILEGES ON vendas_app.* TO 'vendas'@'localhost'`
      );
      await connection.execute(`FLUSH PRIVILEGES`);
      console.log('   ✅ Permissões concedidas');
    } catch (err) {
      console.error('   ❌ Erro ao conceder permissões:', err.message);
    }
    
    // 4. Testar conexão com novo usuário
    console.log('4️⃣  Testando conexão com usuário vendas...');
    try {
      await connection.end();
      
      connection = await mysql.createConnection({
        host: 'localhost',
        user: 'vendas',
        password: 'vendas123',
        port: 3306,
        database: 'vendas_app',
      });
      
      console.log('   ✅ Conectado como vendas com sucesso!');
      
      // Verificar tabelas
      const [tables] = await connection.execute('SHOW TABLES');
      console.log(`   📊 Tabelas: ${tables.length || 0} encontradas`);
      
    } catch (err) {
      console.error('   ❌ Erro ao testar conexão:', err.message);
    }
    
    console.log('');
    console.log('✅ Setup MySQL concluído!');
    console.log('');
    console.log('Próximos passos:');
    console.log('  1. npm run db:push:dev  (criar schema)');
    console.log('  2. npm run test:db      (validar conexão)');
    console.log('  3. npm run dev          (iniciar servidor)');
    
  } catch (error) {
    console.error('❌ Erro fatal:', error.message);
    console.error('');
    console.error('SOLUÇÃO:');
    console.error('  1. Verifique se MySQL está rodando: Get-Service MySQL80');
    console.error('  2. Se não estiver: Start-Service MySQL80');
    console.error('  3. Se erro de acesso: tente com -p password');
    process.exit(1);
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (e) {
        // ignore
      }
    }
  }
}

setupMySQL();
