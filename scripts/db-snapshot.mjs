import * as mysql from "mysql2/promise";

const DB_URL = "mysql://root:root@localhost:3306/erp";

function parseUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || "3306"),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
  };
}

async function getDatabaseStructure() {
  const config = parseUrl(DB_URL);
  const pool = mysql.createPool(config);

  try {
    console.log("🔍 Connecting to database...");
    await pool.query("SELECT 1");
    console.log("✅ Connected to database");

    // Get all tables
    const [tables] = await pool.query(`
      SELECT TABLE_NAME, TABLE_TYPE, TABLE_COMMENT
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME
    `, [config.database]);

    console.log(`📊 Found ${tables.length} tables`);

    const structure = {
      database: config.database,
      tables: [],
    };

    for (const table of tables) {
      const tableName = table.TABLE_NAME;
      console.log(`  📋 Processing table: ${tableName}`);

      // Get columns
      const [columns] = await pool.query(`
        SELECT 
          COLUMN_NAME,
          COLUMN_TYPE,
          DATA_TYPE,
          IS_NULLABLE,
          COLUMN_DEFAULT,
          COLUMN_KEY,
          EXTRA,
          COLUMN_COMMENT,
          ORDINAL_POSITION
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
      `, [config.database, tableName]);

      // Get indexes
      const [indexes] = await pool.query(`
        SELECT 
          INDEX_NAME,
          COLUMN_NAME,
          NON_UNIQUE,
          SEQ_IN_INDEX
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY INDEX_NAME, SEQ_IN_INDEX
      `, [config.database, tableName]);

      // Get foreign keys
      const [foreignKeys] = await pool.query(`
        SELECT 
          CONSTRAINT_NAME,
          COLUMN_NAME,
          REFERENCED_TABLE_NAME,
          REFERENCED_COLUMN_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = ? 
          AND TABLE_NAME = ?
          AND REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION
      `, [config.database, tableName]);

      structure.tables.push({
        name: tableName,
        type: table.TABLE_TYPE,
        comment: table.TABLE_COMMENT,
        columns: columns.map(col => ({
          name: col.COLUMN_NAME,
          type: col.COLUMN_TYPE,
          dataType: col.DATA_TYPE,
          nullable: col.IS_NULLABLE === "YES",
          default: col.COLUMN_DEFAULT,
          key: col.COLUMN_KEY,
          extra: col.EXTRA,
          comment: col.COLUMN_COMMENT,
          position: col.ORDINAL_POSITION,
        })),
        indexes: indexes.map(idx => ({
          name: idx.INDEX_NAME,
          column: idx.COLUMN_NAME,
          nonUnique: idx.NON_UNIQUE === 1,
          position: idx.SEQ_IN_INDEX,
        })),
        foreignKeys: foreignKeys.map(fk => ({
          name: fk.CONSTRAINT_NAME,
          column: fk.COLUMN_NAME,
          referencedTable: fk.REFERENCED_TABLE_NAME,
          referencedColumn: fk.REFERENCED_COLUMN_NAME,
        })),
      });
    }

    return structure;
  } finally {
    await pool.end();
  }
}

async function main() {
  try {
    const structure = await getDatabaseStructure();
    
    // Save to JSON
    const fs = await import("fs");
    const path = await import("path");
    
    const snapshotPath = path.join(process.cwd(), ".audit", "baseline-db-snapshot.json");
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.writeFileSync(snapshotPath, JSON.stringify(structure, null, 2));
    
    console.log(`\n✅ Database snapshot saved to: ${snapshotPath}`);
    console.log(`📊 Total tables: ${structure.tables.length}`);
    
    // Print summary
    console.log("\n📋 Tables found:");
    structure.tables.forEach(t => {
      console.log(`  - ${t.name} (${t.columns.length} columns)`);
    });
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();
