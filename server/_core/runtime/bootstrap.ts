/**
 * Central Runtime Bootstrap
 * 
 * RESPONSIBILITIES:
 * - Validate ENV configuration
 * - Prepare runtime environment
 * - NO automatic service connections
 * - NO import-time side effects
 * 
 * PRINCIPLE: Infrastructure connects ON DEMAND, not at import time
 */

import { getEnv } from '../env.js';
import { InfrastructureError } from '../errors/typed-errors.js';

let bootstrapValidated = false;

/**
 * Validates ENV configuration without connecting to any services
 * This is called by requireBootstrap() guards throughout the codebase
 */
export function validateBootstrap(): void {
  if (bootstrapValidated) {
    return;
  }

  const env = getEnv();

  // Validate critical ENV variables exist (but don't connect)
  // We only validate presence, not connectivity
  if (!env.DATABASE_URL) {
    throw new InfrastructureError('DATABASE_URL is required but not set');
  }

  // Redis is optional for system startup - will be validated on first use
  // We don't throw here if Redis ENV is missing

  bootstrapValidated = true;
}

/**
 * Checks if bootstrap has been validated
 */
export function isBootstrapValidated(): boolean {
  return bootstrapValidated;
}

/**
 * Resets bootstrap state (for testing only)
 */
export function resetBootstrap(): void {
  bootstrapValidated = false;
}
