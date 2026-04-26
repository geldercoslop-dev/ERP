/**
 * FASE 1: Inspeção Completa do Banco MySQL
 * 
 * Objetivo: Capturar estado REAL atual do banco como fonte de verdade
 * - Listar todas as tabelas
 * - Listar colunas de cada tabela
 * - Listar índices
 * - Listar foreign keys
 * - Listar constraints
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

const DB_URL = 'mysql://root:root@localhost:3306/erp';
const OUTPUT_DIR = path.resolve(process.cwd(), '.audit', 'baseline-inspection');

// Criar diretório de saída
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('🔍 FASE 1: Inspeção do Banco MySQL');
console.log('📍 Database:', DB_URL);
console.log('📁 Output:', OUTPUT_DIR);
console.log('');

async function inspectDatabase() {
  const connection = await mysql.createConnection(DB_URL);
  
  try {
    console.log('✅ Conectado ao banco MySQL');
    
    // 1. Listar todas as tabelas
    console.log('\n📋 1. Listando tabelas...');
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME
    `);
    
    const tableList = tables.map(t => t.TABLE_NAME);
    console.log(`   Encontradas ${tableList.length} tabelas:`, tableList.join(', '));
    
    fs.writeFileSync(
      path.join(OUTPUT_DIR, '01-tables.json'),
      JSON.stringify(tables, null, 2)
    );
    
    // 2. Listar colunas de cada tabela
    console.log('\n📋 2. Listando colunas de cada tabela...');
    const columnsData = {};
    
    for (const table of tableList) {
      const [columns] = await connection.execute(`
        SELECT 
          COLUMN_NAME, 
          DATA_TYPE, 
          COLUMN_TYPE, 
          IS_NULLABLE, 
          COLUMN_KEY, 
          COLUMN_DEFAULT, 
          EXTRA,
          CHARACTER_MAXIMUM_LENGTH,
          NUMERIC_PRECISION,
          NUMERIC_SCALE
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
      `, [table]);
      
      columnsData[table] = columns;
      console.log(`   ${table}: ${columns.length} colunas`);
    }
    
    fs.writeFileSync(
      path.join(OUTPUT_DIR, '02-columns.json'),
      JSON.stringify(columnsData, null, 2)
    );
    
    // 3. Listar índices
    console.log('\n📋 3. Listando índices...');
    const indexesData = {};
    
    for (const table of tableList) {
      const [indexes] = await connection.execute(`
        SELECT 
          INDEX_NAME, 
          COLUMN_NAME, 
          SEQ_IN_INDEX, 
          NON_UNIQUE, 
          INDEX_TYPE
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
        ORDER BY INDEX_NAME, SEQ_IN_INDEX
      `, [table]);
      
      indexesData[table] = indexes;
      console.log(`   ${table}: ${indexes.length} índices`);
    }
    
    fs.writeFileSync(
      path.join(OUTPUT_DIR, '03-indexes.json'),
      JSON.stringify(indexesData, null, 2)
    );
    
    // 4. Listar foreign keys
    console.log('\n📋 4. Listando foreign keys...');
    const [foreignKeys] = await connection.execute(`
      SELECT 
        CONSTRAINT_NAME,
        TABLE_NAME,
        COLUMN_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() 
        AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION
    `);
    
    console.log(`   Encontradas ${foreignKeys.length} foreign keys`);
    
    fs.writeFileSync(
      path.join(OUTPUT_DIR, '04-foreign-keys.json'),
      JSON.stringify(foreignKeys, null, 2)
    );
    
    // 5. Listar constraints
    console.log('\n📋 5. Listando constraints...');
    const constraintsData = {};
    
    for (const table of tableList) {
      const [constraints] = await connection.execute(`
        SELECT 
          CONSTRAINT_NAME,
          CONSTRAINT_TYPE
        FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      `, [table]);
      
      constraintsData[table] = constraints;
      console.log(`   ${table}: ${constraints.length} constraints`);
    }
    
    fs.writeFileSync(
      path.join(OUTPUT_DIR, '05-constraints.json'),
      JSON.stringify(constraintsData, null, 2)
    );
    
    // 6. Gerar relatório resumido
    console.log('\n📋 6. Gerando relatório resumido...');
    const summary = {
      database: 'erp',
      tableCount: tableList.length,
      tables: tableList,
      inspectionDate: new Date().toISOString(),
      totalColumns: Object.values(columnsData).reduce((sum, cols) => sum + cols.length, 0),
      totalIndexes: Object.values(indexesData).reduce((sum, idxs) => sum + idxs.length, 0),
      totalForeignKeys: foreignKeys.length,
      totalConstraints: Object.values(constraintsData).reduce((sum, cons) => sum + cons.length, 0)
    };
    
    fs.writeFileSync(
      path.join(OUTPUT_DIR, '00-summary.json'),
      JSON.stringify(summary, null, 2)
    );
    
    console.log('\n✅ FASE 1 Concluída com Sucesso!');
    console.log(`📁 Relatórios salvos em: ${OUTPUT_DIR}`);
    console.log('');
    console.log('📊 Resumo:');
    console.log(`   - Tabelas: ${summary.tableCount}`);
    console.log(`   - Colunas: ${summary.totalColumns}`);
    console.log(`   - Índices: ${summary.totalIndexes}`);
    console.log(`   - Foreign Keys: ${summary.totalForeignKeys}`);
    console.log(`   - Constraints: ${summary.totalConstraints}`);
    
  } catch (error) {
    console.error('❌ Erro durante inspeção:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

inspectDatabase().catch(console.error);
