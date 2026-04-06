/**
 * Core Health Service
 * Validações de saúde do boot e sistema
 */
import { validateBootDatabaseConnection } from './boot-validation.service.js';

/**
 * Valida conexão com banco de dados durante boot
 * Retorna diagnósticos e warnings
 */
export async function validateBootHealth() {
  const diagnostics = await validateBootDatabaseConnection();
  return {
    success: !diagnostics.warnings.some(w => w.includes('failed')),
    warnings: diagnostics.warnings,
    missingTables: diagnostics.missingTables,
  };
}

/**
 * Obtém status de saúde do sistema completo
 */
export function getHealthStatus() {
  return {
    timestamp: Date.now(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
  };
}
