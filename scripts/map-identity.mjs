import * as fs from "fs";
import * as path from "path";

const snapshotPath = path.join(process.cwd(), ".audit", "baseline-db-snapshot.json");
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));

// Parse schema backup to extract table names
const schemaBackupPath = path.join(process.cwd(), "drizzle", "schema.ts.backup");
const schemaBackup = fs.readFileSync(schemaBackupPath, "utf-8");

// Extract table names from schema backup
const schemaTables = [];
const tableRegex = /export const (\w+) = mysqlTable\("([^"]+)"/g;
let match;
while ((match = tableRegex.exec(schemaBackup)) !== null) {
  schemaTables.push({
    exportName: match[1],
    tableName: match[2]
  });
}

// Get database tables from snapshot
const dbTables = snapshot.tables
  .filter(t => t.name !== "__drizzle_migrations")
  .map(t => t.name);

console.log("📊 MAPEAMENTO DE IDENTIDADE\n");
console.log(`Schema antigo: ${schemaTables.length} tabelas`);
console.log(`Banco de dados: ${dbTables.length} tabelas\n`);

// Classify tables
const identityMap = [];

// Check for EXISTENTE (same name in both)
for (const schemaTable of schemaTables) {
  if (dbTables.includes(schemaTable.tableName)) {
    identityMap.push({
      status: "EXISTENTE",
      exportName: schemaTable.exportName,
      tableName: schemaTable.tableName,
      note: "Nome idêntico no schema e DB"
    });
  }
}

// Check for NOVA (in DB but not in schema)
for (const dbTable of dbTables) {
  const inSchema = schemaTables.some(st => st.tableName === dbTable);
  if (!inSchema) {
    identityMap.push({
      status: "NOVA",
      exportName: dbTable.replace(/_([a-z])/g, (g) => g[1].toUpperCase()),
      tableName: dbTable,
      note: "Existe no DB mas não no schema antigo"
    });
  }
}

// Check for REMOVIDA (in schema but not in DB)
for (const schemaTable of schemaTables) {
  const inDb = dbTables.includes(schemaTable.tableName);
  if (!inDb) {
    identityMap.push({
      status: "REMOVIDA",
      exportName: schemaTable.exportName,
      tableName: schemaTable.tableName,
      note: "Existe no schema mas não no DB"
    });
  }
}

// Sort by status
identityMap.sort((a, b) => {
  const statusOrder = { "EXISTENTE": 0, "NOVA": 1, "REMOVIDA": 2 };
  return statusOrder[a.status] - statusOrder[b.status];
});

// Print mapping
console.log("📋 CLASSIFICAÇÃO:\n");
for (const item of identityMap) {
  const icon = item.status === "EXISTENTE" ? "✅" : item.status === "NOVA" ? "➕" : "❌";
  console.log(`${icon} ${item.status.padEnd(12)} | ${item.exportName.padEnd(20)} | ${item.tableName.padEnd(25)} | ${item.note}`);
}

// Save mapping to file
const mappingPath = path.join(process.cwd(), ".audit", "identity-mapping.json");
fs.writeFileSync(mappingPath, JSON.stringify(identityMap, null, 2));
console.log(`\n💾 Mapeamento salvo em: ${mappingPath}`);

// Summary
const existentes = identityMap.filter(i => i.status === "EXISTENTE").length;
const novas = identityMap.filter(i => i.status === "NOVA").length;
const removidas = identityMap.filter(i => i.status === "REMOVIDA").length;

console.log(`\n📊 RESUMO:`);
console.log(`  ✅ EXISTENTE: ${existentes}`);
console.log(`  ➕ NOVA: ${novas}`);
console.log(`  ❌ REMOVIDA: ${removidas}`);
