import type { NextFunction, Request, RequestHandler, Response } from "express";
import { getRedisClient } from "../infra/redis.js";

export type RedisRateLimitOptions = {
  name: string;
  windowMs: number;
  max: number;
  code: string;
  message: string;
  shouldApply: (req: Request) => boolean;
  keySuffix?: (req: Request) => string;
  onBlocked?: (req: Request) => void;
};

type EvalResult = [number, number, number];

const LUA_FIXED_WINDOW = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max = tonumber(ARGV[3])

local state = redis.call('HMGET', key, 'count', 'resetAt')
local count = tonumber(state[1]) or 0
local resetAt = tonumber(state[2]) or 0

if resetAt <= now then
  count = 0
  resetAt = now + window
end

count = count + 1
redis.call('HMSET', key, 'count', count, 'resetAt', resetAt)
redis.call('PEXPIREAT', key, resetAt)

local remaining = max - count
if remaining < 0 then
  remaining = 0
end

return {count, resetAt, remaining}
`;

function normalizeIp(req: Request): string {
  const ip = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || "unknown";
  return String(ip).trim() || "unknown";
}

function defaultKeySuffix(req: Request): string {
  const endpoint = (req.path || req.url || "unknown").split("?")[0];
  return `${normalizeIp(req)}:${endpoint}`;
}

export function createRedisRateLimitMiddleware(options: RedisRateLimitOptions): RequestHandler {
  const {
    name,
    windowMs,
    max,
    code,
    message,
    shouldApply,
    keySuffix = defaultKeySuffix,
    onBlocked,
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!shouldApply(req)) {
      next();
      return;
    }

    const redis = getRedisClient();
    if (!redis) {
      next();
      return;
    }

    try {
      const key = `ratelimit:${name}:${keySuffix(req)}`;
      const now = Date.now();
      const raw = (await redis.eval(
        LUA_FIXED_WINDOW,
        1,
        key,
        String(now),
        String(windowMs),
        String(max)
      )) as EvalResult;

      const count = Number(raw[0]);
      const resetAt = Number(raw[1]);
      const remaining = Number(raw[2]);
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));

      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(remaining));
      res.setHeader("X-RateLimit-Reset", String(Math.floor(resetAt / 1000)));

      if (count > max) {
        if (onBlocked) {
          onBlocked(req);
        }

        res.setHeader("Retry-After", String(retryAfterSeconds));
        res.status(429).json({
          error: {
            code,
            message,
            details: {
              retryAfter: retryAfterSeconds,
            },
          },
        });
        return;
      }

      next();
    } catch {
      next();
    }
  };
}
