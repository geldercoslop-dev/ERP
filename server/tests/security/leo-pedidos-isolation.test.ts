import { describe, expect, it } from "vitest";
import { agentPermissions } from "../../leo/security/agent-permissions.js";
import { getPedidoByNumeroForActor, resolveVendedorIdForCreate } from "../../services/orders.service.js";
import { ADMIN_ACTOR } from "../../_core/service-actor.js";

const baseInput = {
  vendedorId: 99999,
  clienteId: 1,
  subtotal: 10,
  desconto: 0,
  frete: 0,
  total: 10,
  itens: [
    {
      tipo: "LIVRE",
      descricao: "x",
      quantidade: 1,
      valorUnitario: 10,
      custo: 0,
    },
  ],
};

describe("LEO / pedidos — isolamento e permissões", () => {
  it("bloqueia tool sem userId no contexto", () => {
    const r = agentPermissions.hasPermission("buscar_pedido", {
      tenantId: 1,
      userId: 0,
      userRole: "vendedor",
      action: "execute",
    });
    expect(r.allowed).toBe(false);
  });

  it("permite resumo_financeiro para vendedor (escopo no serviço)", () => {
    const r = agentPermissions.hasPermission("resumo_financeiro", {
      tenantId: 1,
      userId: 10,
      userRole: "vendedor",
      action: "execute",
    });
    expect(r.allowed).toBe(true);
  });

  it("getPedidoByNumeroForActor: sem registro retorna null", async () => {
    const p = await getPedidoByNumeroForActor(999999, { role: "vendedor", vendedorId: 1 }, 1);
    expect(p).toBeNull();
  });

  it("resolveVendedorIdForCreate: vendedor ignora vendedorId do payload", () => {
    const id = resolveVendedorIdForCreate(baseInput, { role: "vendedor", vendedorId: 2 });
    expect(id).toBe(2);
  });

  it("resolveVendedorIdForCreate: admin só aceita trustedVendedorId (não o payload)", () => {
    expect(resolveVendedorIdForCreate(baseInput, ADMIN_ACTOR, 42)).toBe(42);
    expect(() => resolveVendedorIdForCreate(baseInput, ADMIN_ACTOR)).toThrow();
  });

  it("resolveVendedorIdForCreate: legado servidor sem role usa vendedorId do ator", () => {
    const id = resolveVendedorIdForCreate(baseInput, { vendedorId: 7 });
    expect(id).toBe(7);
  });
});
