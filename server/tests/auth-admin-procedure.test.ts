/**
 * AUTH-H5 — Gate de adminProcedure com sessão DB-backed.
 *
 * Prova (MySQL real, sem mocks):
 * - sem sessão (ctx.user null) → protected/admin path falha
 * - vendedor (role user) em adminProcedure → FORBIDDEN
 * - admin real com sessão válida → passa no gate e executa impersonate
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
import { revokeAuthSession } from "../_core/session.service.js";
import { REFRESH_COOKIE_NAME } from "../_core/cookies.js";

const TENANT_AP = 96041;

const ADMIN_SENHA = "h5ap-admin-senha!";
const SENHA_VEND = "h5ap-vend-senha!";

let dbConn!: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let userAdminId = 0;
let userVendId = 0;
let vendId = 0;
let openIdAdmin = "";
let openIdVend = "";

type CallerCtx = Parameters<typeof appRouter.createCaller>[0];

function stubCtx(reqHeaders: Record<string, string> = {}) {
  const cookies: Array<{ name: string; value: string }> = [];
  const ctx = {
    req: { hostname: "localhost", headers: reqHeaders, socket: { remoteAddress: "127.0.0.1" } },
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

async function rebuildContext(sessionCookie?: string) {
  const req = {
    hostname: "localhost",
    headers: sessionCookie
      ? { cookie: `session=${sessionCookie}; session_token=${sessionCookie}` }
      : {},
    socket: { remoteAddress: "127.0.0.1" },
  };
  const res = { cookie() {}, clearCookie() {}, setHeader() {} };
  return createContext({ req, res } as never);
}

function callerFromRebuilt(rebuilt: Awaited<ReturnType<typeof rebuildContext>>, reqHeaders: Record<string, string> = {}) {
  const req = { hostname: "localhost", headers: reqHeaders, socket: { remoteAddress: "127.0.0.1" } };
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

async function login(username: string, password: string) {
  const { ctx, cookies } = stubCtx();
  const res = await appRouter.createCaller(ctx).auth.login({ username, password });
  return { res, cookies };
}

describe("AUTH-H5 — gate de adminProcedure com sessão DB-backed", () => {
  beforeAllWithServiceContext(async () => {
    const conn = await getDb();
    if (!conn) throw new Error("Database connection failed");
    dbConn = conn;

    await ensureTenantExists(dbConn, TENANT_AP);
    const suffix = nanoid(6).replace(/[^0-9a-z]/gi, "x");
    openIdAdmin = `h5ap_adm_${suffix}@test.local`;
    openIdVend = `h5ap_v_${suffix}@test.local`;

    process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(ADMIN_SENHA, 10);

    const insA = await dbConn.insert(users).values({
      tenantId: TENANT_AP,
      openId: openIdAdmin,
      name: `H5AP ADMIN ${suffix}`,
      email: openIdAdmin,
      loginMethod: "local",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    });
    userAdminId = getInsertId(insA as never);

    const insU = await dbConn.insert(users).values({
      tenantId: TENANT_AP,
      openId: openIdVend,
      name: `H5AP VEND ${suffix}`,
      email: openIdVend,
      loginMethod: "local",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    });
    userVendId = getInsertId(insU as never);

    const insV = await dbConn.insert(vendedores).values({
      tenantId: TENANT_AP,
      userId: userVendId,
      nome: `VEND H5AP ${suffix}`,
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
    await dbConn.delete(authSessions).where(eq(authSessions.tenantId, TENANT_AP));
    if (vendId > 0) await dbConn.delete(vendedores).where(eq(vendedores.id, vendId));
    for (const id of [userAdminId, userVendId].filter((i) => i > 0)) {
      await dbConn.delete(users).where(eq(users.id, id));
    }
  });

  itWithServiceContext("AP-01) sem sessão → auth.me/impersonate falham (UNAUTHORIZED/FORBIDDEN)", async () => {
    const anon = appRouter.createCaller(stubCtx().ctx);
    await expect(anon.auth.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      anon.auth.impersonateVendedor({ vendedorId: vendId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  itWithServiceContext("AP-02) vendedor (role user) → adminProcedure FORBIDDEN", async () => {
    const { res } = await login(openIdVend, SENHA_VEND);
    const rebuilt = await rebuildContext(res.sessionToken);
    expect(rebuilt.user).not.toBeNull();
    expect(rebuilt.user!.role).toBe("user");
    expect(rebuilt.vendedor?.id).toBe(vendId);

    const caller = callerFromRebuilt(rebuilt);
    await expect(
      caller.auth.impersonateVendedor({ vendedorId: vendId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  itWithServiceContext("AP-03) admin com sessão válida → impersonate executa", async () => {
    const { res } = await login(openIdAdmin, ADMIN_SENHA);
    const rebuilt = await rebuildContext(res.sessionToken);
    expect(rebuilt.user).not.toBeNull();
    expect(rebuilt.user!.role).toBe("admin");

    const headers = { cookie: `session=${res.sessionToken}; session_token=${res.sessionToken}` };
    const caller = callerFromRebuilt(rebuilt, headers);
    const imp = await caller.auth.impersonateVendedor({ vendedorId: vendId });
    expect(imp.ok).toBe(true);
    expect(imp.vendedorId).toBe(vendId);
  });

  itWithServiceContext("AP-04) sessão revogada → admin path cai (sem bypass de procedure)", async () => {
    const { res, cookies } = await login(openIdAdmin, ADMIN_SENHA);
    void cookies.find((c) => c.name === REFRESH_COOKIE_NAME);

    // Revoga a sessão do token recém-emitido
    const sessionId = (await import("../security/jwt-auth.js")).jwtAuth
      .verifyAccessToken(res.sessionToken!).sessionId;
    await revokeAuthSession(sessionId, "test_revoke");

    const rebuilt = await rebuildContext(res.sessionToken);
    expect(rebuilt.user).toBeNull();
    const caller = callerFromRebuilt(rebuilt);
    await expect(
      caller.auth.impersonateVendedor({ vendedorId: vendId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
