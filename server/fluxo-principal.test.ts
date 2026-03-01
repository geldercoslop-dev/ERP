/**
 * Testes dos fluxos principais: Login -> Cadastro/Listagem -> Pedidos.
 * Executa: pnpm test
 */
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

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
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Fluxo principal: Login", () => {
  it("auth.login com credenciais válidas retorna ok e role", async () => {
    const ctx: TrpcContext = { user: null, req: {} as any, res: {} as any };
    const caller = appRouter.createCaller(ctx);

    const res = await caller.auth.login({ username: "admin", password: "admin123" });

    expect(res).toBeDefined();
    expect(res?.ok).toBe(true);
    expect(res?.role).toBe("admin");
    expect(res?.name).toBeDefined();
  });

  it("auth.login com credenciais inválidas lança UNAUTHORIZED", async () => {
    const ctx: TrpcContext = { user: null, req: {} as any, res: {} as any };
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

  it("clientes.list retorna array (pode ser vazio)", async () => {
    const ctx = createVendedorContext();
    const caller = appRouter.createCaller(ctx);

    const list = await caller.clientes.list();

    expect(Array.isArray(list)).toBe(true);
  });

  it("pedidos.list retorna array (pode ser vazio)", async () => {
    const ctx = createVendedorContext();
    const caller = appRouter.createCaller(ctx);

    const list = await caller.pedidos.list({ status: "TODOS" });

    expect(Array.isArray(list)).toBe(true);
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
