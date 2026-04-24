// Type guard para validar payload JWT
function isJWTPayload(data) {
    return (typeof data === "object" &&
        data !== null &&
        typeof data["userId"] === "number" &&
        typeof data["tenantId"] === "number");
}
import jwt from "jsonwebtoken";
import { createLogger } from '../infra/structured-logger.js';
import { parseEnv } from '../services/env.schema.js';
import { ValidationError, InfrastructureError } from '../_core/errors/typed-errors.js';
const logger = createLogger('jwt-security');
/**
 * Configuração JWT com segurança reforçada
 */
export class JWTSecurity {
    static ALGORITHM = "HS256";
    static MIN_SECRET_LENGTH = 32;
    static DEFAULT_EXPIRY = '15m';
    static REFRESH_EXPIRY = '7d';
    /**
     * Valida se o secret é forte o suficiente
     */
    /** Converte "15m", "7d", etc. em segundos (mesma convenção que jwt-auth). */
    static parseExpiryToSeconds(expiry) {
        const units = {
            s: 1,
            m: 60,
            h: 3600,
            d: 86400,
            w: 604800,
        };
        const match = expiry.match(/^(\d+)([smhdw])$/);
        if (!match) {
            throw new ValidationError(`Invalid expiry format: ${expiry}`);
        }
        const [, value, unit] = match;
        return parseInt(value, 10) * units[unit];
    }
    static validateSecret(secret) {
        if (!secret || typeof secret !== 'string') {
            return false;
        }
        // Verifica comprimento mínimo
        if (secret.length < this.MIN_SECRET_LENGTH) {
            logger.error('JWT secret too weak', `JWT secret too weak: length ${secret.length} < ${this.MIN_SECRET_LENGTH}`, {
                metadata: {
                    secretLength: secret.length,
                    minLength: this.MIN_SECRET_LENGTH,
                },
            });
            return false;
        }
        // Verifica se não é um valor padrão/fraco
        const weakSecrets = [
            'secret',
            'your-secret-key',
            'change-this-in-production',
            'jwt-secret',
            'default-secret',
            '123456',
            'password',
        ];
        if (weakSecrets.includes(secret.toLowerCase())) {
            logger.error('JWT secret is weak/default', `JWT secret is weak/default: ${secret.substring(0, 3)}...`, {
                metadata: {
                    secret: secret.substring(0, 3) + '...',
                },
            });
            return false;
        }
        return true;
    }
    /**
     * Gera token com segurança reforçada
     */
    static generateToken(payload, options = {}) {
        try {
            const secret = parseEnv().JWT_ACCESS_SECRET;
            if (!secret || !this.validateSecret(secret)) {
                throw new ValidationError('JWT_ACCESS_SECRET is invalid or missing');
            }
            const jwtPayload = {
                ...payload,
                iat: Math.floor(Date.now() / 1000),
                jti: this.generateJTI(),
            };
            const expiryStr = options.expiresIn || this.DEFAULT_EXPIRY;
            const signOptions = {
                algorithm: this.ALGORITHM,
                expiresIn: this.parseExpiryToSeconds(expiryStr),
                issuer: options.issuer || process.env.JWT_ISSUER || "erp-system",
                audience: options.audience || process.env.JWT_AUDIENCE || "erp-users",
            };
            const token = jwt.sign(jwtPayload, secret, signOptions);
            logger.info('JWT token generated', {
                metadata: {
                    userId: payload.userId,
                    tenantId: payload.tenantId,
                    expiresIn: signOptions.expiresIn,
                    jti: jwtPayload.jti,
                },
            });
            return token;
        }
        catch (error) {
            logger.error('Error generating JWT token', error);
            throw new InfrastructureError('Failed to generate token');
        }
    }
    /**
     * Gera refresh token
     */
    static generateRefreshToken(payload) {
        try {
            const secret = parseEnv().JWT_REFRESH_SECRET;
            if (!secret || !this.validateSecret(secret)) {
                throw new ValidationError('JWT refresh secret is invalid or missing');
            }
            const refreshPayload = {
                ...payload,
                type: 'refresh',
                jti: this.generateJTI(),
            };
            return jwt.sign(refreshPayload, secret, {
                algorithm: this.ALGORITHM,
                expiresIn: this.parseExpiryToSeconds(this.REFRESH_EXPIRY),
                issuer: process.env.JWT_ISSUER || "erp-system",
            });
        }
        catch (error) {
            logger.error('Error generating refresh token', error);
            throw new InfrastructureError('Failed to generate refresh token');
        }
    }
    /**
     * Valida token com verificações de segurança
     */
    static validateToken(token, options = {}) {
        try {
            const secret = options.secret || parseEnv().JWT_ACCESS_SECRET;
            if (!secret || !this.validateSecret(secret)) {
                return {
                    valid: false,
                    error: 'JWT_ACCESS_SECRET is invalid',
                };
            }
            const verifyOptions = {
                algorithms: [this.ALGORITHM],
                issuer: options.issuer || process.env.JWT_ISSUER || "erp-system",
                audience: options.audience || process.env.JWT_AUDIENCE || "erp-users",
                clockTolerance: 30, // 30 segundos de tolerância
            };
            const decoded = jwt.verify(token, secret, verifyOptions);
            if (!isJWTPayload(decoded)) {
                return { valid: false, error: "Invalid token payload" };
            }
            // Verifica se o token não expirou em breve (próximos 5 minutos)
            const now = Math.floor(Date.now() / 1000);
            const timeUntilExpiry = (typeof decoded.exp === "number" ? decoded.exp : 0) - now;
            if (timeUntilExpiry < 300) { // 5 minutos
                logger.warn('Token expiring soon', {
                    metadata: {
                        userId: decoded.userId,
                        tenantId: decoded.tenantId,
                        expiresAt: new Date(((typeof decoded.exp === "number" ? decoded.exp : 0) || 0) * 1000).toISOString(),
                        timeUntilExpiry,
                    },
                });
            }
            if (!isJWTPayload(decoded)) {
                throw new ValidationError("Invalid token payload");
            }
            const payload = decoded;
            return {
                valid: true,
                payload: payload,
            };
        }
        catch (error) {
            if (error instanceof Error && error.name === 'TokenExpiredError') {
                logger.warn('JWT token expired', {
                    error: {
                        message: error.message,
                    },
                    metadata: {
                        expiredAt: new Date(Date.now()).toISOString(),
                    },
                });
                return {
                    valid: false,
                    error: 'Token expired',
                    expired: true,
                };
            }
            if (error instanceof Error && error.name === 'JsonWebTokenError') {
                logger.warn('JWT token validation failed', {
                    error: {
                        message: error.message,
                    },
                });
                return {
                    valid: false,
                    error: 'Invalid token',
                };
            }
            logger.error('Unexpected JWT validation error', error);
            return {
                valid: false,
                error: 'Token validation failed',
            };
        }
    }
    /**
     * Valida refresh token
     */
    static validateRefreshToken(token) {
        try {
            const secret = parseEnv().JWT_REFRESH_SECRET;
            if (!secret || !this.validateSecret(secret)) {
                return {
                    valid: false,
                    error: 'JWT refresh secret is invalid',
                };
            }
            const decoded = jwt.verify(token, secret, {
                algorithms: [this.ALGORITHM],
                issuer: process.env.JWT_ISSUER || 'erp-system',
            });
            // Verifica se é um refresh token
            if (decoded.type !== 'refresh') {
                return {
                    valid: false,
                    error: 'Invalid refresh token',
                };
            }
            if (!isJWTPayload(decoded)) {
                throw new ValidationError("Invalid token payload");
            }
            const payload = decoded;
            return {
                valid: true,
                payload: payload,
            };
        }
        catch (error) {
            if (error instanceof Error && error.name === 'TokenExpiredError') {
                return {
                    valid: false,
                    error: 'Refresh token expired',
                    expired: true,
                };
            }
            return {
                valid: false,
                error: 'Invalid refresh token',
            };
        }
    }
    /**
     * Decodifica token sem validação (apenas para leitura)
     */
    static decodeToken(token) {
        try {
            const decoded = jwt.decode(token);
            return decoded;
        }
        catch (error) {
            logger.error('Error decoding JWT token', error);
            return null;
        }
    }
    /**
     * Gera JTI (JWT ID) único
     */
    static generateJTI() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2);
        return `${timestamp}_${random}`;
    }
    /**
     * Verifica força do token baseado no payload
     */
    static analyzeTokenStrength(token) {
        try {
            const decoded = jwt.decode(token, { complete: true });
            return {
                hasJTI: !!decoded?.payload?.jti,
                hasExpiration: !!decoded?.payload?.exp,
                algorithm: decoded?.header?.alg || null,
                expiresIn: decoded?.payload?.exp ? decoded.payload.exp - Math.floor(Date.now() / 1000) : null,
            };
        }
        catch (error) {
            return {
                hasJTI: false,
                hasExpiration: false,
                algorithm: null,
                expiresIn: null,
            };
        }
    }
}
/**
 * Middleware para validar JWT em requisições
 */
export function jwtValidationMiddleware(options = {}) {
    return (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                if (options.optional) {
                    return next();
                }
                return res.status(401).json({
                    error: 'Authorization header missing',
                    code: 'MISSING_AUTH',
                });
            }
            // Extrai token do header "Bearer <token>"
            const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/);
            if (!tokenMatch) {
                return res.status(401).json({
                    error: 'Invalid authorization header format',
                    code: 'INVALID_AUTH_FORMAT',
                });
            }
            const token = tokenMatch[1];
            // Valida token
            const validation = options.refresh
                ? JWTSecurity.validateRefreshToken(token)
                : JWTSecurity.validateToken(token);
            if (!validation.valid) {
                const statusCode = validation.expired ? 401 : 403;
                return res.status(statusCode).json({
                    error: validation.error,
                    code: validation.expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
                });
            }
            // Adiciona payload ao request
            req.user = {
                id: validation.payload.userId,
                role: validation.payload.role,
            };
            req.tenantId = validation.payload.tenantId;
            req.vendedorId = validation.payload.vendedorId;
            // Adiciona informações do token
            req.tokenInfo = {
                jti: validation.payload.jti,
                exp: validation.payload.exp,
                iat: validation.payload.iat,
            };
            next();
        }
        catch (error) {
            logger.error('JWT middleware error', error);
            res.status(500).json({
                error: 'Authentication error',
                code: 'AUTH_ERROR',
            });
        }
    };
}
/**
 * Middleware para renovar token
 */
export function jwtRefreshMiddleware() {
    return async (req, res, next) => {
        try {
            const { refreshToken } = req.body;
            if (!refreshToken) {
                return res.status(400).json({
                    error: 'Refresh token required',
                    code: 'MISSING_REFRESH_TOKEN',
                });
            }
            const validation = JWTSecurity.validateRefreshToken(refreshToken);
            if (!validation.valid) {
                const statusCode = validation.expired ? 401 : 403;
                return res.status(statusCode).json({
                    error: validation.error,
                    code: validation.expired ? 'REFRESH_EXPIRED' : 'INVALID_REFRESH_TOKEN',
                });
            }
            // Gera novo token de acesso
            const newToken = JWTSecurity.generateToken({
                userId: validation.payload.userId,
                tenantId: validation.payload.tenantId,
                role: validation.payload.role,
                vendedorId: validation.payload.vendedorId,
            });
            res.json({
                success: true,
                token: newToken,
                expiresIn: '15m',
            });
        }
        catch (error) {
            logger.error('JWT refresh error', error);
            res.status(500).json({
                error: 'Token refresh failed',
                code: 'REFRESH_ERROR',
            });
        }
    };
}
