import jwt from 'jsonwebtoken';
import { systemLogger } from '../_core/logger';

export interface JWTPayload {
  userId: number;
  tenantId: number;
  email: string;
  role: 'admin' | 'operator' | 'user';
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RefreshTokenPayload {
  userId: number;
  tenantId: number;
  sessionId: string;
  tokenVersion: number;
  iat?: number;
  exp?: number;
}

class JWTAuth {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly accessTokenExpiry: string;
  private readonly refreshTokenExpiry: string;

  constructor() {
    const access = process.env.JWT_ACCESS_SECRET?.trim();
    const refresh = process.env.JWT_REFRESH_SECRET?.trim();
    if (!access || !refresh) {
      throw new Error(
        'JWT_ACCESS_SECRET e JWT_REFRESH_SECRET são obrigatórios (sem valor padrão).'
      );
    }
    if (access === refresh) {
      throw new Error('JWT_ACCESS_SECRET e JWT_REFRESH_SECRET devem ser diferentes.');
    }
    this.accessTokenSecret = access;
    this.refreshTokenSecret = refresh;
    this.accessTokenExpiry = process.env.JWT_ACCESS_EXPIRY || '15m';
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || '7d';
  }

  /**
   * Gera um par de tokens (access + refresh)
   */
  generateTokenPair(payload: Omit<JWTPayload, 'iat' | 'exp'>, tokenVersion: number = 0): TokenPair {
    const sessionId = this.generateSessionId();
    const now = Math.floor(Date.now() / 1000);

    // Access Token payload
    const accessTokenPayload: JWTPayload = {
      ...payload,
      sessionId,
      iat: now,
      exp: now + this.parseExpiryToSeconds(this.accessTokenExpiry)
    };

    // Refresh Token payload
    const refreshTokenPayload: RefreshTokenPayload = {
      userId: payload.userId,
      tenantId: payload.tenantId,
      sessionId,
      tokenVersion,
      iat: now,
      exp: now + this.parseExpiryToSeconds(this.refreshTokenExpiry)
    };

    const accessToken = jwt.sign(accessTokenPayload, this.accessTokenSecret, {
      algorithm: 'HS256',
      expiresIn: this.accessTokenExpiry
    });

    const refreshToken = jwt.sign(refreshTokenPayload, this.refreshTokenSecret, {
      algorithm: 'HS256',
      expiresIn: this.refreshTokenExpiry
    });

    const expiresIn = this.parseExpiryToSeconds(this.accessTokenExpiry);

    systemLogger.info({
      userId: payload.userId,
      tenantId: payload.tenantId,
      email: payload.email,
      role: payload.role,
      sessionId,
      expiresIn
    }, 'JWT token pair generated');

    return {
      accessToken,
      refreshToken,
      expiresIn
    };
  }

  /**
   * Verifica e decodifica um access token
   */
  verifyAccessToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret, {
        algorithms: ['HS256']
      }) as JWTPayload;

      systemLogger.debug({
        userId: decoded.userId,
        tenantId: decoded.tenantId,
        sessionId: decoded.sessionId,
        role: decoded.role
      }, 'Access token verified');

      return decoded;
    } catch (error) {
      systemLogger.warn({
        error: error instanceof Error ? error.message : String(error),
        tokenLength: token.length
      }, 'Access token verification failed');

      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('expired')) {
        throw new Error('Access token expired');
      } else if (errorMessage.includes('invalid') || errorMessage.includes('malformed')) {
        throw new Error('Invalid access token');
      } else {
        throw new Error('Token verification failed');
      }
    }
  }

  /**
   * Verifica e decodifica um refresh token
   */
  verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      const decoded = jwt.verify(token, this.refreshTokenSecret, {
        algorithms: ['HS256']
      }) as RefreshTokenPayload;

      systemLogger.debug({
        userId: decoded.userId,
        tenantId: decoded.tenantId,
        sessionId: decoded.sessionId,
        tokenVersion: decoded.tokenVersion
      }, 'Refresh token verified');

      return decoded;
    } catch (error) {
      systemLogger.warn({
        error: error instanceof Error ? error.message : String(error),
        tokenLength: token.length
      }, 'Refresh token verification failed');

      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('expired')) {
        throw new Error('Refresh token expired');
      } else if (errorMessage.includes('invalid') || errorMessage.includes('malformed')) {
        throw new Error('Invalid refresh token');
      } else {
        throw new Error('Refresh token verification failed');
      }
    }
  }

  /**
   * Extrai token do header Authorization
   */
  extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) {
      return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1];
  }

  /**
   * Verifica se o token está próximo de expirar (para refresh proativo)
   */
  shouldRefreshToken(token: string): boolean {
    try {
      const decoded = jwt.decode(token) as any;
      if (!decoded || !decoded.exp) {
        return false;
      }

      const now = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = decoded.exp - now;
      const refreshThreshold = 60; // 1 minuto

      return timeUntilExpiry <= refreshThreshold;
    } catch (error) {
      return false;
    }
  }

  /**
   * Gera um ID de sessão único
   */
  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Converte string de expiry (ex: "15m", "7d") para segundos
   */
  private parseExpiryToSeconds(expiry: string): number {
    const units: Record<string, number> = {
      's': 1,
      'm': 60,
      'h': 3600,
      'd': 86400,
      'w': 604800
    };

    const match = expiry.match(/^(\d+)([smhdw])$/);
    if (!match) {
      throw new Error(`Invalid expiry format: ${expiry}`);
    }

    const [, value, unit] = match;
    return parseInt(value) * units[unit];
  }

  /**
   * Obtém informações do token sem verificar assinatura (para debugging)
   */
  decodeToken(token: string): any {
    try {
      return jwt.decode(token);
    } catch (error) {
      return null;
    }
  }
}

// Instância singleton
export const jwtAuth = new JWTAuth();
