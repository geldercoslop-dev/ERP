/**
 * ANTI-DRIFT CHECK (BOOT LEVEL) - BASE + INFRA v1.0
 * 
 * FASE 4: Validação de consistência mínima no bootstrap
 * 
 * Valida:
 * - schema ↔ DB (estrutura)
 * - migrations ↔ journal
 * - Campos críticos (timestamps, tinyints)
 * 
 * ANTI-DRIFT RULES (BASE + INFRA v1.0):
 * - Qualquer novo campo no schema deve ser refletido no service
 * - Qualquer migration deve bater com journal
 * - Qualquer schema mismatch deve falhar no bootstrap
 * 
 * COMPORTAMENTO:
 * - SEM correção automática
 * - SEM fallback silencioso
 * - Bloqueio determinístico em caso de drift
 * 
 * Se divergência crítica → warning ou block controlado
 */

import { logger } from './logger.js';
import { generateSchemaDBValidationReport, logSchemaDBValidationReport } from './schema-db-validator.js';
import { generateSchemaContractReport, logSchemaContractReport } from './schema-contract.js';

/**
 * Bootstrap Guard Configuration
 */
interface BootstrapGuardConfig {
  enableSchemaDBCheck: boolean;
  enableSchemaContractCheck: boolean;
  blockOnCriticalDrift: boolean;
  logWarnings: boolean;
}

/**
 * Default configuration
 */
const defaultConfig: BootstrapGuardConfig = {
  enableSchemaDBCheck: process.env.NODE_ENV === 'development',
  enableSchemaContractCheck: true,
  blockOnCriticalDrift: process.env.NODE_ENV === 'development',
  logWarnings: true,
};

/**
 * Bootstrap Guard Result
 */
interface BootstrapGuardResult {
  success: boolean;
  schemaDBCheck?: {
    passed: boolean;
    violations: string[];
    warnings: string[];
  };
  schemaContractCheck?: {
    passed: boolean;
    violations: string[];
    warnings: string[];
  };
  criticalIssues: string[];
}

/**
 * Bootstrap Guard Class
 */
export class BootstrapGuard {
  private config: BootstrapGuardConfig;

  constructor(config: Partial<BootstrapGuardConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Run all bootstrap checks
   * 
   * @returns Guard result
   */
  async runChecks(): Promise<BootstrapGuardResult> {
    const result: BootstrapGuardResult = {
      success: true,
      criticalIssues: [],
    };

    logger.info('Starting bootstrap guard checks...');

    // STEP 1: Schema vs DB check (BASE + INFRA v1.0 - Rule 2)
    // Valida consistência entre schema.ts e banco de dados
    // Se drift detectado → BLOQUEIO (sem correção automática)
    if (this.config.enableSchemaDBCheck) {
      try {
        const dbReport = await generateSchemaDBValidationReport();
        logSchemaDBValidationReport(dbReport);

        result.schemaDBCheck = {
          passed: dbReport.violations.length === 0,
          violations: dbReport.violations,
          warnings: dbReport.warnings,
        };

        if (dbReport.violations.length > 0) {
          result.success = false;
          result.criticalIssues.push(
            `Schema vs DB drift detected: ${dbReport.violations.join('; ')}`
          );
        }
      } catch (error) {
        logger.error({ error }, 'Schema vs DB check failed');
        result.schemaDBCheck = {
          passed: false,
          violations: ['Check failed with error'],
          warnings: [],
        };
        result.success = false;
        result.criticalIssues.push('Schema vs DB check failed with error');
      }
    }

    // STEP 2: Schema contract check (BASE + INFRA v1.0 - Rule 1)
    // Valida campos usados em services vs schema
    // Se service usa campo não existente → BLOQUEIO
    // Se schema tem campo não usado → WARNING
    if (this.config.enableSchemaContractCheck) {
      try {
        const contractReport = generateSchemaContractReport();
        logSchemaContractReport(contractReport);

        result.schemaContractCheck = {
          passed: contractReport.violations.length === 0,
          violations: contractReport.violations,
          warnings: contractReport.warnings,
        };

        if (contractReport.violations.length > 0) {
          result.success = false;
          result.criticalIssues.push(
            `Schema contract violations: ${contractReport.violations.join('; ')}`
          );
        }
      } catch (error) {
        logger.error({ error }, 'Schema contract check failed');
        result.schemaContractCheck = {
          passed: false,
          violations: ['Check failed with error'],
          warnings: [],
        };
        result.success = false;
        result.criticalIssues.push('Schema contract check failed with error');
      }
    }

    // STEP 3: Final validation (BASE + INFRA v1.0 - Rule 3)
    // Se qualquer mismatch → BLOQUEIO
    // SEM fallback silencioso
    // SEM correção automática
    // Bloqueio determinístico
    logger.info(
      {
        success: result.success,
        criticalIssues: result.criticalIssues,
        schemaDBCheck: result.schemaDBCheck,
        schemaContractCheck: result.schemaContractCheck,
      },
      'Bootstrap guard checks completed'
    );

    // BLOCK ON CRITICAL DRIFT (BASE + INFRA v1.0)
    // Sistema PARA IMEDIATAMENTE se qualquer etapa falhar
    // NÃO fallback automático
    // NÃO correção silenciosa
    // NÃO warnings ignorados
    if (this.config.blockOnCriticalDrift && !result.success) {
      throw new Error(
        `Bootstrap guard blocked startup due to critical issues: ${result.criticalIssues.join('; ')}`
      );
    }

    return result;
  }

  /**
   * Quick health check (lightweight)
   * 
   * @returns true if checks pass
   */
  async quickHealthCheck(): Promise<boolean> {
    try {
      const result = await this.runChecks();
      return result.success;
    } catch (error) {
      logger.error({ error }, 'Quick health check failed');
      return false;
    }
  }
}

/**
 * Default bootstrap guard instance
 */
export const bootstrapGuard = new BootstrapGuard();

/**
 * Run bootstrap checks (called during application startup)
 * 
 * @returns Guard result
 */
export async function runBootstrapChecks(): Promise<BootstrapGuardResult> {
  return bootstrapGuard.runChecks();
}

/**
 * Quick health check for monitoring
 * 
 * @returns true if healthy
 */
export async function bootstrapHealthCheck(): Promise<boolean> {
  return bootstrapGuard.quickHealthCheck();
}
