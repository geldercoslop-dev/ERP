import { createClient } from "redis";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc.js";
import { getDb } from "../db/index.js";
import { logger } from "../_core/logger.js";

type RedisCli = ReturnType<typeof createClient>;

export const healthRouter = router({
  check: publicProcedure.query(async () => {
      const startTime = Date.now();

      const backend = {
        status: "online" as const,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString(),
      };

      // Database health check
      let dbStatus: "connected" | "disconnected" | "error" = "disconnected";
      let dbError: string | null = null;
      
      try {
        const db = await getDb();
        await db.execute("SELECT 1 as health_check");
        dbStatus = "connected";
      } catch (error: unknown) {
        dbError = error instanceof Error ? error.message : String(error);
        dbStatus = "error";
        logger.error({ error: dbError, timestamp: new Date().toISOString() }, 'Database health check failed');
      }

      let redis: RedisCli | null = null;
      let redisStatus: "connected" | "disconnected" | "error" = "disconnected";
      let redisError: string | null = null;

      try {
        redis = createClient({
          socket: {
            host: process.env.REDIS_HOST ?? "localhost",
            port: Number(process.env.REDIS_PORT ?? 6379),
          },
        });

        await redis.connect();
        const pong = await redis.ping();
        redisStatus = pong === "PONG" ? "connected" : "error";
        if (redisStatus === "error") {
          redisError = `Resposta inesperada do PING: ${String(pong)}`;
        }
      } catch (error: unknown) {
        redisError = error instanceof Error ? error.message : String(error);
        redisStatus = "error";
      } finally {
        if (redis) {
          try {
            await redis.quit();
          } catch {
            /* ignore */
          }
        }
      }

      const responseTime = Date.now() - startTime;
      const isHealthy = dbStatus === "connected" && redisStatus === "connected";

      const healthData = {
        status: isHealthy ? "healthy" as const : "degraded" as const,
        backend,
        database: {
          status: dbStatus,
          error: dbError,
        },
        redis: {
          status: redisStatus,
          error: redisError,
        },
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString(),
      };

      // Se não está saudável, retornar erro para código 503
      if (!isHealthy) {
        throw new Error(`System degraded: DB=${dbStatus}, Redis=${redisStatus}`);
      }

      return healthData;
    }),

  ping: publicProcedure.query(() => {
    // TODO: Substituir por logger estruturado apropriado
    // logger.info('Health ping procedure executed', { timestamp: new Date().toISOString() });
    return {
      pong: true,
      timestamp: new Date().toISOString(),
    };
  }),
});
