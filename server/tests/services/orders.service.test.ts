import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createPedidoSafe,
  updatePedido,
  getPedidoById,
  updatePedidoStatus,
  cancelarPedidoSafe,
} from "../../services/orders.service";
import { ADMIN_ACTOR } from "../../_core/service-actor";

// Mock local para evitar import direto de DB
const mockGetDb = vi.fn();

vi.mock("../../db/index", () => ({
  getDb: mockGetDb,
  insertAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../_core/audit-log", () => ({
  auditLog: vi.fn(),
}));

describe("OrdersService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createPedidoSafe", () => {
    it("deve lançar erro quando tenantId não é fornecido", async () => {
      const pedidoData = {
        vendedorId: 1,
        clienteId: 1,
        subtotal: "10",
        desconto: "0",
        frete: "0",
        total: "10",
        itens: [
          {
            tipo: "CATALOGO",
            produtoId: 1,
            descricao: "P",
            quantidade: 1,
            valorUnitario: 10,
            custo: 5,
          },
        ],
      };

      await expect(createPedidoSafe(0, pedidoData as never)).rejects.toThrow(/tenantId obrigatório/);
    });
  });

  describe("updatePedido", () => {
    it("deve atualizar um pedido com sucesso", async () => {
      const pedidoRow = {
        id: 1,
        tenantId: 1,
        clienteId: 1,
        clienteNome: "Antigo",
        total: "100",
        status: "GERADO",
      };
      const clienteRow = { id: 1, tenantId: 1, userId: 1 };
      let limitRound = 0;
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => {
          limitRound += 1;
          // assert: pedido → cliente → getPedido (update) → getPedido (pós-update)
          if (limitRound === 2) return Promise.resolve([clienteRow]);
          return Promise.resolve([pedidoRow]);
        }),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
      };
      mockGetDb.mockResolvedValue(mockDb as never);

      const result = await updatePedido(1, ADMIN_ACTOR, 1, { clienteNome: "Cliente Atualizado" });

      expect(result).toEqual({ success: true });
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe("getPedidoById", () => {
    it("deve retornar pedido quando encontrado", async () => {
      const mockPedido = {
        id: 1,
        clienteNome: "Cliente Teste",
        total: "100.50",
        status: "GERADO",
        tenantId: 1,
        createdAt: new Date(),
      };

      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockPedido]),
      };
      mockGetDb.mockResolvedValue(mockDb as never);

      const result = await getPedidoById(1, 1);

      expect(result).toMatchObject({
        id: 1,
        clienteNome: "Cliente Teste",
      });
    });

    it("deve retornar null quando pedido não encontrado", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockGetDb.mockResolvedValue(mockDb as never);

      const result = await getPedidoById(1, 999);

      expect(result).toBeNull();
    });
  });

  describe("updatePedidoStatus", () => {
    it("deve atualizar status do pedido com sucesso", async () => {
      const pedidoRow = {
        id: 1,
        tenantId: 1,
        status: "GERADO",
      };
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([pedidoRow]),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
      };
      mockGetDb.mockResolvedValue(mockDb as never);

      await updatePedidoStatus(1, 1, "CONFERIDO");

      expect(mockDb.update).toHaveBeenCalled();
    });

    it("deve lançar erro quando status está vazio", async () => {
      await expect(updatePedidoStatus(1, 1, "")).rejects.toThrow("status obrigatório");
    });
  });

  describe("cancelPedido", () => {
    it("deve lançar erro quando pedido não existe", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockGetDb.mockResolvedValue(mockDb as never);

      await expect(cancelarPedidoSafe(1, 999, ADMIN_ACTOR)).rejects.toThrow(/Pedido não encontrado|NOT_FOUND/);
    });
  });
});
