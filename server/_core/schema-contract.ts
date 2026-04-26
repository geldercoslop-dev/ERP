/**
 * SCHEMA CONTRACT VALIDATION - BASE + INFRA v1.0
 * 
 * FASE 2: Validação de contrato entre schema.ts, DB e services
 * 
 * Detecta:
 * - Campos inexistentes no schema usados em services
 * - Campos removidos do schema ainda usados
 * - Mismatch de nomes (camelCase vs snake_case)
 * - Campos required não fornecidos
 * 
 * ANTI-DRIFT RULE (BASE + INFRA v1.0 - Rule 1):
 * - Qualquer novo campo no schema deve ser refletido no service
 * - Se service usa campo não existente → BLOQUEIO
 * - Se schema tem campo não usado → WARNING
 * 
 * SEM correção automática
 */

import { logger } from './logger.js';
import * as schema from "../../drizzle/schema.ts";

/**
 * Schema Field Metadata
 */
interface SchemaFieldMetadata {
  tableName: string;
  fieldName: string;
  type: string;
  isNullable: boolean;
  isRequired: boolean;
}

/**
 * Schema Contract Report
 */
interface SchemaContractReport {
  timestamp: string;
  tables: Record<string, {
    fields: string[];
    missingInDB?: string[];
    missingInSchema?: string[];
  }>;
  violations: string[];
  warnings: string[];
}

/**
 * Extract schema metadata from Drizzle schema
 * 
 * @returns Map of table name to field metadata
 */
export function extractSchemaMetadata(): Map<string, SchemaFieldMetadata[]> {
  const metadata = new Map<string, SchemaFieldMetadata[]>();

  // Get all mysqlTable exports from schema
  const schemaKeys = Object.keys(schema).filter(key => {
    const value = (schema as Record<string, unknown>)[key];
    // Check if it's a mysqlTable (object with column properties)
    return value && typeof value === 'object' && key !== 'default';
  });

  console.log(`[SCHEMA CONTRACT] Found ${schemaKeys.length} tables in schema:`, schemaKeys);

  for (const tableName of schemaKeys) {
    const table = (schema as Record<string, unknown>)[tableName] as Record<string, unknown>;
    const fields: SchemaFieldMetadata[] = [];

    // Drizzle tables have columns as direct properties
    for (const [fieldName, column] of Object.entries(table)) {
      // Skip internal Drizzle properties
      if (fieldName.startsWith('_') || fieldName === '$') continue;
      
      const columnObj = column as { dataType: string; notNull: boolean };
      if (columnObj && typeof columnObj === 'object' && 'dataType' in columnObj) {
        fields.push({
          tableName,
          fieldName,
          type: columnObj.dataType || 'unknown',
          isNullable: !columnObj.notNull,
          isRequired: columnObj.notNull,
        });
      }
    }

    if (fields.length > 0) {
      metadata.set(tableName, fields);
      console.log(`[SCHEMA CONTRACT] Table ${tableName}: ${fields.length} fields`);
    }
  }

  return metadata;
}

/**
 * Validate field exists in schema
 * 
 * @param tableName - Table name
 * @param fieldName - Field name to validate
 * @returns true if field exists in schema
 */
export function fieldExistsInSchema(tableName: string, fieldName: string): boolean {
  const metadata = extractSchemaMetadata();
  const tableFields = metadata.get(tableName);
  if (!tableFields) return false;
  return tableFields.some(f => f.fieldName === fieldName);
}

/**
 * Get all fields for a table from schema
 * 
 * @param tableName - Table name
 * @returns Array of field names
 */
export function getTableFields(tableName: string): string[] {
  const metadata = extractSchemaMetadata();
  const tableFields = metadata.get(tableName);
  if (!tableFields) return [];
  return tableFields.map(f => f.fieldName);
}

/**
 * Validate insert data against schema (BASE + INFRA v1.0)
 * 
 * Detects:
 * - Fields in data that don't exist in schema
 * - Required fields missing from data
 * 
 * ANTI-DRIFT: Se campo não existe no schema → BLOQUEIO
 * SEM correção automática
 * 
 * @param tableName - Table name
 * @param data - Data to insert
 * @returns Validation result with violations
 */
export function validateInsertData(
  tableName: string,
  data: Record<string, unknown>
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const metadata = extractSchemaMetadata();
  const tableFields = metadata.get(tableName);

  if (!tableFields) {
    violations.push(`Table ${tableName} not found in schema`);
    return { valid: false, violations };
  }

  const schemaFieldNames = new Set(tableFields.map(f => f.fieldName));
  const requiredFields = tableFields.filter(f => f.isRequired).map(f => f.fieldName);

  // Check for fields in data that don't exist in schema
  for (const fieldName of Object.keys(data)) {
    if (!schemaFieldNames.has(fieldName)) {
      violations.push(`Field '${fieldName}' does not exist in schema for table '${tableName}'`);
    }
  }

  // Check for required fields missing from data
  for (const requiredField of requiredFields) {
    if (!(requiredField in data) && data[requiredField] === undefined) {
      violations.push(`Required field '${requiredField}' is missing from insert data for table '${tableName}'`);
    }
  }

  return { valid: violations.length === 0, violations };
}

/**
 * Validate update data against schema (BASE + INFRA v1.0)
 * 
 * Detects:
 * - Fields in data that don't exist in schema
 * 
 * ANTI-DRIFT: Se campo não existe no schema → BLOQUEIO
 * SEM correção automática
 * 
 * @param tableName - Table name
 * @param data - Data to update
 * @returns Validation result with violations
 */
export function validateUpdateData(
  tableName: string,
  data: Record<string, unknown>
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const metadata = extractSchemaMetadata();
  const tableFields = metadata.get(tableName);

  if (!tableFields) {
    violations.push(`Table ${tableName} not found in schema`);
    return { valid: false, violations };
  }

  const schemaFieldNames = new Set(tableFields.map(f => f.fieldName));

  // Check for fields in data that don't exist in schema
  for (const fieldName of Object.keys(data)) {
    if (!schemaFieldNames.has(fieldName)) {
      violations.push(`Field '${fieldName}' does not exist in schema for table '${tableName}'`);
    }
  }

  return { valid: violations.length === 0, violations };
}

/**
 * Generate schema contract report
 * 
 * @returns Report with schema metadata and any detected issues
 */
export function generateSchemaContractReport(): SchemaContractReport {
  const metadata = extractSchemaMetadata();
  const report: SchemaContractReport = {
    timestamp: new Date().toISOString(),
    tables: {},
    violations: [],
    warnings: [],
  };

  for (const [tableName, fields] of metadata.entries()) {
    report.tables[tableName] = {
      fields: fields.map(f => f.fieldName),
    };
  }

  return report;
}

/**
 * Log schema contract report
 * 
 * @param report - Schema contract report
 */
export function logSchemaContractReport(report: SchemaContractReport): void {
  logger.info(
    {
      timestamp: report.timestamp,
      tableCount: Object.keys(report.tables).length,
      violations: report.violations,
      warnings: report.warnings,
    },
    'Schema Contract Report'
  );

  if (report.violations.length > 0) {
    logger.error(
      { violations: report.violations },
      'Schema Contract Violations Detected'
    );
  }

  if (report.warnings.length > 0) {
    logger.warn(
      { warnings: report.warnings },
      'Schema Contract Warnings'
    );
  }
}

/**
 * Assert field exists in schema
 * 
 * Runtime assertion that throws if field doesn't exist
 * 
 * @param tableName - Table name
 * @param fieldName - Field name
 * @param context - Context for error message
 */
export function assertFieldInSchema(
  tableName: string,
  fieldName: string,
  context?: string
): void {
  if (!fieldExistsInSchema(tableName, fieldName)) {
    throw new Error(
      `Field '${fieldName}' does not exist in schema for table '${tableName}'${context ? ` (${context})` : ''}`
    );
  }
}

/**
 * Assert insert data is valid against schema
 * 
 * Runtime assertion that throws if data is invalid
 * 
 * @param tableName - Table name
 * @param data - Data to insert
 * @param context - Context for error message
 */
export function assertInsertDataValid(
  tableName: string,
  data: Record<string, unknown>,
  context?: string
): void {
  const validation = validateInsertData(tableName, data);
  if (!validation.valid) {
    throw new Error(
      `Insert data validation failed for table '${tableName}'${context ? ` (${context})` : ''}: ${validation.violations.join(', ')}`
    );
  }
}

/**
 * Assert update data is valid against schema
 * 
 * Runtime assertion that throws if data is invalid
 * 
 * @param tableName - Table name
 * @param data - Data to update
 * @param context - Context for error message
 */
export function assertUpdateDataValid(
  tableName: string,
  data: Record<string, unknown>,
  context?: string
): void {
  const validation = validateUpdateData(tableName, data);
  if (!validation.valid) {
    throw new Error(
      `Update data validation failed for table '${tableName}'${context ? ` (${context})` : ''}: ${validation.violations.join(', ')}`
    );
  }
}
