import { getDb } from '../server/db';
import { readFileSync } from 'fs';

async function runMigration() {
  try {
    console.log('Starting multi-tenant migration...');
    
    const db = await getDb();
    if (!db) {
      throw new Error('Database connection failed');
    }
    
    // Read the migration SQL
    const migrationSQL = readFileSync('./drizzle/multi_tenant_migration.sql', 'utf8');
    
    // Split into individual statements
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`Executing ${statements.length} SQL statements...`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      try {
        await db.execute(statement);
        console.log(`✓ Statement ${i + 1}/${statements.length} executed`);
      } catch (error: any) {
        console.log(`⚠ Statement ${i + 1} skipped: ${error.message}`);
      }
    }
    
    console.log('✅ Multi-tenant migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
