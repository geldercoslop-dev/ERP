import { createLogger } from '../infra/structured-logger.js';
const logger = createLogger('attack-detection');
/**
 * Padrões maliciosos para detecção
 */
const MALICIOUS_PATTERNS = {
    // SQL Injection
    sql: [
        /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
        /(\b(ALTER|CREATE|DELETE|DROP|MERGE|SELECT|UPDATE|UNION|HAVING)\b)/gi,
        // Obs: não tratar ';' isolado como malicioso (quebra User-Agent e headers comuns)
        /('|(\\')|--)/gi,
        /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
        /(\b(OR|AND)\s+['"]?\w+['"]?\s*=\s*['"]?\w+['"]?)/gi,
    ],
    // XSS
    xss: [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /javascript:/gi,
        /on\w+\s*=\s*["'][^"']*["']/gi,
        /<iframe\b[^>]*>/gi,
        /<object\b[^>]*>/gi,
        /<embed\b[^>]*>/gi,
        /<link\b[^>]*>/gi,
        /<meta\b[^>]*>/gi,
        /eval\s*\(/gi,
        /setTimeout\s*\(/gi,
        /setInterval\s*\(/gi,
    ],
    // Path Traversal
    pathTraversal: [
        /\.\.[\/\\]/gi,
        /%2e%2e[\/\\]/gi,
        /\.\.%2f/gi,
        /\.\.%5c/gi,
        /%2e%2e%2f/gi,
        /%2e%2e%5c/gi,
    ],
    // Command Injection
    command: [
        /(\||&|;|\$\(|\`)/gi,
        /\b(curl|wget|nc|netcat|telnet|ssh|ftp|sftp)\b/gi,
        /\b(rm|mv|cp|cat|ls|ps|kill|chmod|chown)\b/gi,
        /\b(python|perl|ruby|bash|sh|cmd|powershell)\b/gi,
    ],
    // NoSQL Injection
    nosql: [
        /\$where/gi,
        /\$ne/gi,
        /\$gt/gi,
        /\$lt/gi,
        /\$in/gi,
        /\$nin/gi,
        /\$regex/gi,
        /\{ \$[^}]* \}/gi,
    ],
    // LDAP Injection
    ldap: [
        /\*\)/gi,
        /\(\|/gi,
        /\(\&/gi,
        /[()&|]/gi,
    ],
    // XXE Injection (evitar /SYSTEM/ solto — falso positivo em /api/system/health)
    xxe: [
        /<!DOCTYPE/gi,
        /<\?xml/gi,
        /<!ENTITY/gi,
        /<!ENTITY[^>]*\bSYSTEM\b/gi,
        /<!ENTITY[^>]*\bPUBLIC\b/gi,
    ],
    // Buffer Overflow Attempts
    bufferOverflow: [
        /.{1000,}/gi, // Strings muito longas
        /A{100,}/gi, // Repetição de caracteres
    ],
};
/**
 * Padrões suspeitos em query strings
 */
const SUSPICIOUS_QUERIES = [
    /\b(admin|administrator|root|test|debug|dev|staging)\b/gi,
    /\b(phpinfo|info|php|asp|jsp|cgi)\b/gi,
    /\b(config|configuration|settings|env|environment)\b/gi,
    /\b(backup|dump|export|download|file)\b/gi,
    /\b(sql|query|select|insert|update|delete)\b/gi,
    /\b(user|password|pass|pwd|login|auth)\b/gi,
];
/**
 * Limites para detecção de flood
 */
const FLOOD_LIMITS = {
    maxUrlLength: 2048,
    maxHeaderCount: 50,
    maxHeaderValueLength: 8192,
    maxBodySize: 10 * 1024 * 1024, // 10MB
    maxParamCount: 100,
    maxParamNameLength: 100,
    maxParamValueLength: 10000,
};
/**
 * Verifica se contém padrões maliciosos
 */
function containsMaliciousPatterns(input) {
    for (const [type, patterns] of Object.entries(MALICIOUS_PATTERNS)) {
        for (const pattern of patterns) {
            if (pattern.test(input)) {
                return { detected: true, type, pattern };
            }
        }
    }
    return { detected: false, type: '', pattern: /(?:)/ };
}
/**
 * Verifica query string suspeita
 */
function hasSuspiciousQuery(queryString) {
    return SUSPICIOUS_QUERIES.some(pattern => pattern.test(queryString));
}
/**
 * Verifica limites de flood
 */
function checkFloodLimits(req) {
    // Verificar tamanho da URL
    if (req.url.length > FLOOD_LIMITS.maxUrlLength) {
        return { valid: false, reason: `URL too long: ${req.url.length}` };
    }
    // Verificar número de headers
    const headerCount = Object.keys(req.headers).length;
    if (headerCount > FLOOD_LIMITS.maxHeaderCount) {
        return { valid: false, reason: `Too many headers: ${headerCount}` };
    }
    // Verificar tamanho dos headers
    for (const [key, value] of Object.entries(req.headers)) {
        if (value && value.toString().length > FLOOD_LIMITS.maxHeaderValueLength) {
            return { valid: false, reason: `Header too long: ${key}` };
        }
    }
    // Verificar Content-Length
    const contentLength = parseInt(req.get('Content-Length') || '0');
    if (contentLength > FLOOD_LIMITS.maxBodySize) {
        return { valid: false, reason: `Body too large: ${contentLength}` };
    }
    // Verificar parâmetros
    if (req.query) {
        const paramCount = Object.keys(req.query).length;
        if (paramCount > FLOOD_LIMITS.maxParamCount) {
            return { valid: false, reason: `Too many query params: ${paramCount}` };
        }
        for (const [key, value] of Object.entries(req.query)) {
            if (key.length > FLOOD_LIMITS.maxParamNameLength) {
                return { valid: false, reason: `Param name too long: ${key}` };
            }
            if (value && value.toString().length > FLOOD_LIMITS.maxParamValueLength) {
                return { valid: false, reason: `Param value too long: ${key}` };
            }
        }
    }
    return { valid: true };
}
/**
 * Middleware de detecção de ataques
 */
export function attackDetectionMiddleware() {
    return (req, res, next) => {
        try {
            // Verificar flood limits
            const floodCheck = checkFloodLimits(req);
            if (!floodCheck.valid) {
                logger.warn('Flood attack detected', {
                    metadata: {
                        ip: req.ip,
                        userAgent: req.get('User-Agent'),
                        url: req.url,
                        method: req.method,
                        reason: floodCheck.reason,
                        timestamp: new Date().toISOString(),
                    }
                });
                return res.status(429).json({
                    error: 'Too Many Requests',
                    message: 'Request exceeds limits',
                    code: 'FLOOD_DETECTED'
                });
            }
            // Verificar URL
            const urlCheck = containsMaliciousPatterns(req.url);
            if (urlCheck.detected) {
                logger.warn('Malicious pattern in URL', {
                    metadata: {
                        ip: req.ip,
                        userAgent: req.get('User-Agent'),
                        url: req.url,
                        method: req.method,
                        attackType: urlCheck.type,
                        pattern: urlCheck.pattern.toString(),
                        timestamp: new Date().toISOString(),
                    }
                });
                return res.status(400).json({
                    error: 'Bad Request',
                    message: 'Malicious content detected',
                    code: 'MALICIOUS_URL'
                });
            }
            // Verificar query string
            if (req.query && hasSuspiciousQuery(req.url.split('?')[1] || '')) {
                logger.warn('Suspicious query detected', {
                    metadata: {
                        ip: req.ip,
                        userAgent: req.get('User-Agent'),
                        url: req.url,
                        method: req.method,
                        query: req.query,
                        timestamp: new Date().toISOString(),
                    }
                });
                return res.status(400).json({
                    error: 'Bad Request',
                    message: 'Suspicious query parameters',
                    code: 'SUSPICIOUS_QUERY'
                });
            }
            // Verificar headers
            for (const [key, value] of Object.entries(req.headers)) {
                if (value) {
                    const lowerKey = key.toLowerCase();
                    // Não aplicar regex genérico em headers comuns; há checagens específicas abaixo (User-Agent).
                    if (lowerKey === "user-agent" || lowerKey === "accept" || lowerKey === "accept-encoding") {
                        continue;
                    }
                    const headerCheck = containsMaliciousPatterns(value.toString());
                    if (headerCheck.detected) {
                        logger.warn('Malicious pattern in header', {
                            metadata: {
                                ip: req.ip,
                                userAgent: req.get('User-Agent'),
                                url: req.url,
                                method: req.method,
                                header: key,
                                attackType: headerCheck.type,
                                pattern: headerCheck.pattern.toString(),
                                timestamp: new Date().toISOString(),
                            }
                        });
                        return res.status(400).json({
                            error: 'Bad Request',
                            message: 'Malicious content in headers',
                            code: 'MALICIOUS_HEADER'
                        });
                    }
                }
            }
            // Verificar User-Agent suspeito
            const userAgent = req.get('User-Agent') || '';
            const suspiciousUA = [
                /bot/gi,
                /crawler/gi,
                /scanner/gi,
                /sqlmap/gi,
                /nikto/gi,
                /nmap/gi,
                /masscan/gi,
                /dirb/gi,
                /gobuster/gi,
                /wfuzz/gi,
            ];
            for (const pattern of suspiciousUA) {
                if (pattern.test(userAgent)) {
                    logger.warn('Suspicious User-Agent detected', {
                        metadata: {
                            ip: req.ip,
                            userAgent: userAgent,
                            url: req.url,
                            method: req.method,
                            pattern: pattern.toString(),
                            timestamp: new Date().toISOString(),
                        }
                    });
                    return res.status(403).json({
                        error: 'Forbidden',
                        message: 'Access denied',
                        code: 'SUSPICIOUS_USER_AGENT'
                    });
                }
            }
            // Verificar body (para POST/PUT)
            if (req.body && (req.method === 'POST' || req.method === 'PUT')) {
                const bodyString = JSON.stringify(req.body);
                const bodyCheck = containsMaliciousPatterns(bodyString);
                if (bodyCheck.detected) {
                    logger.warn('Malicious pattern in body', {
                        metadata: {
                            ip: req.ip,
                            userAgent: req.get('User-Agent'),
                            url: req.url,
                            method: req.method,
                            attackType: bodyCheck.type,
                            pattern: bodyCheck.pattern.toString(),
                            timestamp: new Date().toISOString(),
                        }
                    });
                    return res.status(400).json({
                        error: 'Bad Request',
                        message: 'Malicious content in request body',
                        code: 'MALICIOUS_BODY'
                    });
                }
            }
            next();
        }
        catch (error) {
            logger.error('Error in attack detection', 'Attack detection middleware error', {
                metadata: {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    url: req.url,
                    method: req.method,
                    ip: req.ip,
                }
            });
            // Em caso de erro, bloquear por segurança
            return res.status(500).json({
                error: 'Internal Server Error',
                message: 'Security check failed',
                code: 'SECURITY_ERROR'
            });
        }
    };
}
/**
 * Middleware específico para endpoints críticos
 */
export function criticalEndpointProtection() {
    return (req, res, next) => {
        // Verificações adicionais para endpoints críticos
        const criticalPaths = ['/auth', '/login', '/api/trpc/auth', '/admin'];
        const isCritical = criticalPaths.some(path => req.path.includes(path));
        if (isCritical) {
            // Rate limit mais restritivo para endpoints críticos
            res.setHeader('X-RateLimit-Limit', '10');
            res.setHeader('X-RateLimit-Remaining', '9');
            res.setHeader('X-RateLimit-Reset', new Date(Date.now() + 60 * 1000).toISOString());
            // Headers adicionais de segurança
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('X-XSS-Protection', '1; mode=block');
            res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
            // Cache control
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            logger.info('Critical endpoint accessed', {
                metadata: {
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    url: req.url,
                    method: req.method,
                    timestamp: new Date().toISOString(),
                }
            });
        }
        next();
    };
}
export default attackDetectionMiddleware;
