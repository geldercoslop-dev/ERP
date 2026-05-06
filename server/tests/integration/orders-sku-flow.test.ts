import { describe, expect } from "vitest";
import {
  beforeAllWithServiceContext,
  itWithServiceContext,
} from "./service-context-harness.js";
import {
  cleanupSkuOrderScenario,
  createSkuOrderScenario,
  getPendenciasForPedidoScenario,
  getSkuStockForScenario,
  type SkuOrderScenario,
} from "./helpers/sku-order-flow.helper.js";
import {
  cancelarPedidoSafe,
  createPedidoSafe,
  getPedidoById,
} from "../../services/orders.service.js";

const TENANT_ID = 997;

type PedidoItemInput = {
  produtoId?: number;
  skuId?: number;
  corId?: number;
  quantidade?: number;
  valorUnitario?: number;
};

function buildPedidoInput(s: SkuOrderScenario, item: PedidoItemInput) {
  return {
    vendedorId: s.vendedorId,
    clienteId: s.clienteId,
    clienteNome: `Cliente SKU ${s.scenarioSuffix}`,
    clienteTelefone: "11996000000",
    subtotal: String(item.valorUnitario ?? 100),
    desconto: "0",
    frete: "0",
    total: String(item.valorUnitario ?? 100),
    itens: [
      {
        tipo: "CATALOGO",
        produtoId: item.produtoId,
        skuId: item.skuId,
        corId: item.corId,
        descricao: "Item SKU",
        quantidade: item.quantidade ?? 1,
        valorUnitario: item.valorUnitario ?? 100,
        custo: 10,
      },
    ],
  };
}

async function createPedidoAndTrack(
  scenario: SkuOrderScenario,
  item: PedidoItemInput
) {
  const result = await createPedidoSafe(
    scenario.tenantId,
    buildPedidoInput(scenario, item)
  );
  if (result.success && result.pedidoId > 0) {
    scenario.createdPedidoIds.push(result.pedidoId);
    scenario.createdPedidoNumeros.push(result.numero);
  }
  return result;
}

describe("SKU/PEDIDO/CANCELAMENTO - INTEGRAÇÃO VIA HELPER OFICIAL", () => {
  beforeAllWithServiceContext(async () => {});

  itWithServiceContext("VALIDAÇÃO 1: SKU sem produtoId bloqueia", async () => {
    const scenario = await createSkuOrderScenario(TENANT_ID, { scenarioLabel: "v1-sem-produto" });
    try {
      await expect(
        createPedidoAndTrack(scenario, {
          skuId: scenario.skuAtivoId,
          corId: scenario.corId,
          valorUnitario: 101,
        })
      ).rejects.toThrow(/produtoId|Item com SKU exige produtoId/i);
    } finally {
      await cleanupSkuOrderScenario(scenario);
    }
  });

  itWithServiceContext("VALIDAÇÃO 2: SKU inexistente bloqueia", async () => {
    const scenario = await createSkuOrderScenario(TENANT_ID, { scenarioLabel: "v2-sku-inexistente" });
    try {
      await expect(
        createPedidoAndTrack(scenario, {
          produtoId: scenario.produtoId,
          skuId: 999999999,
          corId: scenario.corId,
          valorUnitario: 102,
        })
      ).rejects.toThrow(/SKU não encontrado/i);
    } finally {
      await cleanupSkuOrderScenario(scenario);
    }
  });

  itWithServiceContext("VALIDAÇÃO 3: SKU de outro tenant bloqueia", async () => {
    const scenario = await createSkuOrderScenario(TENANT_ID, { scenarioLabel: "v3-sku-outro-tenant" });
    try {
      await expect(
        createPedidoAndTrack(scenario, {
          produtoId: scenario.produtoId,
          skuId: scenario.skuOutroTenantId,
          corId: scenario.corId,
          valorUnitario: 103,
        })
      ).rejects.toThrow(/SKU não encontrado|tenant/i);
    } finally {
      await cleanupSkuOrderScenario(scenario);
    }
  });

  itWithServiceContext("VALIDAÇÃO 4: SKU de outro produto bloqueia", async () => {
    const scenario = await createSkuOrderScenario(TENANT_ID, { scenarioLabel: "v4-sku-outro-produto" });
    try {
      await expect(
        createPedidoAndTrack(scenario, {
          produtoId: scenario.produtoId,
          skuId: scenario.skuOutroProdutoId,
          corId: scenario.corId,
          valorUnitario: 104,
        })
      ).rejects.toThrow(/SKU não pertence ao produto informado/i);
    } finally {
      await cleanupSkuOrderScenario(scenario);
    }
  });

  itWithServiceContext("VALIDAÇÃO 5: SKU inativo bloqueia", async () => {
    const scenario = await createSkuOrderScenario(TENANT_ID, { scenarioLabel: "v5-sku-inativo" });
    try {
      await expect(
        createPedidoAndTrack(scenario, {
          produtoId: scenario.produtoId,
          skuId: scenario.skuInativoId,
          corId: scenario.corId,
          valorUnitario: 105,
        })
      ).rejects.toThrow(/SKU inativo/i);
    } finally {
      await cleanupSkuOrderScenario(scenario);
    }
  });

  itWithServiceContext("VALIDAÇÃO 6: corId incompatível bloqueia", async () => {
    const scenario = await createSkuOrderScenario(TENANT_ID, { scenarioLabel: "v6-cor-incompativel" });
    try {
      await expect(
        createPedidoAndTrack(scenario, {
          produtoId: scenario.produtoId,
          skuId: scenario.skuAtivoId,
          corId: scenario.corOtherId,
          valorUnitario: 106,
        })
      ).rejects.toThrow(/cor informada|incompatível/i);
    } finally {
      await cleanupSkuOrderScenario(scenario);
    }
  });

  itWithServiceContext("VALIDAÇÃO 7: SKU válido passa validação", async () => {
    const scenario = await createSkuOrderScenario(TENANT_ID, { scenarioLabel: "v7-sku-valido" });
    try {
      const result = await createPedidoAndTrack(scenario, {
        produtoId: scenario.produtoId,
        skuId: scenario.skuAtivoId,
        corId: scenario.corId,
        valorUnitario: 107,
      });
      expect(result.success).toBe(true);
      expect(result.pedidoId).toBeGreaterThan(0);
    } finally {
      await cleanupSkuOrderScenario(scenario);
    }
  });

  itWithServiceContext("FLUXO 8: SKU suficiente gera pedido GERADO e debita estoque", async () => {
    const scenario = await createSkuOrderScenario(TENANT_ID, { scenarioLabel: "f8-gerado-debita" });
    try {
      const estoqueAntes = await getSkuStockForScenario(scenario.tenantId, scenario.skuAtivoId);
      const result = await createPedidoAndTrack(scenario, {
        produtoId: scenario.produtoId,
        skuId: scenario.skuAtivoId,
        corId: scenario.corId,
        quantidade: 3,
        valorUnitario: 108,
      });

      expect(result.success).toBe(true);
      const pedido = await getPedidoById(scenario.tenantId, result.pedidoId);
      expect(pedido?.status).toBe("GERADO");

      const estoqueDepois = await getSkuStockForScenario(scenario.tenantId, scenario.skuAtivoId);
      expect(estoqueDepois).toBe(estoqueAntes - 3);
    } finally {
      await cleanupSkuOrderScenario(scenario);
    }
  });

  itWithServiceContext("FLUXO 9: SKU bloqueado sem estoque gera PENDENTE_ESTOQUE sem debitar", async () => {
    const scenario = await createSkuOrderScenario(TENANT_ID, { scenarioLabel: "f9-pendente-sem-debito" });
    try {
      const estoqueAntes = await getSkuStockForScenario(scenario.tenantId, scenario.skuSemEstoqueId);
      expect(estoqueAntes).toBe(0);

      const result = await createPedidoAndTrack(scenario, {
        produtoId: scenario.produtoId,
        skuId: scenario.skuSemEstoqueId,
        corId: scenario.corId,
        quantidade: 1,
        valorUnitario: 109,
      });

      expect(result.success).toBe(true);
      const pedido = await getPedidoById(scenario.tenantId, result.pedidoId);
      expect(pedido?.status).toBe("PENDENTE_ESTOQUE");

      const estoqueDepois = await getSkuStockForScenario(scenario.tenantId, scenario.skuSemEstoqueId);
      expect(estoqueDepois).toBe(0);

      const pendencias = await getPendenciasForPedidoScenario(
        scenario.tenantId,
        result.pedidoId,
        scenario.skuSemEstoqueId
      );
      expect(pendencias.length).toBeGreaterThan(0);
      expect(pendencias[0]?.skuId).toBe(scenario.skuSemEstoqueId);
      expect(pendencias[0]?.status).toBe("PENDENTE");
    } finally {
      await cleanupSkuOrderScenario(scenario);
    }
  });

  itWithServiceContext("FLUXO 10: SKU repetido no mesmo pedido agrega quantidade", async () => {
    const scenario = await createSkuOrderScenario(TENANT_ID, { scenarioLabel: "f10-repetido-agrega" });
    try {
      const estoqueAntes = await getSkuStockForScenario(scenario.tenantId, scenario.skuAtivoId);
      const result = await createPedidoSafe(scenario.tenantId, {
        vendedorId: scenario.vendedorId,
        clienteId: scenario.clienteId,
        clienteNome: `Cliente SKU ${scenario.scenarioSuffix}`,
        clienteTelefone: "11996000000",
        subtotal: "200",
        desconto: "0",
        frete: "0",
        total: "200",
        itens: [
          {
            tipo: "CATALOGO",
            produtoId: scenario.produtoId,
            skuId: scenario.skuAtivoId,
            corId: scenario.corId,
            descricao: "SKU repetido 1",
            quantidade: 3,
            valorUnitario: 110,
            custo: 10,
          },
          {
            tipo: "CATALOGO",
            produtoId: scenario.produtoId,
            skuId: scenario.skuAtivoId,
            corId: scenario.corId,
            descricao: "SKU repetido 2",
            quantidade: 2,
            valorUnitario: 110,
            custo: 10,
          },
        ],
      });
      if (result.success && result.pedidoId > 0) {
        scenario.createdPedidoIds.push(result.pedidoId);
        scenario.createdPedidoNumeros.push(result.numero);
      }

      expect(result.success).toBe(true);
      const pedido = await getPedidoById(scenario.tenantId, result.pedidoId);
      expect(pedido?.status).toBe("GERADO");

      const estoqueDepois = await getSkuStockForScenario(scenario.tenantId, scenario.skuAtivoId);
      expect(estoqueDepois).toBe(estoqueAntes - 5);
    } finally {
      await cleanupSkuOrderScenario(scenario);
    }
  });

  itWithServiceContext("FLUXO 11: Cancelamento devolve SKU", async () => {
    const scenario = await createSkuOrderScenario(TENANT_ID, { scenarioLabel: "f11-cancelamento-devolve" });
    try {
      const estoqueAntes = await getSkuStockForScenario(scenario.tenantId, scenario.skuAtivoId);
      const result = await createPedidoAndTrack(scenario, {
        produtoId: scenario.produtoId,
        skuId: scenario.skuAtivoId,
        corId: scenario.corId,
        quantidade: 3,
        valorUnitario: 111,
      });
      expect(result.success).toBe(true);

      const estoqueAposCriacao = await getSkuStockForScenario(scenario.tenantId, scenario.skuAtivoId);
      expect(estoqueAposCriacao).toBe(estoqueAntes - 3);

      await cancelarPedidoSafe(scenario.tenantId, result.pedidoId);

      const estoqueAposCancelamento = await getSkuStockForScenario(scenario.tenantId, scenario.skuAtivoId);
      expect(estoqueAposCancelamento).toBe(estoqueAntes);
    } finally {
      await cleanupSkuOrderScenario(scenario);
    }
  });

  itWithServiceContext("FLUXO 12: Cancelamento repetido não devolve duas vezes", async () => {
    const scenario = await createSkuOrderScenario(TENANT_ID, { scenarioLabel: "f12-cancelamento-idempotente" });
    try {
      const estoqueAntes = await getSkuStockForScenario(scenario.tenantId, scenario.skuAtivoId);
      const result = await createPedidoAndTrack(scenario, {
        produtoId: scenario.produtoId,
        skuId: scenario.skuAtivoId,
        corId: scenario.corId,
        quantidade: 2,
        valorUnitario: 112,
      });
      expect(result.success).toBe(true);

      const estoqueAposCriacao = await getSkuStockForScenario(scenario.tenantId, scenario.skuAtivoId);
      expect(estoqueAposCriacao).toBe(estoqueAntes - 2);

      await cancelarPedidoSafe(scenario.tenantId, result.pedidoId);
      const estoqueAposPrimeiroCancelamento = await getSkuStockForScenario(scenario.tenantId, scenario.skuAtivoId);
      expect(estoqueAposPrimeiroCancelamento).toBe(estoqueAntes);

      await cancelarPedidoSafe(scenario.tenantId, result.pedidoId);
      const estoqueAposSegundoCancelamento = await getSkuStockForScenario(scenario.tenantId, scenario.skuAtivoId);
      expect(estoqueAposSegundoCancelamento).toBe(estoqueAntes);
    } finally {
      await cleanupSkuOrderScenario(scenario);
    }
  });
});
