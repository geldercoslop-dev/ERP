/**
 * SCHEMA vs DB VALIDATION - BASE + INFRA v1.0
 * 
 * FASE 2: Validação de consistência entre schema.ts e banco de dados
 * 
 * Detecta:
 * - Campos no DB que não existem no schema
 * - Campos no schema que não existem no DB
 * - Mismatch de tipos
 * - Campos removidos/adicional não sincronizados
 * 
 * ANTI-DRIFT RULE (BASE + INFRA v1.0 - Rule 2):
 * - Qualquer migration deve bater com journal
 * - Se drift detectado → BLOQUEIO
 * 
 * SEM correção automática
 * 
 * NOTE: This is a lightweight validation that can be run during bootstrap
 * or as a separate health check. It uses direct MySQL pool access.
 */

import { logger } from './logger.js';
import { extractSchemaMetadata, fieldExistsInSchema, getTableFields } from './schema-contract.js';
import { getMysqlPoolOptionsFromEnv } from '../config/database.js';
import * as mysql from 'mysql2/promise';

/**
 * DB Column Metadata
 */
interface DBColumnMetadata {
  tableName: string;
  columnName: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
}

/**
 * Schema vs DB Validation Report
 */
interface SchemaDBValidationReport {
  timestamp: string;
  tables: Record<string, {
    schemaFields: string[];
    dbColumns: string[];
    missingInSchema: string[];
    missingInDB: string[];
    typeMismatches: Array<{ field: string; schemaType: string; dbType: string }>;
  }>;
  violations: string[];
  warnings: string[];
}

/**
 * Extract DB metadata from actual database
 * 
 * @returns Map of table name to column metadata
 */
export async function extractDBMetadata(): Promise<Map<string, DBColumnMetadata[]>> {
  const poolOptions = getMysqlPoolOptionsFromEnv();
  const pool = mysql.createPool(poolOptions);
  const metadata = new Map<string, DBColumnMetadata[]>();

  try {
    // Get all table names
    const [tables] = await pool.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_TYPE = 'BASE TABLE'
    `);

    for (const row of tables as { TABLE_NAME: string }[]) {
      const tableName = row.TABLE_NAME;
      const columns: DBColumnMetadata[] = [];

      // Get column information for this table
      const [columnsResult] = await pool.execute(`
        SELECT 
          COLUMN_NAME,
          DATA_TYPE,
          IS_NULLABLE,
          COLUMN_KEY
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
      `, [tableName]);

      for (const col of columnsResult as {
        COLUMN_NAME: string;
        DATA_TYPE: string;
        IS_NULLABLE: string;
        COLUMN_KEY: string;
      }[]) {
        columns.push({
          tableName,
          columnName: col.COLUMN_NAME,
          dataType: col.DATA_TYPE,
          isNullable: col.IS_NULLABLE === 'YES',
          isPrimaryKey: col.COLUMN_KEY === 'PRI',
        });
      }

      metadata.set(tableName, columns);
    }
  } catch (error) {
    logger.error({ error }, 'Failed to extract DB metadata');
    throw error;
  } finally {
    await pool.end();
  }

  return metadata;
}

/**
 * Compare schema fields with DB columns
 * 
 * @param tableName - Table name
 * @returns Comparison result
 */
export async function compareTableSchemaWithDB(
  tableName: string
): Promise<{
  schemaFields: string[];
  dbColumns: string[];
  missingInSchema: string[];
  missingInDB: string[];
  typeMismatches: Array<{ field: string; schemaType: string; dbType: string }>;
}> {
  const schemaMetadata = extractSchemaMetadata();
  const dbMetadata = await extractDBMetadata();

  const schemaFields = getTableFields(tableName);
  const dbColumns = dbMetadata.get(tableName)?.map(c => c.columnName) || [];

  const missingInSchema = dbColumns.filter(col => !schemaFields.includes(col));
  const missingInDB = schemaFields.filter(field => !dbColumns.includes(field));

  // Type comparison (simplified - can be enhanced)
  const typeMismatches: Array<{ field: string; schemaType: string; dbType: string }> = [];
  const tableSchemaFields = schemaMetadata.get(tableName) || [];
  const tableDBColumns = dbMetadata.get(tableName) || [];

  for (const schemaField of tableSchemaFields) {
    const dbColumn = tableDBColumns.find(c => c.columnName === schemaField.fieldName);
    if (dbColumn) {
      // Simplified type mapping - can be enhanced with proper type mapping
      const schemaType = schemaField.type.toLowerCase();
      const dbType = dbColumn.dataType.toLowerCase();
      
      // Basic type mismatch detection
      if (schemaType !== dbType && !isCompatibleType(schemaType, dbType)) {
        typeMismatches.push({
          field: schemaField.fieldName,
          schemaType: schemaType,
          dbType: dbType,
        });
      }
    }
  }

  return {
    schemaFields,
    dbColumns,
    missingInSchema,
    missingInDB,
    typeMismatches,
  };
}

/**
 * Check if two types are compatible (simplified)
 * 
 * @param schemaType - Type from schema
 * @param dbType - Type from DB
 * @returns true if types are compatible
 */
function isCompatibleType(schemaType: string, dbType: string): boolean {
  // Simplified compatibility check
  const compatMap: Record<string, string[]> = {
    'int': ['int', 'integer', 'tinyint', 'smallint', 'mediumint', 'bigint'],
    'varchar': ['varchar', 'char', 'text'],
    'text': ['text', 'varchar', 'char'],
    'decimal': ['decimal', 'numeric', 'double', 'float'],
    'timestamp': ['timestamp', 'datetime'],
    'date': ['date', 'datetime', 'timestamp'],
    'boolean': ['tinyint', 'boolean'],
  };

  for (const [base, compatible] of Object.entries(compatMap)) {
    if (schemaType.includes(base) && compatible.some(c => dbType.includes(c))) {
      return true;
    }
  }

  return false;
}

/**
 * Generate schema vs DB validation report
 * 
 * @returns Validation report
 */
export async function generateSchemaDBValidationReport(): Promise<SchemaDBValidationReport> {
  const schemaMetadata = extractSchemaMetadata();
  const dbMetadata = await extractDBMetadata();

  const report: SchemaDBValidationReport = {
    timestamp: new Date().toISOString(),
    tables: {},
    violations: [],
    warnings: [],
  };

  // Compare all tables in schema
  for (const tableName of schemaMetadata.keys()) {
    const comparison = await compareTableSchemaWithDB(tableName);
    
    report.tables[tableName] = {
      schemaFields: comparison.schemaFields,
      dbColumns: comparison.dbColumns,
      missingInSchema: comparison.missingInSchema,
      missingInDB: comparison.missingInDB,
      typeMismatches: comparison.typeMismatches,
    };

    // Add violations for missing fields
    if (comparison.missingInSchema.length > 0) {
      report.violations.push(
        `Table '${tableName}': Fields in DB but not in schema: ${comparison.missingInSchema.join(', ')}`
      );
    }

    if (comparison.missingInDB.length > 0) {
      report.violations.push(
        `Table '${tableName}': Fields in schema but not in DB: ${comparison.missingInDB.join(', ')}`
      );
    }

    // Add warnings for type mismatches
    if (comparison.typeMismatches.length > 0) {
      report.warnings.push(
        `Table '${tableName}': Type mismatches: ${comparison.typeMismatches.map(m => `${m.field} (${m.schemaType} vs ${m.dbType})`).join(', ')}`
      );
    }
  }

  // Check for tables in DB that are not in schema
  for (const tableName of dbMetadata.keys()) {
    if (!schemaMetadata.has(tableName)) {
      report.warnings.push(
        `Table '${tableName}' exists in DB but not in schema`
      );
    }
  }

  return report;
}

/**
 * Log schema vs DB validation report
 * 
 * @param report - Validation report
 */
export function logSchemaDBValidationReport(report: SchemaDBValidationReport): void {
  logger.info(
    {
      timestamp: report.timestamp,
      tableCount: Object.keys(report.tables).length,
      violations: report.violations,
      warnings: report.warnings,
    },
    'Schema vs DB Validation Report'
  );

  if (report.violations.length > 0) {
    logger.error(
      { violations: report.violations },
      'Schema vs DB Violations Detected'
    );
  }

  if (report.warnings.length > 0) {
    logger.warn(
      { warnings: report.warnings },
      'Schema vs DB Warnings'
    );
  }
}

/**
 * Assert schema is in sync with DB (BASE + INFRA v1.0)
 * 
 * Runtime assertion that throws if schema and DB are out of sync
 * 
 * ANTI-DRIFT: Se drift detectado → BLOQUEIO
 * SEM correção automática
 * 
 * @param tableName - Table name to check (optional, checks all if not provided)
 */
export async function assertSchemaInSyncWithDB(tableName?: string): Promise<void> {
  if (tableName) {
    const comparison = await compareTableSchemaWithDB(tableName);
    
    if (comparison.missingInSchema.length > 0 || comparison.missingInDB.length > 0) {
      throw new Error(
        `Schema and DB out of sync for table '${tableName}': ` +
        `Missing in schema: ${comparison.missingInSchema.join(', ')}, ` +
        `Missing in DB: ${comparison.missingInDB.join(', ')}`
      );
    }
  } else {
    const report = await generateSchemaDBValidationReport();
    
    if (report.violations.length > 0) {
      throw new Error(
        `Schema and DB out of sync: ${report.violations.join('; ')}`
      );
    }
  }
}
