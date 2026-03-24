/**
 * Load test leve via tRPC caller (sem HTTP) — pedidos + financeiro + auth.
 * Requer DATABASE_URL e dados de dev (admin/admin123).
 *
 * Uso: pnpm exec tsx util/test/load-test.ts
 * Env: LOAD_CONCURRENCY=30 (default 25), LOAD_TENANT_ID=1
 */
import { appRouter } from "../../server/routers";
import type { TrpcContext } from "../../server/_core/context";

const CONCURRENCY = Math.min(50, Math.max(20, Number(process.env.LOAD_CONCURRENCY || 25)));
const TENANT_ID = Number(process.env.LOAD_TENANT_ID || 1);

const defaultSession: TrpcContext["session"] = {
  origin: "none",
  tokenPresent: false,
  tokenKind: "unknown",
};

function anonCtx(): TrpcContext {
  return {
    user: null,
    vendedor: null,
    isImpersonating: false,
    tenantId: null,
    session: defaultSession,
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function adminCtx(): TrpcContext {
  const user: NonNullable<TrpcContext["user"]> = {
    id: 1,
    openId: "load-admin",
    name: "Load",
    email: "load@test",
    role: "admin",
    loginMethod: "local",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    vendedor: null,
    isImpersonating: false,
    tenantId: TENANT_ID,
    session: defaultSession,
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

async function main(): Promise<void> {
  const latencies: number[] = [];
  let errors = 0;

  const runOne = async (i: number) => {
    const t0 = Date.now();
    try {
      if (i % 3 === 0) {
        const c = appRouter.createCaller(anonCtx());
        await c.auth.login({ username: "admin", password: "admin123" });
      } else if (i % 3 === 1) {
        const c = appRouter.createCaller(adminCtx());
        await c.pedidos.list({ status: "TODOS", page: 1, pageSize: 5 });
      } else {
        const c = appRouter.createCaller(adminCtx());
        await c.contasReceber.list({});
      }
    } catch {
      errors += 1;
    } finally {
      latencies.push(Date.now() - t0);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => runOne(i)));

  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  console.log(
    JSON.stringify(
      {
        concurrency: CONCURRENCY,
        tenantId: TENANT_ID,
        errors,
        avgMs: Math.round(avg),
        p95Ms: p95,
        maxMs: latencies[latencies.length - 1] ?? 0,
      },
      null,
      2
    )
  );

  if (errors > CONCURRENCY * 0.4) {
    console.error("Taxa de erro alta — verifique DB, tenant e credenciais.");
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
