import type { Application, Request, Response } from "express";
import crypto from "node:crypto";
import { getSystemHealthComplete } from "../services/system-health.service.js";

/**
 * Verificação leve de material criptográfico de auth (sem tocar em auth.login nem em serviços de sessão).
 */
function authLightCheck(): {
  ok: boolean;
  status: string;
  latencyMs: number;
  method: "hmac-jwt-secret";
} {
  const t0 = Date.now();
  try {
    const secret = process.env.JWT_ACCESS_SECRET?.trim();
    if (!secret || secret.length < 32) {
      return {
        ok: false,
        status: "error",
        latencyMs: Date.now() - t0,
        method: "hmac-jwt-secret",
      };
    }
    const sig = crypto.createHmac("sha256", secret).update("health-full-auth").digest("hex");
    if (sig.length !== 64) {
      return {
        ok: false,
        status: "error",
        latencyMs: Date.now() - t0,
        method: "hmac-jwt-secret",
      };
    }
    return {
      ok: true,
      status: "ok",
      latencyMs: Date.now() - t0,
      method: "hmac-jwt-secret",
    };
  } catch {
    return {
      ok: false,
      status: "error",
      latencyMs: Date.now() - t0,
      method: "hmac-jwt-secret",
    };
  }
}

export function registerHealthFullRoute(app: Application): void {
  app.get("/api/health/full", async (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const data = await getSystemHealthComplete();
      const auth = authLightCheck();
      const dbOk = data.database.status === "ok";
      const redisOk = data.redis.status === "ok";
      const authOk = auth.ok;
      const httpOk = dbOk && redisOk && authOk;
      res.status(httpOk ? 200 : 503).json({
        ...data,
        auth,
        checks: {
          database: dbOk ? "ok" : "fail",
          redis: redisOk ? "ok" : "fail",
          auth: authOk ? "ok" : "fail",
        },
      });
    } catch {
      res.status(503).json({
        error: {
          code: "HEALTH_FULL_UNAVAILABLE",
          message: "Health full indisponível",
        },
      });
    }
  });
}
