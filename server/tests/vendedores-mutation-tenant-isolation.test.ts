/**
 * P23-R-09W — Prova de isolamento multi-tenant das MUTAÇÕES de vendedor
 * Objetivo: tenant A NÃO consegue atualizar, apagar ou trocar senha de vendedor do tenant B.
 * Integração real (MySQL), sem mocks — as queries reais do service são exercitadas.
 * Padrão: service-context-harness (bootstrapServer + ALS) igual a integration/ownership.test.ts.
 *
 * Como updateVendedor/deleteVendedor/updateVendedorSenha retornam void,
 * cada cenário verifica o efeito real no banco após a mutação.
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

// Dois tenants distintos reservados para este teste (diferentes dos usados pelo
// teste R09U de list, para não haver interferência entre suites)
const TENANT_A = 92011;
const TENANT_B = 92012;

// Valores sentinelas do vendedor do tenant B: qualquer alteração via tenant A
// deve ser rejeitada pelo WHERE (tenant_id + id), então estes campos
// precisam permanecer intocados no banco.
const B_TELEFONE_ORIG = "B-ORIG-TELEFONE";
const B_SENHA_ORIG = "B-ORIG-SENHA-HASH";

let dbConn!: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let vendedorIdA = 0;
let vendedorIdAExtra = 0; // registro adicional do tenant A para delete positivo
let vendedorIdB = 0;
let nomeB = "";

/** Leitura direta por id (verificação do estado real no banco, independente de tenant) */
async function readVendedorRow(id: number) {
  const rows = await dbConn.select().from(vendedores).where(eq(vendedores.id, id)).limit(1);
  return rows.length > 0 ? rows[0] : null;
}

describe("vendedores mutation — isolamento multi-tenant (P23-R-09W)", () => {
  beforeAllWithServiceContext(async () => {
    const conn = await getDb();
    if (!conn) throw new Error("Database connection failed");
    dbConn = conn;

    const suffix = nanoid(6).replace(/[^0-9a-z]/gi, "x");
    nomeB = `Vend Mutacao B ${suffix}`;

    // Pré-limpeza tenant-aware: remove resíduos de execuções anteriores
    await dbConn
      .delete(vendedores)
      .where(or(eq(vendedores.tenantId, TENANT_A), eq(vendedores.tenantId, TENANT_B)));

    // Vendedor do tenant A (alvo dos cenários positivos)
    const insA = await dbConn.insert(vendedores).values({
      tenantId: TENANT_A,
      nome: `Vend Mutacao A ${suffix}`,
      ativo: true,
      admin: false,
    });
    vendedorIdA = getInsertId(insA as never);
    if (!Number.isInteger(vendedorIdA) || vendedorIdA <= 0) {
      throw new Error("Falha insert vendedor tenant A");
    }

    // Registro adicional do tenant A (alvo do delete positivo)
    const insAExtra = await dbConn.insert(vendedores).values({
      tenantId: TENANT_A,
      nome: `Vend Mutacao A Extra ${suffix}`,
      ativo: true,
      admin: false,
    });
    vendedorIdAExtra = getInsertId(insAExtra as never);
    if (!Number.isInteger(vendedorIdAExtra) || vendedorIdAExtra <= 0) {
      throw new Error("Falha insert vendedor extra tenant A");
    }

    // Vendedor do tenant B (alvo dos cenários cross-tenant — com sentinelas)
    const insB = await dbConn.insert(vendedores).values({
      tenantId: TENANT_B,
      nome: nomeB,
      telefone: B_TELEFONE_ORIG,
      senha: B_SENHA_ORIG,
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
    const vids = [vendedorIdA, vendedorIdAExtra, vendedorIdB].filter(
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
    await dbConn
      .delete(vendedores)
      .where(or(eq(vendedores.tenantId, TENANT_A), eq(vendedores.tenantId, TENANT_B)));
  });

  itWithServiceContext("updateVendedor positivo no próprio tenant altera o registro", async () => {
    const patchTelefone = "A-NEW-TELEFONE";
    await usersService.updateVendedor(TENANT_A, vendedorIdA, { telefone: patchTelefone });

    const rowA = await readVendedorRow(vendedorIdA);
    expect(rowA).not.toBeNull();
    expect(rowA!.tenantId).toBe(TENANT_A);
    expect(rowA!.telefone).toBe(patchTelefone);
  });

  itWithServiceContext("updateVendedor cross-tenant é bloqueado pelo WHERE (B inalterado)", async () => {
    await usersService.updateVendedor(TENANT_A, vendedorIdB, {
      telefone: "HACKED-TELEFONE",
      nome: "HACKED",
      ativo: false,
    });

    const rowB = await readVendedorRow(vendedorIdB);
    expect(rowB).not.toBeNull();
    expect(rowB!.tenantId).toBe(TENANT_B);
    expect(rowB!.telefone).toBe(B_TELEFONE_ORIG);
    expect(rowB!.nome).toBe(nomeB);
    expect(rowB!.ativo).toBe(true);
  });

  itWithServiceContext("updateVendedorSenha positivo no próprio tenant altera a senha", async () => {
    const novaSenhaA = "A-NEW-SENHA-HASH";
    await usersService.updateVendedorSenha(TENANT_A, vendedorIdA, novaSenhaA);

    const rowA = await readVendedorRow(vendedorIdA);
    expect(rowA).not.toBeNull();
    expect(rowA!.senha).toBe(novaSenhaA);
  });

  itWithServiceContext("updateVendedorSenha cross-tenant é bloqueado pelo WHERE (senha de B inalterada)", async () => {
    await usersService.updateVendedorSenha(TENANT_A, vendedorIdB, "HACKED-SENHA-HASH");

    const rowB = await readVendedorRow(vendedorIdB);
    expect(rowB).not.toBeNull();
    expect(rowB!.senha).toBe(B_SENHA_ORIG);
  });

  itWithServiceContext("deleteVendedor cross-tenant é bloqueado pelo WHERE (B continua existindo)", async () => {
    await usersService.deleteVendedor(TENANT_A, vendedorIdB);

    const rowB = await readVendedorRow(vendedorIdB);
    expect(rowB).not.toBeNull();
    expect(rowB!.id).toBe(vendedorIdB);
    expect(rowB!.tenantId).toBe(TENANT_B);
  });

  itWithServiceContext("deleteVendedor positivo no próprio tenant remove o registro", async () => {
    await usersService.deleteVendedor(TENANT_A, vendedorIdAExtra);

    const rowAExtra = await readVendedorRow(vendedorIdAExtra);
    expect(rowAExtra).toBeNull();
  });

  itWithServiceContext("ausência explícita de efeitos cross-tenant após todas as tentativas", async () => {
    // Tenant B: registro intacto em todos os campos sentinelas
    const rowB = await readVendedorRow(vendedorIdB);
    expect(rowB).not.toBeNull();
    expect(rowB!.tenantId).toBe(TENANT_B);
    expect(rowB!.nome).toBe(nomeB);
    expect(rowB!.telefone).toBe(B_TELEFONE_ORIG);
    expect(rowB!.senha).toBe(B_SENHA_ORIG);
    expect(rowB!.ativo).toBe(true);

    // Tenant A: registro principal reflete apenas as mutações legítimas
    const rowA = await readVendedorRow(vendedorIdA);
    expect(rowA).not.toBeNull();
    expect(rowA!.tenantId).toBe(TENANT_A);
    expect(rowA!.telefone).toBe("A-NEW-TELEFONE");
    expect(rowA!.senha).toBe("A-NEW-SENHA-HASH");

    // Nenhuma linha de B foi transferida ou clonada para o tenant A
    const rowsA = await dbConn
      .select()
      .from(vendedores)
      .where(eq(vendedores.tenantId, TENANT_A));
    expect(rowsA.some((v) => v.id === vendedorIdB)).toBe(false);
  });
});
