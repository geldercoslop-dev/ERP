/**
 * Testes Reais de Consistência do Banco de Dados
 * OBJETIVO: Validar se transações são REALMENTE seguras
 * 
 * ⚠️ ESTES TESTES USAM BANCO REAL - não são em memória
 * ⚠️ Usam transações e validam estado persistente
 */

import { describe, it, expect } from 'vitest';
import { DatabaseConsistencyTester } from './database-consistency-tester.js';

/** Evita "No test suite found" no Vitest; bateria real roda via `tsx server/tests/database-consistency-tester.ts`. */
describe('database-consistency', () => {
  it('documentação: executar suite pesada via `tsx server/tests/database-consistency-tester.ts`', () => {
    expect(DatabaseConsistencyTester).toBeDefined();
  });
});
