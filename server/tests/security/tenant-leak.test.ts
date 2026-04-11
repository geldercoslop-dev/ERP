import express from "express";
import jwt from "jsonwebtoken";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { assertOwnership } from "../../_core/ownership.js";
import * as db from "../../db/index.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { tenantMiddleware } from "../../middleware/tenant.middleware.js";
import { startHttpTestServer, type HttpTestServer } from "./_http-test-server.js";

describe("P0.7 Security - TENANT leak", () => {
  const tenantA = 1001;
  const tenantB = 1002;
  const jwtSecret = "p0-7-tenant-test-secret";
  let server: HttpTestServer;

  beforeAll(async () => {
    process.env.JWT_SECRET = jwtSecret;
    server = await startHttpTestServer((app) => {
      app.use(express.json());
      app.use("/api/secure", authMiddleware, tenantMiddleware);
      app.get("/api/secure/tenant-resource/:tenantId", (req, res) => {
        const requestedTenant = Number(req.params.tenantId);
        const currentTenant = Number((req as express.Request & { tenantId?: number }).tenantId ?? 0);

        if (requestedTenant !== currentTenant) {
          return res.status(403).json({
            success: false,
            error: "Access denied: tenant isolation",
            tenantContext: currentTenant,
            requestedTenant,
          });
        }

        return res.json({ success: true, tenantId: currentTenant, data: { safe: true } });
      });
    });
    console.log(`[TENANT-LEAK] server interno ativo em ${server.baseUrl}`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await server.close();
  });

  it("serviço: bloqueia tenant A acessando pedido de tenant B", async () => {
    vi.spyOn(db, "getPedidoById").mockResolvedValue({ id: 9, tenantId: tenantB, clienteId: 77 } as never);

    const call = assertOwnership(
      {
        user: { id: 10, role: "user", tenantId: tenantA } as never,
        vendedor: { userId: 10 } as never,
        session: null,
        tenantId: tenantA,
      },
      "pedido",
      9
    );

    await expect(call).rejects.toBeInstanceOf(TRPCError);
    await expect(call).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("serviço: bloqueia ownership mesmo no mesmo tenant quando owner difere", async () => {
    vi.spyOn(db, "getClienteOwnerRowById").mockResolvedValue({ id: 88, tenantId: tenantA, userId: 999 } as never);

    const call = assertOwnership(
      {
        user: { id: 10, role: "user", tenantId: tenantA } as never,
        vendedor: { userId: 10 } as never,
        session: null,
        tenantId: tenantA,
      },
      "cliente",
      88
    );

    await expect(call).rejects.toBeInstanceOf(TRPCError);
    await expect(call).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("http: bloqueia token do tenant A tentando recurso do tenant B", async () => {
    const tokenTenantA = jwt.sign({ userId: 111, tenantId: tenantA, role: "user" }, jwtSecret, {
      expiresIn: "30m",
    });

    const res = await fetch(`${server.baseUrl}/api/secure/tenant-resource/${tenantB}`, {
      headers: {
        Authorization: `Bearer ${tokenTenantA}`,
      },
    });
    const body = await res.json().catch(() => ({}));

    console.log("[TENANT-LEAK:HTTP-CROSS]", { status: res.status, body });

    expect([403, 404]).toContain(res.status);
    expect(JSON.stringify(body)).not.toContain("safe\":true");
  });
});