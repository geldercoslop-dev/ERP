import { Redis } from "ioredis";

type GlobalWithRedis = typeof globalThis & {
  __erpRedisClient?: Redis;
};

function createRedisClient(): Redis {
  const client = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    connectTimeout: 5000,
    lazyConnect: true,
    retryStrategy(times: number): number | null {
      if (times > 5) {
        console.error("[REDIS] Retry limit reached. Aborting reconnection.", { attempts: times - 1 });
        return null;
      }

      const delay = Math.min(200 * Math.pow(2, times - 1), 2000);
      console.warn("[REDIS] Reconnecting with backoff", { attempt: times, delay });
      return delay;
    },
  });

  client.on("error", (error: unknown) => {
    console.error("[REDIS] Connection error", error);
  });

  return client;
}

const globalWithRedis = globalThis as GlobalWithRedis;

if (!globalWithRedis.__erpRedisClient) {
  globalWithRedis.__erpRedisClient = createRedisClient();
}

export const redis = globalWithRedis.__erpRedisClient;
