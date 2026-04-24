import { publicProcedure, router } from "../_core/trpc.js";
import { getSystemHealthComplete } from "../services/system-health.service.js";
export const healthRouter = router({
    check: publicProcedure.query(async () => {
        console.log("[HEALTH] PASSO 1: Iniciando health check");
        try {
            console.log("[HEALTH] PASSO 2: Chamando getSystemHealthComplete()");
            const health = await getSystemHealthComplete();
            console.log("[HEALTH] PASSO 3: Recebeu health data", {
                status: health.status,
                dbStatus: health.database?.status,
                redisStatus: health.redis?.status
            });
            const isHealthy = health.status === "ok";
            console.log("[HEALTH] PASSO 4: Determinou health status", { isHealthy });
            const response = {
                status: isHealthy ? "ok" : "error",
                db: health.database.status === "ok" ? "ok" : "error",
                redis: health.redis.status === "ok" ? "ok" : "error",
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
            };
            console.log("[HEALTH] PASSO 5: Montando response final", { response });
            return response;
        }
        catch (error) {
            console.error("[HEALTH] ERRO: Capturado erro no health check", {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }),
    ping: publicProcedure.query(() => {
        return {
            pong: true,
            timestamp: new Date().toISOString(),
        };
    }),
});
