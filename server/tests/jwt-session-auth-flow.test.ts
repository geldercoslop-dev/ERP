/**
 * P23-R-10B — Prova do fluxo JWT de sessão ponta a ponta.
 * senha → auth.login → JWT assinado → createContext (assinatura + revalidação DB)
 * → ctx.user/tenantId/vendedor corretos → auth.me → protectedProcedure.
 * Integração real (MySQL), sem mocks de DB. Padrão service-context-harness.
 *
 * REGRA ZERO: formatos u:<id>, v:<id>, v:<tenant>:<id>, "admin-session" e
 * "vendedor-session" NUNCA autenticam — prova explícita nesta suite.
 */

import "dotenv/config";
import { describe, expect } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDb, getInsertId } from "../db/index.js";
import { jwtAuth, getJwtAuth } from "../security/jwt-auth.js";
import {
  afterAllWithServiceContext,
  beforeAllWithServiceContext,
  itWithServiceContext,
} from "./integration/service-context-harness.js";
import { ensureTenantExists } from "./integration/helpers/tenant.helper.js";
import { users, vendedores } from "../../drizzle/schema.js";
import * as usersService from "../services/users.service.js";
import { appRouter } from "../routers.js";
import { smartAuthRouter } from "../routers/smart-auth.js";
import { createContext } from "../_core/context.js";

// Tenants reservados SOMENTE para esta suite (range 95xxx — sem colisão)
const TENANT_C = 95011;
const TENANT_D = 95012;

const ADMIN_SENHA = "r10b-admin-senha!";
const SENHA_VEND = "r10b-vend-senha!";
const SENHA_VEND_ADMIN = "r10b-vendadm-senha!";

let dbConn!: NonNullable<Awaited<ReturnType<typeof getDb>>>;

// IDs criados por ESTA execução — cleanup somente por IDs
let userAdminId = 0;
let userVendId = 0;
let userVendAdmId = 0;
let userFlipId = 0;
let userDelId = 0;
let vendId = 0;
let vendAdmId = 0;
let vendDelId = 0;
let vendXId = 0; // tenant D, userId apontando para userVend (cross-tenant venenoso)
let openIdAdmin = "";
let openIdVend = "";
let openIdVendAdm = "";
let openIdFlip = "";
let openIdDel = "";

type CallerCtx = Parameters<typeof appRouter.createCaller>[0];

/** ctx mínimo para auth.login (publicProcedure): req/res stubs que capturam cookies */
function loginCtx(): { ctx: CallerCtx; cookies: Array<{ name: string; value: string }> } {
  const cookies: Array<{ name: string; value: string }> = [];
  const ctx = {
    req: { hostname: "localhost", headers: {}, socket: { remoteAddress: "127.0.0.1" } },
    res: {
      cookie(name: string, value: string) {
        cookies.push({ name, value });
      },
      clearCookie(name: string) {
        cookies.push({ name, value: "" });
      },
      setHeader() {},
    },
    user: null,
    tenantId: null,
    vendedor: null,
    isImpersonating: false,
  } as unknown as CallerCtx;
  return { ctx, cookies };
}

/** Reconstrói contexto real via createContext (o que o servidor faz por request). */
async function rebuildContext(opts: {
  bearer?: string;
  sessionCookie?: string;
  adminSession?: string;
  xSessionToken?: string;
}) {
  const cookieParts: string[] = [];
  if (opts.sessionCookie) {
    cookieParts.push(`session=${opts.sessionCookie}`);
    cookieParts.push(`session_token=${opts.sessionCookie}`);
  }
  if (opts.adminSession) cookieParts.push(`admin_session=${opts.adminSession}`);
  const req = {
    hostname: "localhost",
    url: "/api/trpc/auth.me",
    originalUrl: "/api/trpc/auth.me",
    headers: {
      ...(opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : {}),
      ...(opts.xSessionToken ? { "x-session-token": opts.xSessionToken } : {}),
      ...(cookieParts.length > 0 ? { cookie: cookieParts.join("; ") } : {}),
    },
    socket: { remoteAddress: "127.0.0.1" },
  };
  const res = {
    cookie() {},
    clearCookie() {},
    setHeader() {},
  };
  return createContext({ req, res } as never);
}

/** createCaller a partir do contexto reconstruído por createContext (fluxo real). */
function callerFromRebuilt(rebuilt: Awaited<ReturnType<typeof rebuildContext>>) {
  const req = {
    hostname: "localhost",
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  };
  const res = { cookie() {}, clearCookie() {}, setHeader() {} };
  return appRouter.createCaller({
    req,
    res,
    user: rebuilt.user,
    tenantId: rebuilt.tenantId,
    vendedor: rebuilt.vendedor,
    isImpersonating: rebuilt.isImpersonating,
  } as unknown as CallerCtx);
}

/** ctx de caller preservando req/res originais (para impersonation que lê/escreve cookies). */
function callerCtxFromRebuilt(
  rebuilt: Awaited<ReturnType<typeof rebuildContext>>,
  reqHeaders: Record<string, string>,
  capturedCookies: Array<{ name: string; value: string }>
) {
  const req = {
    hostname: "localhost",
    headers: reqHeaders,
    socket: { remoteAddress: "127.0.0.1" },
  };
  const res = {
    cookie(name: string, value: string) {
      capturedCookies.push({ name, value });
    },
    clearCookie(name: string) {
      capturedCookies.push({ name, value: "" });
    },
    setHeader() {},
  };
  const caller = appRouter.createCaller({
    req,
    res,
    user: rebuilt.user,
    tenantId: rebuilt.tenantId,
    vendedor: rebuilt.vendedor,
    isImpersonating: rebuilt.isImpersonating,
  } as unknown as CallerCtx);
  return { caller, req, res };
}

/** JWT assinado com o segredo real, claims arbitrários (para tokens "válidos mas venenosos"). */
function mintSignedJwt(claims: Record<string, unknown>, expiresInSeconds = 300): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("JWT_ACCESS_SECRET ausente no ambiente de teste");
  return jwt.sign(
    { sessionId: `sess_test_${nanoid(8)}`, ...claims },
    secret,
    { algorithm: "HS256", expiresIn: expiresInSeconds }
  );
}

/** Token adulterado: payload decodificado+modificado, assinatura destruída. */
function tamperToken(token: string): string {
  const parts = token.split(".");
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  payload.role = "admin";
  payload.userId = 1;
  const forgedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${parts[0]}.${forgedPayload}.assinatura_invalida`;
}

describe("P23-R-10B — fluxo JWT de sessão ponta a ponta", () => {
  beforeAllWithServiceContext(async () => {
    const conn = await getDb();
    if (!conn) throw new Error("Database connection failed");
    dbConn = conn;

    // Pais em `tenants` antes de inserts filhos (fundação p/ FK futura)
    await ensureTenantExists(dbConn, TENANT_C);
    await ensureTenantExists(dbConn, TENANT_D);

    const suffix = nanoid(6).replace(/[^0-9a-z]/gi, "x");
    openIdAdmin = `r10b_adm_${suffix}@test.local`;
    openIdVend = `r10b_v_${suffix}@test.local`;
    openIdVendAdm = `r10b_va_${suffix}@test.local`;
    openIdFlip = `r10b_fl_${suffix}@test.local`;
    openIdDel = `r10b_dl_${suffix}@test.local`;

    // Senha do login admin vem de ADMIN_PASSWORD_HASH (env) — setada para esta suite
    process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(ADMIN_SENHA, 10);

    const mkUser = async (openId: string, role: "admin" | "user") => {
      const ins = await dbConn.insert(users).values({
        tenantId: TENANT_C,
        openId,
        name: `R10B ${openId}`,
        email: openId,
        loginMethod: "local",
        role,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      });
      const id = getInsertId(ins as never);
      if (!Number.isInteger(id) || id <= 0) throw new Error("Falha insert user");
      return id;
    };

    userAdminId = await mkUser(openIdAdmin, "admin");
    userVendId = await mkUser(openIdVend, "user");
    userVendAdmId = await mkUser(openIdVendAdm, "user");
    userFlipId = await mkUser(openIdFlip, "admin");
    userDelId = await mkUser(openIdDel, "user");

    const senhaVendHash = bcrypt.hashSync(SENHA_VEND, 10);
    const senhaVendAdmHash = bcrypt.hashSync(SENHA_VEND_ADMIN, 10);

    const insV = await dbConn.insert(vendedores).values({
      tenantId: TENANT_C,
      userId: userVendId,
      nome: `VEND R10B ${suffix}`,
      senha: senhaVendHash,
      admin: false,
      ativo: true,
    });
    vendId = getInsertId(insV as never);

    const insVA = await dbConn.insert(vendedores).values({
      tenantId: TENANT_C,
      userId: userVendAdmId,
      nome: `VENDADM R10B ${suffix}`,
      senha: senhaVendAdmHash,
      admin: true,
      ativo: true,
    });
    vendAdmId = getInsertId(insVA as never);

    const insVD = await dbConn.insert(vendedores).values({
      tenantId: TENANT_C,
      userId: userDelId,
      nome: `VENDDEL R10B ${suffix}`,
      senha: senhaVendHash,
      admin: false,
      ativo: true,
    });
    vendDelId = getInsertId(insVD as never);

    // Venenoso: vendedor no tenant D apontando para userId do tenant C
    const insVX = await dbConn.insert(vendedores).values({
      tenantId: TENANT_D,
      userId: userVendId,
      nome: `VENDX R10B ${suffix}`,
      senha: senhaVendHash,
      admin: true,
      ativo: true,
    });
    vendXId = getInsertId(insVX as never);
  });

  afterAllWithServiceContext(async () => {
    if (!dbConn) return;
    const vendIds = [vendId, vendAdmId, vendDelId, vendXId].filter((i) => i > 0);
    const userIds = [userAdminId, userVendId, userVendAdmId, userFlipId, userDelId].filter((i) => i > 0);
    if (vendIds.length > 0) {
      await dbConn.delete(vendedores).where(inArray(vendedores.id, vendIds));
    }
    if (userIds.length > 0) {
      await dbConn.delete(users).where(inArray(users.id, userIds));
    }
    // POST-CLEANUP: nada pode sobrar
    const vidsAlive = vendIds.length > 0
      ? await dbConn.select({ id: vendedores.id }).from(vendedores).where(inArray(vendedores.id, vendIds))
      : [];
    const uidsAlive = userIds.length > 0
      ? await dbConn.select({ id: users.id }).from(users).where(inArray(users.id, userIds))
      : [];
    if (vidsAlive.length !== 0 || uidsAlive.length !== 0) {
      throw new Error(`POST-CLEANUP falhou: vendedores=${vidsAlive.length} users=${uidsAlive.length}`);
    }
  });

  // ═══════════ LOGIN — EMISSÃO JWT ═══════════

  itWithServiceContext("LOGIN-01) admin válido recebe JWT assinado (não u:<id>)", async () => {
    const { ctx, cookies } = loginCtx();
    const caller = appRouter.createCaller(ctx);
    const res = await caller.auth.login({ username: openIdAdmin, password: ADMIN_SENHA });
    expect(res.ok).toBe(true);
    expect(res.role).toBe("admin");
    expect(typeof res.sessionToken).toBe("string");
    expect(res.sessionToken).not.toMatch(/^u:|^v:/);
    // JWT real: 3 segmentos base64url
    expect(res.sessionToken!.split(".")).toHaveLength(3);
    const payload = jwt.decode(res.sessionToken!) as Record<string, unknown>;
    expect(payload.userId).toBe(userAdminId);
    expect(payload.tenantId).toBe(TENANT_C);
    expect(payload.role).toBe("admin");
    expect(payload.vendedorId).toBeUndefined();
    expect(typeof payload.sessionId).toBe("string");
    expect(cookies.some((c) => c.name === "session" && c.value === res.sessionToken)).toBe(true);
    expect(cookies.some((c) => c.name === "session_token" && c.value === res.sessionToken)).toBe(true);
  });

  itWithServiceContext("LOGIN-02) vendedor válido recebe JWT assinado (não v:<id>)", async () => {
    const { ctx, cookies } = loginCtx();
    const caller = appRouter.createCaller(ctx);
    const res = await caller.auth.login({ username: openIdVend, password: SENHA_VEND });
    expect(res.ok).toBe(true);
    expect(res.sessionToken).not.toMatch(/^u:|^v:/);
    expect(res.sessionToken!.split(".")).toHaveLength(3);
    const payload = jwt.decode(res.sessionToken!) as Record<string, unknown>;
    expect(payload.userId).toBe(userVendId);
    expect(payload.tenantId).toBe(TENANT_C);
    expect(payload.vendedorId).toBe(vendId);
    expect(cookies.some((c) => c.name === "session" && c.value === res.sessionToken)).toBe(true);
  });

  itWithServiceContext("LOGIN-03) senha errada falha (UNAUTHORIZED)", async () => {
    const { ctx } = loginCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.auth.login({ username: openIdVend, password: "senha-errada-999" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  itWithServiceContext("LOGIN-04) senha do vendedor-admin não autentica o vendedor comum", async () => {
    const { ctx } = loginCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.auth.login({ username: openIdVend, password: SENHA_VEND_ADMIN })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  itWithServiceContext("LOGIN-05) JWT do vendedor carrega vendedorId de A (nunca X cross-tenant)", async () => {
    const { ctx } = loginCtx();
    const caller = appRouter.createCaller(ctx);
    const res = await caller.auth.login({ username: openIdVend, password: SENHA_VEND });
    const payload = jwt.decode(res.sessionToken!) as Record<string, unknown>;
    expect(payload.vendedorId).toBe(vendId);
    expect(payload.vendedorId).not.toBe(vendXId);
    expect(res.vendedorId).toBe(vendId);
  });

  // ═══════════ LOGIN → CONTEXTO → PROCEDURES ═══════════

  itWithServiceContext("LOGIN-06) login → createContext resolve identidade real", async () => {
    const token = vendToken();
    const rebuilt = await rebuildContext({ bearer: token, sessionCookie: token });
    expect(rebuilt.user).not.toBeNull();
    expect(rebuilt.user!.id).toBe(userVendId);
    expect(rebuilt.tenantId).toBe(TENANT_C);
    expect(rebuilt.vendedor).not.toBeNull();
    expect(rebuilt.vendedor!.id).toBe(vendId);
    expect(rebuilt.isImpersonating).toBe(false);
  });

  itWithServiceContext("LOGIN-07) login → auth.me retorna identidade correta", async () => {
    const rebuilt = await rebuildContext({ sessionCookie: vendToken() });
    const me = await callerFromRebuilt(rebuilt).auth.me();
    expect(me).not.toBeNull();
    expect(me!.id).toBe(userVendId);
    expect(me!.role).toBe("vendedor");
    expect(me!.vendedorId).toBe(vendId);
    expect(me!.isImpersonating).toBe(false);
  });

  itWithServiceContext("LOGIN-08/12) login → protectedProcedure real funciona (cores.list)", async () => {
    const rebuilt = await rebuildContext({ sessionCookie: vendToken() });
    const caller2 = callerFromRebuilt(rebuilt);
    // cores.list = protectedProcedure com requireTenant — prova "entrada no ERP"
    const cores = await caller2.cores.list();
    expect(Array.isArray(cores)).toBe(true);
    expect(rebuilt.tenantId).toBe(TENANT_C);
  });

  itWithServiceContext("LOGIN-09/10/11) tenantId, userId e vendedorId corretos no contexto", async () => {
    const rebuilt = await rebuildContext({ sessionCookie: vendToken() });
    expect(rebuilt.tenantId).toBe(TENANT_C);
    expect(rebuilt.user!.id).toBe(userVendId); // users.id — nunca vendedores.id
    expect(rebuilt.user!.id).not.toBe(vendId);
    expect(rebuilt.vendedor!.id).toBe(vendId);
    expect(rebuilt.vendedor!.userId).toBe(userVendId);
  });

  itWithServiceContext("LOGIN-12b) admin: ctx.user.role=admin do DB; vendedor=null", async () => {
    const { ctx } = loginCtx();
    const caller = appRouter.createCaller(ctx);
    const res = await caller.auth.login({ username: openIdAdmin, password: ADMIN_SENHA });
    const rebuilt = await rebuildContext({ sessionCookie: res.sessionToken });
    expect(rebuilt.user!.role).toBe("admin");
    expect(rebuilt.vendedor).toBeNull();
    const me = await callerFromRebuilt(rebuilt).auth.me();
    expect(me!.role).toBe("admin");
    expect(me!.id).toBe(userAdminId);
  });

  // ═══════════ TOKENS INVÁLIDOS ═══════════

  itWithServiceContext("LOGIN-13) token adulterado (payload modificado, assinatura quebrada) rejeita", async () => {
    const forged = tamperToken(vendToken());
    const rebuilt = await rebuildContext({ bearer: forged, sessionCookie: forged });
    expect(rebuilt.user).toBeNull();
    expect(rebuilt.vendedor).toBeNull();
    expect(rebuilt.tenantId).toBeNull();
    await expect(callerFromRebuilt(rebuilt).auth.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  itWithServiceContext("LOGIN-14) token expirado rejeita", async () => {
    const expired = mintSignedJwt(
      { userId: userVendId, tenantId: TENANT_C, email: openIdVend, role: "user", vendedorId: vendId },
      -10
    );
    const rebuilt = await rebuildContext({ bearer: expired, sessionCookie: expired });
    expect(rebuilt.user).toBeNull();
    expect(rebuilt.tenantId).toBeNull();
  });

  itWithServiceContext("LOGIN-15) JWT válido mas user apagado do DB → UNAUTHORIZED", async () => {
    const token = mintSignedJwt({ userId: userDelId, tenantId: TENANT_C, email: openIdDel, role: "user", vendedorId: vendDelId });
    // Apaga vendedor e user do banco DEPOIS da emissão do JWT
    await dbConn.delete(vendedores).where(eq(vendedores.id, vendDelId));
    await dbConn.delete(users).where(eq(users.id, userDelId));
    vendDelId = 0; userDelId = 0; // não limpar duas vezes
    const rebuilt = await rebuildContext({ bearer: token });
    expect(rebuilt.user).toBeNull();
    await expect(callerFromRebuilt(rebuilt).auth.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  itWithServiceContext("LOGIN-16) role admin removida do DB não permanece admin no token", async () => {
    const { ctx } = loginCtx();
    const caller = appRouter.createCaller(ctx);
    const res = await caller.auth.login({ username: openIdFlip, password: ADMIN_SENHA });
    expect(res.ok).toBe(true);
    // Rebaixa no DB DEPOIS da emissão
    await dbConn.update(users).set({ role: "user" }).where(eq(users.id, userFlipId));
    const rebuilt = await rebuildContext({ bearer: res.sessionToken });
    expect(rebuilt.user).not.toBeNull();
    expect(rebuilt.user!.role).toBe("user"); // DB vence o claim 'admin' do token
    const me = await callerFromRebuilt(rebuilt).auth.me();
    expect(me!.role).toBe("vendedor"); // não-admin exposto como vendedor
  });

  itWithServiceContext("LOGIN-17) vendedor.ativo=false após emissão → sessão rejeitada", async () => {
    const token = vendToken();
    await dbConn.update(vendedores).set({ ativo: false }).where(eq(vendedores.id, vendId));
    try {
      const rebuilt = await rebuildContext({ bearer: token });
      expect(rebuilt.user).toBeNull();
      expect(rebuilt.vendedor).toBeNull();
    } finally {
      await dbConn.update(vendedores).set({ ativo: true }).where(eq(vendedores.id, vendId));
    }
  });

  itWithServiceContext("LOGIN-18) vínculo vendedor.userId divergente → sessão rejeitada", async () => {
    const token = vendToken();
    await dbConn.update(vendedores).set({ userId: userAdminId }).where(eq(vendedores.id, vendId));
    try {
      const rebuilt = await rebuildContext({ bearer: token });
      expect(rebuilt.user).toBeNull();
    } finally {
      await dbConn.update(vendedores).set({ userId: userVendId }).where(eq(vendedores.id, vendId));
    }
  });

  itWithServiceContext("LOGIN-19/24) JWT assinado tenant A + vendedor X (tenant B) → rejeitado", async () => {
    const poisoned = mintSignedJwt({
      userId: userVendId,
      tenantId: TENANT_C,
      email: openIdVend,
      role: "user",
      vendedorId: vendXId, // vendedor de OUTRO tenant — assinatura válida não basta
    });
    const rebuilt = await rebuildContext({ bearer: poisoned });
    expect(rebuilt.user).toBeNull();
    expect(rebuilt.tenantId).toBeNull();
  });

  // ═══════════ FORMATOS LEGADOS — REGRA ZERO ═══════════

  itWithServiceContext("LOGIN-20) 'u:1' rejeitado em Bearer, cookie e x-session-token", async () => {
    for (const channel of [
      { bearer: "u:1" },
      { sessionCookie: "u:1" },
      { xSessionToken: "u:1" },
    ]) {
      const rebuilt = await rebuildContext(channel);
      expect(rebuilt.user).toBeNull();
      expect(rebuilt.vendedor).toBeNull();
      expect(rebuilt.tenantId).toBeNull();
      expect(rebuilt.isImpersonating).toBe(false);
    }
  });

  itWithServiceContext("LOGIN-21) 'v:1' rejeitado", async () => {
    const rebuilt = await rebuildContext({ bearer: "v:1", sessionCookie: "v:1" });
    expect(rebuilt.user).toBeNull();
  });

  itWithServiceContext("LOGIN-22) 'v:tenant:id' rejeitado", async () => {
    const rebuilt = await rebuildContext({ bearer: `v:${TENANT_C}:${vendId}`, sessionCookie: `v:${TENANT_C}:${vendId}` });
    expect(rebuilt.user).toBeNull();
    expect(rebuilt.vendedor).toBeNull();
  });

  itWithServiceContext("LOGIN-23) 'admin-session' literal rejeitado", async () => {
    const rebuilt = await rebuildContext({ bearer: "admin-session", sessionCookie: "admin-session", adminSession: "admin-session" });
    expect(rebuilt.user).toBeNull();
    expect(rebuilt.isImpersonating).toBe(false);
  });

  itWithServiceContext("LOGIN-24) 'vendedor-session' literal rejeitado", async () => {
    const rebuilt = await rebuildContext({ bearer: "vendedor-session", sessionCookie: "vendedor-session" });
    expect(rebuilt.user).toBeNull();
  });

  // ═══════════ LOGOUT ═══════════

  itWithServiceContext("LOGIN-25) logout limpa sessão: próximo auth.me sem credencial falha", async () => {
    const token = vendToken();
    const rebuilt = await rebuildContext({ sessionCookie: token });
    const { caller: authed } = callerCtxFromRebuilt(
      rebuilt,
      { cookie: `session=${token}` },
      []
    );
    const out = await authed.auth.logout();
    expect((out as { success?: boolean }).success).toBe(true);
    // Próxima request do browser: sem cookie, sem Bearer → sem identidade
    const after = await rebuildContext({});
    expect(after.user).toBeNull();
    await expect(callerFromRebuilt(after).auth.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  itWithServiceContext("LOGIN-26) smart-auth não emite formato legado (falha explícita, sem u:/v:)", async () => {
    const { ctx } = loginCtx();
    const smartCaller = smartAuthRouter.createCaller(ctx);
    await expect(
      smartCaller.login({ username: "qualquer", password: "qualquer123" })
    ).rejects.toThrow(); // nunca retorna sessionToken u:/v:
  });

  // ═══════════ IMPERSONATION ═══════════

  /** JWT admin assinado — revalidado no DB pelo createContext exatamente como o de login. */
  function adminLoginSession(): string {
    return mintSignedJwt({
      userId: userAdminId,
      tenantId: TENANT_C,
      email: openIdAdmin,
      role: "admin",
    });
  }

  /** JWT vendedor A assinado — usado em testes de contexto (não de login) para evitar rate-limit. */
  function vendToken(): string {
    return mintSignedJwt({
      userId: userVendId,
      tenantId: TENANT_C,
      email: openIdVend,
      role: "user",
      vendedorId: vendId,
    });
  }

  itWithServiceContext("LOGIN-27) admin impersonate vendedor funciona (admin_session=JWT, session=JWT vendedor)", async () => {
    const adminToken = await adminLoginSession();
    const adminRebuilt = await rebuildContext({ bearer: adminToken, sessionCookie: adminToken });
    const captured: Array<{ name: string; value: string }> = [];
    const cookieHeader = `session=${adminToken}; session_token=${adminToken}`;
    const { caller } = callerCtxFromRebuilt(adminRebuilt, { cookie: cookieHeader, authorization: `Bearer ${adminToken}` }, captured);
    const out = await caller.auth.impersonateVendedor({ vendedorId: vendId });
    expect(out.ok).toBe(true);
    expect(typeof out.sessionToken).toBe("string");
    expect(out.sessionToken).not.toMatch(/^u:|^v:/);
    // admin_session recebe o JWT ADMIN ORIGINAL (assinado), não literal nem ID cru
    const adminSession = captured.find((c) => c.name === "admin_session");
    expect(adminSession).toBeDefined();
    expect(adminSession!.value).toBe(adminToken);
    // session recebe o JWT efetivo do vendedor
    const sessionCookie = captured.find((c) => c.name === "session");
    expect(sessionCookie).toBeDefined();
    const payload = jwt.decode(sessionCookie!.value) as Record<string, unknown>;
    expect(payload.vendedorId).toBe(vendId);
    expect(payload.userId).toBe(userVendId);
    expect(payload.tenantId).toBe(TENANT_C);
  });

  itWithServiceContext("LOGIN-28) sessão efetiva de impersonation NÃO mantém privilégio admin", async () => {
    const adminToken = await adminLoginSession();
    const adminRebuilt = await rebuildContext({ bearer: adminToken, sessionCookie: adminToken });
    const captured: Array<{ name: string; value: string }> = [];
    const cookieHeader = `session=${adminToken}; session_token=${adminToken}`;
    const { caller } = callerCtxFromRebuilt(adminRebuilt, { cookie: cookieHeader, authorization: `Bearer ${adminToken}` }, captured);
    await caller.auth.impersonateVendedor({ vendedorId: vendId });
    const vendToken = captured.find((c) => c.name === "session")!.value;

    // Request pós-impersonate como o browser real: Bearer=admin, cookies session=vendedor + admin_session
    const impCtx = await rebuildContext({
      bearer: adminToken,
      sessionCookie: vendToken,
      adminSession: adminToken,
    });
    expect(impCtx.isImpersonating).toBe(true);
    expect(impCtx.user!.id).toBe(userVendId);
    expect(impCtx.user!.role).toBe("user"); // role efetiva do DB do user vinculado — NÃO admin
    expect(impCtx.vendedor!.id).toBe(vendId);
    const impCaller = callerFromRebuilt(impCtx);
    const me = await impCaller.auth.me();
    expect(me!.role).toBe("vendedor");
    expect(me!.isImpersonating).toBe(true);
    // adminProcedure bloqueia a sessão efetiva não-admin
    await expect(impCaller.vendedores.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  itWithServiceContext("LOGIN-29) admin_session adulterado NÃO ativa impersonation", async () => {
    const { ctx } = loginCtx();
    const caller = appRouter.createCaller(ctx);
    const res = await caller.auth.login({ username: openIdVend, password: SENHA_VEND });
    const forgedAdmin = tamperToken(res.sessionToken!);
    const rebuilt = await rebuildContext({
      bearer: res.sessionToken,
      sessionCookie: res.sessionToken,
      adminSession: forgedAdmin,
    });
    // Cookie falso não ativa impersonation — identidade segue a sessão efetiva válida
    expect(rebuilt.isImpersonating).toBe(false);
    expect(rebuilt.user!.id).toBe(userVendId);
    // stopImpersonation exige impersonation válida → BAD_REQUEST
    const { caller: c } = callerCtxFromRebuilt(
      rebuilt,
      { cookie: `session=${res.sessionToken}; admin_session=${forgedAdmin}` },
      []
    );
    await expect(c.auth.stopImpersonation()).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  itWithServiceContext("LOGIN-30/32) stopImpersonation restaura JWT admin; auth.me pós-restore = admin", async () => {
    const adminToken = await adminLoginSession();
    const adminRebuilt = await rebuildContext({ bearer: adminToken, sessionCookie: adminToken });
    const captured: Array<{ name: string; value: string }> = [];
    const { caller } = callerCtxFromRebuilt(
      adminRebuilt,
      { cookie: `session=${adminToken}; session_token=${adminToken}`, authorization: `Bearer ${adminToken}` },
      captured
    );
    await caller.auth.impersonateVendedor({ vendedorId: vendId });
    const vendToken = captured.find((c) => c.name === "session")!.value;

    const impRebuilt = await rebuildContext({ bearer: adminToken, sessionCookie: vendToken, adminSession: adminToken });
    expect(impRebuilt.isImpersonating).toBe(true);
    const stopCaptured: Array<{ name: string; value: string }> = [];
    const { caller: stopCaller } = callerCtxFromRebuilt(
      impRebuilt,
      {
        cookie: `session=${vendToken}; session_token=${vendToken}; admin_session=${adminToken}`,
        authorization: `Bearer ${adminToken}`,
      },
      stopCaptured
    );
    const stopRes = await stopCaller.auth.stopImpersonation();
    expect(stopRes.ok).toBe(true);
    // sessionToken restaurado = JWT admin original (client deve substituir o armazenado)
    expect(stopRes.sessionToken).toBe(adminToken);
    expect(stopCaptured.find((c) => c.name === "session")!.value).toBe(adminToken);
    expect(stopCaptured.some((c) => c.name === "admin_session" && c.value === "")).toBe(true);

    const restored = await rebuildContext({ bearer: adminToken, sessionCookie: adminToken });
    expect(restored.isImpersonating).toBe(false);
    expect(restored.user!.role).toBe("admin");
    const me = await callerFromRebuilt(restored).auth.me();
    expect(me!.role).toBe("admin");
    expect(me!.id).toBe(userAdminId);
    expect(me!.isImpersonating).toBe(false);
  });

  itWithServiceContext("LOGIN-33) logout durante impersonation limpa session + admin_session", async () => {
    const adminToken = await adminLoginSession();
    const adminRebuilt = await rebuildContext({ bearer: adminToken, sessionCookie: adminToken });
    const captured: Array<{ name: string; value: string }> = [];
    const { caller } = callerCtxFromRebuilt(
      adminRebuilt,
      { cookie: `session=${adminToken}`, authorization: `Bearer ${adminToken}` },
      captured
    );
    await caller.auth.impersonateVendedor({ vendedorId: vendId });
    const vendToken = captured.find((c) => c.name === "session")!.value;
    const impRebuilt = await rebuildContext({ sessionCookie: vendToken, adminSession: adminToken });
    const outCaptured: Array<{ name: string; value: string }> = [];
    const { caller: impCaller } = callerCtxFromRebuilt(
      impRebuilt,
      { cookie: `session=${vendToken}; admin_session=${adminToken}` },
      outCaptured
    );
    const out = await impCaller.auth.logout();
    expect((out as { success?: boolean }).success).toBe(true);
    const cleared = outCaptured.filter((c) => c.value === "").map((c) => c.name);
    expect(cleared).toContain("session");
    expect(cleared).toContain("session_token");
    expect(cleared).toContain("admin_session");
  });

  // ═══════════ FIX2 — admin_session NÃO AUTENTICA SOZINHO ═══════════

  itWithServiceContext("FIX2-A) admin_session válido SEM sessão efetiva → UNAUTHORIZED", async () => {
    const adminToken = adminLoginSession();
    const rebuilt = await rebuildContext({ adminSession: adminToken });
    expect(rebuilt.user).toBeNull();
    expect(rebuilt.tenantId).toBeNull();
    expect(rebuilt.vendedor).toBeNull();
    expect(rebuilt.isImpersonating).toBe(false);
    await expect(callerFromRebuilt(rebuilt).auth.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  itWithServiceContext("FIX2-B) admin_session válido + sessão vendedor mesmo tenant → impersonation", async () => {
    const adminToken = adminLoginSession();
    const rebuilt = await rebuildContext({ sessionCookie: vendToken(), adminSession: adminToken });
    expect(rebuilt.isImpersonating).toBe(true);
    expect(rebuilt.user!.id).toBe(userVendId);
    expect(rebuilt.vendedor!.id).toBe(vendId);
  });

  itWithServiceContext("FIX2-C) admin_session válido + sessão INVÁLIDA → fail closed total", async () => {
    const adminToken = adminLoginSession();
    const rebuilt = await rebuildContext({ sessionCookie: "jwt.forged.invalid", adminSession: adminToken });
    expect(rebuilt.user).toBeNull();
    expect(rebuilt.tenantId).toBeNull();
    expect(rebuilt.vendedor).toBeNull();
    expect(rebuilt.isImpersonating).toBe(false);
  });

  itWithServiceContext("FIX2-D) admin_session adulterado + sessão vendedor → sem impersonation", async () => {
    const token = vendToken();
    const rebuilt = await rebuildContext({
      sessionCookie: token,
      adminSession: tamperToken(token),
    });
    expect(rebuilt.isImpersonating).toBe(false);
    expect(rebuilt.user!.id).toBe(userVendId);
    const me = await callerFromRebuilt(rebuilt).auth.me();
    expect(me!.isImpersonating).toBe(false);
  });

  // ═══════════ FIX2 — REGRA vendedores.admin ═══════════

  itWithServiceContext("FIX2-ROLE) users.role=user + vendedores.admin=true → role efetiva admin (autoridade legítima)", async () => {
    // Prova: buildUserFromVendedor (commit 7fd418433) mapeava v.admin→'admin'.
    // Autoridade = DB revalidado tenant-safe; claim do JWT carrega users.role ('user').
    const { ctx } = loginCtx();
    const caller = appRouter.createCaller(ctx);
    const res = await caller.auth.login({ username: openIdVendAdm, password: SENHA_VEND_ADMIN });
    expect(res.ok).toBe(true);
    expect(res.role).toBe("admin"); // resposta de login usa vendedor.admin (pré-existente)
    const payload = jwt.decode(res.sessionToken!) as Record<string, unknown>;
    expect(payload.role).toBe("user"); // claim = users.role real do DB
    expect(payload.vendedorId).toBe(vendAdmId);

    const rebuilt = await rebuildContext({ bearer: res.sessionToken });
    expect(rebuilt.user!.role).toBe("admin"); // role EFETIVA do DB: vendedores.admin=true
    expect(rebuilt.user!.id).toBe(userVendAdmId);
    expect(rebuilt.vendedor!.id).toBe(vendAdmId);
    expect(rebuilt.tenantId).toBe(TENANT_C);

    // adminProcedure real acessível (vendedores.list exige admin)
    const list = await callerFromRebuilt(rebuilt).vendedores.list();
    expect(Array.isArray(list)).toBe(true);
    const me = await callerFromRebuilt(rebuilt).auth.me();
    expect(me!.role).toBe("admin");
  });

  itWithServiceContext("FIX2-ROLE-X) vendedor.admin de OUTRO tenant não eleva role de A", async () => {
    // vendXId (tenant D, admin=true) aponta para userVendId — sessão de A não usa X
    const rebuilt = await rebuildContext({ bearer: vendToken() });
    expect(rebuilt.user!.role).toBe("user"); // vendId tem admin=false; X em D não vaza
    expect(rebuilt.vendedor!.id).toBe(vendId);
    await expect(callerFromRebuilt(rebuilt).vendedores.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // ═══════════ FIX2 — CONSISTÊNCIA TOKEN cookie/Bearer/local ═══════════

  itWithServiceContext("FIX2-TOKENS) sequência login→impersonate→stop: cookie==Bearer==token retornado (hash/prefixo)", async () => {
    const { createHash } = await import("node:crypto");
    const fp = (t: string) => createHash("sha256").update(t).digest("hex").slice(0, 12);

    // Login vendedor: sessionToken retornado == cookie emitido (mesmo valor canônico)
    const { ctx, cookies } = loginCtx();
    const caller = appRouter.createCaller(ctx);
    const res = await caller.auth.login({ username: openIdVend, password: SENHA_VEND });
    const vendTok = res.sessionToken!;
    expect(cookies.find((c) => c.name === "session")!.value).toBe(vendTok);
    expect(cookies.find((c) => c.name === "session_token")!.value).toBe(vendTok);
    // O client (authStore/auth.service) salva data.sessionToken → Bearer/x-session-token = mesmo JWT
    expect(fp(vendTok)).toBe(fp(cookies.find((c) => c.name === "session")!.value));

    // Impersonate: admin original vai p/ admin_session; session retorna JWT vendedor == sessionToken
    const adminToken = adminLoginSession();
    const adminRebuilt = await rebuildContext({ bearer: adminToken, sessionCookie: adminToken });
    const impCookies: Array<{ name: string; value: string }> = [];
    const { caller: impCaller } = callerCtxFromRebuilt(
      adminRebuilt,
      { cookie: `session=${adminToken}`, authorization: `Bearer ${adminToken}` },
      impCookies
    );
    const imp = await impCaller.auth.impersonateVendedor({ vendedorId: vendId });
    expect(imp.sessionToken).toBe(impCookies.find((c) => c.name === "session")!.value);
    expect(impCookies.find((c) => c.name === "admin_session")!.value).toBe(adminToken);
    expect(fp(imp.sessionToken!)).not.toBe(fp(adminToken));

    // Stop: sessionToken restaurado == cookie session == admin_token original
    const impCtx = await rebuildContext({ sessionCookie: imp.sessionToken, adminSession: adminToken });
    const stopCookies: Array<{ name: string; value: string }> = [];
    const { caller: stopCaller } = callerCtxFromRebuilt(
      impCtx,
      { cookie: `session=${imp.sessionToken}; admin_session=${adminToken}`, authorization: `Bearer ${imp.sessionToken}` },
      stopCookies
    );
    const stop = await stopCaller.auth.stopImpersonation();
    expect(stop.sessionToken).toBe(adminToken);
    expect(stopCookies.find((c) => c.name === "session")!.value).toBe(adminToken);
    expect(fp(stop.sessionToken!)).toBe(fp(adminToken));
  });

  // ═══════════ FIX3 — jwtAuth: facade explícito, lazy REAL, zero Proxy ═══════════

  itWithServiceContext("FIX3-LAZY-STATIC) jwt-auth.ts não contém Proxy/factory import-time", () => {
    const src = readFileSync(join(process.cwd(), "server/security/jwt-auth.ts"), "utf-8");
    expect(src).not.toMatch(/new\s+Proxy/);
    expect(src).not.toContain("createJwtAuthFacade");
    // new JWTAuth() existe SOMENTE dentro de getJwtAuth()
    const ctorSites = [...src.matchAll(/new\s+JWTAuth\s*\(/g)].length;
    expect(ctorSites).toBe(1);
  });

  itWithServiceContext("FIX3-LAZY-PROC) import do módulo NÃO cria JWTAuth nem lê secrets (subprocesso isolado)", () => {
    // Prova executável em processo limpo: SEM bootstrap e SEM secrets no env.
    // Se o módulo executasse qualquer init em import-time, o import falharia.
    // O script importa jwt-auth.ts, chama um método e reporta o erro observado:
    // BootstrapNotInitializedError = a instância/só é criada e inicializada NO PRIMEIRO USO.
    const scriptPath = join(tmpdir(), `r10b-lazy-${process.pid}-${nanoid(6)}.mts`);
    writeFileSync(
      scriptPath,
      [
        'const mod = await import("file:///C:/ERP/server/security/jwt-auth.ts");',
        "let errName = '', errMsg = '';",
        "try { mod.jwtAuth.generateTokenPair({ userId: 1, tenantId: 1, email: 't@t', role: 'admin', sessionId: 's' }); } catch (e) { errName = e.name; errMsg = String(e && e.message || e); }",
        "const a = mod.getJwtAuth();",
        "const b = mod.getJwtAuth();",
        "console.log(JSON.stringify({ importOk: true, methodError: errName, methodMessage: errMsg, sameInstance: a === b }));",
      ].join("\n"),
      "utf-8"
    );
    const env = { ...process.env };
    delete env.JWT_ACCESS_SECRET;
    delete env.JWT_REFRESH_SECRET;
    const out = execFileSync(
      process.execPath,
      [join(process.cwd(), "node_modules/tsx/dist/cli.mjs"), scriptPath],
      { env, encoding: "utf-8", timeout: 90_000 }
    );
    const result = JSON.parse(out.trim().split("\n").pop()!);
    // importOk=true: nenhuma execução sensível ocorreu no import (sem secrets, sem bootstrap)
    expect(result.importOk).toBe(true);
    // Primeiro método real é quem dispara init → bootstrap ausente falha aqui, não no import.
    // requireBootstrap lança BOOTSTRAP_NOT_INITIALIZED (envelopado como InfrastructureError).
    expect(result.methodMessage).toContain("BOOTSTRAP_NOT_INITIALIZED");
    // Instância é singleton: criada no primeiro uso, reutilizada depois
    expect(result.sameInstance).toBe(true);
  });

  itWithServiceContext("FIX3-LAZY-USE) facade delega com this correto — sign/verify roundtrip funciona", () => {
    // Métodos que não leem secrets funcionam via facade (instância criada lazy, sem init):
    expect(jwtAuth.extractTokenFromHeader("Bearer abc.def")).toBe("abc.def");
    expect(jwtAuth.decodeToken("not-a-jwt")).toBeNull();
    // Método com secret: sign + verify completos provam `this` correto (bug do Proxy não volta)
    const { accessToken } = jwtAuth.generateAccessToken({
      userId: userAdminId,
      tenantId: TENANT_C,
      email: openIdAdmin,
      role: "admin",
    });
    const payload = jwtAuth.verifyAccessToken(accessToken);
    expect(payload.userId).toBe(userAdminId);
    expect(payload.tenantId).toBe(TENANT_C);
    // singleton: mesma instância após múltiplos usos
    expect(getJwtAuth()).toBe(getJwtAuth());
  });
});
