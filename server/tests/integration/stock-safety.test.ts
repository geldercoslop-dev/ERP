/**
 * Teste de integração: validação de stockSafety.getStockMovements
 * Valida que o método retorna contrato correto: { success: boolean; data?: StockMovement[]; error?: string }
 */
import { describe, expect } from "vitest";
import {
  beforeAllWithServiceContext,
  itWithServiceContext,
} from "./service-context-harness.js";
import * as stockSafetyService from "../../services/stock-safety.service.js";

const TEST_TENANT_ID = 999;

// Flag para ativar testes de integração com banco real
const INTEGRATION_DB_READY = true;

describe.skipIf(!INTEGRATION_DB_READY)("STOCK SAFETY - getStockMovements TESTE REAL", () => {
  beforeAllWithServiceContext(async () => {
    console.log("\n🔧 Setup: Conectando ao banco para validação de getStockMovements...\n");
    console.log("\n✅ Setup concluído!\n");
  });

  itWithServiceContext("STOCK SAFETY: getStockMovements sem filtros retorna success true e data array", async () => {
    const result = await stockSafetyService.getStockMovements(TEST_TENANT_ID, {});
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  itWithServiceContext("STOCK SAFETY: getStockMovements com filtro produtoId retorna success true e data array", async () => {
    const result = await stockSafetyService.getStockMovements(TEST_TENANT_ID, { produtoId: 99999 });
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  itWithServiceContext("STOCK SAFETY: getStockMovements com filtro tipo retorna success true e data array", async () => {
    const result = await stockSafetyService.getStockMovements(TEST_TENANT_ID, { tipo: "entrada" });
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  itWithServiceContext("STOCK SAFETY: getStockMovements com limit retorna success true e respeita limit", async () => {
    const result = await stockSafetyService.getStockMovements(TEST_TENANT_ID, { limit: 10 });
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
    if (result.data) {
      expect(result.data.length).toBeLessThanOrEqual(10);
    }
  });

  itWithServiceContext("STOCK SAFETY: tenantId inválido retorna success false com error definido", async () => {
    const result = await stockSafetyService.getStockMovements(-1, {});
    expect(result).toBeDefined();
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe("string");
  });
});
