import * as fs from "fs";
import * as path from "path";

const snapshotPath = path.join(process.cwd(), ".audit", "baseline-db-snapshot.json");
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));

function mapMySQLTypeToDrizzle(col, colName, camelCaseCol) {
  const { dataType, type, nullable, default: defaultValue } = col;
  
  // Extract length/precision from type string
  const lengthMatch = type.match(/\((\d+)\)/);
  const precisionMatch = type.match(/\((\d+),(\d+)\)/);
  const length = lengthMatch ? parseInt(lengthMatch[1]) : null;
  const precision = precisionMatch ? { precision: parseInt(precisionMatch[1]), scale: parseInt(precisionMatch[2]) } : null;
  
  // Extract enum values
  const enumMatch = type.match(/enum\(([^)]+)\)/);
  const enumValues = enumMatch ? enumMatch[1].split(',').map(v => v.replace(/'/g, '')) : null;
  
  let drizzleType = "";
  
  switch (dataType) {
    case "int":
      drizzleType = `int()${col.extra.includes("auto_increment") ? ".autoincrement()" : ""}`;
      break;
    case "bigint":
      drizzleType = `int()${col.extra.includes("auto_increment") ? ".autoincrement()" : ""}`;
      break;
    case "varchar":
      drizzleType = `varchar({ length: ${length} })`;
      break;
    case "text":
      drizzleType = `text()`;
      break;
    case "decimal":
      if (precision) {
        drizzleType = `decimal({ precision: ${precision.precision}, scale: ${precision.scale} })`;
      } else {
        drizzleType = `decimal({ precision: 10, scale: 2 })`;
      }
      break;
    case "tinyint":
      drizzleType = `tinyint()`;
      break;
    case "timestamp":
      drizzleType = `timestamp({ mode: 'string' })`;
      break;
    case "enum":
      if (enumValues) {
        drizzleType = `mysqlEnum([${enumValues.map(v => `'${v}'`).join(',')}])`;
      }
      break;
    default:
      drizzleType = `text()`;
  }
  
  // Handle column name mapping - must be in the type definition, not after chaining
  // For varchar, timestamp, etc., the column name goes as first argument
  if (colName !== camelCaseCol) {
    if (dataType === "varchar") {
      drizzleType = `varchar("${colName}", { length: ${length} })`;
    } else if (dataType === "timestamp") {
      drizzleType = `timestamp("${colName}", { mode: 'string' })`;
    } else if (dataType === "int" || dataType === "bigint") {
      drizzleType = `int("${colName}")${col.extra.includes("auto_increment") ? ".autoincrement()" : ""}`;
    } else if (dataType === "tinyint") {
      drizzleType = `tinyint("${colName}")`;
    }
  }
  
  // Add default value BEFORE notNull (order matters for Drizzle)
  if (defaultValue !== null && defaultValue !== "") {
    if (defaultValue === "CURRENT_TIMESTAMP") {
      if (col.extra.includes("DEFAULT_GENERATED on update CURRENT_TIMESTAMP")) {
        drizzleType += ".defaultNow().onUpdateNow()";
      } else {
        drizzleType += ".defaultNow()";
      }
    } else if (typeof defaultValue === "string" && !isNaN(parseFloat(defaultValue))) {
      drizzleType += `.default('${defaultValue}')`;
    } else if (typeof defaultValue === "number") {
      drizzleType += `.default(${defaultValue})`;
    } else {
      drizzleType += `.default('${defaultValue}')`;
    }
  }
  
  // Add nullable LAST
  if (!nullable) {
    drizzleType += ".notNull()";
  }
  
  return drizzleType;
}

function generateSchema(snapshot) {
  let schema = `import { mysqlTable, mysqlSchema, AnyMySqlColumn, index, primaryKey, unique, int, varchar, mysqlEnum, timestamp, text, foreignKey, decimal, tinyint } from "drizzle-orm/mysql-core"\n`;
  schema += `import { sql } from "drizzle-orm"\n\n`;
  
  // Sort tables alphabetically for consistency
  const tables = snapshot.tables
    .filter(t => t.name !== "__drizzle_migrations") // Skip drizzle migrations table
    .sort((a, b) => a.name.localeCompare(b.name));
  
  // First pass: collect all table references for foreign keys
  const tableMap = {};
  tables.forEach(t => {
    tableMap[t.name] = t;
  });
  
  // Generate table definitions
  for (const table of tables) {
    const tableName = table.name;
    const camelCaseName = tableName.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    
    schema += `export const ${camelCaseName} = mysqlTable("${tableName}", {\n`;
    
    // Generate columns with foreign key references
    for (const col of table.columns) {
      const colName = col.name;
      const camelCaseCol = colName.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
      
      let colDef = `\t${camelCaseCol}: ${mapMySQLTypeToDrizzle(col, colName, camelCaseCol)}`;
      
      // Check if this column has a foreign key
      const fk = table.foreignKeys.find(f => f.column === colName);
      if (fk) {
        const refTable = fk.referencedTable;
        const refTableCamel = refTable.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
        const refColCamel = fk.referencedColumn.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
        colDef += `.references(() => ${refTableCamel}.${refColCamel})`;
      }
      
      schema += `${colDef},\n`;
    }
    
    schema += `},\n(table) => [\n`;
    
    // Generate indexes (skip foreign key indexes - MySQL creates them automatically)
    const fkColumns = new Set(table.foreignKeys.map(fk => fk.column));
    const indexMap = {};
    for (const idx of table.indexes) {
      if (idx.name === "PRIMARY") continue;
      
      // Skip indexes that match foreign key names (MySQL auto-creates them)
      if (table.foreignKeys.some(fk => fk.name === idx.name)) continue;
      
      if (!indexMap[idx.name]) {
        indexMap[idx.name] = [];
      }
      indexMap[idx.name].push(idx.column);
    }
    
    for (const [idxName, columns] of Object.entries(indexMap)) {
      const isUnique = table.indexes.find(i => i.name === idxName && !i.nonUnique);
      if (isUnique) {
        schema += `\tunique("${idxName}").on(${columns.map(c => `table.${c.replace(/_([a-z])/g, (g) => g[1].toUpperCase())}`).join(', ')}),\n`;
      } else {
        schema += `\tindex("${idxName}").on(${columns.map(c => `table.${c.replace(/_([a-z])/g, (g) => g[1].toUpperCase())}`).join(', ')}),\n`;
      }
    }
    
    // Generate primary key
    const pkCol = table.columns.find(c => c.key === "PRI");
    if (pkCol) {
      const camelCasePk = pkCol.name.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
      schema += `\tprimaryKey({ columns: [table.${camelCasePk}], name: "${tableName}_id"}),\n`;
    }
    
    schema += `]);\n\n`;
  }
  
  return schema;
}

const schema = generateSchema(snapshot);
const outputPath = path.join(process.cwd(), "drizzle", "schema.ts");

// Backup old schema
if (fs.existsSync(outputPath)) {
  const backupPath = path.join(process.cwd(), "drizzle", "schema.ts.backup");
  fs.copyFileSync(outputPath, backupPath);
  console.log(`✅ Old schema backed up to: ${backupPath}`);
}

fs.writeFileSync(outputPath, schema);
console.log(`✅ New schema generated from database: ${outputPath}`);
console.log(`📊 Total tables: ${snapshot.tables.filter(t => t.name !== "__drizzle_migrations").length}`);
