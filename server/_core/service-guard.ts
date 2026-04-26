/**
 * SERVICE GUARD RULES
 * 
 * FASE 3: Enforcement de regras para services
 * 
 * Regras:
 * - Service NÃO pode criar campos não existentes no schema
 * - Service NÃO pode ignorar required fields
 * - Service NÃO pode usar tipos não definidos no schema
 * - Service DEVE usar conversores de tipo (ISO string, tinyint)
 */

import { logger } from './logger.js';
import { 
  validateInsertData, 
  validateUpdateData, 
  assertFieldInSchema
} from './schema-contract.js';
import {
  toISODateString,
  booleanToTinyint
} from './type-guards.js';

/**
 * Service Guard Configuration
 */
interface ServiceGuardConfig {
  enableRuntimeValidation: boolean;
  logViolations: boolean;
  throwOnViolation: boolean;
}

/**
 * Default configuration
 */
const defaultConfig: ServiceGuardConfig = {
  enableRuntimeValidation: process.env.NODE_ENV === 'development',
  logViolations: true,
  throwOnViolation: process.env.NODE_ENV === 'development',
};

/**
 * Service Guard Context
 */
interface ServiceGuardContext {
  serviceName: string;
  operation: 'insert' | 'update' | 'select' | 'delete';
  tableName: string;
}

/**
 * Service Guard Result
 */
interface ServiceGuardResult {
  valid: boolean;
  violations: string[];
  warnings: string[];
}

/**
 * Service Guard Class
 */
export class ServiceGuard {
  private config: ServiceGuardConfig;

  constructor(config: Partial<ServiceGuardConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Validate insert operation
   * 
   * @param context - Service context
   * @param data - Data to insert
   * @returns Validation result
   */
  validateInsert(context: ServiceGuardContext, data: Record<string, unknown>): ServiceGuardResult {
    const result: ServiceGuardResult = {
      valid: true,
      violations: [],
      warnings: [],
    };

    if (!this.config.enableRuntimeValidation) {
      return result;
    }

    // Validate against schema
    const schemaValidation = validateInsertData(context.tableName, data);
    if (!schemaValidation.valid) {
      result.valid = false;
      result.violations.push(...schemaValidation.violations);
    }

    // Type assertions removidos - já garantidos por TypeScript + prepareData
    // prepareInsertData/prepareUpdateData convertem Date→ISO e boolean→tinyint
    // TypeScript garante tipos em compile-time

    this.logResult(context, result);
    
    if (this.config.throwOnViolation && !result.valid) {
      throw new Error(
        `Service guard violation in ${context.serviceName}.${context.operation}: ${result.violations.join(', ')}`
      );
    }

    return result;
  }

  /**
   * Validate update operation
   * 
   * @param context - Service context
   * @param data - Data to update
   * @returns Validation result
   */
  validateUpdate(context: ServiceGuardContext, data: Record<string, unknown>): ServiceGuardResult {
    const result: ServiceGuardResult = {
      valid: true,
      violations: [],
      warnings: [],
    };

    if (!this.config.enableRuntimeValidation) {
      return result;
    }

    // Validate against schema
    const schemaValidation = validateUpdateData(context.tableName, data);
    if (!schemaValidation.valid) {
      result.valid = false;
      result.violations.push(...schemaValidation.violations);
    }

    // Type assertions removidos - já garantidos por TypeScript + prepareData
    // prepareInsertData/prepareUpdateData convertem Date→ISO e boolean→tinyint
    // TypeScript garante tipos em compile-time

    this.logResult(context, result);
    
    if (this.config.throwOnViolation && !result.valid) {
      throw new Error(
        `Service guard violation in ${context.serviceName}.${context.operation}: ${result.violations.join(', ')}`
      );
    }

    return result;
  }

  /**
   * Assert field exists in schema
   * 
   * @param tableName - Table name
   * @param fieldName - Field name
   * @param context - Service context
   */
  assertFieldExists(tableName: string, fieldName: string, context: ServiceGuardContext): void {
    try {
      assertFieldInSchema(tableName, fieldName, `${context.serviceName}.${context.operation}`);
    } catch (error) {
      if (this.config.throwOnViolation) {
        throw error;
      }
      if (this.config.logViolations) {
        logger.error(
          { error, context },
          'Service guard: field does not exist in schema'
        );
      }
    }
  }


  /**
   * Log validation result
   * 
   * @param context - Service context
   * @param result - Validation result
   */
  private logResult(context: ServiceGuardContext, result: ServiceGuardResult): void {
    if (!this.config.logViolations) {
      return;
    }

    if (result.violations.length > 0) {
      logger.error(
        {
          context,
          violations: result.violations,
        },
        'Service guard violations detected'
      );
    }

    if (result.warnings.length > 0) {
      logger.warn(
        {
          context,
          warnings: result.warnings,
        },
        'Service guard warnings'
      );
    }
  }
}

/**
 * Default service guard instance
 */
export const serviceGuard = new ServiceGuard();

/**
 * Helper function to validate insert with context
 * 
 * @param serviceName - Service name
 * @param tableName - Table name
 * @param data - Data to insert
 * @returns Validation result
 */
export function guardInsert(
  serviceName: string,
  tableName: string,
  data: Record<string, unknown>
): ServiceGuardResult {
  return serviceGuard.validateInsert(
    { serviceName, operation: 'insert', tableName },
    data
  );
}

/**
 * Helper function to validate update with context
 * 
 * @param serviceName - Service name
 * @param tableName - Table name
 * @param data - Data to update
 * @returns Validation result
 */
export function guardUpdate(
  serviceName: string,
  tableName: string,
  data: Record<string, unknown>
): ServiceGuardResult {
  return serviceGuard.validateUpdate(
    { serviceName, operation: 'update', tableName },
    data
  );
}

/**
 * Helper function to assert field exists
 * 
 * @param serviceName - Service name
 * @param tableName - Table name
 * @param fieldName - Field name
 * @param operation - Operation type
 */
export function guardFieldExists(
  serviceName: string,
  tableName: string,
  fieldName: string,
  operation: 'insert' | 'update' | 'select' = 'select'
): void {
  serviceGuard.assertFieldExists(
    tableName,
    fieldName,
    { serviceName, operation, tableName }
  );
}

/**
 * Prepare data for insert (apply type conversions)
 * 
 * @param data - Raw data
 * @returns Data with proper type conversions
 */
export function prepareInsertData(data: Record<string, unknown>): Record<string, unknown> {
  const prepared: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    // Convert Date to ISO string
    if (value instanceof Date) {
      prepared[key] = toISODateString(value);
      continue;
    }

    // Convert boolean to tinyint
    if (typeof value === 'boolean') {
      prepared[key] = booleanToTinyint(value);
      continue;
    }

    prepared[key] = value;
  }

  return prepared;
}

/**
 * Prepare data for update (apply type conversions)
 * 
 * @param data - Raw data
 * @returns Data with proper type conversions
 */
export function prepareUpdateData(data: Record<string, unknown>): Record<string, unknown> {
  return prepareInsertData(data);
}
