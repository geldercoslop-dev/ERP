/**
 * P23-R-09U — Prova de isolamento multi-tenant de vendedores.list
 * Objetivo: getAllVendedores(tenantId) nunca retorna vendedores de outro tenant.
 * Integração real (MySQL), sem mocks — a query real do service é exercitada.
 * Padrão: service-context-harness (bootstrapServer + ALS) igual a integration/ownership.test.ts.
 */

import "dotenv/config";
import { describe, expect } from "vitest";
import { and, eq, inArray, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, getInsertId } from "../db/index.js";
import {
  afterAllWithServiceContext,
  beforeAllWithServiceContext,
  itWithServiceContext,
} from "./integration/service-context-harness.js";
import { ensureTenantExists } from "./integration/helpers/tenant.helper.js";
import { vendedores } from "../../drizzle/schema.js";
import * as usersService from "../services/users.service.js";

// Dois tenants distintos reservados para este teste (não usados por dados reais)
const TENANT_A = 91011;
const TENANT_B = 91012;

let dbConn!: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let vendedorIdA = 0;
let vendedorIdB = 0;

describe("vendedores.list — isolamento multi-tenant (P23-R-09U)", () => {
  beforeAllWithServiceContext(async () => {
    const conn = await getDb();
    if (!conn) throw new Error("Database connection failed");
    dbConn = conn;

    const suffix = nanoid(6).replace(/[^0-9a-z]/gi, "x");

    // Pré-limpeza tenant-aware: remove resíduos de execuções anteriores
    await dbConn
      .delete(vendedores)
      .where(or(eq(vendedores.tenantId, TENANT_A), eq(vendedores.tenantId, TENANT_B)));

    // Pais em `tenants` antes de inserts filhos (fundação p/ FK futura)
    await ensureTenantExists(dbConn, TENANT_A);
    await ensureTenantExists(dbConn, TENANT_B);

    // Criar pelo menos 1 vendedor no tenant A
    const insA = await dbConn.insert(vendedores).values({
      tenantId: TENANT_A,
      nome: `Vend Isolamento A ${suffix}`,
      ativo: true,
      admin: false,
    });
    vendedorIdA = getInsertId(insA as never);
    if (!Number.isInteger(vendedorIdA) || vendedorIdA <= 0) {
      throw new Error("Falha insert vendedor tenant A");
    }

    // Criar pelo menos 1 vendedor no tenant B
    const insB = await dbConn.insert(vendedores).values({
      tenantId: TENANT_B,
      nome: `Vend Isolamento B ${suffix}`,
      ativo: true,
      admin: false,
    });
    vendedorIdB = getInsertId(insB as never);
    if (!Number.isInteger(vendedorIdB) || vendedorIdB <= 0) {
      throw new Error("Falha insert vendedor tenant B");
    }
  });

  afterAllWithServiceContext(async () => {
    // Cleanup forte e tenant-aware: remove exatamente os registros criados,
    // depois qualquer resíduo remanescente nos tenants reservados do teste
    const vids = [vendedorIdA, vendedorIdB].filter((id) => Number.isInteger(id) && id > 0);
    if (vids.length > 0) {
      await dbConn
        .delete(vendedores)
        .where(
          and(inArray(vendedores.id, vids), or(eq(vendedores.tenantId, TENANT_A), eq(vendedores.tenantId, TENANT_B)))
        );
    }
    await dbConn
      .delete(vendedores)
      .where(or(eq(vendedores.tenantId, TENANT_A), eq(vendedores.tenantId, TENANT_B)));
  });

  itWithServiceContext("getAllVendedores(tenantA) retorna somente vendedores do tenant A", async () => {
    const listaA = await usersService.getAllVendedores(TENANT_A);

    expect(Array.isArray(listaA)).toBe(true);
    expect(listaA.length).toBeGreaterThan(0);

    // Todo item retornado pertence ao tenant A
    listaA.forEach((v) => {
      expect(v.tenantId).toBe(TENANT_A);
    });

    // Vendedor criado em A está presente (sem depender de ordem global de IDs)
    expect(listaA.some((v) => v.id === vendedorIdA)).toBe(true);
  });

  itWithServiceContext("getAllVendedores(tenantB) retorna somente vendedores do tenant B", async () => {
    const listaB = await usersService.getAllVendedores(TENANT_B);

    expect(Array.isArray(listaB)).toBe(true);
    expect(listaB.length).toBeGreaterThan(0);

    // Todo item retornado pertence ao tenant B
    listaB.forEach((v) => {
      expect(v.tenantId).toBe(TENANT_B);
    });

    // Vendedor criado em B está presente
    expect(listaB.some((v) => v.id === vendedorIdB)).toBe(true);
  });

  itWithServiceContext("ausência explícita de cross-tenant nos dois sentidos", async () => {
    const listaA = await usersService.getAllVendedores(TENANT_A);
    const listaB = await usersService.getAllVendedores(TENANT_B);

    // Vendedor de B NÃO aparece na lista de A
    expect(listaA.some((v) => v.id === vendedorIdB)).toBe(false);
    expect(listaA.some((v) => v.tenantId === TENANT_B)).toBe(false);

    // Vendedor de A NÃO aparece na lista de B
    expect(listaB.some((v) => v.id === vendedorIdA)).toBe(false);
    expect(listaB.some((v) => v.tenantId === TENANT_A)).toBe(false);

    // Interseção de IDs entre as duas listas deve ser vazia
    const idsA = new Set(listaA.map((v) => v.id));
    const interseccao = listaB.filter((v) => idsA.has(v.id));
    expect(interseccao.length).toBe(0);
  });
});
