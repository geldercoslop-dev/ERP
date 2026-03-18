/**
 * Script para verificar os índices do banco de dados
 */
import { createConnection } from 'mysql2/promise';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

// Configuração do banco de dados
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'erp',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Lista de tabelas para verificar
const TABLES_TO_CHECK = [
  'produtos',
  'pedidos',
  'contas_receber',
  'contas_pagar',
  'clientes',
  'promocoes',
  'promocoes_itens',
  'produto_variacoes',
  'audit_log',
  'pendencias'
];

// Função para obter os índices de uma tabela
async function getTableIndexes(connection, tableName) {
  const [rows] = await connection.query(`SHOW INDEX FROM ${tableName}`);
  return rows;
}

// Função para analisar os índices
function analyzeIndexes(indexes) {
  const result = {
    primaryKey: false,
    uniqueIndexes: [],
    nonUniqueIndexes: [],
    multiColumnIndexes: [],
    indexedColumns: new Set(),
    missingCommonIndexes: []
  };
  
  // Mapeamento de colunas comuns que geralmente precisam de índice
  const commonColumns = {
    'tenant_id': false,
    'id': false,
    'status': false,
    'createdAt': false,
    'updatedAt': false,
    'ativo': false
  };
  
  // Analisar cada índice
  const indexMap = {};
  
  for (const idx of indexes) {
    const indexName = idx.Key_name;
    const columnName = idx.Column_name;
    const isUnique = idx.Non_unique === 0;
    const seqInIndex = idx.Seq_in_index;
    
    // Marcar coluna como indexada
    result.indexedColumns.add(columnName);
    
    // Verificar se é uma coluna comum
    if (columnName in commonColumns) {
      commonColumns[columnName] = true;
    }
    
    // Agrupar por nome do índice
    if (!indexMap[indexName]) {
      indexMap[indexName] = {
        name: indexName,
        columns: [],
        isUnique: isUnique,
        isPrimary: indexName === 'PRIMARY'
      };
    }
    
    indexMap[indexName].columns.push({
      name: columnName,
      seqInIndex: seqInIndex
    });
  }
  
  // Processar os índices agrupados
  for (const [name, index] of Object.entries(indexMap)) {
    // Ordenar colunas por sequência
    index.columns.sort((a, b) => a.seqInIndex - b.seqInIndex);
    
    if (index.isPrimary) {
      result.primaryKey = true;
    } else if (index.isUnique) {
      result.uniqueIndexes.push(index);
    } else {
      result.nonUniqueIndexes.push(index);
    }
    
    if (index.columns.length > 1) {
      result.multiColumnIndexes.push(index);
    }
  }
  
  // Verificar colunas comuns sem índice
  for (const [column, hasIndex] of Object.entries(commonColumns)) {
    if (!hasIndex) {
      result.missingCommonIndexes.push(column);
    }
  }
  
  return result;
}

// Função para executar a verificação
async function checkIndexes() {
  console.log('Verificando índices do banco de dados...');
  
  // Conectar ao banco de dados
  const connection = await createConnection(dbConfig);
  console.log('Conexão estabelecida com o banco de dados');
  
  try {
    const results = {};
    
    for (const tableName of TABLES_TO_CHECK) {
      console.log(`\nVerificando índices da tabela: ${tableName}`);
      
      try {
        const indexes = await getTableIndexes(connection, tableName);
        const analysis = analyzeIndexes(indexes);
        
        console.log(`  Chave primária: ${analysis.primaryKey ? 'Sim' : 'Não'}`);
        console.log(`  Índices únicos: ${analysis.uniqueIndexes.length}`);
        console.log(`  Índices não-únicos: ${analysis.nonUniqueIndexes.length}`);
        console.log(`  Índices multi-coluna: ${analysis.multiColumnIndexes.length}`);
        console.log(`  Total de colunas indexadas: ${analysis.indexedColumns.size}`);
        
        if (analysis.missingCommonIndexes.length > 0) {
          console.log(`  Colunas comuns sem índice: ${analysis.missingCommonIndexes.join(', ')}`);
        }
        
        console.log('  Detalhes dos índices:');
        for (const idx of [...analysis.uniqueIndexes, ...analysis.nonUniqueIndexes]) {
          const columns = idx.columns.map(c => c.name).join(', ');
          console.log(`    - ${idx.name} (${idx.isUnique ? 'único' : 'não-único'}): ${columns}`);
        }
        
        results[tableName] = analysis;
      } catch (error) {
        console.error(`  Erro ao verificar índices da tabela ${tableName}:`, error.message);
      }
    }
    
    console.log('\nResumo geral:');
    console.log('---------------------------------------------------');
    
    let totalIndexes = 0;
    let tablesWithMissingIndexes = [];
    
    for (const [tableName, analysis] of Object.entries(results)) {
      const indexCount = analysis.uniqueIndexes.length + analysis.nonUniqueIndexes.length;
      totalIndexes += indexCount;
      
      if (analysis.missingCommonIndexes.length > 0) {
        tablesWithMissingIndexes.push({
          table: tableName,
          missing: analysis.missingCommonIndexes
        });
      }
    }
    
    console.log(`Total de índices encontrados: ${totalIndexes}`);
    
    if (tablesWithMissingIndexes.length > 0) {
      console.log('\nTabelas com índices comuns faltando:');
      for (const { table, missing } of tablesWithMissingIndexes) {
        console.log(`  - ${table}: ${missing.join(', ')}`);
      }
    } else {
      console.log('\nTodas as tabelas têm os índices comuns necessários.');
    }
    
  } finally {
    // Fechar a conexão
    await connection.end();
    console.log('\nConexão com o banco de dados fechada');
  }
}

// Executar a verificação
checkIndexes().catch(error => {
  console.error('Erro ao verificar índices:', error);
  process.exit(1);
});