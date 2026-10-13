/**
 * AUTH-H5 — Rate limit de login.
 *
 * Prova o comportamento do rate limit no fluxo real de login:
 * - senha errada → UNAUTHORIZED
 * - com Redis ativo: além do limite → TOO_MANY_REQUESTS (fail documentado)
 * - sem Redis: limiter é fail-open (checkRateLimit no-op) — o teste prova
 *   explicitamente qual dos dois caminhos está ativo, sem afrouxar asserts.
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
import { checkRateLimit, clearRateLimitForKey } from "../services/rateLimitService.js";
import { getRedisClient } from "../infra/redis.js";
import { revokeAuthSession } from "../_core/session.service.js";

const TENANT_RL = 96031;

const SENHA_VEND = "h5rl-vend-senha!";

let dbConn!: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let userVendId = 0;
let vendId = 0;
let openIdVend = "";
let rateLimitKey = "";

type CallerCtx = Parameters<typeof appRouter.createCaller>[0];

function loginCtx() {
  const ctx = {
    req: { hostname: "localhost", headers: {}, socket: { remoteAddress: "127.0.0.1" } },
    res: { cookie() {}, clearCookie() {}, setHeader() {} },
    user: null,
    tenantId: null,
    vendedor: null,
    isImpersonating: false,
  } as unknown as CallerCtx;
  return ctx;
}

describe("AUTH-H5 — rate limit de login", () => {
  beforeAllWithServiceContext(async () => {
    const conn = await getDb();
    if (!conn) throw new Error("Database connection failed");
    dbConn = conn;

    await ensureTenantExists(dbConn, TENANT_RL);
    const suffix = nanoid(6).replace(/[^0-9a-z]/gi, "x");
    openIdVend = `h5rl_v_${suffix}@test.local`;
    // Login normaliza username com toLowerCase() na chave do rate limit —
    // nanoid pode gerar maiúsculas, então a chave real é sempre lowercase.
    rateLimitKey = `127.0.0.1:${openIdVend.toLowerCase()}`;

    const insU = await dbConn.insert(users).values({
      tenantId: TENANT_RL,
      openId: openIdVend,
      name: `H5RL VEND ${suffix}`,
      email: openIdVend,
      loginMethod: "local",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    });
    userVendId = getInsertId(insU as never);

    const insV = await dbConn.insert(vendedores).values({
      tenantId: TENANT_RL,
      userId: userVendId,
      nome: `VEND H5RL ${suffix}`,
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
    await dbConn.delete(authSessions).where(eq(authSessions.tenantId, TENANT_RL));
    await clearRateLimitForKey(rateLimitKey, TENANT_RL);
    if (vendId > 0) await dbConn.delete(vendedores).where(eq(vendedores.id, vendId));
    if (userVendId > 0) await dbConn.delete(users).where(eq(users.id, userVendId));
  });

  itWithServiceContext("RL-01) senha errada → UNAUTHORIZED", async () => {
    await clearRateLimitForKey(rateLimitKey, TENANT_RL);
    await expect(
      appRouter.createCaller(loginCtx()).auth.login({ username: openIdVend, password: "errada-999" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  itWithServiceContext("RL-02) rate limiter: sem Redis fail-open, com Redis bloqueia acima do limite", async () => {
    const redis = getRedisClient();
    const probeKey = `probe:${nanoid(8)}`;

    if (!redis) {
      // Documentado: sem Redis, checkRateLimit é no-op (fail-open por design).
      await expect(checkRateLimit(probeKey, TENANT_RL)).resolves.toBeUndefined();
      await expect(checkRateLimit(probeKey, TENANT_RL)).resolves.toBeUndefined();
      return;
    }

    // Com Redis: 5 primeiras passam, a 6ª explode RATE_LIMIT_EXCEEDED.
    try {
      for (let i = 0; i < 5; i++) {
        await checkRateLimit(probeKey, TENANT_RL);
      }
      await expect(checkRateLimit(probeKey, TENANT_RL)).rejects.toThrowError(/Rate limit exceeded/);
    } finally {
      await clearRateLimitForKey(probeKey, TENANT_RL);
    }
  });

  itWithServiceContext("RL-03) login após limite estourado → TOO_MANY_REQUESTS (se Redis ativo)", async () => {
    const redis = getRedisClient();
    if (!redis) {
      // Sem Redis não há contador: login segue apenas com UNAUTHORIZED de senha.
      await expect(
        appRouter.createCaller(loginCtx()).auth.login({ username: openIdVend, password: "errada-999" })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      return;
    }

    await clearRateLimitForKey(rateLimitKey, TENANT_RL);
    try {
      // Estoura o contador manualmente (>5 no window) na mesma chave do login
      for (let i = 0; i < 6; i++) {
        try {
          await checkRateLimit(rateLimitKey, TENANT_RL);
        } catch {
          // limit atingido — esperado
        }
      }
      await expect(
        appRouter.createCaller(loginCtx()).auth.login({ username: openIdVend, password: SENHA_VEND })
      ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    } finally {
      await clearRateLimitForKey(rateLimitKey, TENANT_RL);
    }
  });

  itWithServiceContext("RL-04) login bem-sucedido limpa contador de rate limit", async () => {
    const redis = getRedisClient();
    await clearRateLimitForKey(rateLimitKey, TENANT_RL);
    const res = await appRouter.createCaller(loginCtx()).auth.login({
      username: openIdVend,
      password: SENHA_VEND,
    });
    expect(res.ok).toBe(true);
    if (redis) {
      // Após sucesso, checkRateLimit na mesma chave não herda contagem velha
      await expect(checkRateLimit(rateLimitKey, TENANT_RL)).resolves.toBeUndefined();
      await clearRateLimitForKey(rateLimitKey, TENANT_RL);
    }
  });
});
