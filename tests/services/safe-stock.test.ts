/**
 * Testes para Safe Stock Service — mocks: transaction + tx.execute (lockProduct) + update chain.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { safeStockService } from "../../server/services/safe-stock";

vi.mock("../../server/utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock("../../server/db/index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/db/index")>();

  const produtoRow = { id: 1, nome: "Produto Teste", estoque: 100 };
  const tx = {
    execute: vi.fn().mockResolvedValue([[produtoRow], []]),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ estoque: 100 }]),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
      }),
    }),
  };

  const selectChain: Record<string, unknown> = {};
  selectChain.from = vi.fn().mockReturnValue(selectChain);
  selectChain.where = vi.fn().mockReturnValue(selectChain);
  selectChain.limit = vi.fn().mockResolvedValue([{ id: 1, estoque: 100 }]);

  const db = {
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    select: vi.fn().mockReturnValue(selectChain),
  };

  return { ...actual, getDb: vi.fn().mockResolvedValue(db) };
});

describe("SafeStockService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("processStockOperation", () => {
    it("deve processar saída com sucesso", async () => {
      const result = await safeStockService.processStockOperation({
        produtoId: 1,
        quantidade: 10,
        tipo: "saida",
        motivo: "test",
        traceId: "test-trace",
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.produtoId).toBe(1);
    });

    it("deve falhar se estoque insuficiente", async () => {
      const result = await safeStockService.processStockOperation({
        produtoId: 1,
        quantidade: 200,
        tipo: "saida",
        motivo: "test",
        traceId: "test-trace",
      });

      expect(result.success).toBe(false);
      expect(result.message.toLowerCase()).toContain("estoque");
    });
  });

  describe("checkStock", () => {
    it("deve retornar estoque atual", async () => {
      const stock = await safeStockService.checkStock(1);

      expect(stock).toBeDefined();
      expect(stock?.produtoId).toBe(1);
      expect(stock?.saldo).toBe(100);
    });
  });
});
