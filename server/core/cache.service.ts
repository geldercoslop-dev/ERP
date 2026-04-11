import { redisManager } from "../infra/redis.js";
import { createLogger } from "../infra/structured-logger.js";

type CacheKey = string;

const logger = createLogger("cache-service");

function assertTenantId(tenantId: number): void {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new Error("TENANT_REQUIRED");
  }
}

function assertCacheKey(key: string): void {
  if (!key || key.trim().length === 0) {
    throw new Error("CACHE_KEY_REQUIRED");
  }
}

function buildTenantCacheKey(tenantId: number, key: CacheKey): string {
  return `tenant:${tenantId}:${key}`;
}

export async function getCache<T>(tenantId: number, key: CacheKey): Promise<T | null> {
  assertTenantId(tenantId);
  assertCacheKey(key);

  const client = redisManager.getClient();
  if (!client) {
    const error = new Error("Redis client unavailable");
    logger.error("Redis client unavailable during getCache", error);
    throw error;
  }

  const raw = await client.get(buildTenantCacheKey(tenantId, key));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    logger.error("Invalid cache payload JSON", error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

export async function setCache<T>(tenantId: number, key: CacheKey, value: T, ttl: number): Promise<void> {
  assertTenantId(tenantId);
  assertCacheKey(key);

  if (!Number.isInteger(ttl) || ttl <= 0) {
    throw new Error("CACHE_TTL_REQUIRED");
  }

  const client = redisManager.getClient();
  if (!client) {
    const error = new Error("Redis client unavailable");
    logger.error("Redis client unavailable during setCache", error);
    throw error;
  }

  try {
    await client.set(buildTenantCacheKey(tenantId, key), JSON.stringify(value), "EX", ttl);
  } catch (error) {
    logger.error("Redis setCache failed", error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

export async function invalidateCache(tenantId: number, key: CacheKey): Promise<void> {
  assertTenantId(tenantId);
  assertCacheKey(key);

  const client = redisManager.getClient();
  if (!client) {
    const error = new Error("Redis client unavailable");
    logger.error("Redis client unavailable during invalidateCache", error);
    throw error;
  }

  try {
    await client.del(buildTenantCacheKey(tenantId, key));
  } catch (error) {
    logger.error("Redis invalidateCache failed", error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}
