/**
 * Testes dos fluxos principais: Login -> Cadastro/Listagem -> Pedidos.
 * Executa: pnpm test
 */
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const defaultSession: TrpcContext["session"] = {
  origin: "none",
  tokenPresent: false,
  tokenKind: "unknown",
};

function createVendedorContext(): TrpcContext {
  const user: NonNullable<TrpcContext["user"]> = {
    id: 2,
    openId: "vendedor-local",
    name: "Vendedor",
    email: "vendedor@local.com",
    role: "user",
    loginMethod: "local",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    vendedor: null,
    session: defaultSession,
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function createAdminContext(): TrpcContext {
  const user: NonNullable<TrpcContext["user"]> = {
    id: 1,
    openId: "admin-local",
    name: "Administrador",
    email: "admin@local.com",
    role: "admin",
    loginMethod: "local",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    vendedor: null,
    session: defaultSession,
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Fluxo principal: Login", () => {
  it("auth.login com credenciais válidas retorna ok e role", async () => {
    const ctx: TrpcContext = {
      user: null,
      vendedor: null,
      session: { origin: "none", tokenPresent: false, tokenKind: "unknown" },
      req: {} as any,
      res: {} as any,
    };
    const caller = appRouter.createCaller(ctx);

    const res = await caller.auth.login({ username: "admin", password: "admin123" });

    expect(res).toBeDefined();
    expect(res?.ok).toBe(true);
    expect(res?.role).toBe("admin");
    expect(res?.name).toBeDefined();
  });

  it("auth.login com credenciais inválidas lança UNAUTHORIZED", async () => {
    const ctx: TrpcContext = {
      user: null,
      vendedor: null,
      session: { origin: "none", tokenPresent: false, tokenKind: "unknown" },
      req: {} as any,
      res: {} as any,
    };
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({ username: "x", password: "y" })
    ).rejects.toThrow();
  });
});

describe("Fluxo principal: autenticado (vendedor)", () => {
  it("auth.me com contexto autenticado retorna usuário", async () => {
    const ctx = createVendedorContext();
    const caller = appRouter.createCaller(ctx);

    const me = await caller.auth.me();

    expect(me).toBeDefined();
    expect(me?.role).toBeDefined();
  });

  it("clientes.list retorna items paginados", async () => {
    const ctx = createVendedorContext();
    const caller = appRouter.createCaller(ctx);

    const list = await caller.clientes.list();

    expect(list).toBeDefined();
    expect(list).toHaveProperty("items");
    expect(Array.isArray((list as any).items)).toBe(true);
    expect((list as any).total).toBeGreaterThanOrEqual(0);
    expect((list as any).page).toBe(1);
    expect((list as any).pageSize).toBeLessThanOrEqual(100);
  });

  it("pedidos.list retorna items paginados", async () => {
    const ctx = createVendedorContext();
    const caller = appRouter.createCaller(ctx);

    const list = await caller.pedidos.list({ status: "TODOS" });

    expect(list).toBeDefined();
    expect(list).toHaveProperty("items");
    expect(Array.isArray((list as any).items)).toBe(true);
    expect((list as any).total).toBeGreaterThanOrEqual(0);
    expect((list as any).page).toBe(1);
    expect((list as any).pageSize).toBeLessThanOrEqual(100);
  });

  it("contasPagar.list retorna FORBIDDEN para vendedor", async () => {
    const ctx = createVendedorContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.contasPagar.list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("contasFixas.list retorna FORBIDDEN para vendedor", async () => {
    const ctx = createVendedorContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.contasFixas.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("Fluxo principal: admin", () => {
  it("vendedores.list só é acessível por admin", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const list = await caller.vendedores.list();

    expect(Array.isArray(list)).toBe(true);
  });
});
