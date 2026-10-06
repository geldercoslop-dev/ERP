/**
 * P23-R-09X — Prova de isolamento multi-tenant de getVendedorById
 * Objetivo: a leitura por id é SEMPRE tenant-scoped — não existe fallback global.
 * Integração real (MySQL), sem mocks — as queries reais do service são exercitadas.
 * Padrão: service-context-harness (bootstrapServer + ALS) igual a
 * vendedores-mutation-tenant-isolation.test.ts.
 *
 * Cobre a barreira usada por createVenda/impersonate/linkUser: como o router
 * passa o tenantId do CONTEXTO autenticado para getVendedorById(id, tenantId),
 * provar que (id do tenant B, tenantId A) retorna null prova que nenhum fluxo
 * consegue selecionar vendedor de outro tenant por esse caminho — o service é
 * a fronteira de isolamento que o router consome.
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
import { vendedores } from "../../drizzle/schema.js";
import * as usersService from "../services/users.service.js";

// Dois tenants distintos reservados SOMENTE para este teste
// (diferentes de R09U e R09W para não haver interferência entre suites)
const TENANT_A = 92021;
const TENANT_B = 92022;

let dbConn!: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let vendedorIdA = 0;
let vendedorIdB = 0;
let nomeA = "";
let nomeB = "";

/** Leitura direta por id (verificação do estado real no banco, independente de tenant) */
async function readVendedorRow(id: number) {
  const rows = await dbConn.select().from(vendedores).where(eq(vendedores.id, id)).limit(1);
  return rows.length > 0 ? rows[0] : null;
}

describe("getVendedorById — isolamento multi-tenant (P23-R-09X)", () => {
  beforeAllWithServiceContext(async () => {
    const conn = await getDb();
    if (!conn) throw new Error("Database connection failed");
    dbConn = conn;

    const suffix = nanoid(6).replace(/[^0-9a-z]/gi, "x");
    nomeA = `Vend ById A ${suffix}`;
    nomeB = `Vend ById B ${suffix}`;

    // Vendedor do tenant A
    const insA = await dbConn.insert(vendedores).values({
      tenantId: TENANT_A,
      nome: nomeA,
      ativo: true,
      admin: false,
    });
    vendedorIdA = getInsertId(insA as never);
    if (!Number.isInteger(vendedorIdA) || vendedorIdA <= 0) {
      throw new Error("Falha insert vendedor tenant A");
    }

    // Vendedor do tenant B (alvo dos cenários cross-tenant)
    const insB = await dbConn.insert(vendedores).values({
      tenantId: TENANT_B,
      nome: nomeB,
      ativo: true,
      admin: false,
    });
    vendedorIdB = getInsertId(insB as never);
    if (!Number.isInteger(vendedorIdB) || vendedorIdB <= 0) {
      throw new Error("Falha insert vendedor tenant B");
    }
  });

  afterAllWithServiceContext(async () => {
    // Cleanup somente dos registros criados por ESTA execução:
    // DELETE restrito aos IDs inseridos aqui (tenant como defesa adicional).
    // Nenhum delete amplo por tenant é permitido.
    const vids = [vendedorIdA, vendedorIdB].filter(
      (id) => Number.isInteger(id) && id > 0
    );
    if (vids.length > 0) {
      await dbConn
        .delete(vendedores)
        .where(
          and(
            inArray(vendedores.id, vids),
            or(eq(vendedores.tenantId, TENANT_A), eq(vendedores.tenantId, TENANT_B))
          )
        );
    }
  });

  itWithServiceContext("1) tenant A consegue buscar vendedor do tenant A", async () => {
    const v = await usersService.getVendedorById(vendedorIdA, TENANT_A);
    expect(v).not.toBeNull();
    expect(v!.id).toBe(vendedorIdA);
    expect(v!.tenantId).toBe(TENANT_A);
    expect(v!.nome).toBe(nomeA);
  });

  itWithServiceContext("2) tenant B consegue buscar vendedor do tenant B", async () => {
    const v = await usersService.getVendedorById(vendedorIdB, TENANT_B);
    expect(v).not.toBeNull();
    expect(v!.id).toBe(vendedorIdB);
    expect(v!.tenantId).toBe(TENANT_B);
    expect(v!.nome).toBe(nomeB);
  });

  itWithServiceContext("3) tenant A buscando vendedor do tenant B retorna null", async () => {
    const v = await usersService.getVendedorById(vendedorIdB, TENANT_A);
    expect(v).toBeNull();
    // Registro de B continua intacto no banco (lookup não vazou nada)
    const rowB = await readVendedorRow(vendedorIdB);
    expect(rowB).not.toBeNull();
    expect(rowB!.tenantId).toBe(TENANT_B);
  });

  itWithServiceContext("4) tenant B buscando vendedor do tenant A retorna null", async () => {
    const v = await usersService.getVendedorById(vendedorIdA, TENANT_B);
    expect(v).toBeNull();
    const rowA = await readVendedorRow(vendedorIdA);
    expect(rowA).not.toBeNull();
    expect(rowA!.tenantId).toBe(TENANT_A);
  });

  itWithServiceContext("5) tenantId inválido (0/negativo) é rejeitado por assertTenantId", async () => {
    await expect(usersService.getVendedorById(vendedorIdA, 0)).rejects.toThrow();
    await expect(usersService.getVendedorById(vendedorIdA, -1)).rejects.toThrow();
    await expect(
      usersService.getVendedorById(vendedorIdA, Number.NaN as number)
    ).rejects.toThrow();
  });

  itWithServiceContext("6) vendedor inexistente no mesmo tenant retorna null", async () => {
    const v = await usersService.getVendedorById(999999999, TENANT_A);
    expect(v).toBeNull();
  });

  itWithServiceContext("7) não existe fallback global: assinatura exige tenantId", async () => {
    // Parâmetros declarados antes de qualquer default — length === 2 prova que
    // tenantId é obrigatório na assinatura (não há overload sem tenant).
    expect(usersService.getVendedorById.length).toBe(2);
    // tenantId falsy é rejeitado: não há caminho de busca global por id puro.
    await expect(
      usersService.getVendedorById(vendedorIdA, undefined as unknown as number)
    ).rejects.toThrow();
    await expect(
      usersService.getVendedorById(vendedorIdA, null as unknown as number)
    ).rejects.toThrow();
  });

  itWithServiceContext("8) barreira usada por createVenda: vendedor de outro tenant não é selecionável", async () => {
    // Reproduz exatamente o lookup que createVenda executa:
    //   vendedor = await usersService.getVendedorById(input.vendedorId, tenantId-do-contexto)
    // Admin do tenant A passando vendedorId do tenant B NÃO recebe o vendedor —
    // sem lookup, não há vendedor.tenantId para derivar cliente/pedido/número
    // cross-tenant. Como o router só usa vendedores retornados por este service,
    // provar null aqui prova a ausência de criação cross-tenant.
    const vendedorSelecionado = await usersService.getVendedorById(vendedorIdB, TENANT_A);
    expect(vendedorSelecionado).toBeNull();
  });
});
