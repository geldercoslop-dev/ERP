import { describe, it, expect, beforeEach, vi } from "vitest";
import * as clientesService from "../../server/services/clientes.service";
import { ADMIN_ACTOR } from "../../server/_core/service-actor";
import { getDb } from "../../server/db/core";

vi.mock("../../server/db/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/db/core")>();
  return {
    ...actual,
    getDb: vi.fn(),
    insertAuditLog: vi.fn().mockResolvedValue(undefined),
  };
});

describe("ClientesService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createCliente", () => {
    it("deve criar um cliente com sucesso", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([{ insertId: 99 }]),
        }),
      };
      vi.mocked(getDb).mockResolvedValue(mockDb as never);

      const clienteData = {
        nome: "João Silva",
        telefone: "11999999999",
        rua: "Rua Teste",
        numero: "123",
        bairro: "Centro",
        cidade: "São Paulo",
        uf: "SP",
      };

      const result = await clientesService.createCliente(1, clienteData);

      expect(result).toEqual({ id: 99 });
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("deve lançar erro quando tenantId não é fornecido", async () => {
      await expect(
        clientesService.createCliente(0, {
          nome: "X",
          telefone: "11999999999",
        })
      ).rejects.toThrow(/tenantId obrigatório/);
    });
  });

  describe("getClienteById", () => {
    it("deve retornar null quando cliente não encontrado", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(getDb).mockResolvedValue(mockDb as never);

      const result = await clientesService.getClienteById(1, ADMIN_ACTOR, 99999);
      expect(result).toBeNull();
    });
  });
});
