import { describe, it, expect, beforeEach, vi } from "vitest";
import * as financeService from "../../server/services/finance.service";
import { ADMIN_ACTOR } from "../../server/_core/service-actor";
import { getDb } from "../../server/db/index";

vi.mock("../../server/db/index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/db/index")>();
  return {
    ...actual,
    getDb: vi.fn(),
    insertAuditLog: vi.fn().mockResolvedValue(undefined),
  };
});

describe("FinanceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createContaPagar", () => {
    it("deve criar uma conta a pagar com sucesso", async () => {
      const mockDb = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([{ insertId: 42 }]),
        }),
      };
      vi.mocked(getDb).mockResolvedValue(mockDb as never);

      const contaData = {
        fornecedor: "Fornecedor Teste",
        descricao: "Teste",
        valor: 1000.0,
        dataVencimento: new Date("2024-12-31"),
        status: "PENDENTE" as const,
      };

      const result = await financeService.createContaPagar(1, contaData);

      expect(result).toEqual({ id: 42 });
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("deve lançar erro quando tenantId não é fornecido", async () => {
      const contaData = {
        fornecedor: "F",
        descricao: "D",
        valor: 1000.0,
        dataVencimento: new Date(),
        status: "PENDENTE" as const,
      };

      await expect(financeService.createContaPagar(0, contaData)).rejects.toThrow(/tenantId obrigatório/);
    });
  });

  describe("pagarConta", () => {
    it("deve marcar conta como paga quando encontrada", async () => {
      const row = [
        {
          id: 1,
          tenantId: 1,
          status: "PENDENTE",
        },
      ];
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValueOnce(row).mockResolvedValueOnce([
          { ...row[0], status: "PAGO" },
        ]),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
      };
      vi.mocked(getDb).mockResolvedValue(mockDb as never);

      const result = await financeService.pagarConta(1, 1, 100);
      expect(result).toEqual({ success: true });
    });

    it("deve lançar quando conta não existe", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(getDb).mockResolvedValue(mockDb as never);

      await expect(financeService.pagarConta(1, 999, 50)).rejects.toThrow("Conta a pagar não encontrada");
    });
  });

  describe("listContasPagar", () => {
    it("deve retornar lista vazia quando tenantId inválido", async () => {
      const r = await financeService.listContasPagar(0, ADMIN_ACTOR);
      expect(r.items).toEqual([]);
      expect(r.total).toBe(0);
    });
  });
});
