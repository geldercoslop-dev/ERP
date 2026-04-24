/**
 * Security Middleware
 *
 * Sanitização de headers e proteção contra ataques
 * Validação de payloads e configurações de segurança
 */
import { logger } from '../_core/logger.js';
import { isString } from '../_core/validators.js';
/**
 * Configurações padrão de segurança
 */
const DEFAULT_SECURITY_CONFIG = {
    maxHeaderSize: 8192, // 8KB
    maxPayloadSize: 1024 * 1024, // 1MB
    allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    blockedHeaders: [
        'x-forwarded-host',
        'x-originating-ip',
        'x-remote-ip',
        'x-remote-addr'
    ],
    enableXSSProtection: true,
    enableContentTypeCheck: true
};
/**
 * Headers de segurança padrão
 */
const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
};
/**
 * Valida tamanho dos headers
 */
function validateHeaderSize(headers, maxSize) {
    let totalSize = 0;
    for (const [key, value] of Object.entries(headers)) {
        if (!isString(key) || !isString(value))
            continue;
        totalSize += key.length + value.length + 4; // +4 para ": " e \r\n"
        if (totalSize > maxSize) {
            return false;
        }
    }
    return true;
}
/**
 * Valida método HTTP
 */
function validateMethod(method, allowed) {
    return allowed.includes(method.toUpperCase());
}
/**
 * Valida Content-Type para requests com body
 */
function validateContentType(req) {
    // Skip para requests sem body
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
        return true;
    }
    const contentType = req.headers['content-type'];
    if (!contentType) {
        return false;
    }
    // Content-Types permitidos
    const allowedTypes = [
        'application/json',
        'application/x-www-form-urlencoded',
        'multipart/form-data',
        'text/plain'
    ];
    return allowedTypes.some(type => contentType.toLowerCase().includes(type));
}
/**
 * Valida tamanho do payload
 */
function validatePayloadSize(req, maxSize) {
    const contentLength = req.headers['content-length'];
    if (!contentLength) {
        return true; // Sem content-length, assume que está OK
    }
    const size = parseInt(contentLength, 10);
    return !isNaN(size) && size <= maxSize;
}
/**
 * Detecta padrões suspeitos em headers
 */
function detectSuspiciousHeaders(headers) {
    const suspicious = [];
    const patterns = [
        /<script/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /expression\s*\(/i,
        /@import/i,
        /union\s+select/i,
        /drop\s+table/i,
        /insert\s+into/i
    ];
    for (const [key, value] of Object.entries(headers)) {
        if (!isString(key) || !isString(value))
            continue;
        for (const pattern of patterns) {
            if (pattern.test(value)) {
                suspicious.push(`${key}: ${value}`);
                break;
            }
        }
    }
    return suspicious;
}
/**
 * Detecta User-Agent suspeito
 */
function detectSuspiciousUserAgent(userAgent) {
    if (!isString(userAgent))
        return true;
    const suspiciousPatterns = [
        /bot/i,
        /crawler/i,
        /scanner/i,
        /curl/i,
        /wget/i,
        /python/i,
        /perl/i,
        /java/i,
        /go-http/i,
        /okhttp/i
    ];
    // Permitir alguns bots legítimos
    const allowedBots = [
        'googlebot',
        'bingbot',
        'slurp',
        'duckduckbot',
        'baiduspider'
    ];
    const isAllowedBot = allowedBots.some(bot => userAgent.toLowerCase().includes(bot));
    if (isAllowedBot)
        return false;
    return suspiciousPatterns.some(pattern => pattern.test(userAgent));
}
/**
 * Aplica headers de segurança
 */
function applySecurityHeaders(res, req) {
    // Headers básicos
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
        if (value) {
            res.setHeader(key, value);
        }
    });
    // HSTS apenas em HTTPS
    if (req.protocol === 'https' || req.secure) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    // CSP básico
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'");
}
/**
 * Log de segurança
 */
function logSecurityEvent(event, details, req) {
    logger.warn({
        event,
        ip: req.ip || req.socket?.remoteAddress,
        userAgent: req.headers['user-agent'],
        method: req.method,
        path: req.path,
        timestamp: new Date().toISOString(),
        ...details
    }, 'Security event detected');
}
/**
 * Middleware de segurança
 */
export function createSecurityMiddleware(config = DEFAULT_SECURITY_CONFIG) {
    return (req, res, next) => {
        try {
            // 1. Validar método HTTP
            if (!validateMethod(req.method || '', config.allowedMethods)) {
                logSecurityEvent('invalid_method', { method: req.method }, req);
                res.status(405).json({
                    error: 'Method Not Allowed',
                    message: 'HTTP method not allowed'
                });
                return;
            }
            // 2. Validar tamanho dos headers
            if (!validateHeaderSize(req.headers, config.maxHeaderSize)) {
                logSecurityEvent('headers_too_large', {
                    headerSize: JSON.stringify(req.headers).length
                }, req);
                res.status(431).json({
                    error: 'Request Header Fields Too Large',
                    message: 'Headers exceed maximum size'
                });
                return;
            }
            // 3. Detectar headers suspeitos
            const suspiciousHeaders = detectSuspiciousHeaders(req.headers);
            if (suspiciousHeaders.length > 0) {
                logSecurityEvent('suspicious_headers', {
                    headers: suspiciousHeaders
                }, req);
                res.status(400).json({
                    error: 'Bad Request',
                    message: 'Suspicious headers detected'
                });
                return;
            }
            // 4. Validar Content-Type
            if (config.enableContentTypeCheck && !validateContentType(req)) {
                logSecurityEvent('invalid_content_type', {
                    contentType: req.headers['content-type']
                }, req);
                res.status(415).json({
                    error: 'Unsupported Media Type',
                    message: 'Content-Type not allowed'
                });
                return;
            }
            // 5. Validar tamanho do payload
            if (!validatePayloadSize(req, config.maxPayloadSize)) {
                logSecurityEvent('payload_too_large', {
                    contentLength: req.headers['content-length']
                }, req);
                res.status(413).json({
                    error: 'Payload Too Large',
                    message: 'Request payload exceeds maximum size'
                });
                return;
            }
            // 6. Detectar User-Agent suspeito
            const userAgent = req.headers['user-agent'];
            if (detectSuspiciousUserAgent(userAgent || '')) {
                logSecurityEvent('suspicious_user_agent', {
                    userAgent
                }, req);
                // Não bloqueia, apenas loga para análise
            }
            // 7. Remover headers bloqueados
            config.blockedHeaders.forEach(header => {
                delete req.headers[header.toLowerCase()];
            });
            // 8. Aplicar headers de segurança
            applySecurityHeaders(res, req);
            next();
        }
        catch (error) {
            logSecurityEvent('security_middleware_error', {
                error: error instanceof Error ? error.message : String(error)
            }, req);
            res.status(500).json({
                error: 'Internal Server Error',
                message: 'Security validation failed'
            });
        }
    };
}
/**
 * Middleware de segurança padrão (export)
 */
export const securityMiddleware = createSecurityMiddleware();
/**
 * Utilitários de segurança
 */
export const securityUtils = {
    /**
     * Valida IP seguro
     */
    isSecureIP: (ip) => {
        // IPv4 localhost
        if (ip === '127.0.0.1' || ip === '::1')
            return true;
        // IPv6 localhost
        if (ip.startsWith('::ffff:127.0.0.1'))
            return true;
        // Private networks
        const privateRanges = [
            /^10\./,
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
            /^192\.168\./,
            /^fc00:/,
            /^fe80:/
        ];
        return !privateRanges.some(range => range.test(ip));
    },
    /**
     * Sanitiza string para logs
     */
    sanitizeForLog: (input) => {
        if (!isString(input))
            return String(input);
        return input
            .replace(/[<>]/g, '') // Remove tags
            .replace(/javascript:/gi, '') // Remove javascript URLs
            .replace(/on\w+\s*=/gi, '') // Remove event handlers
            .substring(0, 200); // Limita tamanho
    },
    /**
     * Obtém configuração atual
     */
    getConfig: () => DEFAULT_SECURITY_CONFIG
};
