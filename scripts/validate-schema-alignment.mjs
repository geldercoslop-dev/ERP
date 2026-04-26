import * as fs from "fs";
import * as path from "path";

const snapshotPath = path.join(process.cwd(), ".audit", "baseline-db-snapshot.json");
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));

const schemaPath = path.join(process.cwd(), "drizzle", "schema.ts");
const schema = fs.readFileSync(schemaPath, "utf-8");

console.log("🔍 VALIDAÇÃO DE ALINHAMENTO SCHEMA ↔ DB\n");

// Extract table names from schema
const schemaTables = [];
const tableRegex = /export const (\w+) = mysqlTable\("([^"]+)"/g;
let match;
while ((match = tableRegex.exec(schema)) !== null) {
  schemaTables.push({
    exportName: match[1],
    tableName: match[2]
  });
}

// Get DB tables
const dbTables = snapshot.tables
  .filter(t => t.name !== "__drizzle_migrations")
  .map(t => t.name);

console.log(`Schema: ${schemaTables.length} tabelas`);
console.log(`DB: ${dbTables.length} tabelas\n`);

// Check for exact name matches
const exactMatches = [];
const missingInSchema = [];
const extraInSchema = [];

for (const dbTable of dbTables) {
  const inSchema = schemaTables.some(st => st.tableName === dbTable);
  if (inSchema) {
    exactMatches.push(dbTable);
  } else {
    missingInSchema.push(dbTable);
  }
}

for (const schemaTable of schemaTables) {
  const inDb = dbTables.includes(schemaTable.tableName);
  if (!inDb) {
    extraInSchema.push(schemaTable.tableName);
  }
}

console.log("✅ EXACT MATCHES:");
for (const table of exactMatches) {
  console.log(`  - ${table}`);
}

if (missingInSchema.length > 0) {
  console.log("\n❌ MISSING IN SCHEMA:");
  for (const table of missingInSchema) {
    console.log(`  - ${table}`);
  }
}

if (extraInSchema.length > 0) {
  console.log("\n❌ EXTRA IN SCHEMA:");
  for (const table of extraInSchema) {
    console.log(`  - ${table}`);
  }
}

if (missingInSchema.length === 0 && extraInSchema.length === 0) {
  console.log("\n✅ Schema está 100% alinhado com DB");
  process.exit(0);
} else {
  console.log("\n❌ Schema não está alinhado");
  process.exit(1);
}
