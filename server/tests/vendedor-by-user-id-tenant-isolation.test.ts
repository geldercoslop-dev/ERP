/**
 * P23-R-09Z — Prova de isolamento multi-tenant de vendedor-por-userId + login + actor
 * Objetivo: NENHUM lookup de vendedor por userId é global; login nunca mistura
 * user de um tenant com vendedor/senha/role/admin de outro tenant.
 * Integração real (MySQL), sem mocks de DB — queries reais do service e do
 * router (appRouter.createCaller) são exercitadas.
 * Padrão: service-context-harness (bootstrapServer + ALS) igual a
 * vendedor-by-id-tenant-isolation.test.ts (P23-R-09X) e
 * name-permission-tenant-isolation.test.ts (P23-R-09Y).
 *
 * Fixture deliberada: vendedor X no tenant B com userId do user A simula a
 * ambiguidade real que o lookup global explorava.
 */

import "dotenv/config";
import { describe, expect } from "vitest";
import { and, eq, inArray, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { getDb, getInsertId } from "../db/index.js";
import {
  afterAllWithServiceContext,
  beforeAllWithServiceContext,
  itWithServiceContext,
} from "./integration/service-context-harness.js";
import { ensureTenantExists } from "./integration/helpers/tenant.helper.js";
import {
  users,
  vendedores,
  clientes,
  clienteVendedores,
  pedidos,
  itensPedido,
  contasReceber,
  counters,
  idempotencyKeys,
} from "../../drizzle/schema.js";
import * as usersService from "../services/users.service.js";
import { appRouter } from "../routers.js";
import { createContext } from "../_core/context.js";
import { jwtAuth } from "../security/jwt-auth.js";
import { resolveServiceActor } from "../_core/service-actor.js";
import { validateTenantOwnership } from "../_core/tenant-ownership.js";

// Dois tenants distintos reservados SOMENTE para este teste
// (range 94xxx — 93021/93022 colidia com R09Y name-permission; range 94 resolve)
const TENANT_A = 94031;
const TENANT_B = 94032;

const SENHA_A = "r09z-Senha-A!";
const SENHA_B = "r09z-Senha-B!";
const SENHA_X = "r09z-Senha-X!"; // senha do vendedor venenoso — DIFERENTE de A

let dbConn!: NonNullable<Awaited<ReturnType<typeof getDb>>>;

// IDs criados por ESTA execução — cleanup somente por IDs
let userAId = 0;
let userBId = 0;
let vendAId = 0;
let vendBId = 0;
let vendXId = 0;
let clienteAId = 0;
let clienteVendLinkId = 0;
let pedidoCriadoId = 0;
let pedidoCriadoNumero = 0;
let counterPedidoIdAntes: number | null = null;
let openIdA = "";
let openIdB = "";
let nomeVendA = "";
let nomeVendB = "";
let vendARow: (typeof vendedores.$inferSelect) | null = null;
let vendXRow: (typeof vendedores.$inferSelect) | null = null;
let userARow: (typeof users.$inferSelect) | null = null;

type CallerCtx = Parameters<typeof appRouter.createCaller>[0];

/** ctx real exigido por auth.login (publicProcedure): req/res mínimos */
function loginCtx(): { ctx: CallerCtx; cookies: Array<{ name: string; value: string }> } {
  const cookies: Array<{ name: string; value: string }> = [];
  const ctx = {
    req: { hostname: "localhost", headers: {}, socket: { remoteAddress: "127.0.0.1" } },
    res: {
      cookie(name: string, value: string) {
        cookies.push({ name, value });
      },
    },
    user: null,
    tenantId: null,
    vendedor: null,
    isImpersonating: false,
  } as unknown as CallerCtx;
  return { ctx, cookies };
}

/** ctx de actor para resolveServiceActor: user não-admin autenticado no tenant */
function actorCtx(tenantId: number, userId: number, vendedor: unknown = null): Parameters<typeof resolveServiceActor>[0] {
  return {
    user: {
      id: userId,
      tenantId,
      openId: `r09z_actor_${userId}`,
      name: `R09Z Actor ${userId}`,
      email: `r09z_actor_${userId}@test.local`,
      loginMethod: "local",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    tenantId,
    vendedor,
  } as unknown as Parameters<typeof resolveServiceActor>[0];
}

describe("P23-R-09Z — vendedor por userId + login + actor multi-tenant", () => {
  beforeAllWithServiceContext(async () => {
    const conn = await getDb();
    if (!conn) throw new Error("Database connection failed");
    dbConn = conn;

    const suffix = nanoid(6).replace(/[^0-9a-z]/gi, "x");
    openIdA = `r09z_a_${suffix}@test.local`;
    openIdB = `r09z_b_${suffix}@test.local`;
    nomeVendA = `Vend R09Z A ${suffix}`;
    nomeVendB = `Vend R09Z B ${suffix}`;

    // Pais em `tenants` antes de inserts filhos (fundação p/ FK futura)
    await ensureTenantExists(dbConn, TENANT_A);
    await ensureTenantExists(dbConn, TENANT_B);

    // ─── Users ───
    const insUA = await dbConn.insert(users).values({
      tenantId: TENANT_A,
      openId: openIdA,
      name: `User R09Z A ${suffix}`,
      email: openIdA,
      loginMethod: "local",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    });
    userAId = getInsertId(insUA as never);
    if (!Number.isInteger(userAId) || userAId <= 0) throw new Error("Falha insert user A");

    const insUB = await dbConn.insert(users).values({
      tenantId: TENANT_B,
      openId: openIdB,
      name: `User R09Z B ${suffix}`,
      email: openIdB,
      loginMethod: "local",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    });
    userBId = getInsertId(insUB as never);
    if (!Number.isInteger(userBId) || userBId <= 0) throw new Error("Falha insert user B");

    // ─── Vendedores ───
    // Vendedor A: tenant A, userId=userA, senha A, admin=false
    const hashA = await bcrypt.hash(SENHA_A, 10);
    const insVA = await dbConn.insert(vendedores).values({
      tenantId: TENANT_A,
      userId: userAId,
      nome: nomeVendA,
      email: openIdA,
      senha: hashA,
      admin: false,
      ativo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vendAId = getInsertId(insVA as never);
    if (!Number.isInteger(vendAId) || vendAId <= 0) throw new Error("Falha insert vendedor A");

    // Vendedor B: tenant B, userId=userB, senha B, admin=false
    const hashB = await bcrypt.hash(SENHA_B, 10);
    const insVB = await dbConn.insert(vendedores).values({
      tenantId: TENANT_B,
      userId: userBId,
      nome: nomeVendB,
      email: openIdB,
      senha: hashB,
      admin: false,
      ativo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vendBId = getInsertId(insVB as never);
    if (!Number.isInteger(vendBId) || vendBId <= 0) throw new Error("Falha insert vendedor B");

    // Vendedor X venenoso: tenant B, userId=userA, senha X (diferente), admin=TRUE
    // (simula vazamento de privilégio se o lookup fosse global)
    const hashX = await bcrypt.hash(SENHA_X, 10);
    const insVX = await dbConn.insert(vendedores).values({
      tenantId: TENANT_B,
      userId: userAId,
      nome: `Vend R09Z X ${suffix}`,
      email: `r09z_x_${suffix}@test.local`,
      senha: hashX,
      admin: true,
      ativo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vendXId = getInsertId(insVX as never);
    if (!Number.isInteger(vendXId) || vendXId <= 0) throw new Error("Falha insert vendedor X");

    // ─── Cliente + vínculo (para fluxo real de pedido) ───
    const insCli = await dbConn.insert(clientes).values({
      tenantId: TENANT_A,
      nome: `Cliente R09Z A ${suffix}`,
      telefone: `1190000${suffix.replace(/\D/g, "0")}`.slice(0, 20),
      telefoneNorm: `r09z${suffix}`,
      nomeNorm: `cliente r09z a ${suffix}`,
      sobrenomeNorm: `x${suffix}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    clienteAId = getInsertId(insCli as never);
    if (!Number.isInteger(clienteAId) || clienteAId <= 0) throw new Error("Falha insert cliente A");

    // vínculo vendedor↔cliente (getClienteRowForPedidoCreate exige para actor vendedor)
    const insCV = await dbConn.insert(clienteVendedores).values({
      tenantId: TENANT_A,
      clienteId: clienteAId,
      vendedorId: vendAId,
      tipo: "PRINCIPAL",
      createdAt: new Date(),
    });
    clienteVendLinkId = getInsertId(insCV as never);
    if (!Number.isInteger(clienteVendLinkId) || clienteVendLinkId <= 0) {
      throw new Error("Falha insert clienteVendedores");
    }

    // Snapshot: counter 'pedidos' do tenant A ANTES do teste (cleanup preciso)
    const ctrRows = await dbConn
      .select({ id: counters.id })
      .from(counters)
      .where(and(eq(counters.tenantId, TENANT_A), eq(counters.name, "pedidos")))
      .limit(1);
    counterPedidoIdAntes = ctrRows.length > 0 ? ctrRows[0].id : null;

    // Rows completas para testes de ctx.vendedor
    const vA = await dbConn.select().from(vendedores).where(eq(vendedores.id, vendAId)).limit(1);
    const vX = await dbConn.select().from(vendedores).where(eq(vendedores.id, vendXId)).limit(1);
    const uA = await dbConn.select().from(users).where(eq(users.id, userAId)).limit(1);
    vendARow = vA[0] ?? null;
    vendXRow = vX[0] ?? null;
    userARow = uA[0] ?? null;
    if (!vendARow || !vendXRow || !userARow) throw new Error("Falha ao reler fixtures");
  });

  afterAllWithServiceContext(async () => {
    // Cleanup somente dos registros criados por ESTA execução:
    // DELETE restrito aos IDs inseridos aqui (tenant como defesa adicional).
    // Nenhum delete amplo por tenant é permitido.
    // Artefatos do pedido real criado pelo router (P2)
    // ORDEM importa: filhos de vendedores/clientes PRIMEIRO (FKs), depois pais.
    if (Number.isInteger(pedidoCriadoId) && pedidoCriadoId > 0) {
      await dbConn.delete(itensPedido).where(eq(itensPedido.pedidoId, pedidoCriadoId));
      await dbConn
        .delete(contasReceber)
        .where(and(eq(contasReceber.tenantId, TENANT_A), eq(contasReceber.pedidoNumero, pedidoCriadoNumero)));
      await dbConn.delete(pedidos).where(eq(pedidos.id, pedidoCriadoId));
    }
    // idempotency_keys geradas pelo createPedido deste tenant de teste
    const idemRows = await dbConn
      .select({ id: idempotencyKeys.id })
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.tenantId, TENANT_A), eq(idempotencyKeys.commandName, "createPedido")));
    const idemIds = idemRows.map((r) => r.id);
    if (idemIds.length > 0) {
      await dbConn.delete(idempotencyKeys).where(inArray(idempotencyKeys.id, idemIds));
    }
    // counter 'pedidos' só é apagado se foi criado por ESTA execução
    if (counterPedidoIdAntes === null) {
      const ctrNow = await dbConn
        .select({ id: counters.id })
        .from(counters)
        .where(and(eq(counters.tenantId, TENANT_A), eq(counters.name, "pedidos")))
        .limit(1);
      if (ctrNow.length > 0) {
        await dbConn.delete(counters).where(eq(counters.id, ctrNow[0].id));
      }
    }
    if (Number.isInteger(clienteVendLinkId) && clienteVendLinkId > 0) {
      await dbConn.delete(clienteVendedores).where(eq(clienteVendedores.id, clienteVendLinkId));
    }
    if (Number.isInteger(clienteAId) && clienteAId > 0) {
      await dbConn.delete(clientes).where(eq(clientes.id, clienteAId));
    }

    const vids = [vendAId, vendBId, vendXId].filter((id) => Number.isInteger(id) && id > 0);
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

    const uids = [userAId, userBId].filter((id) => Number.isInteger(id) && id > 0);
    if (uids.length > 0) {
      await dbConn
        .delete(users)
        .where(
          and(
            inArray(users.id, uids),
            or(eq(users.tenantId, TENANT_A), eq(users.tenantId, TENANT_B))
          )
        );
    }

    // POST-CLEANUP: count = 0 dos IDs criados
    const vidsAlive = await dbConn
      .select({ id: vendedores.id })
      .from(vendedores)
      .where(inArray(vendedores.id, vids.length > 0 ? vids : [-1]));
    const uidsAlive = await dbConn
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, uids.length > 0 ? uids : [-1]));
    if (vidsAlive.length !== 0 || uidsAlive.length !== 0) {
      throw new Error(`POST-CLEANUP falhou: vendedores=${vidsAlive.length} users=${uidsAlive.length}`);
    }
    if (Number.isInteger(pedidoCriadoId) && pedidoCriadoId > 0) {
      const pedidoAlive = await dbConn.select({ id: pedidos.id }).from(pedidos).where(eq(pedidos.id, pedidoCriadoId));
      const cliAlive = await dbConn.select({ id: clientes.id }).from(clientes).where(eq(clientes.id, clienteAId));
      if (pedidoAlive.length !== 0 || cliAlive.length !== 0) {
        throw new Error(`POST-CLEANUP falhou: pedido=${pedidoAlive.length} cliente=${cliAlive.length}`);
      }
    }
  });

  // ═══════════ A — getVendedorByUserId tenant-first ═══════════

  itWithServiceContext("A1) getVendedorByUserId(A, userA) retorna somente vendedor A", async () => {
    const v = await usersService.getVendedorByUserId(TENANT_A, userAId);
    expect(v).not.toBeNull();
    expect(v!.id).toBe(vendAId);
    expect(v!.tenantId).toBe(TENANT_A);
    expect(v!.userId).toBe(userAId);
    expect(v!.id).not.toBe(vendXId);
  });

  itWithServiceContext("A2) getVendedorByUserId(B, userA) retorna X de B — NUNCA A", async () => {
    const v = await usersService.getVendedorByUserId(TENANT_B, userAId);
    expect(v).not.toBeNull();
    expect(v!.id).toBe(vendXId);
    expect(v!.tenantId).toBe(TENANT_B);
    expect(v!.id).not.toBe(vendAId);
  });

  itWithServiceContext("A3) getVendedorByUserId(A, userB) retorna null", async () => {
    const v = await usersService.getVendedorByUserId(TENANT_A, userBId);
    expect(v).toBeNull();
  });

  itWithServiceContext("A4) tenantId inválido é rejeitado por assertTenantId", async () => {
    await expect(usersService.getVendedorByUserId(0, userAId)).rejects.toThrow();
    await expect(usersService.getVendedorByUserId(-1, userAId)).rejects.toThrow();
    await expect(usersService.getVendedorByUserId(Number.NaN, userAId)).rejects.toThrow();
    await expect(
      usersService.getVendedorByUserId(undefined as unknown as number, userAId)
    ).rejects.toThrow();
    await expect(
      usersService.getVendedorByUserId(null as unknown as number, userAId)
    ).rejects.toThrow();
  });

  itWithServiceContext("A5) assinatura exige tenantId — não existe overload global de 1 argumento", async () => {
    expect(usersService.getVendedorByUserId.length).toBe(2);
  });

  // ═══════════ L — LOGIN REAL via appRouter.createCaller ═══════════

  itWithServiceContext("L1) login legítimo A: user A / senha A → vendedor A, tenant A", async () => {
    const { ctx, cookies } = loginCtx();
    const caller = appRouter.createCaller(ctx);
    const res = await caller.auth.login({ username: openIdA, password: SENHA_A });

    expect(res.ok).toBe(true);
    expect(res.openId).toBe(openIdA);
    expect(res.name).toBe(nomeVendA);
    expect(res.role).toBe("vendedor");
    expect(res.vendedorId).toBe(vendAId);
    expect(res.vendedorId).not.toBe(vendXId);
    // P23-R-10B: session token é JWT assinado — payload carrega user/tenant/vendedor corretos
    const payload = jwtAuth.verifyAccessToken(res.sessionToken!);
    expect(payload.userId).toBe(userAId);
    expect(payload.tenantId).toBe(TENANT_A);
    expect(payload.vendedorId).toBe(vendAId);
    expect(payload.vendedorId).not.toBe(vendXId);
    // cookie session emitido pelo servidor carrega o MESMO JWT retornado ao client
    expect(cookies.some((c) => c.value === res.sessionToken)).toBe(true);
  });

  itWithServiceContext("L2) senha errada falha com erro de autenticação (não 500)", async () => {
    const { ctx } = loginCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.auth.login({ username: openIdA, password: "senha-totalmente-errada" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  itWithServiceContext("L3) vendedor venenoso cross-tenant: senha de X NÃO autentica user A", async () => {
    // X está no tenant B com userId = userA e senha SENHA_X.
    // Se o lookup fosse global, X poderia ser selecionado e autenticar A com a senha de X.
    const { ctx } = loginCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.auth.login({ username: openIdA, password: SENHA_X })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  itWithServiceContext("L4) mesmo com X existindo em B, login de A usa vendedor A", async () => {
    const { ctx } = loginCtx();
    const caller = appRouter.createCaller(ctx);
    const res = await caller.auth.login({ username: openIdA, password: SENHA_A });

    expect(res.ok).toBe(true);
    expect(res.vendedorId).toBe(vendAId);
    // JWT assinado aponta para vendedor A no tenant A — nunca para X de B
    const payload = jwtAuth.verifyAccessToken(res.sessionToken!);
    expect(payload.vendedorId).toBe(vendAId);
    expect(payload.vendedorId).not.toBe(vendXId);
    expect(payload.tenantId).toBe(TENANT_A);
    expect(payload.userId).toBe(userAId);
  });

  itWithServiceContext("L5) role/admin não vaza: A é admin=false, X é admin=true → resposta é vendedor", async () => {
    const { ctx } = loginCtx();
    const caller = appRouter.createCaller(ctx);
    const res = await caller.auth.login({ username: openIdA, password: SENHA_A });

    expect(res.role).toBe("vendedor"); // nunca "admin" do X
    expect(res.vendedorId).toBe(vendAId);
  });

  itWithServiceContext("L6) login legítimo B: user B / senha B → vendedor B, tenant B", async () => {
    const { ctx } = loginCtx();
    const caller = appRouter.createCaller(ctx);
    const res = await caller.auth.login({ username: openIdB, password: SENHA_B });

    expect(res.ok).toBe(true);
    expect(res.openId).toBe(openIdB);
    expect(res.name).toBe(nomeVendB);
    expect(res.role).toBe("vendedor");
    expect(res.vendedorId).toBe(vendBId);
    const payload = jwtAuth.verifyAccessToken(res.sessionToken!);
    expect(payload.userId).toBe(userBId);
    expect(payload.tenantId).toBe(TENANT_B);
    expect(payload.vendedorId).toBe(vendBId);
  });

  // ═══════════ ACTOR / CONTEXTO ═══════════

  itWithServiceContext("C1) resolveServiceActor(ctx A) resolve vendedor A mesmo com X venenoso em B", async () => {
    const actor = await resolveServiceActor(actorCtx(TENANT_A, userAId));
    expect(actor.role).toBe("vendedor");
    expect(actor.vendedorId).toBe(vendAId);
    expect(actor.vendedorId).not.toBe(vendXId);
    expect(actor.userId).toBe(userAId);
  });

  itWithServiceContext("C2) ctx.vendedor cross-tenant (X de B com tenantId=A) é rejeitado — fail closed", async () => {
    const vendXRow = await dbConn.select().from(vendedores).where(eq(vendedores.id, vendXId)).limit(1);
    expect(vendXRow.length).toBe(1);
    await expect(
      resolveServiceActor(actorCtx(TENANT_A, userAId, vendXRow[0]))
    ).rejects.toThrow();
  });

  // ═══════════ PEDIDO/VENDA — fronteira de seleção de vendedor ═══════════

  itWithServiceContext("P1) barreira de pedido/venda: vendedor X de B não é selecionável com tenant A", async () => {
    // Reproduz o lookup que o fluxo de venda executa no router:
    //   vendedor = await usersService.getVendedorById(input.vendedorId, tenantId-do-contexto)
    // e a resolução do actor usada por services downstream.
    const selecionado = await usersService.getVendedorById(vendXId, TENANT_A);
    expect(selecionado).toBeNull();
    const actor = await resolveServiceActor(actorCtx(TENANT_A, userAId));
    expect(actor.vendedorId).toBe(vendAId);
    expect(actor.vendedorId).not.toBe(vendXId);
  });

  // ═══════════ G — getVendedorFromContext FAIL-CLOSED (via procedures reais) ═══════════
  // clientes.vinculate chama getVendedorFromContext ANTES de requireTenant →
  // exercita a rejeição de ctx.vendedor com tenantId ausente.
  // pendencias.list chama requireTenant + getVendedorFromContext →
  // exercita ALLOW/cross-tenant com tenantId válido.

  itWithServiceContext("G1) ctx.vendedor=A + tenantId ausente → REJECT (fail closed)", async () => {
    const caller = appRouter.createCaller({
      req: {},
      res: {},
      user: userARow,
      tenantId: null,
      vendedor: vendARow,
      isImpersonating: false,
    } as unknown as CallerCtx);
    // REJECT ocorre — tenantId ausente é barrado já na borda (requireUser→tenant guard/entry-guard),
    // UNAUTHORIZED ou FORBIDDEN conforme a camada que rejeita primeiro.
    await expect(
      caller.clientes.vinculate({ clienteId: clienteAId })
    ).rejects.toMatchObject({ code: expect.stringMatching(/^(UNAUTHORIZED|FORBIDDEN)$/) });
  });

  itWithServiceContext("G2) ctx.vendedor=X(B) + tenantId=A → REJECT (cross-tenant)", async () => {
    const caller = appRouter.createCaller({
      req: {},
      res: {},
      user: userARow,
      tenantId: TENANT_A,
      vendedor: vendXRow,
      isImpersonating: false,
    } as unknown as CallerCtx);
    await expect(
      caller.clientes.vinculate({ clienteId: clienteAId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  itWithServiceContext("G3) ctx.vendedor sem tenantId + tenantId=A → REJECT", async () => {
    const caller = appRouter.createCaller({
      req: {},
      res: {},
      user: userARow,
      tenantId: TENANT_A,
      vendedor: { ...vendARow, tenantId: null },
      isImpersonating: false,
    } as unknown as CallerCtx);
    await expect(
      caller.clientes.vinculate({ clienteId: clienteAId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  itWithServiceContext("G4) ctx.vendedor=A + tenantId=A → ALLOW (procedure responde)", async () => {
    const caller = appRouter.createCaller({
      req: {},
      res: {},
      user: userARow,
      tenantId: TENANT_A,
      vendedor: vendARow,
      isImpersonating: false,
    } as unknown as CallerCtx);
    // pendencias.list passa por requireTenant + getVendedorFromContext → lista vazia OK
    const lista = await caller.pendencias.list();
    expect(Array.isArray(lista)).toBe(true);
  });

  // ═══════════ L7 — ENTRADA REAL PÓS-LOGIN (createContext oficial) ═══════════

  itWithServiceContext("L7) token JWT do login É consumido por createContext — identidade real + auth.me + protectedProcedure", async () => {
    // 1) Login real produz JWT de sessão (P23-R-10B: substitui o antigo 'v:tenant:vend')
    const { ctx } = loginCtx();
    const caller = appRouter.createCaller(ctx);
    const res = await caller.auth.login({ username: openIdA, password: SENHA_A });
    expect(res.ok).toBe(true);
    const token = res.sessionToken; // JWT assinado — valor opaco, não impresso
    expect(typeof token).toBe("string");

    // 2) Passa o token pelo mecanismo OFICIAL que reconstrói o contexto (createContext)
    //    exatamente como o client real faz: cookie + x-session-token + Bearer
    const req = {
      headers: {
        cookie: `session=${token}`,
        "x-session-token": token,
        authorization: `Bearer ${token}`,
        host: "localhost",
      },
      hostname: "localhost",
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as Parameters<typeof createContext>[0]["req"];
    const res2 = { cookie: () => undefined, clearCookie: () => undefined } as unknown as Parameters<
      typeof createContext
    >[0]["res"];

    const rebuilt = await createContext({ req, res: res2 });

    // 3) P23-R-10B: o JWT é verificado (assinatura/exp) e a identidade revalidada no DB —
    //    user real, tenant real, vendedor real (tenant-safe: nunca X de B).
    expect(rebuilt.user?.id).toBe(userAId);
    expect(rebuilt.tenantId).toBe(TENANT_A);
    expect(rebuilt.vendedor?.id).toBe(vendAId);
    expect(rebuilt.vendedor?.id).not.toBe(vendXId);
    expect(rebuilt.vendedor?.userId).toBe(userAId);
    expect(rebuilt.vendedor?.ativo).toBe(true);
    expect(rebuilt.isImpersonating).toBe(false);

    const callerAfterLogin = appRouter.createCaller({
      req,
      res: res2,
      user: rebuilt.user,
      tenantId: rebuilt.tenantId,
      vendedor: rebuilt.vendedor,
      isImpersonating: rebuilt.isImpersonating,
    } as unknown as CallerCtx);
    // auth.me resolve a identidade real
    const me = await callerAfterLogin.auth.me();
    expect(me?.id).toBe(userAId);
    // protectedProcedure real funciona com a sessão reconstruída
    const lista = await callerAfterLogin.pendencias.list();
    expect(Array.isArray(lista)).toBe(true);
  });

  // ═══════════ P2 — FLUXO REAL DE PEDIDO PERSISTIDO ═══════════

  itWithServiceContext("P2) pedidos.create real no tenant A → linha persistida tenant=A vendedor=A (≠X)", async () => {
    // ctx autenticado como user A (não-admin), exatamente o shape que createContext
    // produziria para uma sessão válida — com o vendedor venenoso X existindo em B.
    const caller = appRouter.createCaller({
      req: {},
      res: {},
      user: userARow,
      tenantId: TENANT_A,
      vendedor: null,
      isImpersonating: false,
    } as unknown as CallerCtx);

    const created = await caller.pedidos.create({
      clienteId: clienteAId,
      itens: [
        {
          tipo: "LIVRE" as const,
          descricao: `Item R09Z ${nanoid(4)}`,
          quantidade: 1,
          valorUnitario: 10,
        },
      ],
    });

    pedidoCriadoId = created.pedidoId;
    pedidoCriadoNumero = created.numero;
    expect(created.pedidoId).toBeGreaterThan(0);

    // Consultar a linha persistida — prova real no banco
    const rows = await dbConn
      .select()
      .from(pedidos)
      .where(eq(pedidos.id, pedidoCriadoId))
      .limit(1);
    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row.tenantId).toBe(TENANT_A);
    expect(row.vendedorId).toBe(vendAId);
    expect(row.vendedorId).not.toBe(vendXId);
    expect(row.clienteId).toBe(clienteAId);
  });

  // ═══════════ TENANT-OWNERSHIP ═══════════

  itWithServiceContext("O1) claimed tenant B para user A → REJECT", async () => {
    await expect(
      validateTenantOwnership(userAId, TENANT_B)
    ).rejects.toThrow();
  });

  itWithServiceContext("O2) claimed vendedor X(B) para user A(A) → REJECT", async () => {
    await expect(
      validateTenantOwnership(userAId, TENANT_A, { claimedVendedorId: vendXId })
    ).rejects.toThrow();
  });

  itWithServiceContext("O3) claimed vendedor A para user A → ALLOW (identidade coerente)", async () => {
    const identity = await validateTenantOwnership(userAId, TENANT_A, {
      claimedVendedorId: vendAId,
    });
    expect(identity.tenantId).toBe(TENANT_A);
    expect(identity.userId).toBe(userAId);
    expect(identity.vendedorId).toBe(vendAId);
    expect(identity.role).toBe("vendedor");
  });

  itWithServiceContext("O4) claimed vendedor B para user B → ALLOW no tenant B", async () => {
    const identity = await validateTenantOwnership(userBId, TENANT_B, {
      claimedVendedorId: vendBId,
    });
    expect(identity.tenantId).toBe(TENANT_B);
    expect(identity.vendedorId).toBe(vendBId);
  });
});
