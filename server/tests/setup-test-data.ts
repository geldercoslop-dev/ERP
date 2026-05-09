/**
 * Setup de Dados para Testes de Consistência
 * 
 * Wrapper fino que chama service oficial para DB operations
 * Usado antes de rodar database-consistency.test.ts
 */

import { setupConsistencyTestData, cleanupConsistencyTestData, type ConsistencyTestDataSetup } from '../services/system-test.service.js';

export type TestDataSetup = ConsistencyTestDataSetup;

export async function setupTestData(tenantId: number): Promise<TestDataSetup> {
  return setupConsistencyTestData(tenantId);
}

export async function cleanupTestData(tenantId: number, setup: TestDataSetup): Promise<void> {
  return cleanupConsistencyTestData(tenantId, setup);
}
