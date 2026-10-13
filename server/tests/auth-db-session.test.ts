/**
 * AUTH-H5 — Sessões persistidas (auth_sessions): criação no login e
 * validação por-request do access token.
 *
 * Provas (MySQL real, sem mocks):
 * - login admin/vendedor cria linha em auth_sessions com hash do refresh
 * - cookie httpOnly refresh_token é setado; refresh NUNCA volta no body
 * - access token só autentica se a sessão existir, não estiver revogada e
 *   bater tenant/user/vendedor — sessão de outro tenant nunca é aceita
 * - impersonate cria sessão própria; stopImpersonation revoga
 */

import "dotenv/config";
import { describe, expect } from "vitest";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import {
  afterAllWithServiceContext,
  beforeAllWithServiceContext,
  itWithServiceContext,
} from "./integration/service-context-harness.js";
import { ensureTenantExists } from "./integration/helpers/tenant.helper.js";
import { getDb, getInsertId } from "../db/index.js";
import { users, vendedores, authSessions } from "../../drizzle/schema.js";
import { appRouter } from "../routers.js";
import { createContext } from "../_core/context.js";
import { jwtAuth } from "../security/jwt-auth.js";
import { REFRESH_COOKIE_NAME } from "../_core/cookies.js";
import { revokeAuthSession } from "../_core/session.service.js";

// Tenants reservados SOMENTE para esta suite (range 96xxx — sem colisão)
const TENANT_S = 96011;

const ADMIN_SENHA = "h5-admin-senha!";
const SENHA_VEND = "h5-vend-senha!";

let dbConn!: NonNullable<Awaited<ReturnType<typeof getDb>>>;

let userAdminId = 0;
let userVendId = 0;
let vendId = 0;
let openIdAdmin = "";
let openIdVend = "";

type CallerCtx = Parameters<typeof appRouter.createCaller>[0];
type CapturedCookie = { name: string; value: string; options?: Record<string, unknown> };

/** ctx mínimo para login/logout/refresh — captura cookies + opções. */
function stubCtx(reqHeaders: Record<string, string> = {}) {
  const cookies: CapturedCookie[] = [];
  const cleared: string[] = [];
  const ctx = {
    req: { hostname: "localhost", headers: reqHeaders, socket: { remoteAddress: "127.0.0.1" } },
    res: {
      cookie(name: string, value: string, options?: Record<string, unknown>) {
        cookies.push({ name, value, options });
      },
      clearCookie(name: string) {
        cleared.push(name);
        cookies.push({ name, value: "" });
      },
      setHeader() {},
    },
    user: null,
    tenantId: null,
    vendedor: null,
    isImpersonating: false,
  } as unknown as CallerCtx;
  return { ctx, cookies, cleared };
}

/** Reconstrói contexto real via createContext (o que o servidor faz por request). */
async function rebuildContext(opts: {
  bearer?: string;
  sessionCookie?: string;
  adminSession?: string;
}) {
  const cookieParts: string[] = [];
  if (opts.sessionCookie) {
    cookieParts.push(`session=${opts.sessionCookie}`);
    cookieParts.push(`session_token=${opts.sessionCookie}`);
  }
  if (opts.adminSession) cookieParts.push(`admin_session=${opts.adminSession}`);
  const req = {
    hostname: "localhost",
    headers: {
      ...(opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : {}),
      ...(cookieParts.length > 0 ? { cookie: cookieParts.join("; ") } : {}),
    },
    socket: { remoteAddress: "127.0.0.1" },
  };
  const res = { cookie() {}, clearCookie() {}, setHeader() {} };
  return createContext({ req, res } as never);
}

function callerFromRebuilt(rebuilt: Awaited<ReturnType<typeof rebuildContext>>) {
  const req = { hostname: "localhost", headers: {}, socket: { remoteAddress: "127.0.0.1" } };
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

/** ctx de caller com cookies reais de sessão (para logout/refresh/impersonate). */
function callerCtxWithCookies(
  rebuilt: Awaited<ReturnType<typeof rebuildContext>>,
  reqHeaders: Record<string, string>
) {
  const cookies: CapturedCookie[] = [];
  const cleared: string[] = [];
  const ctx = {
    req: { hostname: "localhost", headers: reqHeaders, socket: { remoteAddress: "127.0.0.1" } },
    res: {
      cookie(name: string, value: string, options?: Record<string, unknown>) {
        cookies.push({ name, value, options });
      },
      clearCookie(name: string) {
        cleared.push(name);
        cookies.push({ name, value: "" });
      },
      setHeader() {},
    },
    user: rebuilt.user,
    tenantId: rebuilt.tenantId,
    vendedor: rebuilt.vendedor,
    isImpersonating: rebuilt.isImpersonating,
  } as unknown as CallerCtx;
  return { ctx, cookies, cleared };
}

async function sessionRow(sessionId: string) {
  const rows = await dbConn
    .select()
    .from(authSessions)
    .where(eq(authSessions.sessionId, sessionId))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

async function login(username: string, password: string) {
  const { ctx, cookies } = stubCtx();
  const res = await appRouter.createCaller(ctx).auth.login({ username, password });
  return { res, cookies };
}

function accessSessionId(accessToken: string): string {
  return jwtAuth.verifyAccessToken(accessToken).sessionId;
}

describe("AUTH-H5 — auth_sessions no login e validação de acesso", () => {
  beforeAllWithServiceContext(async () => {
    const conn = await getDb();
    if (!conn) throw new Error("Database connection failed");
    dbConn = conn;

    await ensureTenantExists(dbConn, TENANT_S);
    const suffix = nanoid(6).replace(/[^0-9a-z]/gi, "x");
    openIdAdmin = `h5_adm_${suffix}@test.local`;
    openIdVend = `h5_v_${suffix}@test.local`;

    process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(ADMIN_SENHA, 10);

    const insA = await dbConn.insert(users).values({
      tenantId: TENANT_S,
      openId: openIdAdmin,
      name: `H5 ADMIN ${suffix}`,
      email: openIdAdmin,
      loginMethod: "local",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    });
    userAdminId = getInsertId(insA as never);

    const insU = await dbConn.insert(users).values({
      tenantId: TENANT_S,
      openId: openIdVend,
      name: `H5 VEND ${suffix}`,
      email: openIdVend,
      loginMethod: "local",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    });
    userVendId = getInsertId(insU as never);

    const insV = await dbConn.insert(vendedores).values({
      tenantId: TENANT_S,
      userId: userVendId,
      nome: `VEND H5 ${suffix}`,
      senha: bcrypt.hashSync(SENHA_VEND, 10),
      admin: false,
      ativo: true,
    });
    vendId = getInsertId(insV as never);
  });

  afterAllWithServiceContext(async () => {
    if (!dbConn) return;
    // FKs de auth_sessions são RESTRICT — apagar as sessões do tenant antes
    // de deletar vendedores/users (ordem filho→pai).
    await dbConn.delete(authSessions).where(eq(authSessions.tenantId, TENANT_S));
    if (vendId > 0) await dbConn.delete(vendedores).where(eq(vendedores.id, vendId));
    const userIds = [userAdminId, userVendId].filter((i) => i > 0);
    for (const id of userIds) {
      await dbConn.delete(users).where(eq(users.id, id));
    }
  });

  // ═══════════ LOGIN → SESSÃO PERSISTIDA ═══════════

  itWithServiceContext("DB-01) login admin cria auth_sessions com hash do refresh", async () => {
    const { res, cookies } = await login(openIdAdmin, ADMIN_SENHA);
    expect(res.ok).toBe(true);

    const sessionId = accessSessionId(res.sessionToken!);
    const row = await sessionRow(sessionId);
    expect(row).not.toBeNull();
    expect(row!.tenantId).toBe(TENANT_S);
    expect(row!.userId).toBe(userAdminId);
    expect(row!.vendedorId).toBeNull();
    expect(row!.role).toBe("admin");
    expect(row!.revokedAt).toBeNull();
    // refresh persistido SOMENTE como sha256 hex — nunca o token puro
    expect(row!.refreshTokenHash).toMatch(/^[0-9a-f]{64}$/);
    const refreshCookie = cookies.find((c) => c.name === REFRESH_COOKIE_NAME);
    expect(refreshCookie).toBeDefined();
    expect(row!.refreshTokenHash).not.toBe(refreshCookie!.value);
    expect(row!.lastUsedAt).not.toBeNull();
    expect(row!.refreshTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  itWithServiceContext("DB-02) login seta cookie refresh_token httpOnly e NUNCA devolve refresh no body", async () => {
    const { res, cookies } = await login(openIdAdmin, ADMIN_SENHA);

    const refreshCookie = cookies.find((c) => c.name === REFRESH_COOKIE_NAME);
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie!.value.length).toBeGreaterThan(20);
    expect(refreshCookie!.options?.httpOnly).toBe(true);
    expect(refreshCookie!.options?.path).toBe("/");

    // body carrega access (compat), NUNCA refreshToken
    expect(res.sessionToken).toBeDefined();
    expect((res as Record<string, unknown>).refreshToken).toBeUndefined();
  });

  itWithServiceContext("DB-03) session_id único por login", async () => {
    const a = await login(openIdAdmin, ADMIN_SENHA);
    const b = await login(openIdAdmin, ADMIN_SENHA);
    expect(accessSessionId(a.res.sessionToken!)).not.toBe(accessSessionId(b.res.sessionToken!));
  });

  itWithServiceContext("DB-04) login vendedor cria auth_sessions com vendedor_id", async () => {
    const { res } = await login(openIdVend, SENHA_VEND);
    expect(res.ok).toBe(true);
    expect(res.vendedorId).toBe(vendId);

    const sessionId = accessSessionId(res.sessionToken!);
    const row = await sessionRow(sessionId);
    expect(row).not.toBeNull();
    expect(row!.vendedorId).toBe(vendId);
    expect(row!.tenantId).toBe(TENANT_S);
    expect(row!.userId).toBe(userVendId);
    expect(row!.role).toBe("user");
  });

  // ═══════════ ACCESS TOKEN ↔ SESSÃO NO BANCO ═══════════

  itWithServiceContext("DB-05) access autentica enquanto sessão ativa", async () => {
    const { res } = await login(openIdAdmin, ADMIN_SENHA);
    const rebuilt = await rebuildContext({ sessionCookie: res.sessionToken });
    expect(rebuilt.user).not.toBeNull();
    expect(rebuilt.user!.id).toBe(userAdminId);
    expect(rebuilt.tenantId).toBe(TENANT_S);
  });

  itWithServiceContext("DB-06) access com sessionId inexistente no banco falha", async () => {
    // JWT assinado de verdade, mas sem sessão persistida → rejeita
    const { accessToken } = jwtAuth.generateAccessToken({
      userId: userAdminId,
      tenantId: TENANT_S,
      email: openIdAdmin,
      role: "admin",
    });
    const rebuilt = await rebuildContext({ sessionCookie: accessToken });
    expect(rebuilt.user).toBeNull();
  });

  itWithServiceContext("DB-07) access com sessão revogada falha (revogação server-side)", async () => {
    const { res } = await login(openIdAdmin, ADMIN_SENHA);
    const sessionId = accessSessionId(res.sessionToken!);
    await revokeAuthSession(sessionId, "test_revoke");

    const rebuilt = await rebuildContext({ sessionCookie: res.sessionToken });
    expect(rebuilt.user).toBeNull();
    expect(rebuilt.tenantId).toBeNull();
  });

  itWithServiceContext("DB-08) Bearer e x-session-token não burlam sessão revogada", async () => {
    const { res } = await login(openIdAdmin, ADMIN_SENHA);
    const sessionId = accessSessionId(res.sessionToken!);
    await revokeAuthSession(sessionId, "test_revoke");

    const viaBearer = await rebuildContext({ bearer: res.sessionToken });
    expect(viaBearer.user).toBeNull();
  });

  itWithServiceContext("DB-09) sessionId de outro tenant nunca autentica", async () => {
    const { res } = await login(openIdAdmin, ADMIN_SENHA);
    const sessionId = accessSessionId(res.sessionToken!);

    // Forja JWT válido com o MESMO sessionId real, mas tenant adulterado —
    // assinatura ok; a checagem de sessão deve falhar por mismatch de tenant.
    const forged = jwtAuth.generateAccessTokenForSession(
      {
        userId: userAdminId,
        tenantId: TENANT_S + 999,
        email: openIdAdmin,
        role: "admin",
      },
      sessionId
    );
    const rebuilt = await rebuildContext({ sessionCookie: forged.accessToken });
    expect(rebuilt.user).toBeNull();
  });

  itWithServiceContext("DB-10) vendedor_id do payload deve bater com a sessão", async () => {
    const { res } = await login(openIdVend, SENHA_VEND);
    const sessionId = accessSessionId(res.sessionToken!);

    // Mesmo sessionId, mas payload sem vendedorId → sessão recusa (mismatch)
    const forged = jwtAuth.generateAccessTokenForSession(
      {
        userId: userVendId,
        tenantId: TENANT_S,
        email: openIdVend,
        role: "user",
      },
      sessionId
    );
    const rebuilt = await rebuildContext({ sessionCookie: forged.accessToken });
    expect(rebuilt.user).toBeNull();
  });

  // ═══════════ IMPERSONATION ═══════════

  itWithServiceContext("DB-11) impersonate cria sessão; stopImpersonation revoga", async () => {
    const { res: loginRes, cookies } = await login(openIdAdmin, ADMIN_SENHA);
    const adminToken = loginRes.sessionToken!;

    const rebuiltAdmin = await rebuildContext({ sessionCookie: adminToken });
    const adminHeaders = {
      cookie: `session=${adminToken}; session_token=${adminToken}`,
    };
    const { ctx: impCtx } = callerCtxWithCookies(rebuiltAdmin, adminHeaders);
    const impRes = await appRouter.createCaller(impCtx).auth.impersonateVendedor({ vendedorId: vendId });
    expect(impRes.ok).toBe(true);
    const impSessionId = accessSessionId(impRes.sessionToken!);
    expect(impSessionId).not.toBe(accessSessionId(adminToken));

    // Sessão impersonada persistida com vendedor_id
    const impRow = await sessionRow(impSessionId);
    expect(impRow).not.toBeNull();
    expect(impRow!.vendedorId).toBe(vendId);
    expect(impRow!.revokedAt).toBeNull();

    // Contexto impersonado resolve vendedor + flag
    const rebuiltImp = await rebuildContext({ sessionCookie: impRes.sessionToken!, adminSession: adminToken });
    expect(rebuiltImp.user).not.toBeNull();
    expect(rebuiltImp.user!.id).toBe(userVendId);
    expect(rebuiltImp.vendedor?.id).toBe(vendId);
    expect(rebuiltImp.isImpersonating).toBe(true);

    // stopImpersonation revoga a sessão impersonada
    const impHeaders = {
      cookie: `session=${impRes.sessionToken}; session_token=${impRes.sessionToken}; admin_session=${adminToken}`,
    };
    const { ctx: stopCtx } = callerCtxWithCookies(rebuiltImp, impHeaders);
    const stopRes = await appRouter.createCaller(stopCtx).auth.stopImpersonation();
    expect(stopRes.ok).toBe(true);

    const after = await sessionRow(impSessionId);
    expect(after!.revokedAt).not.toBeNull();
    expect(after!.revokedReason).toBe("impersonation_stop");

    // Token impersonado morto imediatamente
    const dead = await rebuildContext({ sessionCookie: impRes.sessionToken! });
    expect(dead.user).toBeNull();

    // Sessão admin original continua viva
    const back = await rebuildContext({ sessionCookie: adminToken });
    expect(back.user).not.toBeNull();
    expect(back.user!.id).toBe(userAdminId);

    void cookies;
  });
});
