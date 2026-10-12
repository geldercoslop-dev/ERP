/**
 * Teste de integração: validação de preço vigente
 * Valida que os métodos de preço vigente executam sem erro SQL e retornam contrato esperado
 */
import { describe, expect } from "vitest";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, getInsertId } from "../../db/index.js";
import {
  afterAllWithServiceContext,
  beforeAllWithServiceContext,
  itWithServiceContext,
} from "./service-context-harness.js";
import { ensureTenantExists } from "./helpers/tenant.helper.js";
import * as inventoryService from "../../services/inventory.service.js";
import { users, vendedores, produtos } from "../../../drizzle/schema.js";

const TEST_TENANT_ID = 999;

// Flag para ativar testes de integração com banco real
const INTEGRATION_DB_READY = true;

let dbConn!: NonNullable<Awaited<ReturnType<typeof getDb>>>;

let userId = 0;
let vendedorId = 0;
let produtoId = 0;

describe.skipIf(!INTEGRATION_DB_READY)("PREÇO VIGENTE - TESTE REAL", () => {
  beforeAllWithServiceContext(async () => {
    const conn = await getDb();
    if (!conn) throw new Error("Database connection failed");
    dbConn = conn;

    const suffix = nanoid(6).replace(/[^0-9a-z]/gi, "x");

    console.log("\n🔧 Setup: Criando dados de teste para validação de preço vigente...\n");

    // Pai em `tenants` antes de inserts filhos (fundação p/ FK futura)
    await ensureTenantExists(dbConn, TEST_TENANT_ID);

    // Criar usuário
    const insUser = await dbConn.insert(users).values({
      tenantId: TEST_TENANT_ID,
      openId: `preco-vigente-${suffix}`.slice(0, 64),
      name: "User Preco Vigente",
      role: "user",
    });
    userId = getInsertId(insUser);
    if (!Number.isInteger(userId) || userId <= 0) throw new Error("Falha insert user");

    // Criar vendedor
    const insVend = await dbConn.insert(vendedores).values({
      tenantId: TEST_TENANT_ID,
      userId: userId,
      nome: `Vend Preco Vigente ${suffix}`,
      ativo: true,
      admin: false,
    });
    vendedorId = getInsertId(insVend);
    if (!Number.isInteger(vendedorId) || vendedorId <= 0) throw new Error("Falha insert vendedor");

    // Criar produto
    const insProduto = await dbConn.insert(produtos).values({
      tenantId: TEST_TENANT_ID,
      descricao: `Produto Preco Vigente ${suffix}`,
      valorVenda: "100.00",
      ativo: true,
    });
    produtoId = getInsertId(insProduto);
    if (!Number.isInteger(produtoId) || produtoId <= 0) throw new Error("Falha insert produto");

    console.log("\n✅ Setup concluído!\n");
  });

  itWithServiceContext("INVENTORY: getAllProdutosComPrecoVigente retorna array sem erro SQL", async () => {
    const result = await inventoryService.getAllProdutosComPrecoVigente(TEST_TENANT_ID);
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    // Verificar se o erro SQL near '?' não ocorreu
    expect(() => result.find(() => true)).not.toThrow();
  });

  itWithServiceContext("INVENTORY: getProdutosComPrecoVigentePaged retorna objeto com items array sem erro SQL", async () => {
    const result = await inventoryService.getProdutosComPrecoVigentePaged(TEST_TENANT_ID, {
      page: 1,
      pageSize: 10
    });
    expect(result).toBeDefined();
    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.total).toBe("number");
  });

  itWithServiceContext("INVENTORY: getProdutosComPrecoVigentePaged com filtro query não quebra", async () => {
    const result = await inventoryService.getProdutosComPrecoVigentePaged(TEST_TENANT_ID, {
      page: 1,
      pageSize: 10,
      query: "Preco"
    });
    expect(result).toBeDefined();
    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
  });

  itWithServiceContext("INVENTORY: getProdutosComPrecoVigentePaged com filtro categoria não quebra", async () => {
    const result = await inventoryService.getProdutosComPrecoVigentePaged(TEST_TENANT_ID, {
      page: 1,
      pageSize: 10,
      categoria: "Teste"
    });
    expect(result).toBeDefined();
    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
  });

  itWithServiceContext("INVENTORY: getProdutosComPrecoVigentePaged com filtro marca não quebra", async () => {
    const result = await inventoryService.getProdutosComPrecoVigentePaged(TEST_TENANT_ID, {
      page: 1,
      pageSize: 10,
      marca: "MarcaTeste"
    });
    expect(result).toBeDefined();
    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
  });

  afterAllWithServiceContext(async () => {
    console.log("\n🧹 Limpeza preco vigente test...\n");

    // Limpar produto (tenant-safe)
    if (produtoId > 0) {
      await dbConn.delete(produtos).where(
        and(eq(produtos.id, produtoId), eq(produtos.tenantId, TEST_TENANT_ID))
      );
    }

    // Limpar vendedor (tenant-safe)
    if (vendedorId > 0) {
      await dbConn.delete(vendedores).where(
        and(eq(vendedores.id, vendedorId), eq(vendedores.tenantId, TEST_TENANT_ID))
      );
    }

    // Limpar usuário (tenant-safe)
    if (userId > 0) {
      await dbConn.delete(users).where(
        and(eq(users.id, userId), eq(users.tenantId, TEST_TENANT_ID))
      );
    }

    console.log("\n✅ Limpeza concluída!\n");
  });
});
