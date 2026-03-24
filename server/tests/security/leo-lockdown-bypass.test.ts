import { describe, expect, it } from "vitest";
import { stripSensitiveIdsFromRecord } from "../../_core/strip-sensitive-payload";
import { leoErpService } from "../../services/leo-service";
import { ADMIN_ACTOR } from "../../_core/service-actor";

describe("Lockdown — input externo não controla vendedor", () => {
  it("stripSensitiveIdsFromRecord remove vendedorId do objeto", () => {
    const o = stripSensitiveIdsFromRecord({ clienteId: 1, vendedorId: 999, vendedor_id: 888 });
    expect(o.vendedorId).toBeUndefined();
    expect(o.vendedor_id).toBeUndefined();
    expect(o.clienteId).toBe(1);
  });

  it("LeoErpService.createPedido bloqueia admin (sem trustedVendedorId no payload)", async () => {
    await expect(
      leoErpService.createPedido(
        1,
        { clienteId: 1, itens: [{ produtoId: 1, quantidade: 1 }] },
        ADMIN_ACTOR
      )
    ).rejects.toThrow(/admin|trustedVendedorId/i);
  });
});
