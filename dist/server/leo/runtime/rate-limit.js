/**
 * Rate limiting específico para endpoints LEO
 * Extraído do core para isolamento semântico
 */
import { createRedisRateLimitMiddleware } from "../../security/redis-rate-limit.js";
export const leoRateLimiter = createRedisRateLimitMiddleware({
    name: "leo",
    windowMs: 60 * 1000,
    max: 20,
    code: "LEO_RATE_LIMITED",
    message: "Muitas requisições para LEO.",
    shouldApply: (req) => /\/api\/trpc\/leo(\.|\/)/.test(req.originalUrl || req.url),
});
