import { publicProcedure, router } from "../_core/trpc.js";
import { getSystemHealthComplete } from "../services/system-health.service.js";

export const healthRouter = router({
  check: publicProcedure.query(async () => {
    const health = await getSystemHealthComplete();
    const isHealthy = health.status === "ok";

    return {
      status: isHealthy ? "ok" as const : "error" as const,
      db: health.database.status === "ok" ? "ok" as const : "error" as const,
      redis: health.redis.status === "ok" ? "ok" as const : "error" as const,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }),

  ping: publicProcedure.query(() => {
    return {
      pong: true,
      timestamp: new Date().toISOString(),
    };
  }),
});
