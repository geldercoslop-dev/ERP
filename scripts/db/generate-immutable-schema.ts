import fs from 'fs';
import path from 'path';

// Load baseline inspection data
const tables = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.audit/baseline-inspection/01-tables.json'), 'utf-8'));
const columns = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.audit/baseline-inspection/02-columns.json'), 'utf-8'));
const indexes = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.audit/baseline-inspection/03-indexes.json'), 'utf-8'));
const foreignKeys = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.audit/baseline-inspection/04-foreign-keys.json'), 'utf-8'));
const constraints = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.audit/baseline-inspection/05-constraints.json'), 'utf-8'));

// Filter out __drizzle_migrations table
const appTables = tables.filter(t => t.TABLE_NAME !== '__drizzle_migrations');

// Helper functions
function mapMySQLTypeToDrizzle(col: any): string {
  const dataType = col.DATA_TYPE;
  const columnType = col.COLUMN_TYPE;
  const isNullable = col.IS_NULLABLE === 'YES';
  const hasDefault = col.COLUMN_DEFAULT !== null;

  let chain = '';

  switch (dataType) {
    case 'int':
      if (col.EXTRA === 'auto_increment') {
        chain = `int().autoincrement()`;
      } else {
        chain = `int()`;
      }
      break;
    case 'bigint':
      if (col.EXTRA === 'auto_increment') {
        chain = `bigint().autoincrement()`;
      } else {
        chain = `bigint()`;
      }
      break;
    case 'varchar':
      const length = columnType.match(/\((\d+)\)/)?.[1] || '255';
      chain = `varchar({ length: ${length} })`;
      break;
    case 'text':
      chain = `text()`;
      break;
    case 'timestamp':
      chain = `timestamp({ mode: 'string' })`;
      break;
    case 'decimal':
      const match = columnType.match(/decimal\((\d+),(\d+)\)/);
      if (match) {
        chain = `decimal({ precision: ${match[1]}, scale: ${match[2]} })`;
      } else {
        chain = `decimal({ precision: 10, scale: 2 })`;
      }
      break;
    case 'tinyint':
      chain = `int()`;
      break;
    case 'enum':
      const enumValues = columnType.match(/enum\(([^)]+)\)/)?.[1];
      if (enumValues) {
        const values = enumValues.split(',').map(v => v.replace(/'/g, ''));
        chain = `mysqlEnum([${values.map(v => `'${v}'`).join(',')}])`;
      }
      break;
    default:
      chain = `text()`;
  }

  if (!isNullable) {
    chain += '.notNull()';
  }
  if (hasDefault && col.COLUMN_DEFAULT !== 'CURRENT_TIMESTAMP') {
    chain += `.default('${col.COLUMN_DEFAULT}')`;
  }
  if (col.COLUMN_DEFAULT === 'CURRENT_TIMESTAMP') {
    if (col.EXTRA.includes('on update')) {
      chain += `.default(sql\`(now())\`).onUpdateNow()`;
    } else {
      chain += `.default(sql\`(now())\`)`;
    }
  }

  return chain;
}

function generateSchema() {
  let output = `import {
  boolean,
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// DATABASE IMMUTABLE LAYER v1
// Fonte: Banco de dados (única fonte de verdade)
// Princípio: DB é fonte absoluta, schema.ts é reflexo exato
// Data baseline: ${new Date().toISOString()}
// Tabelas: ${appTables.length}
//
// REGRAS IMUTÁVEIS:
// 1. DB é única fonte de verdade
// 2. schema.ts é reflexo 1:1 do DB (sem renomeação)
// 3. PROIBIDO: Drizzle inferir renames
// 4. PROIBIDO: schema.ts definir intenção
// 5. Toda mudança: migration explícita → DB → schema.ts

`;

  // Generate each table
  for (const table of appTables) {
    const tableName = table.TABLE_NAME;
    const tableColumns = columns[tableName] || [];
    const tableIndexes = indexes[tableName] || [];
    const tableFKs = foreignKeys.filter(fk => fk.TABLE_NAME === tableName);
    const tableConstraints = constraints[tableName] || [];

    output += `export const ${tableName} = mysqlTable(\n  "${tableName}",\n  {\n`;

    // Generate columns with FK references
    for (const col of tableColumns) {
      const colName = col.COLUMN_NAME;
      let drizzleDef = mapMySQLTypeToDrizzle(col);
      
      // Add FK reference if this column is a foreign key
      const fk = tableFKs.find(f => f.COLUMN_NAME === colName);
      if (fk) {
        const refTable = fk.REFERENCED_TABLE_NAME;
        const refColumn = fk.REFERENCED_COLUMN_NAME;
        // Use exact table name from DB (1:1 mapping)
        drizzleDef += `.references(() => ${refTable}.${refColumn})`;
      }
      
      output += `    ${colName}: ${drizzleDef},\n`;
    }

    output += `  },\n  (table) => ({\n`;

    // Generate indexes (excluding PRIMARY and FK indexes)
    const uniqueConstraints = tableConstraints.filter(c => c.CONSTRAINT_TYPE === 'UNIQUE');
    for (const uc of uniqueConstraints) {
      const idx = tableIndexes.find(i => i.INDEX_NAME === uc.CONSTRAINT_NAME);
      if (idx && idx.NON_UNIQUE === 0) {
        output += `    ${uc.CONSTRAINT_NAME}: unique("${uc.CONSTRAINT_NAME}").on(table.${idx.COLUMN_NAME}),\n`;
      }
    }

    // Generate regular indexes
    const regularIndexes = tableIndexes.filter(i => 
      i.INDEX_NAME !== 'PRIMARY' && 
      !i.INDEX_NAME.includes('_fk') &&
      !uniqueConstraints.find(uc => uc.CONSTRAINT_NAME === i.INDEX_NAME)
    );
    for (const idx of regularIndexes) {
      output += `    ${idx.INDEX_NAME}: index("${idx.INDEX_NAME}").on(table.${idx.COLUMN_NAME}),\n`;
    }

    output += `  }),\n);\n\n`;
  }

  return output;
}

const schema = generateSchema();
fs.writeFileSync(path.join(process.cwd(), 'drizzle/schema.ts'), schema);
console.log('✅ schema.ts generated as exact 1:1 reflection of DB');
console.log('📊 Tables:', appTables.length);
