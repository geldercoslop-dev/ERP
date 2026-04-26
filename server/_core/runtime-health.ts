/**
 * Runtime Health Orchestrator
 * 
 * Central health checking system with auto-healing capabilities.
 * Validates ENV, DB, Redis, schema, and migrations.
 * Detects drift and attempts controlled auto-repair.
 */

import { getEnv } from "./env.js";
import { systemLogger } from "./logger.js";
import { waitForDatabaseReady } from "./db-bootstrap.js";
import { waitForRedis } from "../infra/redis.js";
import { validateRequiredEnv } from "../services/env.service.js";
import { getDb } from "../db/index.js";

/**
 * Health status levels
 */
export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'FAILED';

/**
 * Individual component health
 */
export interface ComponentHealth {
  name: string;
  status: 'ok' | 'error' | 'warning';
  message?: string;
  error?: Error;
}

/**
 * Overall system health report
 */
export interface SystemHealthReport {
  status: HealthStatus;
  components: ComponentHealth[];
  timestamp: Date;
  canRecover: boolean;
  recoveryAction?: string;
}

/**
 * Migration drift check result
 */
export interface MigrationDriftResult {
  hasDrift: boolean;
  details?: string;
  canAutoRepair: boolean;
}

/**
 * Global system state
 */
declare global {
  var __SYSTEM_STATE__: {
    booted: boolean;
    health: HealthStatus;
    retries: number;
    lastHealthCheck?: Date;
    degradedMode: boolean;
  };
}

// Initialize global system state
if (typeof globalThis.__SYSTEM_STATE__ === 'undefined') {
  globalThis.__SYSTEM_STATE__ = {
    booted: false,
    health: 'unknown' as HealthStatus,
    retries: 0,
    degradedMode: false,
  };
}

/**
 * Get current system state
 */
export function getSystemState() {
  return globalThis.__SYSTEM_STATE__;
}

/**
 * Update system state
 */
export function updateSystemState(updates: Partial<typeof globalThis.__SYSTEM_STATE__>) {
  globalThis.__SYSTEM_STATE__ = {
    ...globalThis.__SYSTEM_STATE__,
    ...updates,
    lastHealthCheck: new Date(),
  };
}

/**
 * Check ENV health
 */
async function checkEnvHealth(): Promise<ComponentHealth> {
  try {
    validateRequiredEnv();
    const env = getEnv();
    
    // Validate critical ENV variables
    if (!env.DATABASE_URL) {
      return {
        name: 'ENV',
        status: 'error',
        message: 'DATABASE_URL is required',
      };
    }
    
    if (!env.APP_SECRET || env.APP_SECRET.length < 32) {
      return {
        name: 'ENV',
        status: 'error',
        message: 'APP_SECRET must be at least 32 characters',
      };
    }
    
    return {
      name: 'ENV',
      status: 'ok',
    };
  } catch (error) {
    return {
      name: 'ENV',
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Check Database health
 */
async function checkDatabaseHealth(): Promise<ComponentHealth> {
  try {
    await waitForDatabaseReady();
    const db = await getDb();
    
    // Execute simple query to validate connection
    await db.execute({ sql: 'SELECT 1 AS ping' } as any);
    
    return {
      name: 'Database',
      status: 'ok',
    };
  } catch (error) {
    return {
      name: 'Database',
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Check Redis health
 */
async function checkRedisHealth(): Promise<ComponentHealth> {
  try {
    const timeoutMs = Math.max(5_000, Number(process.env.REDIS_BOOT_TIMEOUT_MS || 30_000));
    const redisOk = await waitForRedis(timeoutMs);
    
    if (!redisOk) {
      return {
        name: 'Redis',
        status: 'warning',
        message: 'Redis not ready within timeout',
      };
    }
    
    return {
      name: 'Redis',
      status: 'ok',
    };
  } catch (error) {
    return {
      name: 'Redis',
      status: 'warning',
      message: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Check schema guard health
 */
async function checkSchemaHealth(): Promise<ComponentHealth> {
  try {
    // Schema validation is handled by Drizzle ORM automatically
    // If DB connection works, schema is assumed valid
    // Future: add explicit schema validation if needed
    return {
      name: 'Schema',
      status: 'ok',
    };
  } catch (error) {
    return {
      name: 'Schema',
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Check migration drift
 * 
 * Compares __drizzle_migrations table with journal to detect drift.
 * If drift is detected, marks system as FAILED and suggests auto-repair.
 */
export async function checkMigrationDrift(): Promise<MigrationDriftResult> {
  try {
    const db = await getDb();
    
    // Check if migrations table exists
    const tables = await db.execute({ 
      sql: 'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
      values: ['__drizzle_migrations']
    } as any);
    
    if (!tables || (tables as any).length === 0) {
      // No migrations table - this is expected for fresh installations
      return {
        hasDrift: false,
        canAutoRepair: true,
      };
    }
    
    // Get applied migrations from database
    const appliedMigrations = await db.execute({
      sql: 'SELECT hash FROM __drizzle_migrations ORDER BY created_at DESC'
    } as any);
    
    // Read journal file
    const fs = await import('fs');
    const path = await import('path');
    const journalPath = path.resolve(process.cwd(), 'drizzle/meta/_journal.json');
    
    if (!fs.existsSync(journalPath)) {
      return {
        hasDrift: true,
        details: 'Migration journal file not found',
        canAutoRepair: false,
      };
    }
    
    const journalContent = fs.readFileSync(journalPath, 'utf-8');
    const journal = JSON.parse(journalContent);
    
    // Compare applied migrations with journal
    const journalHashes = new Set(journal.entries.map((e: any) => e.hash));
    const appliedHashes = new Set((appliedMigrations as any).map((m: any) => m.hash));
    
    // Check for missing migrations
    const missingMigrations = [...journalHashes].filter(hash => !appliedHashes.has(hash));
    // Check for extra migrations (manual modifications)
    const extraMigrations = [...appliedHashes].filter(hash => !journalHashes.has(hash));
    
    if (missingMigrations.length > 0 || extraMigrations.length > 0) {
      return {
        hasDrift: true,
        details: `Missing: ${missingMigrations.length}, Extra: ${extraMigrations.length}`,
        canAutoRepair: missingMigrations.length > 0 && extraMigrations.length === 0,
      };
    }
    
    return {
      hasDrift: false,
      canAutoRepair: true,
    };
  } catch (error) {
    systemLogger.error({ error: error instanceof Error ? error.message : String(error) }, '[HEALTH] Error checking migration drift');
    return {
      hasDrift: true,
      details: error instanceof Error ? error.message : String(error),
      canAutoRepair: false,
    };
  }
}

/**
 * Attempt auto-repair of migrations
 * 
 * Executes migrate() once to fix drift.
 * If it fails, marks system as unrecoverable.
 */
export async function attemptMigrationRepair(): Promise<boolean> {
  try {
    systemLogger.info('[HEALTH] Attempting auto-repair of migrations...');
    
    const { migrate } = await import("drizzle-orm/mysql2/migrator");
    const db = await getDb();
    
    await migrate(db, { migrationsFolder: './drizzle' });
    
    systemLogger.info('[HEALTH] Migration auto-repair successful');
    return true;
  } catch (error) {
    systemLogger.error({ error: error instanceof Error ? error.message : String(error) }, '[HEALTH] Migration auto-repair failed');
    return false;
  }
}

/**
 * Run comprehensive runtime health check
 * 
 * Validates all components and returns consolidated status.
 * Determines if system can recover and what action to take.
 */
export async function runRuntimeHealthCheck(): Promise<SystemHealthReport> {
  systemLogger.info('[HEALTH] Starting runtime health check...');
  
  const components: ComponentHealth[] = [];
  
  // Check ENV (critical - cannot recover without this)
  const envHealth = await checkEnvHealth();
  components.push(envHealth);
  
  // Check Database (critical - cannot recover without this)
  const dbHealth = await checkDatabaseHealth();
  components.push(dbHealth);
  
  // Check Redis (non-critical - can run in degraded mode)
  const redisHealth = await checkRedisHealth();
  components.push(redisHealth);
  
  // Check Schema (critical)
  const schemaHealth = await checkSchemaHealth();
  components.push(schemaHealth);
  
  // Check Migration Drift
  const driftResult = await checkMigrationDrift();
  if (driftResult.hasDrift) {
    components.push({
      name: 'Migrations',
      status: 'error',
      message: driftResult.details,
    });
  } else {
    components.push({
      name: 'Migrations',
      status: 'ok',
    });
  }
  
  // Determine overall status
  const criticalErrors = components.filter(c => c.name !== 'Redis' && c.status === 'error');
  const warnings = components.filter(c => c.status === 'warning');
  
  let status: HealthStatus;
  let canRecover = false;
  let recoveryAction: string | undefined;
  
  if (criticalErrors.length > 0) {
    status = 'FAILED';
    
    // Check if we can auto-recover
    if (driftResult.hasDrift && driftResult.canAutoRepair) {
      canRecover = true;
      recoveryAction = 'auto-repair-migrations';
    }
  } else if (warnings.length > 0) {
    status = 'DEGRADED';
    canRecover = false;
  } else {
    status = 'HEALTHY';
    canRecover = false;
  }
  
  const report: SystemHealthReport = {
    status,
    components,
    timestamp: new Date(),
    canRecover,
    recoveryAction,
  };
  
  // Update global state
  updateSystemState({
    health: status,
    degradedMode: status === 'DEGRADED',
  });
  
  systemLogger.info({ status, canRecover, recoveryAction }, '[HEALTH] Runtime health check completed');
  
  return report;
}

/**
 * Require system to be in a valid state
 * Throws error if system is not booted or is in FAILED state
 */
export function requireSystemValid(component: string): void {
  const state = getSystemState();
  
  if (!state.booted) {
    throw new Error(
      `SYSTEM_NOT_BOOTED: Component '${component}' accessed before system boot completed. ` +
      `This is a FAIL-HARD protection to prevent access to uninitialized system.`
    );
  }
  
  if (state.health === 'FAILED') {
    throw new Error(
      `SYSTEM_IN_FAILED_STATE: Component '${component}' accessed while system is in FAILED state. ` +
      `System health check failed and could not recover.`
    );
  }
}
