/**
 * Script para verificar a estrutura real das tabelas
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs/promises';

// Carregar variáveis de ambiente
dotenv.config();

// Configuração do banco de dados
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'vendas',
  password: process.env.DB_PASSWORD || 'vendas123',
  database: process.env.DB_NAME || 'vendas_app',
  waitForConnections: true,
  connectionLimit: 1,
  queueLimit: 0
};

// Função para verificar a estrutura das tabelas
async function verificarEstruturaTables() {
  let connection;
  try {
    console.log(`Conectando ao banco de dados: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
    connection = await mysql.createConnection(DB_CONFIG);
    
    // Obter lista de tabelas
    const [tabelas] = await connection.query('SHOW TABLES');
    console.log('\nTabelas encontradas:');
    tabelas.forEach((row, index) => {
      const tableName = Object.values(row)[0];
      console.log(`${index + 1}. ${tableName}`);
    });
    
    // Verificar estrutura das tabelas principais
    const tabelasPrincipais = ['clientes', 'produtos', 'pedidos', 'itens_pedido'];
    
    for (const tabela of tabelasPrincipais) {
      console.log(`\nEstrutura da tabela ${tabela}:`);
      try {
        const [colunas] = await connection.query(`DESCRIBE ${tabela}`);
        colunas.forEach(coluna => {
          console.log(`- ${coluna.Field}: ${coluna.Type}${coluna.Null === 'NO' ? ' (NOT NULL)' : ''}${coluna.Key === 'PRI' ? ' (PK)' : ''}`);
        });
      } catch (error) {
        console.error(`Erro ao verificar estrutura da tabela ${tabela}:`, error.message);
      }
    }
    
    // Verificar dados de exemplo
    for (const tabela of tabelasPrincipais) {
      console.log(`\nDados de exemplo da tabela ${tabela}:`);
      try {
        const [rows] = await connection.query(`SELECT * FROM ${tabela} LIMIT 1`);
        if (rows.length > 0) {
          console.log(rows[0]);
        } else {
          console.log('Nenhum registro encontrado');
        }
      } catch (error) {
        console.error(`Erro ao verificar dados da tabela ${tabela}:`, error.message);
      }
    }
    
    // Salvar relatório
    const estrutura = {};
    for (const tabela of tabelasPrincipais) {
      try {
        const [colunas] = await connection.query(`DESCRIBE ${tabela}`);
        estrutura[tabela] = colunas.map(coluna => ({
          nome: coluna.Field,
          tipo: coluna.Type,
          obrigatorio: coluna.Null === 'NO',
          chave: coluna.Key
        }));
      } catch (error) {
        estrutura[tabela] = { erro: error.message };
      }
    }
    
    // Gerar relatório em JSON
    await fs.writeFile('ESTRUTURA_TABELAS.json', JSON.stringify(estrutura, null, 2));
    console.log('\nEstrutura das tabelas salva em ESTRUTURA_TABELAS.json');
    
  } catch (error) {
    console.error('Erro ao verificar estrutura das tabelas:', error);
  } finally {
    if (connection) await connection.end();
  }
}

// Executar verificação
verificarEstruturaTables()
  .then(() => {
    console.log('\nVerificação concluída com sucesso.');
    process.exit(0);
  })
  .catch(error => {
    console.error('\nErro durante a verificação:', error);
    process.exit(1);
  });