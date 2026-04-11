import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiRouter } from "../../api-routes.js";
import { startHttpTestServer, type HttpTestServer } from "./_http-test-server.js";

describe("P0.7 Security - AUTH bypass", () => {
  let server: HttpTestServer;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "p0-7-test-secret";
    server = await startHttpTestServer((app) => {
      app.use("/api", apiRouter);
    });
    console.log(`[AUTH-BYPASS] server interno ativo em ${server.baseUrl}`);
  });

  afterAll(async () => {
    await server.close();
  });

  it("nega endpoint protegido sem token", async () => {
    const res = await fetch(`${server.baseUrl}/api/clients`);
    const body = await res.json().catch(() => ({}));

    console.log("[AUTH-BYPASS:NO-TOKEN]", { status: res.status, body });

    expect([401, 403]).toContain(res.status);
  });

  it("nega endpoint protegido com bearer inválido", async () => {
    const res = await fetch(`${server.baseUrl}/api/clients`, {
      headers: { Authorization: "Bearer token-malicioso" },
    });
    const body = await res.json().catch(() => ({}));

    console.log("[AUTH-BYPASS:INVALID-TOKEN]", { status: res.status, body });

    expect([401, 403]).toContain(res.status);
  });
});