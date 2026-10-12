/**
 * Teste de integração: validação de finance.getCaixaMensal
 * Valida que o método retorna contrato paginado correto
 */
import { describe, expect } from "vitest";
import { eq, and } from "drizzle-orm";
import { getDb, getInsertId } from "../../db/index.js";
import {
  afterAllWithServiceContext,
  beforeAllWithServiceContext,
  itWithServiceContext,
} from "./service-context-harness.js";
import { ensureTenantExists } from "./helpers/tenant.helper.js";
import * as financeService from "../../services/finance.service.js";
import { caixaMensal } from "../../../drizzle/schema.js";

const TEST_TENANT_ID = 999;

// Flag para ativar testes de integração com banco real
const INTEGRATION_DB_READY = true;

let dbConn!: NonNullable<Awaited<ReturnType<typeof getDb>>>;

let caixaId = 0;

describe.skipIf(!INTEGRATION_DB_READY)("CAIXA MENSAL - TESTE REAL", () => {
  beforeAllWithServiceContext(async () => {
    const conn = await getDb();
    if (!conn) throw new Error("Database connection failed");
    dbConn = conn;

    console.log("\n🔧 Setup: Criando dados de teste para validação de caixa mensal...\n");

    // Pai em `tenants` antes de inserts filhos (fundação p/ FK futura)
    await ensureTenantExists(dbConn, TEST_TENANT_ID);

    // Criar caixa mensal
    const insCaixa = await dbConn.insert(caixaMensal).values({
      tenantId: TEST_TENANT_ID,
      mesAno: "2026-05",
      totalPix: "100.00",
      totalBoleto: "50.00",
      totalCartao: "75.00",
      totalDinheiro: "25.00",
      totalGeral: "250.00",
    });
    caixaId = getInsertId(insCaixa);
    if (!Number.isInteger(caixaId) || caixaId <= 0) throw new Error("Falha insert caixa mensal");

    console.log("\n✅ Setup concluído!\n");
  });

  itWithServiceContext("FINANCE: getCaixaMensal retorna contrato paginado correto", async () => {
    const result = await financeService.getCaixaMensal(TEST_TENANT_ID);
    expect(result).toBeDefined();
    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.total).toBe("number");
    expect(typeof result.page).toBe("number");
    expect(typeof result.pageSize).toBe("number");
  });

  itWithServiceContext("FINANCE: getCaixaMensal com filtro mesAno não quebra", async () => {
    const result = await financeService.getCaixaMensal(TEST_TENANT_ID, "2026-05");
    expect(result).toBeDefined();
    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
  });

  itWithServiceContext("FINANCE: getCaixaMensal com paginação não quebra", async () => {
    const result = await financeService.getCaixaMensal(TEST_TENANT_ID, undefined, { page: 1, pageSize: 10 });
    expect(result).toBeDefined();
    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
  });

  afterAllWithServiceContext(async () => {
    console.log("\n🧹 Limpeza caixa mensal test...\n");

    // Limpar caixa mensal (tenant-safe)
    if (caixaId > 0) {
      await dbConn.delete(caixaMensal).where(
        and(eq(caixaMensal.id, caixaId), eq(caixaMensal.tenantId, TEST_TENANT_ID))
      );
    }

    console.log("\n✅ Limpeza concluída!\n");
  });
});
