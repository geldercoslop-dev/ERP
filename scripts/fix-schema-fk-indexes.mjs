import * as fs from "fs";
import * as path from "path";

const schemaPath = path.join(process.cwd(), "drizzle", "schema.ts");
let schema = fs.readFileSync(schemaPath, "utf-8");

// Read identity mapping to get table names
const mappingPath = path.join(process.cwd(), ".audit", "identity-mapping.json");
const identityMap = JSON.parse(fs.readFileSync(mappingPath, "utf-8"));

// Read DB snapshot to get foreign key names
const snapshotPath = path.join(process.cwd(), ".audit", "baseline-db-snapshot.json");
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));

// Collect all foreign key index names from DB
const fkIndexNames = new Set();
for (const table of snapshot.tables) {
  for (const fk of table.foreignKeys) {
    fkIndexNames.add(fk.name);
  }
}

console.log("🔍 FK index names from DB:", Array.from(fkIndexNames));

// Remove index definitions that match foreign key names
const lines = schema.split('\n');
const fixedLines = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Check if this line is an index definition that matches a FK name
  let shouldRemove = false;
  for (const fkName of fkIndexNames) {
    if (line.includes(`index("${fkName}")`) || line.includes(`unique("${fkName}")`)) {
      console.log(`🗑️  Removing conflicting index: ${line.trim()}`);
      shouldRemove = true;
      break;
    }
  }
  
  if (!shouldRemove) {
    fixedLines.push(line);
  }
}

const fixedSchema = fixedLines.join('\n');

// Backup the current schema
const backupPath = path.join(process.cwd(), "drizzle", "schema.ts.before-fk-fix");
fs.writeFileSync(backupPath, schema);
console.log(`✅ Schema backed up to: ${backupPath}`);

// Write fixed schema
fs.writeFileSync(schemaPath, fixedSchema);
console.log(`✅ Fixed schema written to: ${schemaPath}`);
