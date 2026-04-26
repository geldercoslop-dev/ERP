#!/usr/bin/env node

/**
 * ⚠️  DEPRECATED - INTROSPECT DESATIVADO
 * 
 * Este script foi DESATIVADO como parte da refatoração de arquitetura.
 * 
 * NOVO PRINCÍPIO:
 * - schema.ts é CONTRATO DE DOMÍNIO (domain contract)
 * - DB executa, schema define
 * - Alterações só via decisão de domínio explícita
 * - Fluxo: domain decision → schema.ts → migration → DB
 * 
 * MOTIVO DA DESATIVAÇÃO:
 * - Introspect como fonte primária viola controle de domínio
 * - DB não deve sobrescrever schema.ts automaticamente
 * - Evolução estrutural deve ser controlada e intencional
 * 
 * SE VOCÊ PRECISA VERIFICAR CONSISTÊNCIA:
 * - Use: pnpm run db:generate (gera migration diff)
 * - Revise o SQL gerado manualmente
 * - Aplique migration se necessário
 * 
 * PARA DIAGNÓSTICO MANUAL (APENAS DEV):
 * - Comente esta mensagem temporariamente
 * - Execute manualmente com cuidado
 * - NUNCA em produção
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

const DB_CONFIG = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'root',
  database: 'erp'
};

async function getTables(connection) {
  const [rows] = await connection.execute(`
    SELECT TABLE_NAME 
    FROM information_schema.TABLES 
    WHERE TABLE_SCHEMA = ? 
    AND TABLE_TYPE = 'BASE TABLE'
    AND TABLE_NAME != '__drizzle_migrations'
    ORDER BY TABLE_NAME
  `, [DB_CONFIG.database]);
  
  return rows.map(row => row.TABLE_NAME);
}

async function getColumns(connection, tableName) {
  const [rows] = await connection.execute(`
    SELECT 
      COLUMN_NAME,
      COLUMN_TYPE,
      IS_NULLABLE,
      COLUMN_DEFAULT,
      EXTRA,
      COLUMN_KEY
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = ? 
    AND TABLE_NAME = ?
    ORDER BY ORDINAL_POSITION
  `, [DB_CONFIG.database, tableName]);
  
  return rows;
}

async function getIndexes(connection, tableName) {
  const [rows] = await connection.execute(`
    SELECT 
      INDEX_NAME,
      COLUMN_NAME,
      NON_UNIQUE,
      SEQ_IN_INDEX
    FROM information_schema.STATISTICS 
    WHERE TABLE_SCHEMA = ? 
    AND TABLE_NAME = ?
    ORDER BY INDEX_NAME, SEQ_IN_INDEX
  `, [DB_CONFIG.database, tableName]);
  
  return rows;
}

async function getForeignKeys(connection, tableName) {
  const [rows] = await connection.execute(`
    SELECT 
      CONSTRAINT_NAME,
      COLUMN_NAME,
      REFERENCED_TABLE_NAME,
      REFERENCED_COLUMN_NAME
    FROM information_schema.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = ? 
    AND TABLE_NAME = ?
    AND REFERENCED_TABLE_NAME IS NOT NULL
  `, [DB_CONFIG.database, tableName]);
  
  return rows;
}

function mapMySQLTypeToDrizzle(column) {
  const { COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, COLUMN_KEY } = column;
  
  let drizzleType = '';
  
  // Parse type
  if (COLUMN_TYPE.startsWith('int(')) {
    drizzleType = COLUMN_KEY === 'PRI' && EXTRA.includes('auto_increment') 
      ? 'int("id").primaryKey().autoincrement()'
      : `int("${column.COLUMN_NAME}")`;
  } else if (COLUMN_TYPE.startsWith('bigint(')) {
    drizzleType = COLUMN_KEY === 'PRI' && EXTRA.includes('auto_increment')
      ? 'int("id").primaryKey().autoincrement()'
      : `int("${column.COLUMN_NAME}")`;
  } else if (COLUMN_TYPE.startsWith('varchar(')) {
    const lengthMatch = COLUMN_TYPE.match(/\((\d+)\)/);
    const length = lengthMatch ? parseInt(lengthMatch[1]) : 255;
    drizzleType = `varchar("${column.COLUMN_NAME}", { length: ${length} })`;
  } else if (COLUMN_TYPE === 'text') {
    drizzleType = `text("${column.COLUMN_NAME}")`;
  } else if (COLUMN_TYPE.startsWith('decimal(')) {
    const precisionMatch = COLUMN_TYPE.match(/\((\d+),(\d+)\)/);
    if (precisionMatch) {
      const precision = parseInt(precisionMatch[1]);
      const scale = parseInt(precisionMatch[2]);
      drizzleType = `decimal("${column.COLUMN_NAME}", { precision: ${precision}, scale: ${scale} })`;
    } else {
      drizzleType = `decimal("${column.COLUMN_NAME}", { precision: 10, scale: 2 })`;
    }
  } else if (COLUMN_TYPE === 'tinyint(1)') {
    drizzleType = `boolean("${column.COLUMN_NAME}")`;
  } else if (COLUMN_TYPE.startsWith('timestamp')) {
    drizzleType = `timestamp("${column.COLUMN_NAME}", { mode: 'string' })`;
  } else if (COLUMN_TYPE.startsWith('enum(')) {
    const enumMatch = COLUMN_TYPE.match(/enum\(([^)]+)\)/);
    if (enumMatch) {
      const enumValues = enumMatch[1].split(',').map(v => v.trim().replace(/'/g, ''));
      drizzleType = `mysqlEnum("${column.COLUMN_NAME}", [${enumValues.map(v => `'${v}'`).join(', ')}])`;
    }
  } else {
    drizzleType = `text("${column.COLUMN_NAME}")`;
  }
  
  // Handle defaults
  if (COLUMN_DEFAULT !== null) {
    if (COLUMN_DEFAULT === 'CURRENT_TIMESTAMP') {
      if (EXTRA.includes('on update CURRENT_TIMESTAMP')) {
        drizzleType += '.defaultNow().onUpdateNow()';
      } else {
        drizzleType += '.defaultNow()';
      }
    } else if (typeof COLUMN_DEFAULT === 'string') {
      if (!isNaN(parseFloat(COLUMN_DEFAULT))) {
        drizzleType += `.default('${COLUMN_DEFAULT}')`;
      } else {
        drizzleType += `.default('${COLUMN_DEFAULT}')`;
      }
    } else {
      drizzleType += `.default(${COLUMN_DEFAULT})`;
    }
  }
  
  // Handle nullable
  if (IS_NULLABLE === 'NO') {
    drizzleType += '.notNull()';
  }
  
  // Handle primary key (if not already handled)
  if (COLUMN_KEY === 'PRI' && !drizzleType.includes('.primaryKey()')) {
    drizzleType = drizzleType.replace('.notNull()', '.primaryKey().notNull()');
  }
  
  return drizzleType;
}

function camelCase(str) {
  return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

async function generateSchema() {
  const connection = await mysql.createConnection(DB_CONFIG);
  
  try {
    console.log('🔍 Conectado ao DB, iniciando introspeção determinística...');
    
    const tables = await getTables(connection);
    console.log(`📊 Encontradas ${tables.length} tabelas no DB`);
    
    let schema = `import {\n`;
    schema += `  boolean,\n`;
    schema += `  decimal,\n`;
    schema += `  index,\n`;
    schema += `  int,\n`;
    schema += `  mysqlEnum,\n`;
    schema += `  mysqlTable,\n`;
    schema += `  text,\n`;
    schema += `  timestamp,\n`;
    schema += `  unique,\n`;
    schema += `  varchar,\n`;
    schema += `} from "drizzle-orm/mysql-core";\n\n`;
    
    schema += `// GERADO DETERMINISTICAMENTE DO DB\n`;
    schema += `// Fonte: information_schema (DB é verdade estrutural)\n`;
    schema += `// Data: ${new Date().toISOString()}\n`;
    schema += `// Tabelas: ${tables.length}\n\n`;
    
    // Collect all foreign keys first for references
    const allForeignKeys = {};
    for (const tableName of tables) {
      const fks = await getForeignKeys(connection, tableName);
      allForeignKeys[tableName] = fks;
    }
    
    for (const tableName of tables) {
      const camelTableName = camelCase(tableName);
      const columns = await getColumns(connection, tableName);
      const indexes = await getIndexes(connection, tableName);
      const fks = allForeignKeys[tableName] || [];
      
      schema += `export const ${camelTableName} = mysqlTable(\n`;
      schema += `  "${tableName}",\n`;
      schema += `  {\n`;
      
      // Generate columns
      for (const column of columns) {
        const camelColumnName = camelCase(column.COLUMN_NAME);
        
        // Skip if this is a primary key that's already handled
        if (column.COLUMN_KEY === 'PRI' && column.EXTRA.includes('auto_increment')) {
          schema += `    ${camelColumnName}: int("id").primaryKey().autoincrement(),\n`;
          continue;
        }
        
        let colDef = mapMySQLTypeToDrizzle(column);
        
        // Add foreign key reference if applicable
        const fk = fks.find(f => f.COLUMN_NAME === column.COLUMN_NAME);
        if (fk) {
          const refTableCamel = camelCase(fk.REFERENCED_TABLE_NAME);
          const refColCamel = camelCase(fk.REFERENCED_COLUMN_NAME);
          colDef += `.references(() => ${refTableCamel}.${refColCamel})`;
        }
        
        schema += `    ${camelColumnName}: ${colDef},\n`;
      }
      
      schema += `  },\n`;
      schema += `  (table) => ({\n`;
      
      // Group indexes by name
      const indexGroups = {};
      const fkColumnNames = new Set(fks.map(f => f.COLUMN_NAME));
      
      for (const idx of indexes) {
        if (idx.INDEX_NAME === 'PRIMARY') continue;
        
        // Skip indexes that are automatically created by MySQL for foreign keys
        // MySQL creates an index with the same name as the FK constraint
        const isFkIndex = fks.some(f => 
          f.CONSTRAINT_NAME === idx.INDEX_NAME || 
          idx.COLUMN_NAME === f.COLUMN_NAME
        );
        
        if (isFkIndex) {
          continue;
        }
        
        if (!indexGroups[idx.INDEX_NAME]) {
          indexGroups[idx.INDEX_NAME] = {
            columns: [],
            nonUnique: idx.NON_UNIQUE
          };
        }
        indexGroups[idx.INDEX_NAME].columns.push(idx.COLUMN_NAME);
      }
      
      // Generate index definitions
      for (const [idxName, idxData] of Object.entries(indexGroups)) {
        const columnRefs = idxData.columns.map(col => {
          const camelCol = camelCase(col);
          return `table.${camelCol}`;
        }).join(', ');
        
        if (idxData.nonUnique === 0) {
          schema += `    ${camelCase(idxName)}: unique("${idxName}").on(${columnRefs}),\n`;
        } else {
          schema += `    ${camelCase(idxName)}: index("${idxName}").on(${columnRefs}),\n`;
        }
      }
      
      schema += `  }),\n`;
      schema += `);\n\n`;
    }
    
    return schema;
  } finally {
    await connection.end();
  }
}

async function main() {
  try {
    const schema = await generateSchema();
    
    const outputPath = path.join(process.cwd(), 'drizzle', 'schema.ts');
    const backupPath = path.join(process.cwd(), 'drizzle', 'schema.ts.backup');
    
    // Backup existing schema
    if (fs.existsSync(outputPath)) {
      fs.copyFileSync(outputPath, backupPath);
      console.log('✅ Schema atual backupado para: schema.ts.backup');
    }
    
    // Write new schema
    fs.writeFileSync(outputPath, schema);
    console.log(`✅ Schema determinístico gerado: ${outputPath}`);
    console.log('📋 Este schema é 1:1 com o DB atual');
    
  } catch (error) {
    console.error('❌ Erro na introspeção determinística:', error);
    process.exit(1);
  }
}

main();
