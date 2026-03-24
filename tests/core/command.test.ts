/**
 * Testes para Core Command
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { executeCommand } from '../../server/_core/command';

// Mock do banco de dados
let storedResultJson: string | null = null;
vi.mock('../../server/db', () => ({
  getDb: vi.fn().mockResolvedValue({
    transaction: async (fn: any) => fn({}),
  }),
  reserveIdempotencyKey: vi.fn().mockImplementation(async () => {
    if (!storedResultJson) return { reserved: true };
    return { reserved: false, resultJson: storedResultJson, traceId: 'trace_test' };
  }),
  updateIdempotencyResult: vi.fn().mockImplementation(async (_tx: any, _commandName: string, _key: string, resultJson: string) => {
    storedResultJson = resultJson;
  }),
}));

describe('Core Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storedResultJson = null;
  });

  describe('executeCommand', () => {
    it('deve executar comando com sucesso', async () => {
      const result = await executeCommand(
        { commandName: 'test', idempotencyKey: 'test-key' },
        async () => ({ ok: true, data: 'success' })
      );

      expect(result).toBeDefined();
      expect((result as any).ok).toBe(true);
      expect((result as any).data).toBe('success');
    });

    it('deve lidar com erros na execução', async () => {
      const error = new Error('Test error');
      
      await expect(
        executeCommand(
          { commandName: 'test', idempotencyKey: 'test-key' },
          async () => {
            throw error;
          }
        )
      ).rejects.toThrow('Test error');
    });

    it('deve respeitar idempotência', async () => {
      const key = `test-idem-${Date.now()}`;
      
      const result1 = await executeCommand(
        { commandName: 'test', idempotencyKey: key },
        async () => ({ ok: true, data: 'first', timestamp: Date.now() })
      );

      const result2 = await executeCommand(
        { commandName: 'test', idempotencyKey: key },
        async () => ({ ok: true, data: 'second', timestamp: Date.now() })
      );

      // Ambos devem ter o mesmo resultado (cache)
      expect((result1 as any).data).toBe((result2 as any).data);
    });
  });
});
