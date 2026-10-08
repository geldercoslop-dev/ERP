import jwt from "jsonwebtoken";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
import { systemLogger } from '../_core/logger.js';
import { parseEnv } from '../services/env.schema.js';
import { requireBootstrap } from '../_core/bootstrap.js';
import { ValidationError, InfrastructureError } from '../_core/errors/typed-errors.js';

export interface JWTPayload {
  userId: number;
  tenantId: number;
  email: string;
  role: 'admin' | 'operator' | 'user';
  sessionId: string;
  /** Presente somente em sessões de vendedor (P23-R-10B). Nunca autoridade: revalidado no DB. */
  vendedorId?: number;
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
  private accessTokenSecret: string | null = null;
  private refreshTokenSecret: string | null = null;
  private accessTokenExpiry: string = '15m';
  private refreshTokenExpiry: string = '7d';

  private ensureInitialized(): void {
    if (this.accessTokenSecret !== null) return;

    requireBootstrap('jwt-auth.ensureInitialized');

    const { JWT_ACCESS_SECRET, JWT_REFRESH_SECRET } = parseEnv();
    const access = JWT_ACCESS_SECRET.trim();
    const refresh = JWT_REFRESH_SECRET.trim();
    if (!access || !refresh) {
      throw new ValidationError('JWT_ACCESS_SECRET e JWT_REFRESH_SECRET são obrigatórios (sem valor padrão).');
    }
    if (access === refresh) {
      throw new ValidationError('JWT_ACCESS_SECRET e JWT_REFRESH_SECRET devem ser diferentes.');
    }
    this.accessTokenSecret = access;
    this.refreshTokenSecret = refresh;
    this.accessTokenExpiry = process.env.JWT_ACCESS_EXPIRY || '15m';
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || '7d';
  }

  private getAccessSecret(): string {
    this.ensureInitialized();
    return this.accessTokenSecret!;
  }

  private getRefreshSecret(): string {
    this.ensureInitialized();
    return this.refreshTokenSecret!;
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

    const accessSign: SignOptions = {
      algorithm: "HS256",
    };
    const refreshSign: SignOptions = {
      algorithm: "HS256",
    };
    const accessToken = jwt.sign(accessTokenPayload, this.getAccessSecret(), accessSign);
    const refreshToken = jwt.sign(refreshTokenPayload, this.getRefreshSecret(), refreshSign);

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
   * Gera SOMENTE o access token (sem refresh pair).
   * P23-R-10B: o app não possui fluxo de refresh — emitir refresh token seria
   * credencial extra sem consumidor. Login usa este método.
   */
  generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp' | 'sessionId'>): { accessToken: string; expiresIn: number; sessionId: string } {
    const sessionId = this.generateSessionId();
    const now = Math.floor(Date.now() / 1000);

    const accessTokenPayload: JWTPayload = {
      ...payload,
      sessionId,
      iat: now,
      exp: now + this.parseExpiryToSeconds(this.accessTokenExpiry)
    };

    const accessToken = jwt.sign(accessTokenPayload, this.getAccessSecret(), {
      algorithm: "HS256",
    });

    const expiresIn = this.parseExpiryToSeconds(this.accessTokenExpiry);

    systemLogger.info({
      userId: payload.userId,
      tenantId: payload.tenantId,
      email: payload.email,
      role: payload.role,
      vendedorId: payload.vendedorId,
      sessionId,
      expiresIn
    }, 'JWT access token generated');

    return { accessToken, expiresIn, sessionId };
  }

  /**
   * Verifica e decodifica um access token
   */
  verifyAccessToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, this.getAccessSecret(), {
        algorithms: ["HS256"],
      });

      if (typeof decoded === "string" || decoded === null) {
        throw new ValidationError("Invalid access token payload");
      }

      const p = decoded as JwtPayload & Partial<JWTPayload>;
      if (
        typeof p.userId !== "number" ||
        typeof p.tenantId !== "number" ||
        typeof p.email !== "string" ||
        typeof p.role !== "string" ||
        typeof p.sessionId !== "string"
      ) {
        throw new ValidationError("Invalid access token payload");
      }

      const safePayload: JWTPayload = {
        userId: p.userId,
        tenantId: p.tenantId,
        email: p.email,
        role: p.role as JWTPayload["role"],
        sessionId: p.sessionId,
        vendedorId: typeof p.vendedorId === "number" ? p.vendedorId : undefined,
        iat: typeof p.iat === "number" ? p.iat : undefined,
        exp: typeof p.exp === "number" ? p.exp : undefined,
      };

      systemLogger.debug({
        userId: safePayload.userId,
        tenantId: safePayload.tenantId,
        sessionId: safePayload.sessionId,
        role: safePayload.role
      }, 'Access token verified');

      return safePayload;
    } catch (error) {
      systemLogger.warn({
        error: error instanceof Error ? error.message : String(error),
        tokenLength: token.length
      }, 'Access token verification failed');

      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('expired')) {
        throw new ValidationError('Access token expired');
      } else if (errorMessage.includes('invalid') || errorMessage.includes('malformed')) {
        throw new ValidationError('Invalid access token');
      } else {
        throw new InfrastructureError('Token verification failed');
      }
    }
  }

  /**
   * Verifica e decodifica um refresh token
   */
  verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      const decoded = jwt.verify(token, this.getRefreshSecret(), {
        algorithms: ["HS256"],
      });

      if (typeof decoded === "string" || decoded === null) {
        throw new ValidationError("Invalid refresh token payload");
      }

      const p = decoded as JwtPayload & Partial<RefreshTokenPayload>;
      if (
        typeof p.userId !== "number" ||
        typeof p.tenantId !== "number" ||
        typeof p.sessionId !== "string" ||
        typeof p.tokenVersion !== "number"
      ) {
        throw new ValidationError("Invalid refresh token payload");
      }

      const safePayload: RefreshTokenPayload = {
        userId: p.userId,
        tenantId: p.tenantId,
        sessionId: p.sessionId,
        tokenVersion: p.tokenVersion,
        iat: typeof p.iat === "number" ? p.iat : undefined,
        exp: typeof p.exp === "number" ? p.exp : undefined,
      };

      systemLogger.debug({
        userId: safePayload.userId,
        tenantId: safePayload.tenantId,
        sessionId: safePayload.sessionId,
        tokenVersion: safePayload.tokenVersion
      }, 'Refresh token verified');

      return safePayload;
    } catch (error) {
      systemLogger.warn({
        error: error instanceof Error ? error.message : String(error),
        tokenLength: token.length
      }, 'Refresh token verification failed');

      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('expired')) {
        throw new ValidationError('Refresh token expired');
      } else if (errorMessage.includes('invalid') || errorMessage.includes('malformed')) {
        throw new ValidationError('Invalid refresh token');
      } else {
        throw new InfrastructureError('Refresh token verification failed');
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
      const decoded = jwt.decode(token) as { exp?: number } | null;
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
      throw new ValidationError(`Invalid expiry format: ${expiry}`);
    }

    const [, value, unit] = match;
    return parseInt(value) * units[unit];
  }

  /**
   * Obtém informações do token sem verificar assinatura (para debugging)
   */
  decodeToken(token: string): JwtPayload | RefreshTokenPayload | null {
    try {
      const decoded = jwt.decode(token);
      // jwt.decode pode retornar string, null ou object
      if (typeof decoded === 'string' || decoded === null) {
        return null;
      }
      return decoded as JwtPayload | RefreshTokenPayload;
    } catch (error) {
      return null;
    }
  }
}

// Instância singleton lazy - só cria quando acessada
let _jwtAuthInstance: JWTAuth | null = null;

export function getJwtAuth(): JWTAuth {
  if (!_jwtAuthInstance) {
    _jwtAuthInstance = new JWTAuth();
  }
  return _jwtAuthInstance;
}

// Compatibilidade: facade explícito preserva a API pública sem Proxy.
// P23-R-10B-FIX3: NADA executa em import-time — o módulo só aloca um objeto
// literal de arrow functions. Cada método resolve a instância lazy via
// getJwtAuth() no momento da chamada e invoca com `this` correto (sem bind).
// Secrets/ENV nunca são lidos na importação.
type JwtAuthPublicApi = Pick<
  JWTAuth,
  | "generateTokenPair"
  | "generateAccessToken"
  | "verifyAccessToken"
  | "verifyRefreshToken"
  | "extractTokenFromHeader"
  | "shouldRefreshToken"
  | "decodeToken"
>;

export const jwtAuth: JwtAuthPublicApi = {
  generateTokenPair: (payload, tokenVersion) =>
    getJwtAuth().generateTokenPair(payload, tokenVersion),
  generateAccessToken: (payload) =>
    getJwtAuth().generateAccessToken(payload),
  verifyAccessToken: (token) =>
    getJwtAuth().verifyAccessToken(token),
  verifyRefreshToken: (token) =>
    getJwtAuth().verifyRefreshToken(token),
  extractTokenFromHeader: (authHeader) =>
    getJwtAuth().extractTokenFromHeader(authHeader),
  shouldRefreshToken: (token) =>
    getJwtAuth().shouldRefreshToken(token),
  decodeToken: (token) =>
    getJwtAuth().decodeToken(token),
};
