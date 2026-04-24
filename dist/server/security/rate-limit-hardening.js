import { createLogger } from '../infra/structured-logger.js';
import { createRedisRateLimitMiddleware } from './redis-rate-limit.js';
const logger = createLogger('rate-limit-hardening');
function getTenant(req) {
    const tenantId = req.tenantId;
    if (typeof tenantId === 'number' && Number.isFinite(tenantId))
        return String(tenantId);
    if (typeof tenantId === 'string' && tenantId.trim() !== '')
        return tenantId.trim();
    return 'anonymous';
}
function getUserId(req) {
    const userId = req.user?.id;
    if (typeof userId === 'number' && Number.isFinite(userId))
        return String(userId);
    if (typeof userId === 'string' && userId.trim() !== '')
        return userId.trim();
    return 'anonymous';
}
function getIp(req) {
    return req.ip || req.connection.remoteAddress || 'unknown';
}
function getLoginIdentity(req) {
    const body = req.body;
    if (typeof body !== 'object' || body == null) {
        return 'unknown';
    }
    const data = body;
    const identity = data.email || data.usuario || data.username;
    return typeof identity === 'string' && identity.trim() !== '' ? identity.trim().toLowerCase() : 'unknown';
}
/**
 * Rate Limiting EXTREMO para endpoints críticos
 */
export function createCriticalRateLimit() {
    return createRedisRateLimitMiddleware({
        name: 'hardening-critical',
        windowMs: 60 * 1000,
        max: 5,
        code: 'CRITICAL_RATE_LIMIT',
        message: 'Critical endpoint rate limit exceeded',
        keySuffix: (req) => `critical:${getIp(req)}:${req.get('User-Agent') || 'unknown'}`,
        shouldApply: () => true,
        onBlocked: (req) => {
            logger.warn('Critical rate limit exceeded', {
                metadata: {
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    url: req.url,
                    method: req.method,
                    timestamp: new Date().toISOString(),
                },
            });
        },
    });
}
/**
 * Rate Limiting para endpoints de autenticação
 */
export function createAuthRateLimit() {
    return createRedisRateLimitMiddleware({
        name: 'hardening-auth',
        windowMs: 15 * 60 * 1000,
        max: 10,
        code: 'AUTH_RATE_LIMIT',
        message: 'Too many authentication attempts, please try again later',
        keySuffix: (req) => `auth:${getIp(req)}:${getLoginIdentity(req)}`,
        shouldApply: () => true,
        onBlocked: (req) => {
            logger.warn('Authentication rate limit exceeded', {
                metadata: {
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    url: req.url,
                    method: req.method,
                    email: getLoginIdentity(req),
                    timestamp: new Date().toISOString(),
                },
            });
        },
    });
}
/**
 * Rate Limiting para APIs sensíveis
 */
export function createSensitiveApiRateLimit() {
    return createRedisRateLimitMiddleware({
        name: 'hardening-sensitive',
        windowMs: 5 * 60 * 1000,
        max: 50,
        code: 'SENSITIVE_API_RATE_LIMIT',
        message: 'Sensitive API rate limit exceeded',
        keySuffix: (req) => `sensitive:${getTenant(req)}:${getIp(req)}`,
        shouldApply: () => true,
        onBlocked: (req) => {
            logger.warn('Sensitive API rate limit exceeded', {
                metadata: {
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    url: req.url,
                    method: req.method,
                    tenantId: getTenant(req),
                    timestamp: new Date().toISOString(),
                },
            });
        },
    });
}
/**
 * Rate Limiting para upload de arquivos
 */
export function createUploadRateLimit() {
    return createRedisRateLimitMiddleware({
        name: 'hardening-upload',
        windowMs: 60 * 1000,
        max: 3,
        code: 'UPLOAD_RATE_LIMIT',
        message: 'Upload rate limit exceeded, please try again later',
        keySuffix: (req) => `upload:${getTenant(req)}:${getIp(req)}`,
        shouldApply: () => true,
        onBlocked: (req) => {
            logger.warn('Upload rate limit exceeded', {
                metadata: {
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    url: req.url,
                    method: req.method,
                    tenantId: getTenant(req),
                    contentLength: req.get('Content-Length'),
                    timestamp: new Date().toISOString(),
                },
            });
        },
    });
}
/**
 * Rate Limiting para LEO AI
 */
export function createLeoRateLimit() {
    return createRedisRateLimitMiddleware({
        name: 'hardening-leo',
        windowMs: 60 * 1000,
        max: 20,
        code: 'LEO_RATE_LIMIT',
        message: 'LEO AI rate limit exceeded, please try again later',
        keySuffix: (req) => `leo:${getTenant(req)}:${getUserId(req)}:${getIp(req)}`,
        shouldApply: () => true,
        onBlocked: (req) => {
            logger.warn('LEO AI rate limit exceeded', {
                metadata: {
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    url: req.url,
                    method: req.method,
                    tenantId: getTenant(req),
                    userId: getUserId(req),
                    timestamp: new Date().toISOString(),
                },
            });
        },
    });
}
/**
 * Rate Limiting para prevenção de brute force
 */
export function createBruteForceProtection() {
    return createRedisRateLimitMiddleware({
        name: 'hardening-bruteforce',
        windowMs: 60 * 1000,
        max: 3,
        code: 'BRUTE_FORCE_PROTECTION',
        message: 'Brute force protection activated. Account temporarily locked.',
        keySuffix: (req) => `brute:${getIp(req)}:${getLoginIdentity(req)}`,
        shouldApply: () => true,
        onBlocked: (req) => {
            logger.warn('Brute force protection activated', {
                metadata: {
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    url: req.url,
                    method: req.method,
                    email: getLoginIdentity(req),
                    timestamp: new Date().toISOString(),
                },
            });
        },
    });
}
/**
 * Rate Limiting adaptativo baseado em comportamento
 */
export function createAdaptiveRateLimit() {
    return createRedisRateLimitMiddleware({
        name: 'hardening-adaptive',
        windowMs: 60 * 1000,
        max: 100,
        code: 'ADAPTIVE_RATE_LIMIT',
        message: 'Adaptive rate limit exceeded',
        keySuffix: (req) => `adaptive:${getIp(req)}:${(req.path || req.url).split('?')[0]}`,
        shouldApply: () => true,
        onBlocked: (req) => {
            logger.warn('Adaptive rate limit exceeded', {
                metadata: {
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    url: req.url,
                    method: req.method,
                    timestamp: new Date().toISOString(),
                },
            });
        },
    });
}
/**
 * Middleware completo de rate limiting hardening
 */
export function createHardeningRateLimits() {
    return [
        // Rate limit adaptativo geral
        createAdaptiveRateLimit(),
        // Rate limits específicos por endpoint
        {
            path: '/api/trpc/auth.login',
            limit: createAuthRateLimit()
        },
        {
            path: '/api/trpc/auth.register',
            limit: createAuthRateLimit()
        },
        {
            path: '/api/trpc/auth.forgotPassword',
            limit: createAuthRateLimit()
        },
        {
            path: '/api/trpc/auth.resetPassword',
            limit: createAuthRateLimit()
        },
        {
            path: '/admin',
            limit: createCriticalRateLimit()
        },
        {
            path: '/leo',
            limit: createLeoRateLimit()
        },
        {
            path: '/api/upload',
            limit: createUploadRateLimit()
        },
        {
            path: '/api/sensitive',
            limit: createSensitiveApiRateLimit()
        }
    ];
}
export default createHardeningRateLimits;
