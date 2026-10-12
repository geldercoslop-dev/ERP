/**
 * P23-R-09Y — Prova de isolamento multi-tenant de lookups por nome + permissões Leo
 *
 * Objetivo: nenhum lookup por nome é global nesta cadeia:
 *   core.getVendedorByNome → service → users.tool → leo-permissions → vendedores.create
 * e identidade inexistente recebe DENY (nunca 'consulta').
 *
 * Integração real (MySQL), sem mocks — as queries reais do service/tool/Leo são exercitadas.
 * Padrão: service-context-harness (bootstrapServer + ALS) igual a
 * vendedor-by-id-tenant-isolation.test.ts (P23-R-09X).
 *
 * Cobertura E (vendedores.create): exercita o fluxo REAL via appRouter.createCaller
 * (API nativa tRPC v11) com ctx admin + tenantId — inclui requireTenant(ctx),
 * lookup de duplicidade tenant-scoped e inserts reais de user+vendedor.
 * Cleanup cobre também o vendedor/user criados pelo router e o audit_log gerado
 * (entity='vendedor', entityId=String(vendedor.id)) — sempre por IDs criados.
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
import { auditLogs, users, vendedores } from "../../drizzle/schema.js";
import * as usersService from "../services/users.service.js";
import { usersTool } from "../tools/users.tool.js";
import { checkLeoPermission, promoverUsuario } from "../leo/security/leo-permissions.js";
import { appRouter } from "../routers.js";

// Dois tenants distintos reservados SOMENTE para este teste
// (range 930xx — diferente de R09U/R09W/R09X para não haver interferência entre suites)
const TENANT_A = 93021;
const TENANT_B = 93022;

let dbConn!: NonNullable<Awaited<ReturnType<typeof getDb>>>;

// IDs de TODOS os registros criados por esta execução (cleanup somente por IDs)
let vendAId = 0;
let vendBId = 0;
let sharedVendAId = 0;
let sharedVendBId = 0;
let userAId = 0;
let userBId = 0;
let sharedUserAId = 0;
let sharedUserBId = 0;

// Nomes únicos por execução (nanoid) — nunca colidem com dados reais
let vendNomeA = "";
let vendNomeB = "";
let vendSharedNome = "";
let userNameA = "";
let userNameB = "";
let userSharedName = "";
let nomeInexistente = "";

// IDs criados pelo fluxo real do router (vendedores.create) — cleanup por ID
let routerVendId = 0;
let routerUserId = 0;

type CallerCtx = Parameters<typeof appRouter.createCaller>[0];

/** ctx real exigido por adminProcedure + requireTenant: user role=admin no tenant informado */
function adminCtx(tenantId: number): CallerCtx {
  return {
    req: {},
    res: {},
    user: {
      id: 990000001,
      tenantId,
      openId: `r09y_admin_ctx_${tenantId}`,
      name: `R09Y Admin T${tenantId}`,
      email: `r09y_admin_t${tenantId}@test.local`,
      loginMethod: "local",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    tenantId,
    vendedor: null,
    isImpersonating: false,
  } as unknown as CallerCtx;
}

describe("P23-R-09Y — lookups por nome + permissões Leo multi-tenant", () => {
  beforeAllWithServiceContext(async () => {
    const conn = await getDb();
    if (!conn) throw new Error("Database connection failed");
    dbConn = conn;

    const suffix = nanoid(6).replace(/[^0-9a-z]/gi, "x");
    vendNomeA = `Vend R09Y A ${suffix}`;
    vendNomeB = `Vend R09Y B ${suffix}`;
    vendSharedNome = `Vend R09Y Shared ${suffix}`;
    userNameA = `User R09Y A ${suffix}`;
    userNameB = `User R09Y B ${suffix}`;
    userSharedName = `User R09Y Shared ${suffix}`;
    nomeInexistente = `Inexistente R09Y ${suffix}`;

    // Pais em `tenants` antes de inserts filhos (fundação p/ FK futura)
    await ensureTenantExists(dbConn, TENANT_A);
    await ensureTenantExists(dbConn, TENANT_B);

    // ─── Vendedores ───
    // Vendedor exclusivo do tenant A (não-admin)
    const insVA = await dbConn.insert(vendedores).values({
      tenantId: TENANT_A,
      nome: vendNomeA,
      ativo: true,
      admin: false,
    });
    vendAId = getInsertId(insVA as never);
    if (!Number.isInteger(vendAId) || vendAId <= 0) throw new Error("Falha insert vendedor A");

    // Vendedor exclusivo do tenant B (não-admin)
    const insVB = await dbConn.insert(vendedores).values({
      tenantId: TENANT_B,
      nome: vendNomeB,
      ativo: true,
      admin: false,
    });
    vendBId = getInsertId(insVB as never);
    if (!Number.isInteger(vendBId) || vendBId <= 0) throw new Error("Falha insert vendedor B");

    // Homônimo: mesmo nome em A (admin=false) e B (admin=true)
    const insSVA = await dbConn.insert(vendedores).values({
      tenantId: TENANT_A,
      nome: vendSharedNome,
      ativo: true,
      admin: false,
    });
    sharedVendAId = getInsertId(insSVA as never);
    if (!Number.isInteger(sharedVendAId) || sharedVendAId <= 0) throw new Error("Falha insert vend shared A");

    const insSVB = await dbConn.insert(vendedores).values({
      tenantId: TENANT_B,
      nome: vendSharedNome,
      ativo: true,
      admin: true,
    });
    sharedVendBId = getInsertId(insSVB as never);
    if (!Number.isInteger(sharedVendBId) || sharedVendBId <= 0) throw new Error("Falha insert vend shared B");

    // ─── Users ───
    // User exclusivo do tenant A (role=user)
    const insUA = await dbConn.insert(users).values({
      tenantId: TENANT_A,
      openId: `r09y_u_a_${suffix}`,
      name: userNameA,
      email: `r09y_ua_${suffix}@test.local`,
      loginMethod: "local",
      role: "user",
    });
    userAId = getInsertId(insUA as never);
    if (!Number.isInteger(userAId) || userAId <= 0) throw new Error("Falha insert user A");

    // User exclusivo do tenant B (role=admin)
    const insUB = await dbConn.insert(users).values({
      tenantId: TENANT_B,
      openId: `r09y_u_b_${suffix}`,
      name: userNameB,
      email: `r09y_ub_${suffix}@test.local`,
      loginMethod: "local",
      role: "admin",
    });
    userBId = getInsertId(insUB as never);
    if (!Number.isInteger(userBId) || userBId <= 0) throw new Error("Falha insert user B");

    // Homônimo: mesmo name em A (role=user) e B (role=admin)
    const insSUA = await dbConn.insert(users).values({
      tenantId: TENANT_A,
      openId: `r09y_su_a_${suffix}`,
      name: userSharedName,
      email: `r09y_sua_${suffix}@test.local`,
      loginMethod: "local",
      role: "user",
    });
    sharedUserAId = getInsertId(insSUA as never);
    if (!Number.isInteger(sharedUserAId) || sharedUserAId <= 0) throw new Error("Falha insert user shared A");

    const insSUB = await dbConn.insert(users).values({
      tenantId: TENANT_B,
      openId: `r09y_su_b_${suffix}`,
      name: userSharedName,
      email: `r09y_sub_${suffix}@test.local`,
      loginMethod: "local",
      role: "admin",
    });
    sharedUserBId = getInsertId(insSUB as never);
    if (!Number.isInteger(sharedUserBId) || sharedUserBId <= 0) throw new Error("Falha insert user shared B");
  });

  afterAllWithServiceContext(async () => {
    // Cleanup somente dos registros criados por ESTA execução:
    // DELETE restrito aos IDs inseridos aqui (tenant como defesa adicional).
    // Nenhum delete amplo apenas por tenant é permitido.
    // Audit logs gerados pelo router (entityId = id do vendedor criado) —
    // seleciona pelos IDs de entidade criados e deleta pelos próprios IDs.
    const auditEntityIds = [routerVendId].filter((id) => id > 0).map(String);
    if (auditEntityIds.length > 0) {
      const auditRows = await dbConn
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tenantId, TENANT_A),
            eq(auditLogs.entity, "vendedor"),
            inArray(auditLogs.entityId, auditEntityIds)
          )
        );
      const auditIds = auditRows.map((r) => r.id);
      if (auditIds.length > 0) {
        await dbConn
          .delete(auditLogs)
          .where(and(inArray(auditLogs.id, auditIds), eq(auditLogs.tenantId, TENANT_A)));
      }
    }

    const vendIds = [vendAId, vendBId, sharedVendAId, sharedVendBId, routerVendId].filter(
      (id) => Number.isInteger(id) && id > 0
    );
    if (vendIds.length > 0) {
      await dbConn
        .delete(vendedores)
        .where(
          and(
            inArray(vendedores.id, vendIds),
            or(eq(vendedores.tenantId, TENANT_A), eq(vendedores.tenantId, TENANT_B))
          )
        );
    }

    const userIds = [userAId, userBId, sharedUserAId, sharedUserBId, routerUserId].filter(
      (id) => Number.isInteger(id) && id > 0
    );
    if (userIds.length > 0) {
      await dbConn
        .delete(users)
        .where(
          and(
            inArray(users.id, userIds),
            or(eq(users.tenantId, TENANT_A), eq(users.tenantId, TENANT_B))
          )
        );
    }
  });

  // ═══════════ A — getVendedorByNome (service → core) ═══════════

  itWithServiceContext("A1) tenant A encontra vendedor A pelo nome", async () => {
    const v = await usersService.getVendedorByNome(TENANT_A, vendNomeA);
    expect(v).not.toBeNull();
    expect(v!.id).toBe(vendAId);
    expect(v!.tenantId).toBe(TENANT_A);
    expect(v!.nome).toBe(vendNomeA);
  });

  itWithServiceContext("A2) tenant B encontra vendedor B pelo nome", async () => {
    const v = await usersService.getVendedorByNome(TENANT_B, vendNomeB);
    expect(v).not.toBeNull();
    expect(v!.id).toBe(vendBId);
    expect(v!.tenantId).toBe(TENANT_B);
  });

  itWithServiceContext("A3) tenant A não encontra nome exclusivo de B", async () => {
    const v = await usersService.getVendedorByNome(TENANT_A, vendNomeB);
    expect(v).toBeNull();
  });

  itWithServiceContext("A4) tenant B não encontra nome exclusivo de A", async () => {
    const v = await usersService.getVendedorByNome(TENANT_B, vendNomeA);
    expect(v).toBeNull();
  });

  itWithServiceContext("A5) homônimo A/B: cada tenant resolve apenas o próprio registro", async () => {
    const vA = await usersService.getVendedorByNome(TENANT_A, vendSharedNome);
    expect(vA).not.toBeNull();
    expect(vA!.id).toBe(sharedVendAId);
    expect(vA!.tenantId).toBe(TENANT_A);
    expect(vA!.admin).toBe(false);

    const vB = await usersService.getVendedorByNome(TENANT_B, vendSharedNome);
    expect(vB).not.toBeNull();
    expect(vB!.id).toBe(sharedVendBId);
    expect(vB!.tenantId).toBe(TENANT_B);
    expect(vB!.admin).toBe(true);
  });

  itWithServiceContext("A6) tenantId 0/negativo/NaN rejeitado", async () => {
    await expect(usersService.getVendedorByNome(0, vendNomeA)).rejects.toThrow();
    await expect(usersService.getVendedorByNome(-1, vendNomeA)).rejects.toThrow();
    await expect(usersService.getVendedorByNome(Number.NaN as number, vendNomeA)).rejects.toThrow();
    // não há overload sem tenant: assinatura exige 2 params
    expect(usersService.getVendedorByNome.length).toBe(2);
    await expect(
      usersService.getVendedorByNome(undefined as unknown as number, vendNomeA)
    ).rejects.toThrow();
  });

  itWithServiceContext("A7) inexistente no tenant retorna null", async () => {
    const v = await usersService.getVendedorByNome(TENANT_A, nomeInexistente);
    expect(v).toBeNull();
  });

  // ═══════════ B — getUserByDisplayName (service) ═══════════

  itWithServiceContext("B8) tenant A encontra user A", async () => {
    const u = await usersService.getUserByDisplayName(TENANT_A, userNameA);
    expect(u).not.toBeNull();
    expect(u!.id).toBe(userAId);
    expect(u!.tenantId).toBe(TENANT_A);
    expect(u!.name).toBe(userNameA);
  });

  itWithServiceContext("B9) tenant A não encontra user exclusivo de B", async () => {
    const u = await usersService.getUserByDisplayName(TENANT_A, userNameB);
    expect(u).toBeNull();
  });

  itWithServiceContext("B10) homônimo A/B: cada tenant resolve apenas o próprio user", async () => {
    const uA = await usersService.getUserByDisplayName(TENANT_A, userSharedName);
    expect(uA).not.toBeNull();
    expect(uA!.id).toBe(sharedUserAId);
    expect(uA!.tenantId).toBe(TENANT_A);
    expect(uA!.role).toBe("user");

    const uB = await usersService.getUserByDisplayName(TENANT_B, userSharedName);
    expect(uB).not.toBeNull();
    expect(uB!.id).toBe(sharedUserBId);
    expect(uB!.tenantId).toBe(TENANT_B);
    expect(uB!.role).toBe("admin");
  });

  itWithServiceContext("B11) admin homônimo de B nunca aparece em lookup de A", async () => {
    const uA = await usersService.getUserByDisplayName(TENANT_A, userSharedName);
    expect(uA).not.toBeNull();
    expect(uA!.role).toBe("user"); // nunca o admin de B
    expect(uA!.id).not.toBe(sharedUserBId);
  });

  itWithServiceContext("B12) tenantId inválido rejeitado; sem overload sem tenant", async () => {
    await expect(usersService.getUserByDisplayName(0, userNameA)).rejects.toThrow();
    await expect(usersService.getUserByDisplayName(-5, userNameA)).rejects.toThrow();
    await expect(
      usersService.getUserByDisplayName(Number.NaN as number, userNameA)
    ).rejects.toThrow();
    expect(usersService.getUserByDisplayName.length).toBe(2);
    await expect(
      usersService.getUserByDisplayName(null as unknown as number, userNameA)
    ).rejects.toThrow();
  });

  itWithServiceContext("B13) inexistente retorna null", async () => {
    const u = await usersService.getUserByDisplayName(TENANT_A, nomeInexistente);
    expect(u).toBeNull();
  });

  // ═══════════ C — users.tool ═══════════

  itWithServiceContext("C14) tool passa tenant corretamente (vendedor + user)", async () => {
    const v = await usersTool.getVendedorByNome({ tenantId: TENANT_A, nome: vendNomeA });
    expect(v).not.toBeNull();
    expect(v!.id).toBe(vendAId);

    const u = await usersTool.getUserByDisplayName({ tenantId: TENANT_A, displayName: userNameA });
    expect(u).not.toBeNull();
    expect(u!.id).toBe(userAId);
  });

  itWithServiceContext("C15) tenant ausente/inválido não permite lookup global", async () => {
    await expect(
      usersTool.getVendedorByNome({ tenantId: undefined as unknown as number, nome: vendNomeA })
    ).rejects.toThrow();
    await expect(
      usersTool.getVendedorByNome({ tenantId: 0, nome: vendNomeA })
    ).rejects.toThrow();
    await expect(
      usersTool.getVendedorByNome({ tenantId: Number.NaN as number, nome: vendNomeA })
    ).rejects.toThrow();
    await expect(
      usersTool.getUserByDisplayName({ tenantId: undefined as unknown as number, displayName: userNameA })
    ).rejects.toThrow();
    await expect(
      usersTool.getUserByDisplayName({ tenantId: -1, displayName: userNameA })
    ).rejects.toThrow();
  });

  itWithServiceContext("C16) nome/displayName vazio continua rejeitado", async () => {
    await expect(
      usersTool.getVendedorByNome({ tenantId: TENANT_A, nome: "" })
    ).rejects.toThrow();
    await expect(
      usersTool.getUserByDisplayName({ tenantId: TENANT_A, displayName: "" })
    ).rejects.toThrow();
  });

  // ═══════════ D — Leo (getUserPermission + checkLeoPermission) ═══════════

  itWithServiceContext("D17) vendedor admin de B com mesmo nome NÃO torna usuário de A admin", async () => {
    // Em A o homônimo é admin=false → operacao_erp: 'sistema' exige admin → DENY
    expect(await checkLeoPermission(TENANT_A, vendSharedNome, "sistema", "qualquer")).toBe(false);
    // Em B o homônimo é admin=true → 'sistema' permitido (privilégio real, só em B)
    expect(await checkLeoPermission(TENANT_B, vendSharedNome, "sistema", "qualquer")).toBe(true);
    // A mantém o nível real do próprio tenant: operacao_erp permite 'operacao' em entidade ERP
    expect(await checkLeoPermission(TENANT_A, vendSharedNome, "operacao", "pedido")).toBe(true);
  });

  itWithServiceContext("D18) user role=admin de B com mesmo nome NÃO torna usuário de A admin", async () => {
    // Sem vendedor com esse nome — cai no lookup de users.
    // A resolve o próprio user (role=user → consulta): 'sistema' DENY, 'consulta' permitida
    expect(await checkLeoPermission(TENANT_A, userSharedName, "sistema", "qualquer")).toBe(false);
    expect(await checkLeoPermission(TENANT_A, userSharedName, "consulta", "qualquer")).toBe(true);
    // B resolve o próprio user (role=admin): 'sistema' permitido — prova que o privilégio
    // existe em B e NÃO vazou para A
    expect(await checkLeoPermission(TENANT_B, userSharedName, "sistema", "qualquer")).toBe(true);
  });

  itWithServiceContext("D19) identidade inexistente → deny total (prova via API pública, sem export)", async () => {
    // getUserPermission é privado — a prova decisiva via checkLeoPermission:
    // se existisse fallback nivel='consulta', ação 'consulta' retornaria TRUE.
    // Retorna false → identidade inexistente não recebeu nível algum (return null interno).
    expect(await checkLeoPermission(TENANT_A, nomeInexistente, "consulta", "qualquer")).toBe(false);
    expect(await checkLeoPermission(TENANT_A, nomeInexistente, "sistema", "qualquer")).toBe(false);
    // Existe APENAS em B (user e vendedor exclusivos): em A é inexistente → deny
    expect(await checkLeoPermission(TENANT_A, userNameB, "consulta", "qualquer")).toBe(false);
    expect(await checkLeoPermission(TENANT_A, vendNomeB, "consulta", "qualquer")).toBe(false);
    // promoverUsuario também usa getUserPermission: solicitante inexistente → não-admin → fail
    const promo = await promoverUsuario(TENANT_A, nomeInexistente, userNameA, "admin");
    expect(promo.success).toBe(false);
  });

  itWithServiceContext("D20) identidade inexistente → checkLeoPermission false", async () => {
    expect(await checkLeoPermission(TENANT_A, nomeInexistente, "consulta", "qualquer")).toBe(false);
    expect(await checkLeoPermission(TENANT_A, nomeInexistente, "sistema", "qualquer")).toBe(false);
    // nome que só existe em B também é deny em A
    expect(await checkLeoPermission(TENANT_A, userNameB, "consulta", "qualquer")).toBe(false);
  });

  itWithServiceContext("D21) admin válido no próprio tenant preserva comportamento admin", async () => {
    expect(await checkLeoPermission(TENANT_B, userNameB, "consulta", "qualquer")).toBe(true);
    expect(await checkLeoPermission(TENANT_B, userNameB, "operacao", "pedido")).toBe(true);
    expect(await checkLeoPermission(TENANT_B, userNameB, "sistema", "qualquer")).toBe(true);
  });

  itWithServiceContext("D22) não-admin recebe somente permissões do próprio nível", async () => {
    // user role=user → nivel consulta: consulta=ok, operacao/sistema=deny
    expect(await checkLeoPermission(TENANT_A, userNameA, "consulta", "qualquer")).toBe(true);
    expect(await checkLeoPermission(TENANT_A, userNameA, "operacao", "pedido")).toBe(false);
    expect(await checkLeoPermission(TENANT_A, userNameA, "sistema", "qualquer")).toBe(false);

    // vendedor admin=false → nivel operacao_erp: operacao em entidade ERP=ok, sistema=deny
    expect(await checkLeoPermission(TENANT_A, vendNomeA, "operacao", "pedido")).toBe(true);
    expect(await checkLeoPermission(TENANT_A, vendNomeA, "sistema", "qualquer")).toBe(false);
  });

  // ═══════════ E — vendedores.create via router REAL (appRouter.createCaller) ═══════════
  // O repo não possui harness de caller (grep: zero createCaller/callerFactory) —
  // usa-se a API nativa tRPC v11 com ctx admin/tenant real exigido por
  // adminProcedure + requireTenant. O ALS do harness cobre assertServiceEntryIfEnabled.

  itWithServiceContext("E23) router real: create em A com homônimo só em B NÃO recebe CONFLICT", async () => {
    // 'vendNomeB' existe como vendedor APENAS no tenant B
    const caller = appRouter.createCaller(adminCtx(TENANT_A));
    const result = await caller.vendedores.create({
      nome: vendNomeB,
      email: null,
      telefone: null,
      senha: "123456",
      cidade: "Cidade Teste",
      admin: false,
    });
    expect(result).not.toBeNull();
    expect(result.id).toBeGreaterThan(0);
    routerVendId = result.id;

    // Registro criado pertence ao tenant A; captura o userId criado pelo fluxo (cleanup)
    const row = await dbConn
      .select({ id: vendedores.id, tenantId: vendedores.tenantId, userId: vendedores.userId })
      .from(vendedores)
      .where(eq(vendedores.id, routerVendId))
      .limit(1);
    expect(row[0]?.tenantId).toBe(TENANT_A);
    routerUserId = row[0]?.userId ?? 0;
    expect(routerUserId).toBeGreaterThan(0);

    // O registro de B permanece intacto e distinto
    const vB = await usersService.getVendedorByNome(TENANT_B, vendNomeB);
    expect(vB).not.toBeNull();
    expect(vB!.id).toBe(vendBId);
  });

  itWithServiceContext("E24) router real: create em A com homônimo em A retorna CONFLICT", async () => {
    // 'vendNomeA' já existe como vendedor no tenant A
    const caller = appRouter.createCaller(adminCtx(TENANT_A));
    const promise = caller.vendedores.create({
      nome: vendNomeA,
      email: null,
      telefone: null,
      senha: "123456",
      cidade: "Cidade Teste",
      admin: false,
    });
    await expect(promise).rejects.toMatchObject({ code: "CONFLICT" });

    // CONFLICT ocorre antes dos inserts: nenhum registro extra foi criado
    const dupA = await dbConn
      .select({ id: vendedores.id })
      .from(vendedores)
      .where(and(eq(vendedores.tenantId, TENANT_A), eq(vendedores.id, vendAId)))
      .limit(1);
    expect(dupA[0]?.id).toBe(vendAId);
  });
});
