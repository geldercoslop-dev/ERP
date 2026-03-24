import jwt from 'jsonwebtoken';
import { createLogger } from '../infra/structured-logger';

const logger = createLogger('jwt-security');

export interface JWTPayload {
  userId: number;
  tenantId: number;
  vendedorId?: number;
  role: string;
  iat?: number;
  exp?: number;
  jti?: string;
}

export interface JWTValidationResult {
  valid: boolean;
  payload?: JWTPayload;
  error?: string;
  expired?: boolean;
}

/**
 * Configuração JWT com segurança reforçada
 */
export class JWTSecurity {
  private static readonly ALGORITHM = 'HS256';
  private static readonly MIN_SECRET_LENGTH = 32;
  private static readonly DEFAULT_EXPIRY = '15m';
  private static readonly REFRESH_EXPIRY = '7d';
  
  /**
   * Valida se o secret é forte o suficiente
   */
  static validateSecret(secret: string): boolean {
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
  static generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>, options: {
    expiresIn?: string;
    issuer?: string;
    audience?: string;
  } = {}): string {
    try {
      const secret = process.env.JWT_ACCESS_SECRET;
      if (!secret || !this.validateSecret(secret)) {
        throw new Error('JWT_ACCESS_SECRET is invalid or missing');
      }
      
      const jwtPayload: JWTPayload = {
        ...payload,
        iat: Math.floor(Date.now() / 1000),
        jti: this.generateJTI(),
      };
      
      const signOptions = {
        algorithm: this.ALGORITHM,
        expiresIn: options.expiresIn || this.DEFAULT_EXPIRY,
        issuer: options.issuer || process.env.JWT_ISSUER || 'erp-system',
        audience: options.audience || process.env.JWT_AUDIENCE || 'erp-users',
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
    } catch (error) {
      logger.error('Error generating JWT token', error as Error);
      throw new Error('Failed to generate token');
    }
  }
  
  /**
   * Gera refresh token
   */
  static generateRefreshToken(payload: Pick<JWTPayload, 'userId' | 'tenantId'>): string {
    try {
      const secret = process.env.JWT_REFRESH_SECRET;
      if (!secret || !this.validateSecret(secret)) {
        throw new Error('JWT refresh secret is invalid or missing');
      }
      
      const refreshPayload = {
        ...payload,
        type: 'refresh',
        jti: this.generateJTI(),
      };
      
      return jwt.sign(refreshPayload, secret, {
        algorithm: this.ALGORITHM,
        expiresIn: this.REFRESH_EXPIRY,
        issuer: process.env.JWT_ISSUER || 'erp-system',
      } as any);
    } catch (error) {
      logger.error('Error generating refresh token', error as Error);
      throw new Error('Failed to generate refresh token');
    }
  }
  
  /**
   * Valida token com verificações de segurança
   */
  static validateToken(token: string, options: {
    secret?: string;
    issuer?: string;
    audience?: string;
  } = {}): JWTValidationResult {
    try {
      const secret = options.secret || process.env.JWT_ACCESS_SECRET;
      if (!secret || !this.validateSecret(secret)) {
        return {
          valid: false,
          error: 'JWT_ACCESS_SECRET is invalid',
        };
      }
      
      const verifyOptions = {
        algorithms: [this.ALGORITHM],
        issuer: options.issuer || process.env.JWT_ISSUER || 'erp-system',
        audience: options.audience || process.env.JWT_AUDIENCE || 'erp-users',
        clockTolerance: 30, // 30 segundos de tolerância
      };
      
      const decoded = jwt.verify(token, secret, verifyOptions as any) as any;
      
      // Validações adicionais do payload
      if (!decoded.userId || !decoded.tenantId) {
        return {
          valid: false,
          error: 'Invalid token payload structure',
        };
      }
      
      // Verifica se o token não expirou em breve (próximos 5 minutos)
      const now = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = (decoded.exp || 0) - now;
      
      if (timeUntilExpiry < 300) { // 5 minutos
        logger.warn('Token expiring soon', {
          metadata: {
            userId: decoded.userId,
            tenantId: decoded.tenantId,
            expiresAt: new Date((decoded.exp || 0) * 1000).toISOString(),
            timeUntilExpiry,
          },
        });
      }
      
      return {
        valid: true,
        payload: decoded,
      };
      
    } catch (error) {
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        logger.warn('JWT token expired', {
          error: {
            message: error.message,
            stack: error.stack,
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
            stack: error.stack,
          },
        });
        
        return {
          valid: false,
          error: 'Invalid token',
        };
      }
      
      logger.error('Unexpected JWT validation error', error as Error);
      return {
        valid: false,
        error: 'Token validation failed',
      };
    }
  }
  
  /**
   * Valida refresh token
   */
  static validateRefreshToken(token: string): JWTValidationResult {
    try {
      const secret = process.env.JWT_REFRESH_SECRET;
      if (!secret || !this.validateSecret(secret)) {
        return {
          valid: false,
          error: 'JWT refresh secret is invalid',
        };
      }
      
      const decoded = jwt.verify(token, secret, {
        algorithms: [this.ALGORITHM],
        issuer: process.env.JWT_ISSUER || 'erp-system',
      } as any) as any;
      
      // Verifica se é um refresh token
      if (decoded.type !== 'refresh') {
        return {
          valid: false,
          error: 'Invalid refresh token',
        };
      }
      
      return {
        valid: true,
        payload: decoded,
      };
      
    } catch (error) {
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
  static decodeToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.decode(token) as JWTPayload;
      return decoded;
    } catch (error) {
      logger.error('Error decoding JWT token', error as Error);
      return null;
    }
  }
  
  /**
   * Gera JTI (JWT ID) único
   */
  private static generateJTI(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `${timestamp}_${random}`;
  }
  
  /**
   * Verifica força do token baseado no payload
   */
  static analyzeTokenStrength(token: string): {
    hasJTI: boolean;
    hasExpiration: boolean;
    algorithm: string | null;
    expiresIn: number | null;
  } {
    try {
      const decoded = jwt.decode(token, { complete: true } as any) as any;
      
      return {
        hasJTI: !!decoded?.payload?.jti,
        hasExpiration: !!decoded?.payload?.exp,
        algorithm: decoded?.header?.alg || null,
        expiresIn: decoded?.payload?.exp ? decoded.payload.exp - Math.floor(Date.now() / 1000) : null,
      };
    } catch (error) {
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
export function jwtValidationMiddleware(options: {
  optional?: boolean;
  refresh?: boolean;
} = {}) {
  return (req: any, res: any, next: any) => {
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
        id: validation.payload!.userId,
        role: validation.payload!.role,
      };
      
      req.tenantId = validation.payload!.tenantId;
      req.vendedorId = validation.payload!.vendedorId;
      
      // Adiciona informações do token
      req.tokenInfo = {
        jti: validation.payload!.jti,
        exp: validation.payload!.exp,
        iat: validation.payload!.iat,
      };
      
      next();
      
    } catch (error) {
      logger.error('JWT middleware error', error as Error);
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
  return async (req: any, res: any, next: any) => {
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
        userId: validation.payload!.userId,
        tenantId: validation.payload!.tenantId,
        role: validation.payload!.role,
        vendedorId: validation.payload!.vendedorId,
      });
      
      res.json({
        success: true,
        token: newToken,
        expiresIn: '15m',
      });
      
    } catch (error) {
      logger.error('JWT refresh error', error as Error);
      res.status(500).json({
        error: 'Token refresh failed',
        code: 'REFRESH_ERROR',
      });
    }
  };
}
