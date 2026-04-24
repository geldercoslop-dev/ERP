import crypto from "node:crypto";
import { createClient } from "redis";
import { pingDatabase } from "../services/database-health.service.js";
import { parseEnv } from "../services/env.schema.js";
async function checkDatabase() {
    const start = Date.now();
    try {
        const result = await pingDatabase("HEALTH_FULL");
        return { status: result.ok ? "ok" : "error", responseTime: Date.now() - start };
    }
    catch (e) {
        return {
            status: "error",
            responseTime: Date.now() - start,
            error: e instanceof Error ? e.message : String(e),
        };
    }
}
async function checkRedis() {
    const start = Date.now();
    const redis = createClient({
        socket: {
            host: parseEnv().REDIS_HOST ?? "localhost",
            port: Number(parseEnv().REDIS_PORT ?? 6379),
        },
    });
    try {
        await redis.connect();
        const pong = await redis.ping();
        if (pong !== "PONG") {
            return {
                status: "error",
                responseTime: Date.now() - start,
                error: `PING inválido: ${String(pong)}`,
            };
        }
        return { status: "ok", responseTime: Date.now() - start };
    }
    catch (e) {
        return {
            status: "error",
            responseTime: Date.now() - start,
            error: e instanceof Error ? e.message : String(e),
        };
    }
    finally {
        try {
            await redis.quit();
        }
        catch {
            // noop
        }
    }
}
/**
 * Verificação leve de material criptográfico de auth (sem tocar em auth.login nem em serviços de sessão).
 */
function authLightCheck() {
    const t0 = Date.now();
    try {
        const secret = parseEnv().JWT_ACCESS_SECRET?.trim();
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
    }
    catch {
        return {
            ok: false,
            status: "error",
            latencyMs: Date.now() - t0,
            method: "hmac-jwt-secret",
        };
    }
}
export function registerHealthFullRoute(app) {
    app.get("/api/health/full", async (_req, res) => {
        res.setHeader("Cache-Control", "no-store");
        try {
            const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
            const auth = authLightCheck();
            const dbOk = database.status === "ok";
            const redisOk = redis.status === "ok";
            const authOk = auth.ok;
            const httpOk = dbOk && redisOk && authOk;
            res.status(httpOk ? 200 : 503).json({
                status: httpOk ? "ok" : "error",
                timestamp: new Date().toISOString(),
                responseTime: database.responseTime + redis.responseTime,
                database,
                redis,
                auth,
                checks: {
                    database: dbOk ? "ok" : "fail",
                    redis: redisOk ? "ok" : "fail",
                    auth: authOk ? "ok" : "fail",
                },
            });
        }
        catch {
            res.status(503).json({
                error: {
                    code: "HEALTH_FULL_UNAVAILABLE",
                    message: "Health full indisponível",
                },
            });
        }
    });
}
