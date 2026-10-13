/**
 * AUTH-H5 — Refresh cookie-only com rotação + logout com revogação DB.
 *
 * Provas (MySQL real, sem mocks):
 * - auth.refresh lê SOMENTE cookie refresh_token e rotaciona o hash
 * - replay do refresh antigo falha; refresh adulterado/ausente/revogado falha
 * - vendedor inativo derruba refresh
 * - logout revoga sessão no banco, limpa todos os cookies e mata o access
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
import {
  hashRefreshToken,
  revokeAuthSession,
} from "../_core/session.service.js";
import { COOKIE_NAME, ADMIN_SESSION_COOKIE } from "../../shared/const.js";

const TENANT_R = 96021;

const ADMIN_SENHA = "h5r-admin-senha!";
const SENHA_VEND = "h5r-vend-senha!";

let dbConn!: NonNullable<Awaited<ReturnType<typeof getDb>>>;

let userAdminId = 0;
let userVendId = 0;
let vendId = 0;
let openIdAdmin = "";
let openIdVend = "";

type CallerCtx = Parameters<typeof appRouter.createCaller>[0];
type CapturedCookie = { name: string; value: string; options?: Record<string, unknown> };

/** ctx stub com headers arbitrários — captura cookies setados e limpos. */
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

/** ctx de caller autenticado (user/vendedor do rebuild) + headers de cookie reais. */
function authedCtx(rebuilt: Awaited<ReturnType<typeof rebuildContext>>, reqHeaders: Record<string, string>) {
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

async function rebuildContext(opts: { sessionCookie?: string; bearer?: string }) {
  const req = {
    hostname: "localhost",
    headers: {
      ...(opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : {}),
      ...(opts.sessionCookie
        ? { cookie: `session=${opts.sessionCookie}; session_token=${opts.sessionCookie}` }
        : {}),
    },
    socket: { remoteAddress: "127.0.0.1" },
  };
  const res = { cookie() {}, clearCookie() {}, setHeader() {} };
  return createContext({ req, res } as never);
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
  const access = res.sessionToken!;
  const refreshCookie = cookies.find((c) => c.name === REFRESH_COOKIE_NAME)!;
  const accessCookie = cookies.find((c) => c.name === COOKIE_NAME)!;
  return {
    res,
    access,
    refreshToken: refreshCookie.value,
    accessCookie: accessCookie.value,
    sessionId: jwtAuth.verifyAccessToken(access).sessionId,
  };
}

describe("AUTH-H5 — refresh com rotação + logout com revogação", () => {
  beforeAllWithServiceContext(async () => {
    const conn = await getDb();
    if (!conn) throw new Error("Database connection failed");
    dbConn = conn;

    await ensureTenantExists(dbConn, TENANT_R);
    const suffix = nanoid(6).replace(/[^0-9a-z]/gi, "x");
    openIdAdmin = `h5r_adm_${suffix}@test.local`;
    openIdVend = `h5r_v_${suffix}@test.local`;

    process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(ADMIN_SENHA, 10);

    const insA = await dbConn.insert(users).values({
      tenantId: TENANT_R,
      openId: openIdAdmin,
      name: `H5R ADMIN ${suffix}`,
      email: openIdAdmin,
      loginMethod: "local",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    });
    userAdminId = getInsertId(insA as never);

    const insU = await dbConn.insert(users).values({
      tenantId: TENANT_R,
      openId: openIdVend,
      name: `H5R VEND ${suffix}`,
      email: openIdVend,
      loginMethod: "local",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    });
    userVendId = getInsertId(insU as never);

    const insV = await dbConn.insert(vendedores).values({
      tenantId: TENANT_R,
      userId: userVendId,
      nome: `VEND H5R ${suffix}`,
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
    await dbConn.delete(authSessions).where(eq(authSessions.tenantId, TENANT_R));
    if (vendId > 0) await dbConn.delete(vendedores).where(eq(vendedores.id, vendId));
    for (const id of [userAdminId, userVendId].filter((i) => i > 0)) {
      await dbConn.delete(users).where(eq(users.id, id));
    }
  });

  // ═══════════ REFRESH ═══════════

  itWithServiceContext("R-01) refresh com cookie válido rotaciona e mantém sessionId", async () => {
    const { refreshToken, sessionId } = await login(openIdAdmin, ADMIN_SENHA);
    const before = await sessionRow(sessionId);

    const { ctx, cookies } = stubCtx({ cookie: `${REFRESH_COOKIE_NAME}=${refreshToken}` });
    const res = await appRouter.createCaller(ctx).auth.refresh();

    expect(res.ok).toBe(true);
    expect(res.sessionToken).toBeDefined();
    // sessionId preservado — a rotação renova os tokens, não a sessão
    expect(jwtAuth.verifyAccessToken(res.sessionToken!).sessionId).toBe(sessionId);

    // Refresh novo, hash no banco atualizado, cookie redefinido httpOnly
    const newRefreshCookie = cookies.find((c) => c.name === REFRESH_COOKIE_NAME);
    expect(newRefreshCookie).toBeDefined();
    expect(newRefreshCookie!.value).not.toBe(refreshToken);
    expect(newRefreshCookie!.options?.httpOnly).toBe(true);

    const after = await sessionRow(sessionId);
    expect(after!.refreshTokenHash).toBe(hashRefreshToken(newRefreshCookie!.value));
    expect(after!.refreshTokenHash).not.toBe(before!.refreshTokenHash);
    expect(after!.lastUsedAt!.getTime()).toBeGreaterThanOrEqual(before!.lastUsedAt!.getTime());
    expect(after!.revokedAt).toBeNull();
  });

  itWithServiceContext("R-02) refresh sem cookie → UNAUTHORIZED", async () => {
    const { ctx } = stubCtx();
    await expect(appRouter.createCaller(ctx).auth.refresh()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  itWithServiceContext("R-03) refresh adulterado → UNAUTHORIZED", async () => {
    const { refreshToken } = await login(openIdAdmin, ADMIN_SENHA);
    const tampered = `${refreshToken}x`;
    const { ctx } = stubCtx({ cookie: `${REFRESH_COOKIE_NAME}=${tampered}` });
    await expect(appRouter.createCaller(ctx).auth.refresh()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  itWithServiceContext("R-04) replay do refresh antigo → UNAUTHORIZED", async () => {
    const { refreshToken } = await login(openIdAdmin, ADMIN_SENHA);

    // Primeira rotação OK
    const { ctx } = stubCtx({ cookie: `${REFRESH_COOKIE_NAME}=${refreshToken}` });
    const res = await appRouter.createCaller(ctx).auth.refresh();
    expect(res.ok).toBe(true);

    // Replay do refresh já rotacionado → hash não bate → UNAUTHORIZED
    const { ctx: replayCtx } = stubCtx({ cookie: `${REFRESH_COOKIE_NAME}=${refreshToken}` });
    await expect(appRouter.createCaller(replayCtx).auth.refresh()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  itWithServiceContext("R-05) refresh com sessão revogada → UNAUTHORIZED", async () => {
    const { refreshToken, sessionId } = await login(openIdAdmin, ADMIN_SENHA);
    await revokeAuthSession(sessionId, "test_revoke");

    const { ctx } = stubCtx({ cookie: `${REFRESH_COOKIE_NAME}=${refreshToken}` });
    await expect(appRouter.createCaller(ctx).auth.refresh()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  itWithServiceContext("R-06) vendedor inativo → refresh UNAUTHORIZED", async () => {
    const { refreshToken } = await login(openIdVend, SENHA_VEND);
    await dbConn.update(vendedores).set({ ativo: false }).where(eq(vendedores.id, vendId));
    try {
      const { ctx } = stubCtx({ cookie: `${REFRESH_COOKIE_NAME}=${refreshToken}` });
      await expect(appRouter.createCaller(ctx).auth.refresh()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    } finally {
      await dbConn.update(vendedores).set({ ativo: true }).where(eq(vendedores.id, vendId));
    }
  });

  itWithServiceContext("R-07) access do refresh rotacionado autentica com a mesma sessão", async () => {
    const { refreshToken } = await login(openIdVend, SENHA_VEND);
    const { ctx } = stubCtx({ cookie: `${REFRESH_COOKIE_NAME}=${refreshToken}` });
    const res = await appRouter.createCaller(ctx).auth.refresh();

    const rebuilt = await rebuildContext({ sessionCookie: res.sessionToken });
    expect(rebuilt.user).not.toBeNull();
    expect(rebuilt.user!.id).toBe(userVendId);
    expect(rebuilt.vendedor?.id).toBe(vendId);
    expect(rebuilt.tenantId).toBe(TENANT_R);
  });

  itWithServiceContext("R-08) refresh nunca é aceito via body/header — só cookie", async () => {
    const { refreshToken } = await login(openIdAdmin, ADMIN_SENHA);

    // Bearer + x-session-token com o REFRESH token → sem cookie → UNAUTHORIZED
    const { ctx } = stubCtx({
      authorization: `Bearer ${refreshToken}`,
      "x-session-token": refreshToken,
    });
    await expect(appRouter.createCaller(ctx).auth.refresh()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  // ═══════════ LOGOUT ═══════════

  itWithServiceContext("R-09) logout revoga sessão no banco e limpa cookies", async () => {
    const { access, refreshToken, sessionId } = await login(openIdAdmin, ADMIN_SENHA);

    const rebuilt = await rebuildContext({ sessionCookie: access });
    const { ctx, cleared } = authedCtx(rebuilt, {
      cookie: `session=${access}; session_token=${access}; ${REFRESH_COOKIE_NAME}=${refreshToken}`,
    });
    const res = await appRouter.createCaller(ctx).auth.logout();
    expect(res.success).toBe(true);

    const row = await sessionRow(sessionId);
    expect(row!.revokedAt).not.toBeNull();
    expect(row!.revokedReason).toBe("logout");

    // Cookies de sessão + refresh + admin_session limpos
    for (const name of [COOKIE_NAME, "session", REFRESH_COOKIE_NAME, ADMIN_SESSION_COOKIE]) {
      expect(cleared).toContain(name);
    }

    // Access morto imediatamente após logout
    const dead = await rebuildContext({ sessionCookie: access });
    expect(dead.user).toBeNull();
  });

  itWithServiceContext("R-10) refresh após logout → UNAUTHORIZED", async () => {
    const { access, refreshToken, sessionId } = await login(openIdAdmin, ADMIN_SENHA);

    const rebuilt = await rebuildContext({ sessionCookie: access });
    const { ctx } = authedCtx(rebuilt, {
      cookie: `session=${access}; session_token=${access}; ${REFRESH_COOKIE_NAME}=${refreshToken}`,
    });
    await appRouter.createCaller(ctx).auth.logout();
    expect((await sessionRow(sessionId))!.revokedAt).not.toBeNull();

    const { ctx: refreshCtx } = stubCtx({ cookie: `${REFRESH_COOKIE_NAME}=${refreshToken}` });
    await expect(appRouter.createCaller(refreshCtx).auth.refresh()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  itWithServiceContext("R-11) logout identifica sessão pelo refresh quando access já expirou", async () => {
    const { access, refreshToken, sessionId } = await login(openIdAdmin, ADMIN_SENHA);

    // Logout só com refresh cookie (access ausente) — a sessão é revogada igual
    const { ctx } = stubCtx({ cookie: `${REFRESH_COOKIE_NAME}=${refreshToken}` });
    await appRouter.createCaller(ctx).auth.logout();

    const row = await sessionRow(sessionId);
    expect(row!.revokedAt).not.toBeNull();

    const dead = await rebuildContext({ sessionCookie: access });
    expect(dead.user).toBeNull();
  });
});
