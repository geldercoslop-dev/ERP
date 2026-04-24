import { createLogger } from '../infra/structured-logger.js';
const logger = createLogger('security-validation');
/**
 * Middleware de validação para endpoints críticos
 */
export function securityValidationMiddleware() {
    return (req, res, next) => {
        try {
            // Validações básicas de segurança
            const validations = [
                validateRequestSize(req),
                validateRequestPath(req),
                validateContentType(req),
                validateUserAgent(req),
            ];
            for (const validation of validations) {
                if (!validation.valid) {
                    logger.warn('Security validation failed', {
                        metadata: {
                            reason: validation.reason,
                            path: req.path,
                            method: req.method,
                            ip: req.ip,
                            userAgent: req.get('User-Agent'),
                        },
                    });
                    return res.status(400).json({
                        error: 'Security validation failed',
                        reason: validation.reason,
                    });
                }
            }
            next();
        }
        catch (error) {
            logger.error('Security validation error', error);
            res.status(500).json({
                error: 'Internal server error',
            });
        }
    };
}
/**
 * Valida tamanho da requisição
 */
function validateRequestSize(req) {
    const contentLength = parseInt(req.get('Content-Length') || '0', 10);
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (contentLength > maxSize) {
        return {
            valid: false,
            reason: `Request too large: ${contentLength} bytes (max: ${maxSize})`,
        };
    }
    return { valid: true, reason: '' };
}
/**
 * Valida path da requisição
 */
function validateRequestPath(req) {
    const path = req.path;
    // Verifica caracteres suspeitos
    const suspiciousChars = /[<>\"'&]/;
    if (suspiciousChars.test(path)) {
        return {
            valid: false,
            reason: 'Suspicious characters in path',
        };
    }
    // Verifica patterns de injection
    const injectionPatterns = [
        /\$\(/,
        /\{\$/,
        /<script/i,
        /javascript:/i,
    ];
    for (const pattern of injectionPatterns) {
        if (pattern.test(path)) {
            return {
                valid: false,
                reason: 'Possible injection attempt',
            };
        }
    }
    return { valid: true, reason: '' };
}
/**
 * Valida Content-Type
 */
function validateContentType(req) {
    const method = req.method;
    const contentType = req.get('Content-Type') || '';
    // Para POST/PUT, deve ter Content-Type
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
        const allowedTypes = [
            'application/json',
            'application/x-www-form-urlencoded',
            'multipart/form-data',
        ];
        const isValidType = allowedTypes.some(type => contentType.includes(type));
        if (!isValidType) {
            return {
                valid: false,
                reason: `Invalid Content-Type: ${contentType}`,
            };
        }
    }
    return { valid: true, reason: '' };
}
/**
 * Valida User-Agent
 */
function validateUserAgent(req) {
    const userAgent = req.get('User-Agent') || '';
    // Verifica User-Agent muito curto ou vazio (possível bot)
    if (userAgent.length < 10) {
        return {
            valid: false,
            reason: 'Invalid or missing User-Agent',
        };
    }
    // Verifica patterns de bots
    const botPatterns = [
        /bot/i,
        /crawler/i,
        /scraper/i,
        /curl/i,
        /wget/i,
    ];
    for (const pattern of botPatterns) {
        if (pattern.test(userAgent)) {
            return {
                valid: false,
                reason: 'Bot or automated tool detected',
            };
        }
    }
    return { valid: true, reason: '' };
}
/**
 * Middleware para rate limiting simples
 */
export function simpleRateLimitMiddleware() {
    const requests = new Map();
    const WINDOW_MS = 60 * 1000; // 1 minuto
    const MAX_REQUESTS = 100;
    return (req, res, next) => {
        const ip = req.ip || 'unknown';
        const now = Date.now();
        const key = ip;
        let userRequests = requests.get(key);
        if (!userRequests || now - userRequests.lastReset > WINDOW_MS) {
            userRequests = { count: 0, lastReset: now };
            requests.set(key, userRequests);
        }
        userRequests.count++;
        if (userRequests.count > MAX_REQUESTS) {
            logger.warn('Rate limit exceeded', {
                metadata: {
                    ip,
                    count: userRequests.count,
                    maxRequests: MAX_REQUESTS,
                },
            });
            return res.status(429).json({
                error: 'Too many requests',
                retryAfter: Math.ceil(WINDOW_MS / 1000),
            });
        }
        next();
    };
}
/**
 * Middleware para logging de segurança
 */
export function securityLoggingMiddleware() {
    return (req, res, next) => {
        const startTime = Date.now();
        // Intercepta resposta
        const originalJson = res.json;
        res.json = function (data, ...args) {
            const duration = Date.now() - startTime;
            const statusCode = res.statusCode;
            // Log de requisições suspeitas
            if (statusCode >= 400 || duration > 5000) {
                logger.warn('Suspicious request detected', {
                    metadata: {
                        path: req.path,
                        method: req.method,
                        statusCode,
                        duration,
                        ip: req.ip,
                        userAgent: req.get('User-Agent'),
                        contentLength: req.get('Content-Length'),
                    },
                });
            }
            return originalJson.call(this, data);
        };
        next();
    };
}
