import { createClient } from "redis";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";

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

      return {
        status: "healthy" as const,
        backend,
        redis: {
          status: redisStatus,
          error: redisError,
        },
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString(),
      };
    }),

  ping: publicProcedure.query(() => {
    console.log("🔥 HEALTH PROCEDURE EXECUTADO");
    return {
      pong: true,
      timestamp: new Date().toISOString(),
    };
  }),
});
