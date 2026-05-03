/**
 * Testes unitários para a máquina oficial de status de pedidos.
 * Cobertura direta de validatePedidoStatusTransition e assertPedidoStatusTransition.
 *
 * Não requer banco de dados — testa apenas a lógica de domínio pura.
 */
import { describe, it, expect } from "vitest";
import {
  validatePedidoStatusTransition,
  assertPedidoStatusTransition,
  PedidoStatus,
  type PedidoStatusValue,
} from "../shared/domain-status.js";

describe("DOMAIN-STATUS: máquina de status de pedidos", () => {
  describe("validatePedidoStatusTransition", () => {
    describe("transições válidas", () => {
      const validCases: Array<[PedidoStatusValue, PedidoStatusValue]> = [
        // GERADO
        [PedidoStatus.GERADO, PedidoStatus.GERADO],
        [PedidoStatus.GERADO, PedidoStatus.CONFERIDO],
        [PedidoStatus.GERADO, PedidoStatus.CANCELADO],
        // CONFERIDO
        [PedidoStatus.CONFERIDO, PedidoStatus.CONFERIDO],
        [PedidoStatus.CONFERIDO, PedidoStatus.IMPRESSO],
        [PedidoStatus.CONFERIDO, PedidoStatus.CANCELADO],
        // IMPRESSO
        [PedidoStatus.IMPRESSO, PedidoStatus.IMPRESSO],
        [PedidoStatus.IMPRESSO, PedidoStatus.EM_ROTA],
        [PedidoStatus.IMPRESSO, PedidoStatus.CANCELADO],
        // EM_ROTA
        [PedidoStatus.EM_ROTA, PedidoStatus.EM_ROTA],
        [PedidoStatus.EM_ROTA, PedidoStatus.ENTREGUE],
        [PedidoStatus.EM_ROTA, PedidoStatus.CANCELADO],
        // ENTREGUE (estado terminal)
        [PedidoStatus.ENTREGUE, PedidoStatus.ENTREGUE],
        // CANCELADO (estado terminal)
        [PedidoStatus.CANCELADO, PedidoStatus.CANCELADO],
        // PENDENTE_ESTOQUE
        [PedidoStatus.PENDENTE_ESTOQUE, PedidoStatus.PENDENTE_ESTOQUE],
        [PedidoStatus.PENDENTE_ESTOQUE, PedidoStatus.GERADO],
        [PedidoStatus.PENDENTE_ESTOQUE, PedidoStatus.CANCELADO],
      ];

      it.each(validCases)(
        "aceita transição válida: %s → %s",
        (from, to) => {
          const result = validatePedidoStatusTransition(from, to);
          expect(result.valid).toBe(true);
          expect(result.allowed).toBe(true);
          expect(result.from).toBe(from);
          expect(result.to).toBe(to);
          expect(result.reason).toBeUndefined();
        }
      );
    });

    describe("transições inválidas", () => {
      const invalidCases: Array<[PedidoStatusValue, PedidoStatusValue, string]> = [
        // ENTREGUE não pode sair do estado terminal
        [PedidoStatus.ENTREGUE, PedidoStatus.GERADO, "Transição não permitida"],
        [PedidoStatus.ENTREGUE, PedidoStatus.CANCELADO, "Transição não permitida"],
        // CANCELADO não pode sair do estado terminal
        [PedidoStatus.CANCELADO, PedidoStatus.CONFERIDO, "Transição não permitida"],
        // Retrocessos inválidos
        [PedidoStatus.CONFERIDO, PedidoStatus.GERADO, "Transição não permitida"],
        [PedidoStatus.EM_ROTA, PedidoStatus.CONFERIDO, "Transição não permitida"],
        [PedidoStatus.IMPRESSO, PedidoStatus.GERADO, "Transição não permitida"],
        // Pulos inválidos
        [PedidoStatus.GERADO, PedidoStatus.ENTREGUE, "Transição não permitida"],
        [PedidoStatus.PENDENTE_ESTOQUE, PedidoStatus.ENTREGUE, "Transição não permitida"],
      ];

      it.each(invalidCases)(
        "rejeita transição inválida: %s → %s",
        (from, to, expectedReason) => {
          const result = validatePedidoStatusTransition(from, to);
          expect(result.valid).toBe(true); // status são válidos, apenas não permitidos
          expect(result.allowed).toBe(false);
          expect(result.from).toBe(from);
          expect(result.to).toBe(to);
          expect(result.reason).toContain(expectedReason);
        }
      );
    });

    describe("status inválidos", () => {
      it("rejeita status de origem inválido", () => {
        const result = validatePedidoStatusTransition("STATUS_INVALIDO", PedidoStatus.GERADO);
        expect(result.valid).toBe(false);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("Status origem inválido");
      });

      it("rejeita status de destino inválido", () => {
        const result = validatePedidoStatusTransition(PedidoStatus.GERADO, "STATUS_INVALIDO");
        expect(result.valid).toBe(false);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("Status destino inválido");
      });

      it("rejeita ambos os status inválidos", () => {
        const result = validatePedidoStatusTransition("INVALIDO_1", "INVALIDO_2");
        expect(result.valid).toBe(false);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("Status origem e destino inválidos");
      });
    });
  });

  describe("assertPedidoStatusTransition", () => {
    describe("transições válidas", () => {
      const validCases: Array<[PedidoStatusValue, PedidoStatusValue]> = [
        [PedidoStatus.GERADO, PedidoStatus.CONFERIDO],
        [PedidoStatus.CONFERIDO, PedidoStatus.IMPRESSO],
        [PedidoStatus.IMPRESSO, PedidoStatus.EM_ROTA],
        [PedidoStatus.EM_ROTA, PedidoStatus.ENTREGUE],
        [PedidoStatus.PENDENTE_ESTOQUE, PedidoStatus.GERADO],
        [PedidoStatus.GERADO, PedidoStatus.CANCELADO],
        [PedidoStatus.ENTREGUE, PedidoStatus.ENTREGUE],
        [PedidoStatus.CANCELADO, PedidoStatus.CANCELADO],
      ];

      it.each(validCases)(
        "não lança erro para transição válida: %s → %s",
        (from, to) => {
          expect(() => assertPedidoStatusTransition(from, to)).not.toThrow();
        }
      );
    });

    describe("transições inválidas", () => {
      const invalidCases: Array<[PedidoStatusValue, PedidoStatusValue, string]> = [
        [PedidoStatus.ENTREGUE, PedidoStatus.GERADO, "Transição não permitida"],
        [PedidoStatus.ENTREGUE, PedidoStatus.CANCELADO, "Transição não permitida"],
        [PedidoStatus.CANCELADO, PedidoStatus.CONFERIDO, "Transição não permitida"],
        [PedidoStatus.CONFERIDO, PedidoStatus.GERADO, "Transição não permitida"],
        [PedidoStatus.EM_ROTA, PedidoStatus.CONFERIDO, "Transição não permitida"],
        [PedidoStatus.IMPRESSO, PedidoStatus.GERADO, "Transição não permitida"],
        [PedidoStatus.GERADO, PedidoStatus.ENTREGUE, "Transição não permitida"],
        [PedidoStatus.PENDENTE_ESTOQUE, PedidoStatus.ENTREGUE, "Transição não permitida"],
      ];

      it.each(invalidCases)(
        "lança erro para transição inválida: %s → %s",
        (from, to, expectedMessage) => {
          expect(() => assertPedidoStatusTransition(from, to)).toThrow(expectedMessage);
        }
      );
    });

    describe("status inválidos", () => {
      it("lança erro para status de origem inválido", () => {
        expect(() =>
          assertPedidoStatusTransition("STATUS_INVALIDO", PedidoStatus.GERADO)
        ).toThrow("Status origem inválido");
      });

      it("lança erro para status de destino inválido", () => {
        expect(() =>
          assertPedidoStatusTransition(PedidoStatus.GERADO, "STATUS_INVALIDO")
        ).toThrow("Status destino inválido");
      });
    });
  });
});
